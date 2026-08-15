'use strict';
// Feed import: fetch an existing podcast RSS feed and pull its episodes
// in. Tolerant tag-level parsing (imports don't need a full XML DOM).

function pick(xml, tag) {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'));
  return m ? decode(m[1]) : '';
}

function attr(xml, tag, name) {
  const m = xml.match(new RegExp(`<${tag}[^>]*\\b${name}=["']([^"']*)["']`, 'i'));
  return m ? decode(m[1]) : '';
}

function decode(value) {
  return String(value)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .trim();
}

function parseFeed(xml) {
  const channelXml = (xml.split(/<item[\s>]/i)[0] || '');
  const channel = {
    title: pick(channelXml, 'title'),
    description: pick(channelXml, 'description') || pick(channelXml, 'itunes:summary'),
    author: pick(channelXml, 'itunes:author'),
    language: pick(channelXml, 'language'),
    image: attr(channelXml, 'itunes:image', 'href') || pick(channelXml, 'url'),
    explicit: /<itunes:explicit>\s*(yes|true)\s*</i.test(channelXml),
    category: attr(channelXml, 'itunes:category', 'text'),
  };
  const items = [];
  const itemBlocks = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) || [];
  for (const block of itemBlocks) {
    const enclosureUrl = attr(block, 'enclosure', 'url');
    if (!enclosureUrl) continue;
    const pub = pick(block, 'pubDate');
    const date = pub ? new Date(pub) : null;
    items.push({
      title: pick(block, 'title') || 'Untitled',
      description: pick(block, 'description') || pick(block, 'itunes:summary'),
      mediaUrl: enclosureUrl,
      bytes: Number(attr(block, 'enclosure', 'length')) || 0,
      guid: pick(block, 'guid'),
      date: date && !Number.isNaN(date.getTime())
        ? date.toISOString().slice(0, 10)
        : new Date().toISOString().slice(0, 10),
      episode: Number(pick(block, 'itunes:episode')) || null,
      season: Number(pick(block, 'itunes:season')) || null,
      durationRaw: pick(block, 'itunes:duration'),
    });
  }
  return { channel, items };
}

function parseDuration(raw) {
  if (!raw) return null;
  const parts = String(raw).split(':').map(Number);
  if (parts.some(Number.isNaN)) return null;
  return parts.reduce((acc, n) => acc * 60 + n, 0);
}

async function fetchFeed(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'FOSSCast-importer' },
    signal: AbortSignal.timeout(20000),
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`feed returned ${res.status}`);
  return parseFeed(await res.text());
}

module.exports = { parseFeed, fetchFeed, parseDuration };

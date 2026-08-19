'use strict';
// The public site: landing page, show pages with players, RSS feeds.

const { esc, publicPage } = require('./html');

const MEDIA_TYPES = {
  '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.aac': 'audio/aac',
  '.flac': 'audio/flac', '.ogg': 'audio/ogg', '.oga': 'audio/ogg',
  '.opus': 'audio/opus', '.wav': 'audio/wav',
};

function mediaType(url) {
  try {
    const pathname = new URL(url, 'http://relative').pathname.toLowerCase();
    const ext = pathname.slice(pathname.lastIndexOf('.'));
    return MEDIA_TYPES[ext] || 'application/octet-stream';
  } catch {
    return 'application/octet-stream';
  }
}

// Episodes the public can see: published and not future-dated.
function visible(episodes) {
  const today = new Date().toISOString().slice(0, 10);
  return episodes.filter((e) => !e.draft && e.date <= today);
}

function absolute(url, domain) {
  return url.startsWith('/') ? `https://${domain}${url}` : url;
}

// Every episode shows artwork: its own where it has some, the show's
// otherwise, so a feed or a page is never left with a blank square.
// A readable permalink per episode: podcast apps put this in their
// "visit the episode page" link, so it wants to be stable and tidy.
function slugify(name) {
  return String(name || '').toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

function episodeSlug(episode) {
  return episode.slug || slugify(episode.title) || episode.id;
}

function episodeUrl(show, episode, domain) {
  const base = domain ? `https://${domain}` : '';
  return `${base}/shows/${show.slug}/${episodeSlug(episode)}`;
}

// For display on the site: prefer the small web copy so pages load fast,
// falling back to the full image, then to the show's, so an episode
// without its own cover still shows the podcast art.
function artFor(episode, show) {
  return episode.artworkWeb || episode.artwork
    || show.artworkWeb || show.artwork || '';
}

// For the RSS feed and directories: the full-size original only.
function artForFeed(episode, show) {
  return episode.artwork || show.artwork || '';
}

// The small web copy of the show's own artwork / banner, for the site.
function showArtWeb(show) { return show.artworkWeb || show.artwork || ''; }
function showBannerWeb(show) { return show.bannerWeb || show.banner || ''; }

// Where people can subscribe. RSS always works; the rest appear once
// the show has a listing on them, since those need a catalogue URL the
// platform issues after you submit the feed. Icons are drawn inline:
// nothing is fetched from anyone.
const APPS = [
  ['apple', 'Apple Podcasts', '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2a6 6 0 0 1 6 6v3a6 6 0 0 1-12 0V8a6 6 0 0 1 6-6zm0 3a1.6 1.6 0 0 0-1.6 1.6v4.8a1.6 1.6 0 0 0 3.2 0V6.6A1.6 1.6 0 0 0 12 5zm-7 6h1.8a5.2 5.2 0 0 0 10.4 0H19a7 7 0 0 1-6 6.9V21h-2v-3.1A7 7 0 0 1 5 11z"/></svg>'],
  ['spotify', 'Spotify', '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm4.6 14.4a.8.8 0 0 1-1.1.3c-3-1.8-6.7-2.2-11.1-1.2a.8.8 0 1 1-.4-1.5c4.8-1.1 8.9-.6 12.3 1.4.4.2.5.7.3 1zm1.2-2.9a1 1 0 0 1-1.3.3c-3.4-2.1-8.6-2.7-12.6-1.5a1 1 0 1 1-.6-1.9c4.6-1.4 10.3-.7 14.2 1.7.5.3.6.9.3 1.4zm.1-3A1.2 1.2 0 0 1 16.4 11C12.5 8.7 6.1 8.4 2.4 9.6a1.2 1.2 0 1 1-.7-2.3C6 5.9 13 6.2 17.5 8.9c.6.3.8 1 .4 1.6z"/></svg>'],
  ['youtube', 'YouTube Music', '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16zm-2-11.5 6 3.5-6 3.5z"/></svg>'],
  ['amazon', 'Amazon Music', '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M3.5 16.3c4.6 2.8 10.9 2.9 16-.2.6-.4 1.1.3.5.8-2.2 1.9-5.2 2.8-8 2.8-3.9 0-7.5-1.5-9.3-3.8-.3-.3 0-.7.8-.4zm17.4 1.2c-.4-.5-2.5-.3-3.4-.1-.3 0-.3-.2 0-.4 1.7-1.2 4.4-.8 4.7-.4.3.4-.1 3-1.6 4.2-.3.2-.5.1-.4-.2.4-.9 1.1-2.7.7-3.1z"/></svg>'],
  ['pocketcasts', 'Pocket Casts', '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 3.4a6.6 6.6 0 0 1 6.6 6.6h-2.2A4.4 4.4 0 0 0 12 7.6V5.4zm0 3.3a3.3 3.3 0 0 1 3.3 3.3h-1.9A1.4 1.4 0 0 0 12 10.6V8.7z"/></svg>'],
  ['overcast', 'Overcast', '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 3.2 3.4 10.4-3.4-2.3-3.4 2.3z"/></svg>'],
  ['podcastindex', 'Podcast Index', '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2a10 10 0 0 0-4 19.2V16a4 4 0 1 1 8 0v5.2A10 10 0 0 0 12 2zm0 6a2 2 0 1 1 0 4 2 2 0 0 1 0-4z"/></svg>'],
];

const RSS_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M5 3c8.8 0 16 7.2 16 16h-3C18 11.8 12.2 6 5 6V3zm0 6c5.5 0 10 4.5 10 10h-3c0-3.9-3.1-7-7-7V9zm1.5 6a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5z"/></svg>';

function subscribeRow(show, domain) {
  const links = show.links || {};
  const feedUrl = `https://${domain}/shows/${show.slug}/feed.xml`;
  const buttons = APPS
    .filter(([key]) => links[key])
    .map(([key, label, icon]) => `<a class="sub-btn" href="${esc(links[key])}" target="_blank" rel="noopener noreferrer">${icon}<span>${esc(label)}</span></a>`)
    .join('');
  return `<div class="subscribe">
    <span class="sub-label">Listen on</span>
    ${buttons}
    <a class="sub-btn" href="/shows/${esc(show.slug)}/feed.xml">${RSS_ICON}<span>RSS</span></a>
    <button class="sub-btn" type="button" data-copy-feed="${esc(feedUrl)}">${RSS_ICON}<span>Copy feed link</span></button>
  </div>`;
}

function player(episode) {
  const type = mediaType(episode.mediaUrl);
  const tag = type.startsWith('video/') ? 'video' : 'audio';
  return `<${tag} controls preload="none" src="${esc(episode.mediaUrl)}"></${tag}>`;
}

function landing() {
  return publicPage({
    title: 'FOSSCast',
    description: 'A home for an independent show: every published episode, playable in the browser and subscribable anywhere podcasts go.',
    body: `
  <section class="panel hero">
    <p class="status"><span aria-hidden="true">&#9679;</span> Being built in the open. First shows soon.</p>
    <h1>Your show, kept properly.</h1>
    <p class="lede">FOSSCast is the public home of an independent show:
    every published episode on its own page, playable here and
    subscribable anywhere podcasts go, served from hardware you
    control.</p>
  </section>
  <section class="grid">
    <div class="panel wide">
      <h2>A website worth linking to</h2>
      <p>Every episode gets its own page with artwork, player, chapters
      and transcript, and the feed points podcast apps straight at it.
      Banners, cover art and light or dark, as the visitor prefers.</p>
    </div>
    <div class="panel">
      <h2>Episodes</h2>
      <p>Video and audio, hosted here or anywhere else, archive.org
      included.</p>
    </div>
    <div class="panel">
      <h2>Subscribe anywhere</h2>
      <p>RSS feeds any podcast app understands, transcripts and
      chapters included.</p>
    </div>
  </section>`,
  });
}

function showsIndex(shows, episodes) {
  const cards = shows.length
    ? shows.map((show) => {
        const count = episodes.filter((e) => e.showId === show.id).length;
        return `<a class="panel show-card" href="/shows/${esc(show.slug)}">
          <h2>${esc(show.name)}</h2>
          <p>${esc(show.description)}</p>
          <p class="hint">${count} episode${count === 1 ? '' : 's'}</p>
        </a>`;
      }).join('')
    : '<div class="panel"><p class="hint">No shows yet. They are coming.</p></div>';
  return publicPage({
    title: 'Shows - FOSSCast',
    description: 'All shows on FOSSCast.',
    body: `<h1 class="page-title">Shows</h1><section class="grid">${cards}</section>`,
  });
}

function showPage(show, allEpisodes, domain) {
  const episodes = visible(allEpisodes);
  const items = episodes.length
    ? episodes.map((episode) => {
        const art = artFor(episode, show);
        return `
      <article class="panel episode">
        ${art ? `<a class="episode-art-link" href="${esc(episodeUrl(show, episode, ''))}"><img class="episode-art" src="${esc(art)}" alt="" width="200" height="200" loading="lazy"></a>` : ''}
        <div class="episode-body">
          <h2><a href="${esc(episodeUrl(show, episode, ''))}">${esc(episode.title)}</a></h2>
          <p class="hint">${esc(episode.date)}${episode.episode ? ` &middot; episode ${Number(episode.episode)}` : ''}${episode.duration ? ` &middot; ${Math.round(episode.duration / 60)} min` : ''}</p>
          ${episode.description ? `<p>${esc(episode.description)}</p>` : ''}
          ${player(episode)}
        </div>
      </article>`;
      }).join('')
    : '<div class="panel"><p class="hint">No episodes published yet.</p></div>';
  return publicPage({
    title: `${show.name} - FOSSCast`,
    description: show.description,
    image: show.banner || show.artwork || '',
    body: `
  ${show.banner ? `<div class="show-banner"><img src="${esc(showBannerWeb(show))}" alt=""></div>` : ''}
  <section class="panel hero show-hero">
    ${show.artwork ? `<img class="show-art" src="${esc(showArtWeb(show))}" alt="${esc(show.name)} artwork" width="160" height="160">` : ''}
    <div class="show-hero-text">
    <h1>${esc(show.name)}</h1>
    <p class="lede">${esc(show.description)}</p>
    ${subscribeRow(show, domain)}
    <p class="feed-line">Paste this into any app: <code>https://${esc(domain)}/shows/${esc(show.slug)}/feed.xml</code></p>
    </div>
  </section>
  <section class="episodes">${items}</section>`,
  });
}

function episodePage(show, episode, domain) {
  const art = artFor(episode, show);
  const chapters = (episode.chapters || []).length
    ? `<section class="panel">
        <h2>Chapters</h2>
        <ol class="chapters">
          ${episode.chapters.map((c) => {
            const h = Math.floor(c.start / 3600);
            const m = Math.floor((c.start % 3600) / 60);
            const sec = c.start % 60;
            const stamp = `${h ? String(h).padStart(2, '0') + ':' : ''}${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
            return `<li><span class="chapter-time">${esc(stamp)}</span> ${esc(c.title)}</li>`;
          }).join('')}
        </ol>
      </section>`
    : '';

  return publicPage({
    title: `${episode.title} - ${show.name}`,
    description: episode.description || `An episode of ${show.name}.`,
    image: art ? absolute(art, domain) : '',
    body: `
  <article class="panel episode-page">
    <div class="episode-head">
      ${art ? `<img class="episode-art large" src="${esc(art)}" alt="" width="160" height="160">` : ''}
      <div class="episode-meta">
        <p class="hint"><a href="/shows/${esc(show.slug)}">${esc(show.name)}</a></p>
        <h1>${esc(episode.title)}</h1>
        <p class="hint">${esc(episode.date)}${episode.episode ? ` &middot; episode ${Number(episode.episode)}` : ''}${episode.season ? ` &middot; season ${Number(episode.season)}` : ''}${episode.duration ? ` &middot; ${Math.round(episode.duration / 60)} min` : ''}</p>
      </div>
    </div>
    ${player(episode)}
    ${episode.description ? `<p>${esc(episode.description)}</p>` : ''}
    ${subscribeRow(show, domain)}
    <p class="hint">
      ${episode.transcript ? `<a href="${esc(episode.transcript)}">Transcript</a> &middot; ` : ''}
      <a href="/embed/${esc(episode.id)}">Embed this episode</a>
    </p>
  </article>
  ${chapters}`,
  });
}

function escXml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function itunesDuration(seconds) {
  if (!seconds) return '';
  return `<itunes:duration>${Math.round(seconds)}</itunes:duration>`;
}

const TRANSCRIPT_TYPES = {
  '.vtt': 'text/vtt', '.srt': 'application/x-subrip',
  '.json': 'application/json', '.txt': 'text/plain', '.html': 'text/html',
};

function transcriptTag(episode, domain) {
  if (!episode.transcript) return '';
  const ext = episode.transcript.slice(episode.transcript.lastIndexOf('.')).toLowerCase();
  const type = TRANSCRIPT_TYPES[ext] || 'text/plain';
  return `<podcast:transcript url="${escXml(absolute(episode.transcript, domain))}" type="${type}"/>`;
}

function chaptersTag(episode, domain) {
  if (!episode.chapters || !episode.chapters.length) return '';
  return `<podcast:chapters url="${escXml(`https://${domain}/api/v1/episodes/${episode.id}/chapters.json`)}" type="application/json+chapters"/>`;
}

function chaptersJson(episode) {
  return {
    version: '1.2.0',
    chapters: (episode.chapters || []).map((c) => ({ startTime: c.start, title: c.title })),
  };
}

function personTags(show) {
  return (show.persons || [])
    .map((p) => `<podcast:person${p.role ? ` role="${escXml(p.role)}"` : ''}>${escXml(p.name)}</podcast:person>`)
    .join('\n    ');
}

function feed(show, episodes, domain) {
  const base = `https://${domain}`;
  const owner = show.ownerEmail || '';
  const items = visible(episodes).map((episode) => `
    <item>
      <title>${escXml(episode.title)}</title>
      <link>${escXml(episodeUrl(show, episode, domain))}</link>
      <guid isPermaLink="false">${escXml(episode.guid || episode.id)}</guid>
      <pubDate>${new Date(episode.date + 'T00:00:00Z').toUTCString()}</pubDate>
      <description>${escXml(episode.description)}</description>
      <enclosure url="${escXml(absolute(episode.mediaUrl, domain))}" length="${Number(episode.bytes) || 0}" type="${escXml(mediaType(episode.mediaUrl))}"/>
      ${episode.episode ? `<itunes:episode>${Number(episode.episode)}</itunes:episode>` : ''}
      ${episode.season ? `<itunes:season>${Number(episode.season)}</itunes:season>` : ''}
      <itunes:episodeType>${escXml(episode.type || 'full')}</itunes:episodeType>
      ${itunesDuration(episode.duration)}
      <itunes:explicit>${show.explicit ? 'true' : 'false'}</itunes:explicit>
      ${artForFeed(episode, show) ? `<itunes:image href="${escXml(absolute(artForFeed(episode, show), domain))}"/>` : ''}
      ${transcriptTag(episode, domain)}
      ${chaptersTag(episode, domain)}
    </item>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
  xmlns:atom="http://www.w3.org/2005/Atom"
  xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"
  xmlns:podcast="https://podcastindex.org/namespace/1.0">
  <channel>
    <title>${escXml(show.name)}</title>
    <link>${escXml(`${base}/shows/${show.slug}`)}</link>
    <atom:link href="${escXml(`${base}/shows/${show.slug}/feed.xml`)}" rel="self" type="application/rss+xml"/>
    <description>${escXml(show.description)}</description>
    <language>${escXml(show.language || 'en')}</language>
    <podcast:guid>${escXml(show.podcastGuid || show.id)}</podcast:guid>
    ${show.author ? `<itunes:author>${escXml(show.author)}</itunes:author>` : ''}
    ${owner ? `<itunes:owner>
      <itunes:name>${escXml(show.ownerName || show.author || show.name)}</itunes:name>
      <itunes:email>${escXml(owner)}</itunes:email>
    </itunes:owner>
    <managingEditor>${escXml(owner)}${show.ownerName ? ` (${escXml(show.ownerName)})` : ''}</managingEditor>` : ''}
    <itunes:type>${show.serial ? 'serial' : 'episodic'}</itunes:type>
    ${show.copyright ? `<copyright>${escXml(show.copyright)}</copyright>` : ''}
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <generator>FOSSCast</generator>
    ${show.artwork ? `<itunes:image href="${escXml(absolute(show.artwork, domain))}"/><image><url>${escXml(absolute(show.artwork, domain))}</url><title>${escXml(show.name)}</title><link>${escXml(`${base}/shows/${show.slug}`)}</link></image>` : ''}
    ${show.category ? `<itunes:category text="${escXml(show.category)}"/>` : ''}
    <itunes:explicit>${show.explicit ? 'true' : 'false'}</itunes:explicit>
    <podcast:locked${owner ? ` owner="${escXml(owner)}"` : ''}>${show.locked ? 'yes' : 'no'}</podcast:locked>
    ${show.funding && show.funding.url ? `<podcast:funding url="${escXml(show.funding.url)}">${escXml(show.funding.label || 'Support the show')}</podcast:funding>` : ''}
    ${personTags(show)}
    ${items}
  </channel>
</rss>
`.split('\n').filter((line) => line.trim() !== '').join('\n') + '\n';
}

// Minimal embeddable player page for one episode.
function embedPage(show, episode) {
  return `<!doctype html>
<html lang="en" data-accent="deep_orange">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(episode.title)} - ${esc(show.name)}</title>
<link rel="stylesheet" href="/css/site.css?v=0.3.0">
</head>
<body class="embed">
<div class="embed-player">
  ${artFor(episode, show) ? `<img class="embed-art" src="${esc(artFor(episode, show))}" alt="">` : ''}
  <div class="embed-meta">
    <strong>${esc(episode.title)}</strong>
    <span class="hint">${esc(show.name)}</span>
    ${player(episode)}
  </div>
</div>
</body>
</html>
`;
}

module.exports = { landing, showsIndex, showPage, episodePage, feed, embedPage, chaptersJson, mediaType, visible, artFor, episodeSlug, episodeUrl, subscribeRow, APPS };

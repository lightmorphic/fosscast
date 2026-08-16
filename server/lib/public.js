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
function artFor(episode, show) {
  return episode.artwork || show.artwork || '';
}

function player(episode) {
  const type = mediaType(episode.mediaUrl);
  const tag = type.startsWith('video/') ? 'video' : 'audio';
  return `<${tag} controls preload="none" src="${esc(episode.mediaUrl)}"></${tag}>`;
}

function landing() {
  return publicPage({
    title: 'FOSSCast',
    description: 'The public home of independent shows: live video streams with open chat, and an episode archive you can subscribe to anywhere.',
    body: `
  <section class="panel hero">
    <p class="status"><span aria-hidden="true">&#9679;</span> Being built in the open. First shows soon.</p>
    <h1>Watch it live. Keep it forever.</h1>
    <p class="lede">FOSSCast is the public home of independent shows: live video
    streams with an open chat room while the show happens, and a growing
    archive of every published episode, playable here and subscribable
    anywhere podcasts go.</p>
  </section>
  <section class="grid">
    <div class="panel wide">
      <h2>Live, with the room in it</h2>
      <p>When a show goes on air it streams right here. No account, no
      app, just press play, and a chat room sits beside every stream:
      pick a nickname and join in while the hosts watch from their
      studio.</p>
    </div>
    <div class="panel">
      <h2>Episodes</h2>
      <p>Missed it? Every episode stays: video and audio, playable
      here.</p>
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

function livePage(show, { live, embed }) {
  const chatPanel = `
  <aside class="panel chat-panel" id="chat">
    <div class="chat-head">
      <span class="live-badge${live ? ' on' : ''}" id="live-badge"><span class="dot"></span><span id="live-label">${live ? 'LIVE' : 'OFFLINE'}</span></span>
      <span class="hint" id="viewers"></span>
    </div>
    <div class="chat-log" id="chat-log" aria-live="polite"></div>
    <form id="nick-form" class="chat-form">
      <input id="nick" maxlength="24" placeholder="Pick a nickname to chat" aria-label="Nickname" required>
      <button class="btn-primary" type="submit">Join</button>
    </form>
    <form id="msg-form" class="chat-form" hidden>
      <input id="msg" maxlength="500" placeholder="Say something" aria-label="Message" autocomplete="off" required>
      <button class="btn-primary" type="submit">Send</button>
    </form>
  </aside>`;

  if (embed) {
    return `<!doctype html>
<html lang="en" data-accent="deep_orange">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(show.name)} chat</title>
<meta name="robots" content="noindex">
<link rel="icon" href="/img/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/css/site.css?v=0.1.0">
</head>
<body class="embed" data-slug="${esc(show.slug)}" data-live="${live ? '1' : ''}">
${chatPanel}
<script src="/js/live.js?v=0.1.0"></script>
</body>
</html>
`;
  }

  return publicPage({
    title: `${show.name} live - FOSSCast`,
    description: `Watch ${show.name} live.`,
    body: `
  <div class="live-layout" data-slug="${esc(show.slug)}" data-live="${live ? '1' : ''}" id="live-root">
    <section class="panel player-panel">
      <div class="player-frame">
        <video id="player" controls autoplay playsinline ${live ? '' : 'hidden'}></video>
        <div id="offline" class="offline-state" ${live ? 'hidden' : ''}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3.2" fill="currentColor"/><path d="M6.3 17.7a8 8 0 0 1 0-11.4M17.7 6.3a8 8 0 0 1 0 11.4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
          <p><strong>${esc(show.name)}</strong> is not live right now.</p>
          <p class="hint">This page comes alive the moment the show starts. Leave it open.</p>
        </div>
      </div>
      <h1 class="live-title">${esc(show.name)}</h1>
      <p class="hint"><a href="/shows/${esc(show.slug)}">Episodes and RSS feed</a></p>
    </section>
    ${chatPanel}
  </div>
  <script src="/js/hls.min.js?v=0.1.0"></script>
  <script src="/js/live.js?v=0.1.0"></script>`,
  });
}

function showPage(show, allEpisodes, domain, live = false) {
  const episodes = visible(allEpisodes);
  const liveBanner = live
    ? `<a class="panel live-banner" href="/live/${esc(show.slug)}">
        <span class="live-badge on"><span class="dot"></span>LIVE</span>
        <span>${esc(show.name)} is live right now. Watch and join the chat.</span>
      </a>`
    : '';
  const items = episodes.length
    ? episodes.map((episode) => {
        const art = artFor(episode, show);
        return `
      <article class="panel episode">
        <div class="episode-head">
          ${art ? `<img class="episode-art" src="${esc(art)}" alt="" width="96" height="96" loading="lazy">` : ''}
          <div class="episode-meta">
            <h2>${esc(episode.title)}</h2>
            <p class="hint">${esc(episode.date)}${episode.episode ? ` &middot; episode ${Number(episode.episode)}` : ''}${episode.duration ? ` &middot; ${Math.round(episode.duration / 60)} min` : ''}</p>
          </div>
        </div>
        ${episode.description ? `<p>${esc(episode.description)}</p>` : ''}
        ${player(episode)}
      </article>`;
      }).join('')
    : '<div class="panel"><p class="hint">No episodes published yet.</p></div>';
  return publicPage({
    title: `${show.name} - FOSSCast`,
    description: show.description,
    image: show.banner || show.artwork || '',
    body: `
  ${show.banner ? `<div class="show-banner"><img src="${esc(show.banner)}" alt=""></div>` : ''}
  ${liveBanner}
  <section class="panel hero show-hero">
    ${show.artwork ? `<img class="show-art" src="${esc(show.artwork)}" alt="${esc(show.name)} artwork" width="160" height="160">` : ''}
    <div class="show-hero-text">
    <h1>${esc(show.name)}</h1>
    <p class="lede">${esc(show.description)}</p>
    <p class="feed-line"><a href="/shows/${esc(show.slug)}/feed.xml">RSS feed</a>
    for any podcast app: <code>https://${esc(domain)}/shows/${esc(show.slug)}/feed.xml</code>
    &middot; <a href="/live/${esc(show.slug)}">live page</a></p>
    </div>
  </section>
  <section class="episodes">${items}</section>`,
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

// The Podcasting 2.0 live announcement: apps that support liveItem see
// the stream natively while the show is on air.
function liveItemTag(show, liveInfo, domain) {
  if (!liveInfo || !liveInfo.live) return '';
  const base = `https://${domain}`;
  const start = liveInfo.since || new Date().toISOString();
  return `
    <podcast:liveItem status="live" start="${escXml(start)}">
      <title>LIVE: ${escXml(show.name)}</title>
      <guid isPermaLink="false">live-${escXml(show.id)}-${escXml(start)}</guid>
      <enclosure url="${escXml(`${base}/hls/${show.slug}/index.m3u8`)}" type="application/x-mpegURL" length="0"/>
      <podcast:contentLink href="${escXml(`${base}/live/${show.slug}`)}">Watch and chat live</podcast:contentLink>
    </podcast:liveItem>`;
}

function personTags(show) {
  return (show.persons || [])
    .map((p) => `<podcast:person${p.role ? ` role="${escXml(p.role)}"` : ''}>${escXml(p.name)}</podcast:person>`)
    .join('\n    ');
}

function feed(show, episodes, domain, liveInfo = null) {
  const base = `https://${domain}`;
  const items = visible(episodes).map((episode) => `
    <item>
      <title>${escXml(episode.title)}</title>
      <guid isPermaLink="false">${escXml(episode.guid || episode.id)}</guid>
      <pubDate>${new Date(episode.date + 'T00:00:00Z').toUTCString()}</pubDate>
      <description>${escXml(episode.description)}</description>
      <enclosure url="${escXml(absolute(episode.mediaUrl, domain))}" length="${Number(episode.bytes) || 0}" type="${escXml(mediaType(episode.mediaUrl))}"/>
      ${episode.episode ? `<itunes:episode>${Number(episode.episode)}</itunes:episode>` : ''}
      ${episode.season ? `<itunes:season>${Number(episode.season)}</itunes:season>` : ''}
      <itunes:episodeType>${escXml(episode.type || 'full')}</itunes:episodeType>
      ${itunesDuration(episode.duration)}
      <itunes:explicit>${show.explicit ? 'true' : 'false'}</itunes:explicit>
      ${artFor(episode, show) ? `<itunes:image href="${escXml(absolute(artFor(episode, show), domain))}"/>` : ''}
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
    <podcast:guid>${escXml(show.id)}</podcast:guid>
    ${show.author ? `<itunes:author>${escXml(show.author)}</itunes:author>` : ''}
    ${show.artwork ? `<itunes:image href="${escXml(absolute(show.artwork, domain))}"/><image><url>${escXml(absolute(show.artwork, domain))}</url><title>${escXml(show.name)}</title><link>${escXml(`${base}/shows/${show.slug}`)}</link></image>` : ''}
    ${show.category ? `<itunes:category text="${escXml(show.category)}"/>` : ''}
    <itunes:explicit>${show.explicit ? 'true' : 'false'}</itunes:explicit>
    <podcast:locked${show.lockedOwner ? ` owner="${escXml(show.lockedOwner)}"` : ''}>${show.locked ? 'yes' : 'no'}</podcast:locked>
    ${show.funding && show.funding.url ? `<podcast:funding url="${escXml(show.funding.url)}">${escXml(show.funding.label || 'Support the show')}</podcast:funding>` : ''}
    ${personTags(show)}
    ${liveItemTag(show, liveInfo, domain)}
    ${items}
  </channel>
</rss>
`;
}

// Minimal embeddable player page for one episode.
function embedPage(show, episode) {
  return `<!doctype html>
<html lang="en" data-accent="deep_orange">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(episode.title)} - ${esc(show.name)}</title>
<link rel="stylesheet" href="/css/site.css?v=0.1.0">
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

module.exports = { landing, showsIndex, showPage, livePage, feed, embedPage, chaptersJson, mediaType, visible, artFor };

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
    const pathname = new URL(url).pathname.toLowerCase();
    const ext = pathname.slice(pathname.lastIndexOf('.'));
    return MEDIA_TYPES[ext] || 'application/octet-stream';
  } catch {
    return 'application/octet-stream';
  }
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
    <div class="panel">
      <h2>Live</h2>
      <p>When a show goes on air it streams right here. No account, no
      app, just press play.</p>
    </div>
    <div class="panel">
      <h2>Chat</h2>
      <p>Every live stream has a room beside it. Pick a nickname and join
      in; the hosts see the chat from their studio.</p>
    </div>
    <div class="panel">
      <h2>Episodes</h2>
      <p>Missed it? Every episode stays: video and audio, with RSS feeds
      any podcast app can subscribe to.</p>
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
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(show.name)} chat</title>
<meta name="robots" content="noindex">
<link rel="icon" href="/img/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/css/site.css">
</head>
<body class="embed" data-slug="${esc(show.slug)}" data-live="${live ? '1' : ''}">
${chatPanel}
<script src="/js/live.js"></script>
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
  <script src="/js/hls.min.js"></script>
  <script src="/js/live.js"></script>`,
  });
}

function showPage(show, episodes, domain, live = false) {
  const liveBanner = live
    ? `<a class="panel live-banner" href="/live/${esc(show.slug)}">
        <span class="live-badge on"><span class="dot"></span>LIVE</span>
        <span>${esc(show.name)} is live right now. Watch and join the chat.</span>
      </a>`
    : '';
  const items = episodes.length
    ? episodes.map((episode) => `
      <article class="panel episode">
        <h2>${esc(episode.title)}</h2>
        <p class="hint">${esc(episode.date)}</p>
        ${episode.description ? `<p>${esc(episode.description)}</p>` : ''}
        ${player(episode)}
      </article>`).join('')
    : '<div class="panel"><p class="hint">No episodes published yet.</p></div>';
  return publicPage({
    title: `${show.name} - FOSSCast`,
    description: show.description,
    body: `
  ${liveBanner}
  <section class="panel hero">
    <h1>${esc(show.name)}</h1>
    <p class="lede">${esc(show.description)}</p>
    <p class="feed-line"><a href="/shows/${esc(show.slug)}/feed.xml">RSS feed</a>
    for any podcast app: <code>https://${esc(domain)}/shows/${esc(show.slug)}/feed.xml</code>
    &middot; <a href="/live/${esc(show.slug)}">live page</a></p>
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

function feed(show, episodes, domain) {
  const base = `https://${domain}`;
  const items = episodes.map((episode) => `
    <item>
      <title>${escXml(episode.title)}</title>
      <guid isPermaLink="false">${escXml(episode.id)}</guid>
      <pubDate>${new Date(episode.date + 'T00:00:00Z').toUTCString()}</pubDate>
      <description>${escXml(episode.description)}</description>
      <enclosure url="${escXml(episode.mediaUrl)}" length="0" type="${escXml(mediaType(episode.mediaUrl))}"/>
    </item>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escXml(show.name)}</title>
    <link>${escXml(`${base}/shows/${show.slug}`)}</link>
    <atom:link href="${escXml(`${base}/shows/${show.slug}/feed.xml`)}" rel="self" type="application/rss+xml"/>
    <description>${escXml(show.description)}</description>
    <language>en</language>
    ${items}
  </channel>
</rss>
`;
}

module.exports = { landing, showsIndex, showPage, livePage, feed, mediaType };

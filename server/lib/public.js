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

// Where a listener actually fetches an episode from.
//
// Media this server holds is linked straight at: the media route counts
// the download as it goes past. Media that lives somewhere else - the
// show's own host, an archive.org item - would never touch this server,
// so nothing could be counted and the statistics page would sit empty
// however many people listened. Those are published as a link back
// here, and /d hands the listener onward.
//
// Either way this server carries no audio: the difference is only
// whether it gets to see that the request happened.
//
// The extension is cosmetic but load-bearing: some apps read the file
// type off the URL rather than trusting the enclosure's type attribute.
function mediaPath(episode) {
  if (episode.mediaUrl.startsWith('/')) return episode.mediaUrl;
  let ext = '';
  try {
    const pathname = new URL(episode.mediaUrl, 'http://relative').pathname.toLowerCase();
    const dot = pathname.lastIndexOf('.');
    if (dot !== -1 && MEDIA_TYPES[pathname.slice(dot)]) ext = pathname.slice(dot);
  } catch { /* no usable extension */ }
  return `/d/${episode.id}${ext}`;
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

// Where listeners can chip in. Each entry is the service, where to sign
// up with them, and what a finished link looks like, so the admin form
// can hand someone straight to the sign-up rather than leaving them to
// find it. Icons are plain glyphs drawn here, not brand logos: nothing
// is fetched from anyone and no one's trademark is copied.
const HEART_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 21s-7.5-4.7-9.3-9A5.2 5.2 0 0 1 12 6.6a5.2 5.2 0 0 1 9.3 5.4C19.5 16.3 12 21 12 21z"/></svg>';
const CUP_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M4 6h12v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V6zm13 1h1.6a2.9 2.9 0 0 1 0 5.8H17V7zM3 19h14v2H3z"/></svg>';
const COIN_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm.9 15.4v1.2h-1.6v-1.2a4.4 4.4 0 0 1-2.6-1.1l.9-1.4a3.6 3.6 0 0 0 2.3.9c.9 0 1.5-.4 1.5-1.1 0-.6-.4-1-1.6-1.4-1.7-.6-2.8-1.3-2.8-2.8 0-1.3.9-2.3 2.3-2.6V6.4h1.6v1.4c.9.1 1.6.4 2.1.8l-.8 1.4a3.3 3.3 0 0 0-1.9-.7c-.9 0-1.3.5-1.3 1 0 .6.5.9 1.8 1.4 1.8.6 2.6 1.4 2.6 2.8 0 1.3-.9 2.5-2.5 2.9z"/></svg>';
const HANDS_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M7 10a3 3 0 1 1 0-6 3 3 0 0 1 0 6zm10 0a3 3 0 1 1 0-6 3 3 0 0 1 0 6zM2 20v-1.5C2 15.9 4.2 14 7 14s5 1.9 5 4.5V20H2zm11 0v-1.5c0-1.4-.5-2.6-1.3-3.6.5-.2 1.1-.3 1.7-.3 2.8 0 5 1.9 5 4.5V20h-5.4z"/></svg>';

const SUPPORT = [
  ['patreon', 'Patreon', 'https://www.patreon.com/create', 'https://www.patreon.com/yourshow', HEART_ICON],
  ['buymeacoffee', 'Buy Me a Coffee', 'https://buymeacoffee.com/signup', 'https://buymeacoffee.com/yourshow', CUP_ICON],
  ['kofi', 'Ko-fi', 'https://ko-fi.com/signup', 'https://ko-fi.com/yourshow', CUP_ICON],
  ['liberapay', 'Liberapay', 'https://liberapay.com/sign-up', 'https://liberapay.com/yourshow', HEART_ICON],
  ['githubsponsors', 'GitHub Sponsors', 'https://github.com/sponsors', 'https://github.com/sponsors/you', HEART_ICON],
  ['opencollective', 'Open Collective', 'https://opencollective.com/create', 'https://opencollective.com/yourshow', HANDS_ICON],
  ['paypal', 'PayPal', 'https://www.paypal.com/paypalme/grab', 'https://www.paypal.me/yourshow', COIN_ICON],
];

// Where the show talks to its audience. Matrix leads, then the rest of
// the open, federated places, then the big platforms - a podcast that
// cares about owning its own feed usually cares about that order.
// Icons are plain glyphs by kind of place, not brand marks: nothing is
// fetched from anyone and no trademark is copied.
const CHAT_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 3c5 0 9 3.1 9 7s-4 7-9 7a11 11 0 0 1-2.6-.3L5 19.5l.9-3.4C4.1 14.8 3 12.9 3 10.7 3 6.8 7 3 12 3z"/></svg>';
const FEDI_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm6.9 7h-2.8a15 15 0 0 0-1.2-3.6A8 8 0 0 1 18.9 9zM12 4.2c.7 1 1.3 2.4 1.7 4.8h-3.4c.4-2.4 1-3.8 1.7-4.8zM4.3 13a8 8 0 0 1 0-2h3.2a19 19 0 0 0 0 2H4.3zm.8 2h2.8c.3 1.4.7 2.6 1.2 3.6A8 8 0 0 1 5.1 15zm2.8-6H5.1a8 8 0 0 1 4-3.6C8.6 6.4 8.2 7.6 7.9 9zM12 19.8c-.7-1-1.3-2.4-1.7-4.8h3.4c-.4 2.4-1 3.8-1.7 4.8zm2-6.8h-4a17 17 0 0 1 0-2h4a17 17 0 0 1 0 2zm.9 5.6c.5-1 .9-2.2 1.2-3.6h2.8a8 8 0 0 1-4 3.6zm1.6-5.6a19 19 0 0 0 0-2h3.2a8 8 0 0 1 0 2h-3.2z"/></svg>';
const VIDEO_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zm6 3.5v7l6-3.5z"/></svg>';
const PHOTO_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M9 4h6l1.2 2H20a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h3.8L9 4zm3 5a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9zm0 2a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5z"/></svg>';
const POST_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zm2 4v2h10V7H7zm0 4v2h10v-2H7zm0 4v2h6v-2H7z"/></svg>';
const LINK_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.1 0l2.4-2.4a5 5 0 0 0-7.1-7.1L11 4.9"/><path d="M14 11a5 5 0 0 0-7.1 0L4.5 13.4a5 5 0 0 0 7.1 7.1l1.4-1.4"/></svg>';

const SOCIAL = [
  ['matrix', 'Matrix', 'https://matrix.to/#/#yourshow:example.org', CHAT_ICON],
  ['mastodon', 'Mastodon', 'https://mastodon.social/@yourshow', FEDI_ICON],
  ['peertube', 'PeerTube', 'https://your.peertube.site/c/yourshow', VIDEO_ICON],
  ['lemmy', 'Lemmy', 'https://lemmy.world/c/yourshow', POST_ICON],
  ['bluesky', 'Bluesky', 'https://bsky.app/profile/yourshow', FEDI_ICON],
  ['discord', 'Discord', 'https://discord.gg/yourinvite', CHAT_ICON],
  ['telegram', 'Telegram', 'https://t.me/yourshow', CHAT_ICON],
  ['signal', 'Signal', 'https://signal.group/#your-group-link', CHAT_ICON],
  ['youtube', 'YouTube', 'https://youtube.com/@yourshow', VIDEO_ICON],
  ['twitch', 'Twitch', 'https://twitch.tv/yourshow', VIDEO_ICON],
  ['tiktok', 'TikTok', 'https://tiktok.com/@yourshow', VIDEO_ICON],
  ['instagram', 'Instagram', 'https://instagram.com/yourshow', PHOTO_ICON],
  ['facebook', 'Facebook', 'https://facebook.com/yourshow', POST_ICON],
  ['x', 'X', 'https://x.com/yourshow', POST_ICON],
  ['threads', 'Threads', 'https://threads.net/@yourshow', POST_ICON],
  ['reddit', 'Reddit', 'https://reddit.com/r/yourshow', POST_ICON],
  ['linkedin', 'LinkedIn', 'https://linkedin.com/company/yourshow', POST_ICON],
  ['website', 'Website', 'https://yourshow.example.com', LINK_ICON],
];

function socialLinks(show) {
  const social = show.social || {};
  return SOCIAL.filter(([key]) => social[key])
    .map(([key, label, , icon]) => ({ url: social[key], label, icon }));
}

function socialRow(show) {
  const list = socialLinks(show);
  if (!list.length) return '';
  return `<div class="subscribe social">
    <span class="sub-label">Find us on</span>
    ${list.map((l) => `<a class="sub-btn" href="${esc(l.url)}" target="_blank" rel="noopener noreferrer">${l.icon}<span>${esc(l.label)}</span></a>`).join('')}
  </div>`;
}

// Everything a listener can pay through: the services above, plus the
// funding URL typed in by hand.
function supportLinks(show) {
  const support = show.support || {};
  const list = SUPPORT.filter(([key]) => support[key])
    .map(([key, label, , , icon]) => ({ url: support[key], label, icon }));
  if (show.funding && show.funding.url) {
    list.push({ url: show.funding.url, label: show.funding.label || 'Support the show', icon: COIN_ICON });
  }
  return list;
}

function supportRow(show) {
  const list = supportLinks(show);
  if (!list.length) return '';
  return `<div class="subscribe support">
    <span class="sub-label">Support the show</span>
    ${list.map((l) => `<a class="sub-btn" href="${esc(l.url)}" target="_blank" rel="noopener noreferrer">${l.icon}<span>${esc(l.label)}</span></a>`).join('')}
  </div>`;
}

const RSS_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M5 3c8.8 0 16 7.2 16 16h-3C18 11.8 12.2 6 5 6V3zm0 6c5.5 0 10 4.5 10 10h-3c0-3.9-3.1-7-7-7V9zm1.5 6a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5z"/></svg>';

// Subscribing, following and chipping in were three loose rows tacked
// under the description, each a different length, none of them looking
// like anything. They are one card now: a column per thing a listener
// might want to do, with the feed address along the bottom for the app
// that asks for a URL.
function listenCard(show, domain) {
  const links = show.links || {};
  const feedUrl = `https://${domain}/shows/${show.slug}/feed.xml`;
  const apps = APPS.filter(([key]) => links[key])
    .map(([key, label, icon]) => `<a class="sub-btn" href="${esc(links[key])}" target="_blank" rel="noopener noreferrer">${icon}<span>${esc(label)}</span></a>`)
    .join('');
  const social = socialLinks(show)
    .map((l) => `<a class="sub-btn" href="${esc(l.url)}" target="_blank" rel="noopener noreferrer">${l.icon}<span>${esc(l.label)}</span></a>`)
    .join('');
  const support = supportLinks(show)
    .map((l) => `<a class="sub-btn" href="${esc(l.url)}" target="_blank" rel="noopener noreferrer">${l.icon}<span>${esc(l.label)}</span></a>`)
    .join('');

  const groups = [
    ['Listen', `${apps}<a class="sub-btn" href="/shows/${esc(show.slug)}/feed.xml">${RSS_ICON}<span>RSS</span></a>`],
    ['Follow', social],
    ['Support', support],
  ].filter(([, content]) => content);

  return `<section class="panel listen-card">
    <div class="listen-groups" data-groups="${groups.length}">
      ${groups.map(([title, content]) => `<div class="listen-group">
        <h2 class="listen-title">${esc(title)}</h2>
        <div class="sub-btns">${content}</div>
      </div>`).join('')}
    </div>
    <div class="feed-row">
      <span class="feed-label">${RSS_ICON} Feed address</span>
      <code class="feed-url">${esc(feedUrl)}</code>
      <button class="btn-secondary btn-small" type="button" data-copy-feed="${esc(feedUrl)}"><span>Copy</span></button>
    </div>
  </section>`;
}

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
  return `<${tag} controls preload="none" src="${esc(mediaPath(episode))}"></${tag}>`;
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

// ---------- Hosts ----------
// A podcast is its people, so each host is a record of their own (name,
// role, photo, write-up) rather than a line in a list. They appear as
// cards on /hosts and each has a page of their own.
function hosts(show) {
  // Instances filled in before hosts had records of their own kept a
  // plain "Name | role" list; the feed still speaks for those.
  const list = Array.isArray(show.hosts) && show.hosts.length
    ? show.hosts
    : (show.persons || []);
  return list.filter((h) => h && h.name);
}

function hostSlug(host) {
  return host.slug || slugify(host.name) || host.id;
}

function hostUrl(host, domain) {
  const base = domain ? `https://${domain}` : '';
  return `${base}/hosts/${hostSlug(host)}`;
}

// The small web copy first, so a page of twenty faces stays quick.
function hostPhoto(host) { return host.photoWeb || host.photo || ''; }

// The show's own menu. Pages beyond the front page only appear once
// there is something on them.
function siteNav(show, current = '') {
  const items = [['/', 'Home', current === 'home']];
  if (hosts(show).length) items.push(['/hosts', 'Hosts', current === 'hosts']);
  return items.length > 1 ? items : [];
}

function initials(name) {
  return String(name).trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}

// The first line of a write-up is not a summary of it: "Hi there! I'm
// Charlie." is a greeting, and a card showing only that next to cards
// showing four lines looks broken. So the card summarises the whole
// piece - paragraphs run together, cut at a word - and every host gets
// the same amount of it.
function summarise(text, limit = 150) {
  const flat = String(text || '').replace(/\s+/g, ' ').trim();
  if (flat.length <= limit) return { text: flat, more: false };
  const cut = flat.slice(0, limit);
  const space = cut.lastIndexOf(' ');
  const trimmed = (space > limit * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,;:.!?-]+$/, '');
  return { text: trimmed, more: true };
}

function hostCard(host, domain) {
  const photo = hostPhoto(host);
  return `
      <a class="panel host-card" href="${esc(hostUrl(host, ''))}">
        ${photo
          ? `<img class="host-photo" src="${esc(photo)}" alt="" width="140" height="140" loading="lazy">`
          : `<span class="host-photo host-photo-blank" aria-hidden="true">${esc(initials(host.name))}</span>`}
        <span class="host-card-text">
          <span class="host-name">${esc(host.name)}</span>
          ${host.role ? `<span class="host-role">${esc(host.role)}</span>` : ''}
          ${host.bio ? (() => { const s = summarise(host.bio); return `<span class="host-snip">${esc(s.text)}${s.more ? '&hellip;' : ''}</span>`; })() : ''}
        </span>
      </a>`;
}

// Paragraphs, not one wall of text: the write-up is what makes the page
// worth visiting.
function paragraphs(text) {
  return String(text || '').split(/\n{2,}/).map((para) => para.trim()).filter(Boolean)
    .map((para) => `<p>${esc(para).replaceAll('\n', '<br>')}</p>`).join('');
}

function hostsPage(show, domain) {
  const list = hosts(show);
  return publicPage({
    title: `Hosts - ${show.name}`,
    description: `The people behind ${show.name}.`,
    image: show.banner || show.artwork || '',
    icon: showArtWeb(show),
    nav: siteNav(show, 'hosts'),
    theme: show.theme,
    footer: (show.theme || {}).footer || '',
    body: `
  <section class="panel hero hosts-hero">
    <h1>Hosts</h1>
    <p class="lede">The people behind ${esc(show.name)}.</p>
  </section>
  ${list.length
    ? `<section class="host-grid">${list.map((h) => hostCard(h, domain)).join('')}</section>`
    : '<div class="panel"><p class="hint">No hosts listed yet.</p></div>'}`,
  });
}

function hostPage(show, host, domain) {
  const photo = hostPhoto(host);
  const others = hosts(show).filter((h) => hostSlug(h) !== hostSlug(host));
  return publicPage({
    title: `${host.name} - ${show.name}`,
    description: host.role ? `${host.name}, ${host.role} on ${show.name}.` : `${host.name} on ${show.name}.`,
    image: photo ? absolute(host.photo || photo, domain) : (show.artwork || ''),
    icon: showArtWeb(show),
    nav: siteNav(show, 'hosts'),
    theme: show.theme,
    footer: (show.theme || {}).footer || '',
    body: `
  <article class="panel host-page">
    <div class="host-side">
      ${photo
        ? `<img class="host-photo large" src="${esc(photo)}" alt="" width="200" height="200">`
        : `<span class="host-photo host-photo-blank large" aria-hidden="true">${esc(initials(host.name))}</span>`}
      <div class="host-side-text">
        <h1>${esc(host.name)}</h1>
        ${host.role ? `<p class="host-role">${esc(host.role)}</p>` : ''}
        ${host.link ? `<p class="hint"><a href="${esc(host.link)}" rel="noopener noreferrer">${esc(host.link.replace(/^https?:\/\//, ''))}</a></p>` : ''}
      </div>
    </div>
    ${host.bio ? `<div class="host-bio">${paragraphs(host.bio)}</div>` : ''}
  </article>
  ${others.length
    ? `<section class="host-more">
        <h2 class="section-title">The rest of the team</h2>
        <div class="host-grid">${others.map((h) => hostCard(h, domain)).join('')}</div>
      </section>`
    : ''}`,
  });
}

// Which banner to draw. A show can have both a still and a video, and
// the operator says which: the video, the still, or a toss-up on every
// visit. With only one of the two uploaded there is nothing to choose,
// so the choice is ignored rather than leaving the strip empty.
function bannerKind(show, roll = Math.random) {
  const hasVideo = !!show.bannerVideo;
  const hasImage = !!show.banner;
  if (!hasVideo && !hasImage) return 'none';
  if (!hasVideo) return 'image';
  if (!hasImage) return 'video';
  const mode = show.bannerMode || 'video';
  if (mode === 'image') return 'image';
  if (mode === 'random') return roll() < 0.5 ? 'video' : 'image';
  return 'video';
}

function bannerMarkup(show) {
  const kind = bannerKind(show);
  if (kind === 'none') return '';
  if (kind === 'image') return `<div class="show-banner"><img src="${esc(showBannerWeb(show))}" alt=""></div>`;
  // The poster is the video's own first frame where we have one. Using
  // the still banner instead meant a refresh showed the photograph and
  // then swapped to the video a moment later: a flash of the wrong
  // picture on every visit.
  const poster = show.bannerVideoPoster || '';
  return `<div class="show-banner"><video src="${esc(show.bannerVideo)}"${poster ? ` poster="${esc(poster)}"` : ''} autoplay muted${show.bannerLoop === false ? '' : ' loop'} playsinline preload="auto" aria-hidden="true" style="object-position: ${Number(show.bannerFocusX ?? 50)}% ${Number(show.bannerFocusY ?? 50)}%"></video></div>`;
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
    icon: showArtWeb(show),
    nav: siteNav(show, 'home'),
    theme: show.theme,
    footer: (show.theme || {}).footer || '',
    body: `
  ${bannerMarkup(show)}
  <section class="panel hero show-hero">
    ${show.artwork ? `<img class="show-art" src="${esc(showArtWeb(show))}" alt="${esc(show.name)} artwork" width="160" height="160">` : ''}
    <div class="show-hero-text">
    <h1>${esc(show.name)}</h1>
    ${(show.theme || {}).tagline ? `<p class="tagline">${esc(show.theme.tagline)}</p>` : ''}
    <p class="lede">${esc(show.description)}</p>
    </div>
  </section>
  ${listenCard(show, domain)}
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
    icon: showArtWeb(show),
    nav: siteNav(show),
    theme: show.theme,
    footer: (show.theme || {}).footer || '',
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

// podcast:person carries the role, the photo and a link, so apps that
// show a host's face get it straight from the feed.
function personTags(show, domain) {
  return hosts(show)
    .map((h) => {
      const img = h.photo ? ` img="${escXml(absolute(h.photo, domain))}"` : '';
      // Only a real host record has a page to point at; a legacy line
      // has nothing behind it, so it goes out as a bare name.
      const page = (h.id || h.slug) && domain ? hostUrl(h, domain) : '';
      const href = h.link ? ` href="${escXml(h.link)}"` : (page ? ` href="${escXml(page)}"` : '');
      return `<podcast:person${h.role ? ` role="${escXml(h.role)}"` : ''}${img}${href}>${escXml(h.name)}</podcast:person>`;
    })
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
      <enclosure url="${escXml(absolute(mediaPath(episode), domain))}" length="${Number(episode.bytes) || 0}" type="${escXml(mediaType(episode.mediaUrl))}"/>
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
    ${supportLinks(show).map((l) => `<podcast:funding url="${escXml(l.url)}">${escXml(l.label)}</podcast:funding>`).join('\n    ')}
    ${personTags(show, domain)}
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

module.exports = { bannerKind, bannerMarkup, landing, showsIndex, showPage, episodePage, hostsPage, hostPage, hosts, hostSlug, feed, embedPage, chaptersJson, mediaType, visible, artFor, episodeSlug, episodeUrl, subscribeRow, listenCard, supportRow, supportLinks, socialRow, socialLinks, slugify, APPS, SUPPORT, SOCIAL };

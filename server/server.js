'use strict';
// FOSSCast server: the public site, the media and feed routes and the
// admin area, in one process. Zero runtime npm dependencies.

const http = require('http');
const fs = require('fs');
const path = require('path');

const { Store } = require('./lib/store');
const { createAdminRouter } = require('./lib/admin');
const { Stats } = require('./lib/stats');
const media = require('./lib/media');
const publicSite = require('./lib/public');
const feedAliases = require('./lib/feedaliases');
const transcripts = require('./lib/transcripts');

const HTTP_PORT = Number(process.env.HTTP_PORT || 3100);
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const WEB_DIR = path.resolve(process.env.WEB_DIR || path.join(__dirname, '..', 'web'));
const config = require('./lib/config');
const { siteDomain } = require('./lib/domain');
const VERSION = require('./package.json').version;

const store = new Store(DATA_DIR);
// Before anything reads a setting: anything still in the environment is
// moved into the store, once, and said so in the log.
config.adopt(store);

const MIME = {
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

// The same reasoning as the media files below: a feed is meant to be
// read by anything, and a page listing a show's latest episodes reads it
// from the visitor's own browser. Without this the browser refuses, and
// the page shows whatever somebody last typed in by hand.
const FEED_CORS = { 'Access-Control-Allow-Origin': '*' };

function send(res, status, body, headers = {}) {
  res.writeHead(status, headers);
  res.end(body);
}

function sendJson(res, status, obj) {
  send(res, status, JSON.stringify(obj), {
    'Content-Type': 'application/json; charset=utf-8',
  });
}

function sendHtml(res, page, status = 200) {
  send(res, status, page, { 'Content-Type': 'text/html; charset=utf-8' });
}

function readBody(req, limit = 64 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error('body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

const MEDIA_DIR = path.join(DATA_DIR, 'media');
const stats = new Stats(store);
const admin = createAdminRouter({ store, readBody, mediaDir: MEDIA_DIR, dataDir: DATA_DIR, stats });

function clientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  if (xff) return String(xff).split(',')[0].trim();
  return req.socket.remoteAddress || 'unknown';
}

// Demo instances are read-only everywhere, not just in the dashboard:
// nothing can be uploaded, so there is nothing for a visitor to spoil
// for the next one.
const DEMO = process.env.DEMO_MODE === '1';

// decodeURIComponent throws on a malformed escape - "%" on its own is
// enough - and an exception in a request handler takes the whole
// process down with it. Anything decoding a path from a stranger goes
// through here.
function safeDecode(value) {
  try { return decodeURIComponent(value); } catch { return null; }
}

function serveStatic(res, urlPath) {
  const file = path.resolve(path.join(WEB_DIR, urlPath));
  if (!file.startsWith(WEB_DIR + path.sep)) return send(res, 404, 'not found');
  const type = MIME[path.extname(file).toLowerCase()];
  if (!type) return send(res, 404, 'not found');
  const stream = fs.createReadStream(file);
  stream.on('error', () => send(res, 404, 'not found'));
  stream.on('open', () => {
    res.writeHead(200, {
      'Content-Type': type,
      'Cache-Control': 'public, max-age=86400',
    });
    stream.pipe(res);
  });
}

// One bad request should cost that request, not the site: without this,
// anything thrown while routing ends the process and every listener
// gets nothing until the container restarts.
const server = http.createServer((req, res) => {
  try {
    route(req, res);
  } catch (err) {
    console.error('request failed:', err.message);
    if (!res.headersSent) send(res, 500, 'server error');
    else res.end();
  }
});

function route(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const p = url.pathname;

  if (req.method === 'PUT' && p === '/admin/api/upload') {
    if (DEMO) return sendJson(res, 403, { error: 'demo instance is read-only' });
    if (!admin.currentUser(req)) return sendJson(res, 401, { error: 'not signed in' });
    media.saveUpload(req, MEDIA_DIR, url.searchParams.get('show') || 'show', url.searchParams.get('filename') || 'file')
      .then((result) => sendJson(res, 200, result))
      .catch((err) => sendJson(res, 400, { error: err.message }));
    return;
  }

  // An episode whose media lives elsewhere. The listener's app asks us
  // first, we count that exactly as we count a file we serve ourselves,
  // then we tell it where the file really is and it goes and gets it.
  // No audio passes through this server; we only see the request.
  if (p.startsWith('/d/') && (req.method === 'GET' || req.method === 'HEAD')) {
    const decoded = safeDecode(p.slice(3));
    const id = decoded === null ? '' : decoded.replace(/\.[a-z0-9]+$/i, '');
    const episode = store.load('episodes', []).find((e) => e.id === id);
    // Only ever forward to a real web address, and never to media we
    // hold ourselves: that has its own route, which serves byte ranges.
    // And only for an episode the public can already see - a draft or a
    // dated-ahead episode is not published yet, and handing out its
    // address here would publish it.
    const published = episode && publicSite.visible([episode]).length === 1;
    if (!published || !/^https?:\/\//i.test(episode.mediaUrl || '')) {
      send(res, 404, 'not found');
      return;
    }
    if (req.method === 'GET') {
      const range = req.headers.range;
      if (!range || /^bytes=0-/.test(range)) {
        stats.record(episode.id, clientIp(req), req.headers['user-agent'] || '', {
          headers: req.headers,
          published: episode.date,
        });
      }
    }
    // Temporary on purpose: a permanent redirect would be cached by the
    // app, and the next download would never be seen.
    //
    // The header lets a web player fetch an episode to keep for offline
    // listening. Without it a browser refuses the read - not because the
    // audio is private (it is a public podcast, and anything can already
    // download it) but because the rule exists for pages that are not.
    res.writeHead(302, {
      Location: episode.mediaUrl,
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
    });
    res.end();
    return;
  }

  if (p.startsWith('/media/') && (req.method === 'GET' || req.method === 'HEAD')) {
    // Count a download on the first byte of an episode file (full GETs
    // or ranges starting at 0), deduplicated per listener per day.
    if (req.method === 'GET') {
      const range = req.headers.range;
      if (!range || /^bytes=0-/.test(range)) {
        const episode = store.load('episodes', []).find((e) => e.mediaUrl === p);
        if (episode) {
          stats.record(episode.id, clientIp(req), req.headers['user-agent'] || '', {
            headers: req.headers,
            published: episode.date,
          });
        }
      }
    }
    // Published media is public by definition, and saying so lets a
    // browser read it: an embedded player on somebody else's page, a
    // waveform drawn in a tab, a transcriber working on the podcaster's
    // own machine. Without this a script can play the file but never
    // look at it, which is a distinction no listener benefits from.
    res.setHeader('Access-Control-Allow-Origin', '*');
    return media.serveMedia(req, res, MEDIA_DIR, p);
  }

  if (p.startsWith('/admin') || p === '/help') {
    admin.handle(req, res, url).catch((err) => {
      console.error('admin error:', err.message);
      if (!res.headersSent) send(res, 500, 'server error');
    });
    return;
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return send(res, 405, 'method not allowed');
  }
  if (p === '/healthz') {
    return sendJson(res, 200, { ok: true, uptime: Math.round(process.uptime()) });
  }
  if (p === '/version') return sendJson(res, 200, { version: VERSION });
  if (p === '/') {
    // Before anybody owns this, the front page is not a front page: it is
    // a person who has just run the thing and been told by the log to open
    // it in a browser. Sending them to a landing page with no way in makes
    // a liar of that line - Charlie went looking for the setup screen and
    // found a marketing page - so while the instance is unclaimed the
    // address in the log leads where the log says it will.
    if (!store.load('users', []).length) {
      res.writeHead(302, { Location: '/admin/setup' });
      return res.end();
    }
    // One instance is one podcast, so the front page is that show, not a
    // generic landing. The landing only shows before a show exists.
    const shows = store.load('shows', []);
    if (shows.length) {
      const show = shows[0];
      const items = store.load('episodes', [])
        .filter((e) => e.showId === show.id)
        .sort((a, b) => (a.date < b.date ? 1 : -1));
      return sendHtml(res, publicSite.showPage(show, items, siteDomain()));
    }
    return sendHtml(res, publicSite.landing());
  }

  if (p === '/shows') {
    return sendHtml(res, publicSite.showsIndex(
      store.load('shows', []),
      store.load('episodes', []),
    ));
  }
  // An address this show's last host used, kept alive so a podcaster
  // who moved never has to edit a directory entry. Permanent, so the
  // directories update themselves and stop relying on it.
  const aliased = feedAliases.match(store.load('shows', []), p);
  if (aliased) {
    // The header goes on the redirect too: a browser checks every hop of
    // a chain, so an alias without it fails a page the real address
    // would have served.
    res.writeHead(301, { Location: `/shows/${aliased.slug}/feed.xml`, ...FEED_CORS });
    return res.end();
  }

  const showMatch = p.match(/^\/shows\/([a-z0-9-]+)(\/feed\.xml)?$/);
  if (showMatch) {
    const show = store.load('shows', []).find((s) => s.slug === showMatch[1]);
    if (!show) return send(res, 404, 'not found');
    const items = store.load('episodes', [])
      .filter((e) => e.showId === show.id)
      .sort((a, b) => (a.date < b.date ? 1 : -1));
    if (showMatch[2]) {
      // Apps poll the feed about once a day, so counting distinct
      // pullers is the nearest honest thing to a subscriber count.
      stats.recordFeed(clientIp(req), req.headers['user-agent'] || '');
      return send(res, 200, publicSite.feed(show, items, siteDomain()), {
        'Content-Type': 'application/rss+xml; charset=utf-8',
        ...FEED_CORS,
      });
    }
    return sendHtml(res, publicSite.showPage(show, items, siteDomain()));
  }

  // The hosts pages: the team as cards, and one page each. The instance
  // holds a single podcast, so these sit at the top level rather than
  // under the show's slug.
  const hostsMatch = p.match(/^\/hosts(?:\/([a-z0-9][a-z0-9-]*))?$/);
  if (hostsMatch) {
    const show = store.load('shows', [])[0];
    if (!show) return send(res, 404, 'not found');
    if (!hostsMatch[1]) return sendHtml(res, publicSite.hostsPage(show));
    const host = publicSite.hosts(show)
      .find((h) => publicSite.hostSlug(h) === hostsMatch[1] || h.id === hostsMatch[1]);
    if (!host) return send(res, 404, 'not found');
    return sendHtml(res, publicSite.hostPage(show, host, siteDomain()));
  }

  const chaptersMatch = p.match(/^\/api\/v1\/episodes\/([a-f0-9-]+)\/chapters\.json$/);
  if (chaptersMatch) {
    const episode = store.load('episodes', []).find((e) => e.id === chaptersMatch[1]);
    if (!episode || episode.draft) return sendJson(res, 404, { error: 'not found' });
    return sendJson(res, 200, publicSite.chaptersJson(episode));
  }

  const embedMatch = p.match(/^\/embed\/([a-f0-9-]+)$/);
  if (embedMatch) {
    const episode = store.load('episodes', []).find((e) => e.id === embedMatch[1]);
    const show = episode && store.load('shows', []).find((s) => s.id === episode.showId);
    if (!episode || !show || episode.draft) return send(res, 404, 'not found');
    return sendHtml(res, publicSite.embedPage(show, episode, siteDomain()));
  }

  // An episode's own page: what podcast apps link to from the feed.
  const episodeMatch = p.match(/^\/shows\/([a-z0-9-]+)\/([a-z0-9][a-z0-9-]*)$/);
  if (episodeMatch && episodeMatch[2] !== 'feed.xml') {
    const show = store.load('shows', []).find((s) => s.slug === episodeMatch[1]);
    if (!show) return send(res, 404, 'not found');
    const wanted = episodeMatch[2];
    const episode = publicSite.visible(store.load('episodes', []).filter((e) => e.showId === show.id))
      .find((e) => publicSite.episodeSlug(e) === wanted || e.id === wanted);
    if (!episode) return send(res, 404, 'not found');
    // The transcript is a file, so reading it is the server's job; the
    // page is handed cues and does no file work of its own. Only when
    // the episode has been switched to show it, so an instance that has
    // not is doing no extra reading at all.
    const said = episode.transcriptPublic && episode.transcript
      ? transcripts.parseCues(transcripts.read(MEDIA_DIR, episode.transcript) || '')
      : null;
    return sendHtml(res, publicSite.episodePage(show, episode, siteDomain(), said));
  }

  // The three directories the image ships, plus /js/: FOSSCast puts no
  // script there itself, and the door is left open on purpose so that
  // an operator mounting their own web/ over the image's can serve one.
  if (p.startsWith('/css/') || p.startsWith('/fonts/') || p.startsWith('/img/') || p.startsWith('/js/')) {
    return serveStatic(res, p);
  }
  send(res, 404, 'not found');
}

server.listen(HTTP_PORT, () => {
  console.log(`FOSSCast ${VERSION} listening on :${HTTP_PORT}`);
});

for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  });
}

module.exports = { server };

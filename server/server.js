'use strict';
// FOSSCast server: the public site, the admin area, the publish API
// and the MediaMTX auth hook. Zero runtime npm dependencies.

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
const DOMAIN = (process.env.DOMAIN || 'localhost').trim();
const VERSION = require('./package.json').version;

const store = new Store(DATA_DIR);

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
  // The HandBrake preset offered on the podcast page.
  '.json': 'application/json',
};

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
// no uploads, no publishing, no chat for anyone to spoil.
const DEMO = process.env.DEMO_MODE === '1';

// Publishing from a studio can be turned off for an instance that does
// not want the door open at all - one whose audio lives somewhere else,
// or that simply never records that way. On by default: an instance
// that says nothing keeps the feature it always had.
const STUDIO_PUBLISHING = !/^(0|off|false|no)$/i.test((process.env.STUDIO_PUBLISHING || '').trim());

// The studio's own key: FOSSStudio (or any other studio) sends it to
// publish a finished recording. Nothing else uses it.
function studioAuthed(req) {
  if (!STUDIO_PUBLISHING) return false;
  const token = (admin.settings().studioToken || '').trim();
  const given = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (!token || !given || given.length !== token.length) return false;
  return require('crypto').timingSafeEqual(Buffer.from(given), Buffer.from(token));
}
const crypto = require('crypto');


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
// Somebody typing addresses into the subscribe box over and over is
// either a bot or a nuisance; either way the mail server should not wear
// it. Sign-ups are rate-limited per address-source the same way logins
// are.
const subscribeLimiter = new (require('./lib/auth').RateLimiter)({ max: 5, windowMs: 10 * 60 * 1000 });

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
    const check = url.searchParams.get('check');
    media.saveUpload(req, MEDIA_DIR, url.searchParams.get('show') || 'show', url.searchParams.get('filename') || 'file')
      .then(async (result) => {
        // A banner video is measured the moment it lands, and thrown
        // away again if it is too big for the job. The alternative -
        // re-encoding whatever arrives - is the one thing a small VPS
        // should not be asked to do.
        if (check === 'banner-video') {
          const file = path.join(DATA_DIR, decodeURIComponent(result.urlPath.slice(1)));
          const info = await media.probeVideo(file);
          const problem = media.bannerVideoProblem(info && { ...info, bytes: result.size });
          if (problem) {
            fs.rm(file, { force: true }, () => {});
            return sendJson(res, 400, { error: problem });
          }
          return sendJson(res, 200, { ...result, width: info.width, height: info.height, duration: info.duration });
        }
        return sendJson(res, 200, result);
      })
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
    res.writeHead(302, { Location: episode.mediaUrl, 'Cache-Control': 'no-store' });
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

  if (p.startsWith('/admin')) {
    admin.handle(req, res, url).catch((err) => {
      console.error('admin error:', err.message);
      if (!res.headersSent) send(res, 500, 'server error');
    });
    return;
  }

  // Publisher API: token-authenticated, used by studios to push
  // episodes. Two steps: PUT the media, then POST the episode.
  if (p === '/api/v1/media' && req.method === 'PUT') {
    if (DEMO) return sendJson(res, 403, { error: 'demo instance is read-only' });
    if (!studioAuthed(req)) return sendJson(res, 401, { error: 'bad token' });
    const show = store.load('shows', [])[0];
    if (!show) return sendJson(res, 409, { error: 'no show configured yet' });
    media.saveUpload(req, MEDIA_DIR, show.slug, url.searchParams.get('filename') || 'upload')
      .then((result) => sendJson(res, 200, result))
      .catch((err) => sendJson(res, 400, { error: err.message }));
    return;
  }
  if (p === '/api/v1/episodes' && req.method === 'POST') {
    if (DEMO) return sendJson(res, 403, { error: 'demo instance is read-only' });
    if (!studioAuthed(req)) return sendJson(res, 401, { error: 'bad token' });
    readBody(req).then((raw) => {
      let body;
      try { body = JSON.parse(raw.toString() || '{}'); } catch {
        return sendJson(res, 400, { error: 'bad json' });
      }
      const show = store.load('shows', [])[0];
      if (!show) return sendJson(res, 409, { error: 'no show configured yet' });
      const title = String(body.title || '').trim().slice(0, 200);
      const mediaUrl = String(body.mediaUrl || '').trim().slice(0, 1000);
      const validUrl = /^https?:\/\//.test(mediaUrl) || /^\/media\/[^/]+\/[^/]+$/.test(mediaUrl);
      if (!title || !validUrl) return sendJson(res, 400, { error: 'title and mediaUrl required' });
      const list = store.load('episodes', []);
      const episode = {
        id: crypto.randomUUID(),
        showId: show.id,
        title,
        date: /^\d{4}-\d{2}-\d{2}$/.test(body.date) ? body.date : new Date().toISOString().slice(0, 10),
        mediaUrl,
        description: String(body.description || '').trim().slice(0, 4000),
        episode: Number(body.episode) || null,
        season: Number(body.season) || null,
        type: ['full', 'trailer', 'bonus'].includes(body.type) ? body.type : 'full',
        draft: body.draft !== false, // arrives as a draft unless told otherwise
        createdAt: new Date().toISOString(),
      };
      list.push(episode);
      store.save('episodes', list);
      admin.measureEpisode(episode.id);
      sendJson(res, 200, { ok: true, id: episode.id, draft: episode.draft, editUrl: `https://${DOMAIN}/admin/episodes/${episode.id}` });
    }).catch(() => sendJson(res, 400, { error: 'bad request' }));
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
    // One instance is one podcast, so the front page is that show, not a
    // generic landing. The landing only shows before a show exists.
    const shows = store.load('shows', []);
    if (shows.length) {
      const show = shows[0];
      const items = store.load('episodes', [])
        .filter((e) => e.showId === show.id)
        .sort((a, b) => (a.date < b.date ? 1 : -1));
      return sendHtml(res, publicSite.showPage(show, items, DOMAIN));
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
    res.writeHead(301, { Location: `/shows/${aliased.slug}/feed.xml` });
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
      return send(res, 200, publicSite.feed(show, items, DOMAIN), {
        'Content-Type': 'application/rss+xml; charset=utf-8',
      });
    }
    return sendHtml(res, publicSite.showPage(show, items, DOMAIN));
  }

  // The hosts pages: the team as cards, and one page each. The instance
  // holds a single podcast, so these sit at the top level rather than
  // under the show's slug.
  const hostsMatch = p.match(/^\/hosts(?:\/([a-z0-9][a-z0-9-]*))?$/);
  if (hostsMatch) {
    const show = store.load('shows', [])[0];
    if (!show) return send(res, 404, 'not found');
    if (!hostsMatch[1]) return sendHtml(res, publicSite.hostsPage(show, DOMAIN));
    const host = publicSite.hosts(show)
      .find((h) => publicSite.hostSlug(h) === hostsMatch[1] || h.id === hostsMatch[1]);
    if (!host) return send(res, 404, 'not found');
    return sendHtml(res, publicSite.hostPage(show, host, DOMAIN));
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
    return sendHtml(res, publicSite.embedPage(show, episode, DOMAIN));
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
    return sendHtml(res, publicSite.episodePage(show, episode, DOMAIN, said));
  }

  if (p.startsWith('/css/') || p.startsWith('/fonts/') || p.startsWith('/img/') || p.startsWith('/js/') || p.startsWith('/presets/')) {
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

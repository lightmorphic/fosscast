'use strict';
// FOSSCast server: the public site, the admin area, the publish API
// and the MediaMTX auth hook. Zero runtime npm dependencies.

const http = require('http');
const fs = require('fs');
const path = require('path');

const { Store } = require('./lib/store');
const { createAdminRouter } = require('./lib/admin');
const { ChatHub } = require('./lib/chat');
const { LiveStatus } = require('./lib/live');
const publicSite = require('./lib/public');

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
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
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

const chat = new ChatHub(store);
const liveStatus = new LiveStatus({
  onChange(streamKey, isLive) {
    const show = store.load('shows', []).find((s) => s.streamKey === streamKey);
    if (show) chat.broadcast(show.id, { type: 'status', live: isLive });
  },
});
const admin = createAdminRouter({ store, readBody, chat });

const MEDIAMTX_HLS = process.env.MEDIAMTX_HLS || 'http://mediamtx:8888';

function clientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  if (xff) return String(xff).split(',')[0].trim();
  return req.socket.remoteAddress || 'unknown';
}

// Public HLS playback is proxied per show slug so stream keys never
// appear in viewer-facing URLs.
function proxyHls(req, res, show, rest, search) {
  if (!/^[a-zA-Z0-9._-]*$/.test(rest)) return send(res, 404, 'not found');
  const target = new URL(`${MEDIAMTX_HLS}/live/${show.streamKey}/${rest}${search}`);
  const upstream = http.request(target, { method: 'GET' }, (up) => {
    const headers = { 'Cache-Control': 'no-store' };
    if (up.headers['content-type']) headers['Content-Type'] = up.headers['content-type'];
    res.writeHead(up.statusCode, headers);
    up.pipe(res);
  });
  upstream.on('error', () => send(res, 502, 'stream unavailable'));
  upstream.end();
}

// MediaMTX asks us to authorise every publish and every play attempt.
// Publishing needs a show's stream key (the path is live/<key>);
// playback is public. Everything else (api, metrics, pprof) is denied.
async function mediamtxAuth(req, res) {
  let body;
  try {
    body = JSON.parse((await readBody(req)).toString() || '{}');
  } catch {
    return sendJson(res, 400, { error: 'bad request' });
  }
  const action = body.action;
  const streamPath = body.path;
  if (action === 'read' || action === 'playback') return send(res, 200, 'ok');
  if (action === 'publish') {
    const key = typeof streamPath === 'string' && streamPath.startsWith('live/')
      ? streamPath.slice('live/'.length)
      : '';
    if (key && admin.shows().some((show) => show.streamKey === key)) {
      return send(res, 200, 'ok');
    }
    return sendJson(res, 401, { error: 'invalid stream key' });
  }
  return sendJson(res, 401, { error: 'forbidden' });
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

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const p = url.pathname;

  if (req.method === 'POST' && p === '/api/internal/mediamtx-auth') {
    mediamtxAuth(req, res).catch(() => sendJson(res, 500, { error: 'auth error' }));
    return;
  }

  if (p.startsWith('/admin')) {
    admin.handle(req, res, url).catch((err) => {
      console.error('admin error:', err.message);
      if (!res.headersSent) send(res, 500, 'server error');
    });
    return;
  }

  // Chat API: SSE out, POST in, recent messages as JSON.
  const chatMatch = p.match(/^\/api\/v1\/shows\/([a-z0-9-]+)\/(chat\/stream|chat\/messages|live)$/);
  if (chatMatch) {
    const show = store.load('shows', []).find((s) => s.slug === chatMatch[1]);
    if (!show) return sendJson(res, 404, { error: 'unknown show' });
    const endpoint = chatMatch[2];
    if (endpoint === 'chat/stream' && req.method === 'GET') {
      return chat.join(show.id, res);
    }
    if (endpoint === 'chat/messages' && req.method === 'GET') {
      return sendJson(res, 200, { messages: chat.recent(show.id) });
    }
    if (endpoint === 'chat/messages' && req.method === 'POST') {
      readBody(req).then((raw) => {
        let body;
        try { body = JSON.parse(raw.toString() || '{}'); } catch {
          return sendJson(res, 400, { error: 'bad json' });
        }
        const result = chat.post(show.id, {
          name: body.name, text: body.text, ip: clientIp(req),
        });
        if (result.error) return sendJson(res, result.status, { error: result.error });
        sendJson(res, 200, { ok: true, id: result.id });
      }).catch(() => sendJson(res, 400, { error: 'bad request' }));
      return;
    }
    if (endpoint === 'live' && req.method === 'GET') {
      return sendJson(res, 200, {
        live: liveStatus.isLive(show.streamKey),
        since: liveStatus.since(show.streamKey),
      });
    }
    return send(res, 405, 'method not allowed');
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return send(res, 405, 'method not allowed');
  }
  if (p === '/healthz') {
    return sendJson(res, 200, { ok: true, uptime: Math.round(process.uptime()) });
  }
  if (p === '/version') return sendJson(res, 200, { version: VERSION });
  if (p === '/') return sendHtml(res, publicSite.landing());

  if (p === '/shows') {
    return sendHtml(res, publicSite.showsIndex(
      store.load('shows', []),
      store.load('episodes', []),
    ));
  }
  const showMatch = p.match(/^\/shows\/([a-z0-9-]+)(\/feed\.xml)?$/);
  if (showMatch) {
    const show = store.load('shows', []).find((s) => s.slug === showMatch[1]);
    if (!show) return send(res, 404, 'not found');
    const items = store.load('episodes', [])
      .filter((e) => e.showId === show.id)
      .sort((a, b) => (a.date < b.date ? 1 : -1));
    if (showMatch[2]) {
      return send(res, 200, publicSite.feed(show, items, DOMAIN), {
        'Content-Type': 'application/rss+xml; charset=utf-8',
      });
    }
    return sendHtml(res, publicSite.showPage(show, items, DOMAIN, liveStatus.isLive(show.streamKey)));
  }

  const liveMatch = p.match(/^\/live\/([a-z0-9-]+)$/);
  if (liveMatch) {
    const show = store.load('shows', []).find((s) => s.slug === liveMatch[1]);
    if (!show) return send(res, 404, 'not found');
    return sendHtml(res, publicSite.livePage(show, {
      live: liveStatus.isLive(show.streamKey),
      embed: url.searchParams.get('embed') === '1',
    }));
  }

  const hlsMatch = p.match(/^\/hls\/([a-z0-9-]+)\/(.*)$/);
  if (hlsMatch) {
    const show = store.load('shows', []).find((s) => s.slug === hlsMatch[1]);
    if (!show) return send(res, 404, 'not found');
    return proxyHls(req, res, show, hlsMatch[2], url.search);
  }

  if (p.startsWith('/css/') || p.startsWith('/fonts/') || p.startsWith('/img/') || p.startsWith('/js/')) {
    return serveStatic(res, p);
  }
  send(res, 404, 'not found');
});

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

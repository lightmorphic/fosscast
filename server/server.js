'use strict';
// FOSSCast server: the public site, the publish API and the MediaMTX
// auth hook. Zero runtime npm dependencies, plain Node.

const http = require('http');
const fs = require('fs');
const path = require('path');

const HTTP_PORT = Number(process.env.HTTP_PORT || 3100);
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const WEB_DIR = path.resolve(process.env.WEB_DIR || path.join(__dirname, '..', 'web'));
const STREAM_KEY = (process.env.STREAM_KEY || '').trim();
const VERSION = require('./package.json').version;

fs.mkdirSync(DATA_DIR, { recursive: true });

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

// MediaMTX asks us to authorise every publish and every play attempt.
// Publishing needs the stream key (the path is live/<key>); playback is
// public. Everything else (api, metrics, pprof) is denied outright.
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
    if (STREAM_KEY && streamPath === `live/${STREAM_KEY}`) {
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

function landingPage() {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>FOSSCast</title>
<meta name="description" content="The public home of independent shows: live video streams with open chat, and an episode archive you can subscribe to anywhere.">
<link rel="icon" href="/img/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/css/site.css">
</head>
<body>
<header class="top">
  <a class="wordmark" href="/" aria-label="FOSSCast home">
    <svg class="mark" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3.2" fill="currentColor"/><path d="M6.3 17.7a8 8 0 0 1 0-11.4M17.7 6.3a8 8 0 0 1 0 11.4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
    <span>FOSSCast</span>
  </a>
  <a class="top-link" href="https://github.com/lightmorphic/fosscast">Source</a>
</header>

<main class="wrap">
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
  </section>
</main>

<footer class="foot">
  <a class="lightmorphic-badge" href="https://lightmorphic.co.uk" target="_blank" rel="noopener noreferrer" translate="no">
    <span>Created by</span>
    <img src="/img/lightmorphic-dark-tb-250x50-sq.webp" alt="Lightmorphic" width="125" height="25" loading="lazy">
    <span class="external-link-icon" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
        <path d="M15 3h6v6"/>
        <line x1="10" y1="14" x2="21" y2="3"/>
      </svg>
    </span>
  </a>
  <div class="foot-line">FOSSCast &middot; <a href="https://github.com/lightmorphic/fosscast">GitHub</a> &middot; free software under the <a href="https://github.com/lightmorphic/fosscast/blob/main/LICENSE">GNU GPL v3</a></div>
</footer>
</body>
</html>
`;
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const p = url.pathname;

  if (req.method === 'POST' && p === '/api/internal/mediamtx-auth') {
    mediamtxAuth(req, res).catch(() => sendJson(res, 500, { error: 'auth error' }));
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
    return send(res, 200, landingPage(), {
      'Content-Type': 'text/html; charset=utf-8',
    });
  }
  if (p.startsWith('/css/') || p.startsWith('/fonts/') || p.startsWith('/img/')) {
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

'use strict';
// A page that lists a show's latest episodes reads the feed from the
// visitor's own browser, and a browser will not hand a page a file from
// another domain unless the file says it may. So the feed says it may -
// and nothing else here does, because nothing else here is meant to be
// read by a stranger's page.
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const PORT = 5400 + Math.floor(Math.random() * 100);
const BASE = `http://127.0.0.1:${PORT}`;
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'fosscast-cors-'));
const ALLOW = 'access-control-allow-origin';
let child;

async function until(fn, ms = 5000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try { return await fn(); } catch { await new Promise((r) => setTimeout(r, 100)); }
  }
  throw new Error('timed out');
}

before(async () => {
  fs.writeFileSync(path.join(DATA, 'shows.json'), JSON.stringify([{
    id: 'show-1', slug: 'a-show', name: 'A Show', description: 'x', createdAt: 'x',
    feedAliases: ['/rss'],
  }]));
  fs.writeFileSync(path.join(DATA, 'episodes.json'), JSON.stringify([]));
  child = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    env: { ...process.env, HTTP_PORT: String(PORT), DATA_DIR: DATA, DOMAIN: 'cors.example' },
    stdio: 'ignore',
  });
  await until(async () => {
    const res = await fetch(`${BASE}/healthz`);
    if (!res.ok) throw new Error('not up');
  });
});

after(() => { if (child) child.kill(); });

test('the feed may be read by any page', async () => {
  const res = await fetch(`${BASE}/shows/a-show/feed.xml`, {
    headers: { Origin: 'https://somebody-elses-site.example' },
  });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.headers.get(ALLOW), '*');
});

test('an old address says so as well, so the redirect can be followed', async () => {
  const res = await fetch(`${BASE}/rss`, { redirect: 'manual' });
  assert.strictEqual(res.status, 301);
  assert.strictEqual(res.headers.get(ALLOW), '*');
});

test('the pages themselves stay unreadable from another page', async () => {
  for (const where of ['/', '/shows', '/shows/a-show', '/healthz', '/version']) {
    const res = await fetch(`${BASE}${where}`, {
      headers: { Origin: 'https://somebody-elses-site.example' },
    });
    assert.strictEqual(res.headers.get(ALLOW), null, `${where} should not be readable`);
  }
});

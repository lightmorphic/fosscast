'use strict';
// Publisher API + stats behaviour against the real server.
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const PORT = 4200 + Math.floor(Math.random() * 100);
const BASE = `http://127.0.0.1:${PORT}`;
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'fosscast-api-'));
let child;
let token;

async function until(fn, ms = 5000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try { return await fn(); } catch { await new Promise((r) => setTimeout(r, 100)); }
  }
  throw new Error('timed out');
}

before(async () => {
  // Pre-seed a show and settings so the API has something to publish to.
  fs.writeFileSync(path.join(DATA, 'shows.json'), JSON.stringify([{
    id: 'show-1', slug: 'test-show', name: 'Test Show', description: '',
    createdAt: 'x',
  }]));
  token = 'tok-' + 'a'.repeat(60);
  fs.writeFileSync(path.join(DATA, 'settings.json'), JSON.stringify({
    secret: 's'.repeat(64), publisherToken: token,
  }));
  child = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    env: { ...process.env, HTTP_PORT: String(PORT), DATA_DIR: DATA, DOMAIN: 'api.example' },
    stdio: 'ignore',
  });
  await until(async () => {
    const res = await fetch(`${BASE}/healthz`);
    if (!res.ok) throw new Error('not up');
  });
});

after(() => {
  child.kill();
  fs.rmSync(DATA, { recursive: true, force: true });
});

test('publish API refuses without the token', async () => {
  const res = await fetch(`${BASE}/api/v1/episodes`, { method: 'POST', body: '{}' });
  assert.strictEqual(res.status, 401);
});

test('media then episode publishes as a draft', async () => {
  const up = await fetch(`${BASE}/api/v1/media?filename=ep.mp3`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}` },
    body: Buffer.from('fake-audio-bytes'),
  });
  assert.strictEqual(up.status, 200);
  const { urlPath } = await up.json();
  assert.match(urlPath, /^\/media\/test-show\/ep\.mp3$/);

  const pub = await fetch(`${BASE}/api/v1/episodes`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'From the studio', mediaUrl: urlPath, description: 'pushed' }),
  });
  assert.strictEqual(pub.status, 200);
  const body = await pub.json();
  assert.ok(body.ok);
  assert.strictEqual(body.draft, true);

  // Draft: hidden from the public feed
  const feed = await (await fetch(`${BASE}/shows/test-show/feed.xml`)).text();
  assert.ok(!feed.includes('From the studio'));
});

test('downloads count once per listener per day', async () => {
  // Publish a public episode pointing at the uploaded media
  await fetch(`${BASE}/api/v1/episodes`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'Public one', mediaUrl: '/media/test-show/ep.mp3', draft: false }),
  });
  for (let i = 0; i < 3; i++) {
    await fetch(`${BASE}/media/test-show/ep.mp3`, { headers: { 'User-Agent': 'PodApp/1.0' } });
  }
  await new Promise((r) => setTimeout(r, 200));
  const stats = JSON.parse(fs.readFileSync(path.join(DATA, 'stats.json'), 'utf8'));
  const totals = Object.values(stats.totals);
  assert.deepStrictEqual(totals, [1]);
});

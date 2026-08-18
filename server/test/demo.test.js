'use strict';
// A demo instance hands its login to strangers, so nothing anywhere
// may be changed: not settings, not episodes, not uploads.
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const PORT = 4400 + Math.floor(Math.random() * 100);
const BASE = `http://127.0.0.1:${PORT}`;
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'fosscast-demo-'));
const PASSWORD = 'a very long demo password';
let child;
let cookie = '';

async function until(fn, ms = 5000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try { return await fn(); } catch { await new Promise((r) => setTimeout(r, 100)); }
  }
  throw new Error('timed out');
}

function form(data) {
  return {
    method: 'POST',
    redirect: 'manual',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', cookie },
    body: new URLSearchParams(data).toString(),
  };
}

before(async () => {
  // A show already exists, as it would on a real demo.
  fs.writeFileSync(path.join(DATA, 'shows.json'), JSON.stringify([{
    id: 'show-1', slug: 'demo-show', name: 'Demo Show', description: 'Look around.',
    createdAt: 'x',
  }]));
  child = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    env: {
      ...process.env,
      HTTP_PORT: String(PORT),
      DATA_DIR: DATA,
      DOMAIN: 'demo.example',
      DEMO_MODE: '1',
      ADMIN_EMAIL: 'demo@demo.example',
      ADMIN_PASSWORD: PASSWORD,
    },
    stdio: 'ignore',
  });
  await until(async () => {
    const res = await fetch(`${BASE}/healthz`);
    if (!res.ok) throw new Error('not up');
  });
  const login = await fetch(`${BASE}/admin/login`, form({
    email: 'demo@demo.example', password: PASSWORD,
  }));
  cookie = login.headers.get('set-cookie').split(';')[0];
});

after(() => {
  child.kill();
  fs.rmSync(DATA, { recursive: true, force: true });
});

test('looking around still works', async () => {
  for (const p of ['/admin', '/admin/shows', '/admin/stats']) {
    const res = await fetch(`${BASE}${p}`, { headers: { cookie } });
    assert.strictEqual(res.status, 200, `${p} should be readable`);
  }
  const dash = await (await fetch(`${BASE}/admin`, { headers: { cookie } })).text();
  assert.ok(dash.includes('Demo instance'), 'the demo banner should be visible');
});

test('no setting, episode or moderation change is accepted', async () => {
  const attempts = [
    ['/admin/shows/demo-show/settings', { name: 'Hacked', description: 'rude words' }],
    ['/admin/shows/demo-show/episodes', { title: 'Rude', date: '2026-01-01', mediaUrl: 'https://x.example/a.mp3' }],
    ['/admin/shows/demo-show/delete', {}],
    ['/admin/account/password', { current: PASSWORD, next: 'brand new password', again: 'brand new password' }],
  ];
  for (const [p, data] of attempts) {
    const res = await fetch(`${BASE}${p}`, form(data));
    assert.strictEqual(res.status, 403, `${p} should be refused`);
  }
  // Nothing was written: the show is untouched and no episode exists.
  const shows = JSON.parse(fs.readFileSync(path.join(DATA, 'shows.json'), 'utf8'));
  assert.strictEqual(shows[0].name, 'Demo Show');
  assert.ok(!fs.existsSync(path.join(DATA, 'episodes.json')));
});

test('uploads are refused, so no stranger can put files on the server', async () => {
  const res = await fetch(`${BASE}/admin/api/upload?show=demo-show&filename=x.mp3`, {
    method: 'PUT', headers: { cookie }, body: Buffer.from('not welcome'),
  });
  assert.strictEqual(res.status, 403);
});

test('the publish API is closed too', async () => {
  const res = await fetch(`${BASE}/api/v1/episodes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'Sneaky', mediaUrl: 'https://x.example/a.mp3' }),
  });
  assert.strictEqual(res.status, 403);
});

test('the public site still reads normally', async () => {
  assert.strictEqual((await fetch(`${BASE}/`)).status, 200);
  assert.strictEqual((await fetch(`${BASE}/shows/demo-show`)).status, 200);
  assert.strictEqual((await fetch(`${BASE}/shows/demo-show/feed.xml`)).status, 200);
});

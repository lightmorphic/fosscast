'use strict';
// Integration test: boots the real server on a random port with a
// temporary data directory and walks the admin flow end to end.
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const PORT = 3900 + Math.floor(Math.random() * 100);
const BASE = `http://127.0.0.1:${PORT}`;
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'fosscast-test-'));
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
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      cookie,
    },
    body: new URLSearchParams(data).toString(),
  };
}

before(async () => {
  child = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    env: {
      ...process.env,
      HTTP_PORT: String(PORT),
      DATA_DIR: DATA,
      DOMAIN: 'test.example',
      ADMIN_EMAIL: 'admin@test.example',
      ADMIN_PASSWORD: 'a very long test password',
    },
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

test('wrong password is rejected', async () => {
  const res = await fetch(`${BASE}/admin/login`, form({
    email: 'admin@test.example', password: 'wrong',
  }));
  assert.strictEqual(res.status, 401);
});

test('login sets a session cookie', async () => {
  const res = await fetch(`${BASE}/admin/login`, form({
    email: 'admin@test.example', password: 'a very long test password',
  }));
  assert.strictEqual(res.status, 303);
  const setCookie = res.headers.get('set-cookie');
  assert.ok(setCookie.includes('fosscast_admin='));
  assert.ok(setCookie.includes('HttpOnly'));
  cookie = setCookie.split(';')[0];
});

test('admin pages need the cookie', async () => {
  const anon = await fetch(`${BASE}/admin`, { redirect: 'manual' });
  assert.strictEqual(anon.status, 303);
  const authed = await fetch(`${BASE}/admin`, { headers: { cookie } });
  assert.strictEqual(authed.status, 200);
  assert.ok((await authed.text()).includes('Dashboard'));
});

test('create a show, publish an episode, see both publicly', async () => {
  let res = await fetch(`${BASE}/admin/shows`, form({
    name: 'Test Show', description: 'A show about tests.',
  }));
  assert.strictEqual(res.status, 303);
  assert.strictEqual(res.headers.get('location'), '/admin/shows/test-show');

  res = await fetch(`${BASE}/admin/shows/test-show/episodes`, form({
    title: 'Episode One',
    date: '2026-08-15',
    mediaUrl: 'https://example.org/media/episode-one.mp3',
    description: 'The first one.',
  }));
  assert.strictEqual(res.status, 303);

  const page = await (await fetch(`${BASE}/shows/test-show`)).text();
  assert.ok(page.includes('Episode One'));
  assert.ok(page.includes('<audio'));

  const feed = await (await fetch(`${BASE}/shows/test-show/feed.xml`)).text();
  assert.ok(feed.includes('<rss'));
  assert.ok(feed.includes('Episode One'));
  assert.ok(feed.includes('type="audio/mpeg"'));
});

test('the episode edit page and the home page render', async () => {
  const list = JSON.parse(fs.readFileSync(path.join(DATA, 'episodes.json'), 'utf8'));
  const editRes = await fetch(`${BASE}/admin/episodes/${list[0].id}`, { headers: { cookie } });
  assert.strictEqual(editRes.status, 200);
  assert.ok((await editRes.text()).includes('Edit episode'));

  const home = await (await fetch(`${BASE}/`)).text();
  assert.ok(home.includes('Test Show'));
  assert.ok(home.includes('Episode One'));
});

test('a second show is refused (this edition manages one podcast)', async () => {
  const res = await fetch(`${BASE}/admin/shows`, form({
    name: 'Second Show', description: 'One too many.',
  }));
  assert.strictEqual(res.status, 303);
  const shows = JSON.parse(fs.readFileSync(path.join(DATA, 'shows.json'), 'utf8'));
  assert.strictEqual(shows.length, 1);
});

test('login rate limiting locks out after repeated failures', async () => {
  for (let i = 0; i < 10; i++) {
    await fetch(`${BASE}/admin/login`, form({ email: 'admin@test.example', password: 'no' }));
  }
  const res = await fetch(`${BASE}/admin/login`, form({
    email: 'admin@test.example', password: 'a very long test password',
  }));
  assert.strictEqual(res.status, 429);
});

test('a one-time sign-in link logs in and cannot be reused', async () => {
  const auth = require('../lib/auth');
  const settings = JSON.parse(fs.readFileSync(path.join(DATA, 'settings.json'), 'utf8'));
  const users = JSON.parse(fs.readFileSync(path.join(DATA, 'users.json'), 'utf8'));
  const token = auth.signLoginLink(users[0].id, settings.secret, 60000);

  const first = await fetch(`${BASE}/admin/session?token=${encodeURIComponent(token)}`, { redirect: 'manual' });
  assert.strictEqual(first.status, 303);
  assert.strictEqual(first.headers.get('location'), '/admin');
  assert.ok(first.headers.get('set-cookie').includes('fosscast_admin='));

  // Same link a second time is refused.
  const second = await fetch(`${BASE}/admin/session?token=${encodeURIComponent(token)}`, { redirect: 'manual' });
  assert.strictEqual(second.status, 400);

  // A garbage token is refused.
  const bad = await fetch(`${BASE}/admin/session?token=nonsense`, { redirect: 'manual' });
  assert.strictEqual(bad.status, 400);
});

'use strict';
// The Settings page, and the promise underneath it: an instance's own
// decisions live in the panel, not in a compose file, and changing one
// takes effect without a restart.
//
// The instance is started with the old environment variables still set,
// because that is what somebody upgrading actually has. What is checked
// is that they are adopted once, that the page then owns them, and that
// a saved change reaches the feed straight away.
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const PORT = 4810 + Math.floor(Math.random() * 60);
const BASE = `http://127.0.0.1:${PORT}`;
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'fosscast-settings-'));
let child;
let cookie = '';
let log = '';

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
  child = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    env: {
      ...process.env,
      HTTP_PORT: String(PORT),
      DATA_DIR: DATA,
      DOMAIN: 'https://old.example/',   // pasted with a scheme, as people do
      MEDIA_UPLOADS: 'off',
      ADMIN_EMAIL: 'admin@old.example',
      ADMIN_PASSWORD: 'a very long test password',
    },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  child.stdout.on('data', (chunk) => { log += chunk.toString(); });
  await until(async () => {
    const res = await fetch(`${BASE}/healthz`);
    if (!res.ok) throw new Error('not up');
  });
  const res = await fetch(`${BASE}/admin/login`, form({
    email: 'admin@old.example', password: 'a very long test password',
  }));
  cookie = res.headers.get('set-cookie').split(';')[0];
  await fetch(`${BASE}/admin/podcast/create`, form({
    name: 'Old Podcast', description: 'It has been here a while.',
  }));
});

after(() => {
  child.kill();
  fs.rmSync(DATA, { recursive: true, force: true });
});

test('what was in the environment is adopted once, and said out loud', () => {
  const stored = JSON.parse(fs.readFileSync(path.join(DATA, 'settings.json'), 'utf8'));
  assert.strictEqual(stored.domain, 'old.example', 'the scheme and slash are stripped on the way in');
  assert.strictEqual(stored.mediaUploads, false);
  assert.match(log, /Moved DOMAIN, MEDIA_UPLOADS out of the environment/);
  assert.match(log, /come out of your compose file/);
});

test('the settings the environment set are honoured', async () => {
  const page = await (await fetch(`${BASE}/admin/episodes`, { headers: { cookie } })).text();
  assert.ok(!page.includes('mediaFile'), 'no upload box while uploads are off');
  const feed = await (await fetch(`${BASE}/shows/old-podcast/feed.xml`)).text();
  assert.ok(feed.includes('https://old.example/'), 'the feed uses the adopted domain');
});

test('the Settings page is a page, with a menu item', async () => {
  const res = await fetch(`${BASE}/admin/settings`, { headers: { cookie } });
  assert.strictEqual(res.status, 200);
  const page = await res.text();
  assert.ok(page.includes('Site address'));
  assert.ok(page.includes('href="/admin/settings"'), 'the menu links to it');
  assert.ok(page.includes('value="old.example"'), 'it shows what is stored');
});

test('a saved setting takes effect at once, with no restart', async () => {
  const res = await fetch(`${BASE}/admin/settings`, form({
    live: '1',
    domain: 'https://new.example/ignored/path',
    mediaUploads: '1',
    studioPublishing: '1',
    contactPath: 'https://evil.example/contact',   // refused: not this site
    maillistEmbed: '',
    frameAncestors: '',
  }));
  assert.strictEqual(res.status, 204, 'autosave answers without a page');

  const feed = await (await fetch(`${BASE}/shows/old-podcast/feed.xml`)).text();
  assert.ok(feed.includes('https://new.example/'), 'the feed moved without a restart');
  assert.ok(!feed.includes('old.example'), 'and nothing of the old address is left');

  const page = await (await fetch(`${BASE}/admin/episodes`, { headers: { cookie } })).text();
  assert.ok(page.includes('mediaFile'), 'the upload box came back');

  const site = await (await fetch(`${BASE}/shows/old-podcast`)).text();
  assert.ok(!site.includes('evil.example'), 'an off-site contact path is ignored');
});

test('nobody who is not signed in can read or change a setting', async () => {
  const read = await fetch(`${BASE}/admin/settings`, { redirect: 'manual' });
  assert.strictEqual(read.status, 303);
  assert.strictEqual(read.headers.get('location'), '/admin/login');

  const write = await fetch(`${BASE}/admin/settings`, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ domain: 'hijacked.example' }).toString(),
  });
  assert.strictEqual(write.status, 303);
  const feed = await (await fetch(`${BASE}/shows/old-podcast/feed.xml`)).text();
  assert.ok(!feed.includes('hijacked.example'));
});

'use strict';
// The publish token was called PUBLISHER_TOKEN; it is FOSSSTUDIO_TOKEN
// now. An instance that has been running since before the rename has
// its token written into a studio's configuration somewhere, so it must
// keep working untouched - and so must the old environment variable.
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const PORT = 4400 + Math.floor(Math.random() * 100);
const BASE = `http://127.0.0.1:${PORT}`;
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'fosscast-rename-'));
const OLD_TOKEN = 'old-' + 'b'.repeat(58);
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
    id: 'show-1', slug: 'old-show', name: 'Old Show', description: '', createdAt: 'x',
  }]));
  // Settings exactly as an instance from before the rename would have.
  fs.writeFileSync(path.join(DATA, 'settings.json'), JSON.stringify({
    secret: 's'.repeat(64), publisherToken: OLD_TOKEN,
  }));
  child = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    env: { ...process.env, HTTP_PORT: String(PORT), DATA_DIR: DATA, DOMAIN: 'rename.example' },
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

test('a token issued under the old name still publishes', async () => {
  const res = await fetch(`${BASE}/api/v1/episodes`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${OLD_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'Still working', mediaUrl: 'https://example.org/a.mp3' }),
  });
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.ok(body.ok);
  assert.strictEqual(body.draft, true);
});

test('the stored setting is carried over, not duplicated or rotated', async () => {
  const settings = JSON.parse(fs.readFileSync(path.join(DATA, 'settings.json'), 'utf8'));
  assert.strictEqual(settings.studioToken, OLD_TOKEN, 'the same token, under the new name');
  assert.strictEqual(settings.publisherToken, undefined, 'and the old name is gone');
});

test('a wrong token is still refused', async () => {
  const res = await fetch(`${BASE}/api/v1/episodes`, {
    method: 'POST',
    headers: { Authorization: `Bearer wrong-${'b'.repeat(56)}` },
    body: '{}',
  });
  assert.strictEqual(res.status, 401);
});

'use strict';
// Studio publishing is a door: a studio sends a key and an episode
// appears. An instance whose audio lives somewhere else has no use for
// it, so it can be switched off - and then the door refuses, the key
// card is gone from the Account page, and the button that mints a new
// key is not there to press. Unset, everything works as it always did.
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ON = 5320 + Math.floor(Math.random() * 20);
const OFF = 5350 + Math.floor(Math.random() * 20);
const PASSWORD = 'a long studio password';
const children = [];

async function until(fn, ms = 8000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try { return await fn(); } catch { await new Promise((r) => setTimeout(r, 100)); }
  }
  throw new Error('timed out');
}

function start(port, extraEnv = {}) {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'fosscast-studio-'));
  children.push(spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    env: {
      ...process.env,
      HTTP_PORT: String(port),
      DATA_DIR: data,
      DOMAIN: 'studio.example',
      ADMIN_EMAIL: 'op@studio.example',
      ADMIN_PASSWORD: PASSWORD,
      ...extraEnv,
    },
    stdio: 'ignore',
  }));
}

async function account(port) {
  const base = `http://127.0.0.1:${port}`;
  const login = await fetch(`${base}/admin/login`, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ email: 'op@studio.example', password: PASSWORD }).toString(),
  });
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const page = await (await fetch(`${base}/admin/account`, { headers: { cookie } })).text();
  return { page, cookie };
}

before(async () => {
  start(ON);
  start(OFF, { STUDIO_PUBLISHING: 'off' });
  await until(async () => {
    for (const p of [ON, OFF]) {
      const res = await fetch(`http://127.0.0.1:${p}/healthz`);
      if (!res.ok) throw new Error('not up');
    }
  });
});

after(() => { for (const child of children) child.kill(); });

test('unset, the key is on the Account page and the door listens', async () => {
  const { page } = await account(ON);
  assert.ok(page.includes('Studio publishing'));
  const key = (page.match(/id="studio-token" type="password" value="([a-f0-9]{64})"/) || [])[1];
  assert.ok(key, 'the key is on the page');
  const res = await fetch(`http://127.0.0.1:${ON}/api/v1/episodes`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'From a studio', mediaUrl: 'https://example.org/s.mp3' }),
  });
  assert.notStrictEqual(res.status, 401, 'the key is accepted');
});

test('switched off, the card goes and the door refuses every key', async () => {
  const { page, cookie } = await account(OFF);
  assert.ok(!page.includes('Studio publishing'));
  assert.ok(!page.includes('id="studio-token"'));

  // Not even the right key gets in - the settings file still holds one.
  const { page: onPage } = await account(ON);
  const key = onPage.match(/id="studio-token" type="password" value="([a-f0-9]{64})"/)[1];
  for (const guess of [key, 'x'.repeat(64)]) {
    const res = await fetch(`http://127.0.0.1:${OFF}/api/v1/episodes`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${guess}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Should not land', mediaUrl: 'https://example.org/s.mp3' }),
    });
    assert.strictEqual(res.status, 401);
  }

  // And the button that would mint a new key is not there to press.
  const res = await fetch(`http://127.0.0.1:${OFF}/admin/account/studio-key`, {
    method: 'POST',
    redirect: 'manual',
    headers: { cookie, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: '',
  });
  assert.strictEqual(res.status, 404);
});

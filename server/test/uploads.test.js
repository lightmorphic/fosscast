'use strict';
// The switch an instance that stores nothing needs: no audio uploads.
// Some instances hold no audio at all - the episodes live on the
// podcaster's own storage and the feed points there - so offering an
// upload box there is offering something that cannot work. Unset,
// everything works as it always did.
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const OFF = 5350 + Math.floor(Math.random() * 20);
const PASSWORD = 'a long uploads password';
const children = [];

async function until(fn, ms = 8000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try { return await fn(); } catch { await new Promise((r) => setTimeout(r, 100)); }
  }
  throw new Error('timed out');
}

function start(port, extraEnv = {}) {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'fosscast-uploads-'));
  children.push(spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    env: {
      ...process.env,
      HTTP_PORT: String(port),
      DATA_DIR: data,
      DOMAIN: 'uploads.example',
      ADMIN_EMAIL: 'op@uploads.example',
      ADMIN_PASSWORD: PASSWORD,
      ...extraEnv,
    },
    stdio: 'ignore',
  }));
}

before(async () => {
  start(OFF, { MEDIA_UPLOADS: 'off' });
  await until(async () => {
    const res = await fetch(`http://127.0.0.1:${OFF}/healthz`);
    if (!res.ok) throw new Error('not up');
  });
});

after(() => { for (const child of children) child.kill(); });

// An instance that holds no audio should not offer to hold any.
test('MEDIA_UPLOADS=off takes the audio upload off the episode form', async () => {
  const base = `http://127.0.0.1:${OFF}`;
  const login = await fetch(`${base}/admin/login`, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ email: 'op@uploads.example', password: PASSWORD }).toString(),
  });
  const cookie = login.headers.get('set-cookie').split(';')[0];
  await fetch(`${base}/admin/shows`, {
    method: 'POST',
    redirect: 'manual',
    headers: { cookie, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ name: 'No Storage Here', description: 'x' }).toString(),
  });

  const form = await (await fetch(`${base}/admin/episodes?only=new`, { headers: { cookie } })).text();
  assert.ok(!form.includes('uploads to this server'), 'nothing offers to hold the audio');
  assert.ok(!form.includes('id="mediaFile"'), 'and there is no box to drop it in');
  assert.ok(form.includes('The address of the audio'), 'the address is the way in');

  // The halves can be asked for separately, so a menu can point at each.
  assert.ok(!form.includes('<h2>All episodes</h2>'), 'the new half is only the form');
  const list = await (await fetch(`${base}/admin/episodes?only=all`, { headers: { cookie } })).text();
  assert.ok(list.includes('<h2>All episodes</h2>') && !list.includes('<h2>New episode</h2>'),
    'the list half is only the list');
});

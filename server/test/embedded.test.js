'use strict';
// Some operators run the dashboard inside their own shell. Two small
// knobs make that possible without weakening anything for anybody
// else: FRAME_ANCESTORS names the one origin allowed to frame the
// admin (unset means nobody, exactly as before), and an X-Embedded
// request header - injected by the embedding proxy - asks for pages
// without our own top bar. These tests hold both promises, and the
// third one: a stock instance behaves byte-for-byte as it always did.
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const PORT = 4600 + Math.floor(Math.random() * 100);
const PORT2 = 4700 + Math.floor(Math.random() * 100);
const PASSWORD = 'a long embedded password';
const children = [];

async function until(fn, ms = 5000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try { return await fn(); } catch { await new Promise((r) => setTimeout(r, 100)); }
  }
  throw new Error('timed out');
}

function start(port, extraEnv = {}) {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'fosscast-embedded-'));
  const child = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    env: {
      ...process.env,
      HTTP_PORT: String(port),
      DATA_DIR: data,
      DOMAIN: 'embedded.example',
      ADMIN_EMAIL: 'op@embedded.example',
      ADMIN_PASSWORD: PASSWORD,
      ...extraEnv,
    },
    stdio: 'ignore',
  });
  children.push(child);
  return child;
}

async function login(base) {
  const res = await fetch(`${base}/admin/login`, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ email: 'op@embedded.example', password: PASSWORD }).toString(),
  });
  return res.headers.get('set-cookie').split(';')[0];
}

before(async () => {
  start(PORT);
  start(PORT2, { FRAME_ANCESTORS: 'https://portal.example.com' });
  await until(async () => {
    for (const p of [PORT, PORT2]) {
      const res = await fetch(`http://127.0.0.1:${p}/healthz`);
      if (!res.ok) throw new Error('not up');
    }
  });
});

after(() => { for (const child of children) child.kill(); });

test('unset FRAME_ANCESTORS keeps the old headers exactly', async () => {
  const res = await fetch(`http://127.0.0.1:${PORT}/admin/login`);
  assert.equal(res.headers.get('content-security-policy'), "frame-ancestors 'none'");
  assert.equal(res.headers.get('x-frame-options'), 'DENY');
});

test('FRAME_ANCESTORS names who may frame the admin, and only then', async () => {
  const res = await fetch(`http://127.0.0.1:${PORT2}/admin/login`);
  assert.equal(res.headers.get('content-security-policy'), 'frame-ancestors https://portal.example.com');
  // X-Frame-Options cannot express one origin, so it must not
  // contradict the CSP that can.
  assert.equal(res.headers.get('x-frame-options'), null);
});

test('a plain request wears the full chrome', async () => {
  const cookie = await login(`http://127.0.0.1:${PORT}`);
  const page = await (await fetch(`http://127.0.0.1:${PORT}/admin`, { headers: { cookie } })).text();
  assert.ok(page.includes('<header class="top">'));
  assert.ok(page.includes('class="admin-nav"'));
  assert.ok(!page.includes('body class="admin embedded"'));
});

test('X-Embedded drops the top bar and leaves the content', async () => {
  const cookie = await login(`http://127.0.0.1:${PORT}`);
  const page = await (await fetch(`http://127.0.0.1:${PORT}/admin`, {
    headers: { cookie, 'X-Embedded': '1' },
  })).text();
  assert.ok(!page.includes('<header class="top">'));
  assert.ok(!page.includes('class="admin-nav"'));
  assert.ok(page.includes('body class="admin embedded"'));
  // The page itself survives; only what wrapped it is gone.
  assert.ok(page.includes('<main class="wrap">'));
  // Signing out belongs to the shell around the frame, not to us.
  assert.ok(!page.includes('/admin/logout'));
});

test('embedding changes nothing about who gets in', async () => {
  const res = await fetch(`http://127.0.0.1:${PORT}/admin`, {
    redirect: 'manual',
    headers: { 'X-Embedded': '1' },
  });
  assert.equal(res.status, 303);
  assert.match(res.headers.get('location'), /login/);
});

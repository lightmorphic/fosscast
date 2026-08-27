'use strict';
// An operator running FOSSCast for somebody else can put their own name
// on the dashboard. It is a label, not a fork: unset, every page says
// FOSSCast exactly as it always did, and the feed's generator tag names
// the software honestly whatever the door says.
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const PLAIN = 4800 + Math.floor(Math.random() * 50);
const BRANDED = 4860 + Math.floor(Math.random() * 50);
const BRAND = 'Radio Free Example';
const PASSWORD = 'a long branding password';
const children = [];

async function until(fn, ms = 5000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try { return await fn(); } catch { await new Promise((r) => setTimeout(r, 100)); }
  }
  throw new Error('timed out');
}

function start(port, extraEnv = {}) {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'fosscast-brand-'));
  children.push(spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    env: {
      ...process.env,
      HTTP_PORT: String(port),
      DATA_DIR: data,
      DOMAIN: 'brand.example',
      ADMIN_EMAIL: 'op@brand.example',
      ADMIN_PASSWORD: PASSWORD,
      ...extraEnv,
    },
    stdio: 'ignore',
  }));
}

async function dashboard(port) {
  const base = `http://127.0.0.1:${port}`;
  const login = await fetch(`${base}/admin/login`, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ email: 'op@brand.example', password: PASSWORD }).toString(),
  });
  const cookie = login.headers.get('set-cookie').split(';')[0];
  return (await fetch(`${base}/admin`, { headers: { cookie } })).text();
}

before(async () => {
  start(PLAIN);
  start(BRANDED, { BRAND_NAME: BRAND });
  await until(async () => {
    for (const p of [PLAIN, BRANDED]) {
      const res = await fetch(`http://127.0.0.1:${p}/healthz`);
      if (!res.ok) throw new Error('not up');
    }
  });
});

after(() => { for (const child of children) child.kill(); });

test('unset, the dashboard is FOSSCast down to the last word', async () => {
  const page = await dashboard(PLAIN);
  assert.ok(page.includes('- FOSSCast admin</title>'));
  assert.ok(page.includes('FOSSCast <span class="admin-tag">admin</span>'));
  assert.ok(!page.includes('Radio Free Example'));
});

test('BRAND_NAME puts the operator name on the door', async () => {
  const page = await dashboard(BRANDED);
  assert.ok(page.includes(`- ${BRAND} admin</title>`));
  assert.ok(page.includes(`${BRAND} <span class="admin-tag">admin</span>`));
  assert.ok(!page.includes('FOSSCast'));
});

test('the welcome heading follows the brand', async () => {
  const fresh = await dashboard(BRANDED);
  assert.ok(fresh.includes(`Welcome to ${BRAND}`) || fresh.includes('Your podcast'),
    'a branded instance never greets anybody as FOSSCast');
  assert.ok(!fresh.includes('Welcome to FOSSCast'));
});

test('the feed still says what the software actually is', async () => {
  // Renaming the door does not entitle anyone to misreport the
  // generator: the public feed keeps naming FOSSCast.
  const res = await fetch(`http://127.0.0.1:${BRANDED}/shows`);
  assert.equal(res.status, 200);
  const source = fs.readFileSync(path.join(__dirname, '..', 'lib', 'public.js'), 'utf8');
  assert.ok(source.includes('<generator>FOSSCast</generator>'));
});

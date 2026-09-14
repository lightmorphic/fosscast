'use strict';
// The first run, without a line of it in a compose file.
//
// The instance is started with nothing at all in the environment - no
// ADMIN_EMAIL, no ADMIN_PASSWORD, no DOMAIN - which is what the install
// instructions now produce. What is checked is that nobody but the
// person who can read the log may claim it, that the password rule is
// enforced rather than advised, that the code cannot be used twice, and
// that two-factor stops a login that has the right password.
//
// The passkey road is not here: it needs a browser with an
// authenticator in it, and a fetch cannot sign anything. It is driven
// against a real Chromium with a virtual authenticator instead.
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const totp = require('../lib/totp');
const { MINIMUM } = require('../lib/setup');

const PORT = 4890 + Math.floor(Math.random() * 60);
const BASE = `http://127.0.0.1:${PORT}`;
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'fosscast-setup-'));
const PASSWORD = 'harbour-thistle-pewter-quarry-lantern';
let child;
let log = '';
let code = '';

async function until(fn, ms = 5000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try { return await fn(); } catch { await new Promise((r) => setTimeout(r, 100)); }
  }
  throw new Error('timed out');
}

function post(path, data, cookie = '') {
  return fetch(`${BASE}${path}`, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...(cookie ? { cookie } : {}) },
    body: new URLSearchParams(data).toString(),
  });
}

function storedUser() {
  return JSON.parse(fs.readFileSync(path.join(DATA, 'users.json'), 'utf8'))[0];
}

function codeNow(secret) {
  return totp.codeAt(secret, Math.floor(Date.now() / 1000 / 30));
}

before(async () => {
  const env = { ...process.env, HTTP_PORT: String(PORT), DATA_DIR: DATA };
  // Exactly what somebody has after pasting the new compose file.
  delete env.ADMIN_EMAIL;
  delete env.ADMIN_PASSWORD;
  delete env.DOMAIN;
  child = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    env, stdio: ['ignore', 'pipe', 'inherit'],
  });
  child.stdout.on('data', (chunk) => { log += chunk.toString(); });
  await until(async () => {
    const res = await fetch(`${BASE}/healthz`);
    if (!res.ok) throw new Error('not up');
  });
  await until(async () => {
    const found = log.match(/^\s+(\d{3}-\d{3})\s*$/m);
    if (!found) throw new Error('no code yet');
    [, code] = found;
  });
});

after(() => {
  child.kill();
  fs.rmSync(DATA, { recursive: true, force: true });
});

test('an unclaimed instance sends everybody to setup, and prints a code', async () => {
  assert.match(log, /Nobody owns this FOSSCast yet/);
  assert.match(log, /never written to disk/);
  assert.ok(/^\d{3}-\d{3}$/.test(code), 'the code is six digits');
  assert.ok(!fs.readdirSync(DATA).includes('setup.json'), 'and it is not on disk');

  for (const where of ['/admin', '/admin/episodes', '/admin/login', '/admin/settings']) {
    const res = await fetch(`${BASE}${where}`, { redirect: 'manual' });
    assert.strictEqual(res.headers.get('location'), '/admin/setup', `${where} leads to setup`);
  }
  const page = await (await fetch(`${BASE}/admin/setup`)).text();
  assert.ok(page.includes('docker compose logs app'), 'the page says where the code is');
});

test('the wrong code claims nothing', async () => {
  const res = await post('/admin/setup', {
    code: '000-000', email: 'thief@example.test', password: PASSWORD, again: PASSWORD,
  });
  assert.strictEqual(res.status, 403);
  assert.ok(!fs.existsSync(path.join(DATA, 'users.json')), 'no account was made');
});

test('a password on the list is refused by name, not by rule', async () => {
  const res = await post('/admin/setup', {
    code, email: 'owner@example.test', password: 'password123', again: 'password123',
  });
  assert.strictEqual(res.status, 400);
  const page = await res.text();
  assert.ok(page.includes('one of the first things anybody tries'), 'it says which word');
  assert.ok(page.includes('password'), 'and names it');
  assert.ok(!fs.existsSync(path.join(DATA, 'users.json')));
});

test('a short password is told how short, and what would pass', async () => {
  const res = await post('/admin/setup', {
    code, email: 'owner@example.test', password: 'sixteen', again: 'sixteen',
  });
  assert.strictEqual(res.status, 400);
  const page = await res.text();
  assert.ok(page.includes(`at least ${MINIMUM}`));
  assert.ok(page.includes('four or five ordinary words'), 'and says what would do');
});

test('the right code with a good password claims the instance', async () => {
  const res = await post('/admin/setup', {
    code, email: 'Owner@Example.test', password: PASSWORD, again: PASSWORD,
  });
  assert.strictEqual(res.status, 303);
  assert.strictEqual(res.headers.get('location'), '/admin/setup/protect');
  assert.ok(res.headers.get('set-cookie').includes('fosscast_admin='), 'and signs them in');

  const user = storedUser();
  assert.strictEqual(user.email, 'owner@example.test', 'the address is folded to lower case');
  assert.ok(user.hash.startsWith('scrypt$'), 'the password is hashed, never stored');
  assert.ok(!JSON.stringify(user).includes(PASSWORD), 'and appears nowhere in the file');
  assert.ok(user.totpSecret, 'a two-factor secret is ready in case they want it');
  assert.strictEqual(user.totpEnabled, false, 'but it does nothing yet');
});

test('the code is spent: nobody can claim it a second time', async () => {
  const res = await post('/admin/setup', {
    code, email: 'thief@example.test', password: PASSWORD, again: PASSWORD,
  });
  assert.strictEqual(res.status, 303);
  assert.strictEqual(res.headers.get('location'), '/admin/login', 'setup is over');
  assert.strictEqual(JSON.parse(fs.readFileSync(path.join(DATA, 'users.json'), 'utf8')).length, 1);
});

test('two-factor is offered at setup and stops a login once it is on', async () => {
  const signIn = await post('/admin/login', { email: 'owner@example.test', password: PASSWORD });
  const cookie = signIn.headers.get('set-cookie').split(';')[0];

  const offered = await (await fetch(`${BASE}/admin/setup/protect`, { headers: { cookie } })).text();
  assert.ok(offered.includes('Make it hard to lose'));
  assert.ok(offered.includes('no QR code here on purpose'), 'and says why there is no picture');

  const wrong = await post('/admin/setup/twofactor', { code: '000000' }, cookie);
  assert.strictEqual(wrong.status, 400);
  assert.strictEqual(storedUser().totpEnabled, false);

  const on = await post('/admin/setup/twofactor', { code: codeNow(storedUser().totpSecret) }, cookie);
  assert.strictEqual(on.status, 200);
  assert.strictEqual(storedUser().totpEnabled, true);

  // The right password is now only half of it.
  const half = await post('/admin/login', { email: 'owner@example.test', password: PASSWORD });
  assert.strictEqual(half.status, 303);
  assert.ok(half.headers.get('location').startsWith('/admin/login/code?t='));
  assert.strictEqual(half.headers.get('set-cookie'), null, 'nothing is signed in yet');

  const token = decodeURIComponent(half.headers.get('location').split('t=')[1]);
  const bad = await post('/admin/login/code', { t: token, code: '000000' });
  assert.strictEqual(bad.status, 401);

  const good = await post('/admin/login/code', { t: token, code: codeNow(storedUser().totpSecret) });
  assert.strictEqual(good.status, 303);
  assert.strictEqual(good.headers.get('location'), '/admin');
  assert.ok(good.headers.get('set-cookie').includes('fosscast_admin='));
});

test('a forged half-login is worth nothing', async () => {
  const res = await post('/admin/login/code', {
    t: `pending.${storedUser().id}.${Date.now() + 60000}.notasignature`,
    code: codeNow(storedUser().totpSecret),
  });
  assert.strictEqual(res.status, 401);
  assert.strictEqual(res.headers.get('set-cookie'), null);
});

test('the same password rule applies to a later change', async () => {
  const signIn = await post('/admin/login', { email: 'owner@example.test', password: PASSWORD });
  const token = decodeURIComponent(signIn.headers.get('location').split('t=')[1]);
  const done = await post('/admin/login/code', { t: token, code: codeNow(storedUser().totpSecret) });
  const cookie = done.headers.get('set-cookie').split(';')[0];

  const res = await post('/admin/account/password', {
    current: PASSWORD, next: 'letmein12345', again: 'letmein12345',
  }, cookie);
  assert.strictEqual(res.status, 400);
  assert.ok((await res.text()).includes('one of the first things anybody tries'));
});

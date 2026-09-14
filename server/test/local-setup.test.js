'use strict';
// Who may claim an instance, and how few times.
//
// By default the first person to open an unclaimed FOSSCast claims it,
// from wherever they are: there is no code, and the window in which
// somebody else could get there first is said out loud in the log
// rather than guarded against. What must hold is the other half - that
// once it has an owner there is no second sign-up, from anywhere, ever.
//
// REQUIRE_SETUP_CODE is the escape hatch for an instance whose port is
// open to the internet before it has been claimed. Where it is set the
// code is required from everywhere, and no header may talk its way out
// of it: the test that matters is a request from a real non-loopback
// address carrying X-Forwarded-For: 127.0.0.1, which is the header a
// reverse proxy writes and anybody can forge.

const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const local = require('../lib/local');

const OPEN_PORT = 4960 + Math.floor(Math.random() * 15);
const CODE_PORT = OPEN_PORT + 15;
const OPEN_DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'fosscast-open-'));
const CODE_DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'fosscast-code-'));
const PASSWORD = 'harbor-thistle-pewter-quarry-lantern';

// An address of this machine that is not loopback, so a request can be
// made that arrives the way a request from another machine arrives. A
// box with nothing but loopback cannot be asked these questions over
// HTTP; the decision behind the log line is still checked below, every
// way round.
function outsideAddress() {
  for (const entries of Object.values(os.networkInterfaces())) {
    for (const entry of entries || []) {
      if (entry.family === 'IPv4' && !entry.internal) return entry.address;
    }
  }
  return null;
}

const OUTSIDE = outsideAddress();
const started = [];
let codeLog = '';
let theCode = '';

// fetch cannot choose which of this machine's addresses it speaks from,
// and that choice is the whole point of some of these, so the requests
// are made by hand.
function request({
  port, from, to = '127.0.0.1', host, method = 'GET',
  path: where = '/admin/setup', headers = {}, form, cookie,
}) {
  const body = form ? new URLSearchParams(form).toString() : null;
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: to,
      port,
      method,
      path: where,
      localAddress: from,
      headers: {
        host: host || `${to}:${port}`,
        ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
        ...(cookie ? { cookie } : {}),
        ...headers,
      },
    }, (res) => {
      let text = '';
      res.on('data', (chunk) => { text += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, text }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

function users(dir) {
  const file = path.join(dir, 'users.json');
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : [];
}

function start(port, dir, extra = {}) {
  const env = {
    ...process.env, HTTP_PORT: String(port), DATA_DIR: dir, ...extra,
  };
  delete env.ADMIN_EMAIL;
  delete env.ADMIN_PASSWORD;
  delete env.DOMAIN;
  if (!extra.REQUIRE_SETUP_CODE) delete env.REQUIRE_SETUP_CODE;
  const child = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    env, stdio: ['ignore', 'pipe', 'inherit'],
  });
  started.push(child);
  return child;
}

async function waitFor(port) {
  const end = Date.now() + 5000;
  for (;;) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/healthz`);
      if (res.ok) return;
    } catch { /* not up yet */ }
    if (Date.now() > end) throw new Error(`nothing answered on ${port}`);
    await new Promise((r) => setTimeout(r, 100));
  }
}

before(async () => {
  start(OPEN_PORT, OPEN_DATA).stdout.resume();
  const guarded = start(CODE_PORT, CODE_DATA, { REQUIRE_SETUP_CODE: '1' });
  guarded.stdout.on('data', (chunk) => { codeLog += chunk.toString(); });
  await waitFor(OPEN_PORT);
  await waitFor(CODE_PORT);
  const end = Date.now() + 5000;
  for (;;) {
    const found = codeLog.match(/^\s+(\d{3}-\d{3})\s*$/m);
    if (found) { [, theCode] = found; break; }
    if (Date.now() > end) throw new Error('no code was printed');
    await new Promise((r) => setTimeout(r, 100));
  }
});

after(() => {
  for (const child of started) child.kill();
  fs.rmSync(OPEN_DATA, { recursive: true, force: true });
  fs.rmSync(CODE_DATA, { recursive: true, force: true });
});

// ---------------------------------------------------------------------
// The ordinary install: no code, first person in
// ---------------------------------------------------------------------

test('an unclaimed instance asks for a login and nothing else', async () => {
  const page = await request({ port: OPEN_PORT });
  assert.strictEqual(page.status, 200);
  assert.ok(!page.text.includes('name="code"'), 'no field');
  assert.ok(!page.text.includes('Setup code'), 'nothing called a setup code');
  assert.ok(!page.text.includes('docker compose logs'), 'and nobody is sent to a log');
});

test('the first person to fill it in owns it, from wherever they are', async (t) => {
  // Deliberately not from loopback where this machine has another
  // address: being on the box is not what is being asked for any more,
  // and a test that only ever claims from loopback would not notice if
  // it quietly became so again.
  const from = OUTSIDE || undefined;
  if (!OUTSIDE) t.diagnostic('no address but loopback here, so claiming from loopback');

  const claim = await request({
    port: OPEN_PORT,
    from,
    to: OUTSIDE || '127.0.0.1',
    method: 'POST',
    form: { email: 'Owner@Example.test', password: PASSWORD, again: PASSWORD },
  });
  assert.strictEqual(claim.status, 303);
  assert.ok(claim.headers.location.endsWith('/admin/setup/protect'));
  assert.ok(claim.headers['set-cookie'][0].includes('fosscast_admin='), 'and signs them in');

  const [owner] = users(OPEN_DATA);
  assert.strictEqual(owner.email, 'owner@example.test', 'folded to lower case');
  assert.ok(owner.hash.startsWith('scrypt$'), 'the password is hashed, never stored');
  assert.ok(owner.totpSecret, 'a two-factor secret is ready if they want it');
  assert.strictEqual(owner.totpEnabled, false, 'but it does nothing yet');
});

test('and that is the only sign-up there will ever be', async () => {
  const second = {
    method: 'POST',
    form: { email: 'second@example.test', password: PASSWORD, again: PASSWORD },
  };

  // From the machine it runs on.
  const near = await request({ port: OPEN_PORT, ...second });
  assert.strictEqual(near.status, 303);
  assert.ok(near.headers.location.endsWith('/admin/login'), 'setup is over');

  // From off it.
  if (OUTSIDE) {
    const far = await request({ port: OPEN_PORT, from: OUTSIDE, to: OUTSIDE, ...second });
    assert.strictEqual(far.status, 303);
    assert.ok(far.headers.location.endsWith('/admin/login'));
  }

  // And by the owner, signed in, which is the one road that does not go
  // through the guard that sends everybody else to the login page.
  const signIn = await request({
    port: OPEN_PORT,
    method: 'POST',
    path: '/admin/login',
    form: { email: 'owner@example.test', password: PASSWORD },
  });
  const cookie = signIn.headers['set-cookie'][0].split(';')[0];
  const inside = await request({ port: OPEN_PORT, cookie, ...second });
  assert.strictEqual(inside.status, 404, 'there is no such thing as a second sign-up');

  // The screen itself is gone.
  const screen = await request({ port: OPEN_PORT });
  assert.strictEqual(screen.status, 303);
  assert.ok(screen.headers.location.endsWith('/admin/login'));

  assert.strictEqual(users(OPEN_DATA).length, 1, 'still the one owner');
  assert.strictEqual(users(OPEN_DATA)[0].email, 'owner@example.test');
});

// ---------------------------------------------------------------------
// REQUIRE_SETUP_CODE, for the instance whose port is open early
// ---------------------------------------------------------------------

test('with the setting on, the code is printed and asked for', async () => {
  assert.match(codeLog, /REQUIRE_SETUP_CODE is set/);
  assert.match(codeLog, /never written to disk/);
  assert.ok(/^\d{3}-\d{3}$/.test(theCode), 'six digits');
  assert.ok(!fs.readdirSync(CODE_DATA).includes('setup.json'), 'and not on disk');

  const page = await request({ port: CODE_PORT });
  assert.ok(page.text.includes('name="code"'), 'the field is there');
  assert.ok(page.text.includes('docker compose logs app'), 'and says where to read it');
});

test('no code, a wrong code, and a forged one all claim nothing', async () => {
  const attempt = {
    method: 'POST',
    form: { email: 'thief@example.test', password: PASSWORD, again: PASSWORD },
  };

  const bare = await request({ port: CODE_PORT, ...attempt });
  assert.strictEqual(bare.status, 403);

  const wrong = await request({
    port: CODE_PORT,
    method: 'POST',
    form: { code: '000-000', ...attempt.form },
  });
  assert.strictEqual(wrong.status, 403);

  // The one that matters. X-Forwarded-For is written by whoever is in
  // front of an app and anybody can put it in a request by hand, so it
  // must never be worth anything here - from loopback, where a proxy
  // would genuinely be, or from off the machine entirely.
  const forgedNear = await request({
    port: CODE_PORT,
    headers: { 'X-Forwarded-For': '127.0.0.1', 'X-Real-IP': '127.0.0.1' },
    ...attempt,
  });
  assert.strictEqual(forgedNear.status, 403);

  if (OUTSIDE) {
    const forgedFar = await request({
      port: CODE_PORT,
      from: OUTSIDE,
      to: OUTSIDE,
      host: `127.0.0.1:${CODE_PORT}`,
      headers: { 'X-Forwarded-For': '127.0.0.1', 'X-Real-IP': '127.0.0.1' },
      ...attempt,
    });
    assert.strictEqual(forgedFar.status, 403, 'a forged address claims nothing');
  }

  assert.deepStrictEqual(users(CODE_DATA), [], 'nothing was claimed');
});

test('the right code claims it, once', async () => {
  const claim = await request({
    port: CODE_PORT,
    method: 'POST',
    form: {
      code: theCode, email: 'owner@example.test', password: PASSWORD, again: PASSWORD,
    },
  });
  assert.strictEqual(claim.status, 303);
  assert.ok(claim.headers.location.endsWith('/admin/setup/protect'));

  // The code is spent along with the sign-up it belonged to.
  const again = await request({
    port: CODE_PORT,
    method: 'POST',
    form: {
      code: theCode, email: 'thief@example.test', password: PASSWORD, again: PASSWORD,
    },
  });
  assert.strictEqual(again.status, 303);
  assert.ok(again.headers.location.endsWith('/admin/login'));
  assert.strictEqual(users(CODE_DATA).length, 1);
});

// ---------------------------------------------------------------------
// Where the claim came from, which is only ever the socket's own word
// ---------------------------------------------------------------------
//
// Nothing turns on this any more - it decides no permission - but the
// line it writes in the log is the only evidence there would be if
// somebody else reached an unclaimed instance first, and evidence taken
// from a forgeable header is worse than none.

test('the claim is logged as coming from where it really came from', () => {
  const gateway = '172.17.0.1';
  local.setHostAddressForTests(gateway);

  // A browser on the box, in a container and out of one. Inside Docker
  // a port published on 127.0.0.1 is reached through Docker's own
  // relay, which dials the container from the bridge gateway, so that
  // address is the machine too - but only in a container, where the
  // gateway is the host rather than the building's router.
  assert.strictEqual(local.decide({ address: '127.0.0.1', headers: { host: 'localhost:3100' } }), true);
  assert.strictEqual(local.decide({ address: '::1', headers: { host: '[::1]:3100' } }), true);
  assert.strictEqual(local.decide({ address: '::ffff:127.0.0.1', headers: { host: '127.0.0.1:3100' } }), true);
  assert.strictEqual(local.decide({ address: gateway, headers: { host: '127.0.0.1:3100' } }), true);

  // Another machine, however it dresses the request up.
  assert.strictEqual(local.decide({ address: '203.0.113.9', headers: { host: '127.0.0.1:3100' } }), false);
  assert.strictEqual(local.decide({
    address: '203.0.113.9',
    headers: { host: '127.0.0.1:3100', 'x-forwarded-for': '127.0.0.1' },
  }), false, 'X-Forwarded-For is not an address');
  assert.strictEqual(local.decide({
    address: '203.0.113.9',
    headers: { host: 'localhost', 'x-real-ip': '127.0.0.1' },
  }), false);
  assert.strictEqual(local.decide({
    address: '203.0.113.9',
    headers: { host: 'localhost', forwarded: 'for=127.0.0.1' },
  }), false);

  // Another container on the same bridge is not the host, even though
  // its address looks much like the one that is.
  assert.strictEqual(local.decide({ address: '172.17.0.5', headers: { host: '127.0.0.1:3100' } }), false);

  // Something is in front, so what is behind it is not on the machine
  // whatever address it dials from.
  for (const name of local.PROXY_HEADERS) {
    assert.strictEqual(
      local.decide({ address: '127.0.0.1', headers: { host: 'localhost', [name]: 'anything' } }),
      false,
      `${name} means something is in front`,
    );
  }
  assert.strictEqual(local.decide({
    address: '127.0.0.1',
    headers: { host: 'podcast.example.com' },
  }), false, 'a site name is not a name anybody types on the box');

  local.setHostAddressForTests(undefined);
});

test('without a container the gateway is a router, and means nothing', () => {
  local.setHostAddressForTests(undefined);
  if (!fs.existsSync('/.dockerenv') && !fs.existsSync('/run/.containerenv')) {
    assert.strictEqual(local.hostAddress(), null);
  }
  local.setHostAddressForTests(undefined);
});

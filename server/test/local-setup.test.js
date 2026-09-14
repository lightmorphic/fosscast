'use strict';
// Who may claim an instance without the code from the log.
//
// The rule is that being on the machine FOSSCast runs on, in the first
// half hour after it starts, is proof enough, and that nothing a
// stranger can write into a request may imitate being there. The test that matters most is the last kind: a
// request from off the machine carrying X-Forwarded-For: 127.0.0.1,
// which is the header a reverse proxy writes and anybody can forge. If
// that ever claims an instance, every FOSSCast behind a proxy belongs
// to whoever asks first, so it is checked here and not only reasoned
// about.

const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const local = require('../lib/local');
const setup = require('../lib/setup');
const setupScreen = require('../lib/admin/setup-page');

const PORT = 4960 + Math.floor(Math.random() * 30);
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'fosscast-local-'));
const PASSWORD = 'harbor-thistle-pewter-quarry-lantern';

// An address of this machine that is not loopback, so a request can be
// made that arrives the way a request from another machine arrives. A
// box with nothing but loopback cannot be asked these questions over
// HTTP; the decision itself is still checked below, every way round.
function outsideAddress() {
  for (const entries of Object.values(os.networkInterfaces())) {
    for (const entry of entries || []) {
      if (entry.family === 'IPv4' && !entry.internal) return entry.address;
    }
  }
  return null;
}

const OUTSIDE = outsideAddress();
let child;

// fetch cannot choose which of this machine's addresses it speaks from,
// and that choice is the whole point here, so the requests are made by
// hand.
function request({ from, to, host, method = 'GET', path: where = '/admin/setup', headers = {}, form }) {
  const body = form ? new URLSearchParams(form).toString() : null;
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: to,
      port: PORT,
      method,
      path: where,
      localAddress: from,
      headers: {
        host: host || `${to}:${PORT}`,
        ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
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

function users() {
  const file = path.join(DATA, 'users.json');
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : [];
}

before(async () => {
  const env = { ...process.env, HTTP_PORT: String(PORT), DATA_DIR: DATA };
  delete env.ADMIN_EMAIL;
  delete env.ADMIN_PASSWORD;
  delete env.DOMAIN;
  child = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    env, stdio: ['ignore', 'ignore', 'inherit'],
  });
  const end = Date.now() + 5000;
  for (;;) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/healthz`);
      if (res.ok) break;
    } catch { /* not up yet */ }
    if (Date.now() > end) throw new Error('the server did not start');
    await new Promise((r) => setTimeout(r, 100));
  }
});

after(() => {
  if (child) child.kill();
  fs.rmSync(DATA, { recursive: true, force: true });
});

// ---------------------------------------------------------------------
// The decision itself, asked every way round
// ---------------------------------------------------------------------

test('the machine itself is the socket saying so, never a header', () => {
  const gateway = '172.17.0.1';
  local.setHostAddressForTests(gateway);

  // A browser on the box, in a container and out of one.
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

  // A proxy on the same machine dials from the same place a browser on
  // it does. Either sign of one is enough to ask for the code.
  assert.strictEqual(local.decide({
    address: '127.0.0.1',
    headers: { host: 'localhost:3100', 'x-forwarded-for': '203.0.113.9' },
  }), false, 'a header a proxy adds says there is a proxy');
  assert.strictEqual(local.decide({
    address: '127.0.0.1',
    headers: { host: 'podcast.example.com' },
  }), false, 'a site name is not a name anybody types on the box');

  // Every one of the forwarding headers counts, whatever it says.
  for (const name of local.PROXY_HEADERS) {
    assert.strictEqual(
      local.decide({ address: '127.0.0.1', headers: { host: 'localhost', [name]: 'anything' } }),
      false,
      `${name} means something is in front`,
    );
  }

  local.setHostAddressForTests(undefined);
});

test('without a container the gateway is a router, and means nothing', () => {
  // Read fresh: on a machine with no container around it, the default
  // gateway is the building's router, and treating it as the machine
  // itself would hand the instance to a network.
  local.setHostAddressForTests(undefined);
  if (!fs.existsSync('/.dockerenv') && !fs.existsSync('/run/.containerenv')) {
    assert.strictEqual(local.hostAddress(), null);
  }
  local.setHostAddressForTests(undefined);
});

test('the door closes half an hour after the instance starts', () => {
  assert.ok(setup.withinOpeningTime(), 'open at the start, which is when people install');

  // The half hour is not for the person installing it. It is for the
  // one shape the address test cannot see through: a reverse proxy on
  // the same machine that sets no forwarding header and rewrites Host
  // to its upstream is, to us, word for word a browser on the box. So
  // the door only stands open while somebody is plainly at it, and an
  // instance left running and unclaimed stops offering itself.
  setup.setStartedAtForTests(Date.now() - setup.OPENING - 1000);
  assert.strictEqual(setup.withinOpeningTime(), false);
  setup.setStartedAtForTests(Date.now());
});

test('somebody on the machine who came late is told why, not just refused', () => {
  const { claimPage } = setupScreen({ brandName: 'FOSSCast' });

  const open = claimPage({ local: true });
  assert.ok(!open.includes('name="code"'));

  const closed = claimPage({ local: false, late: true });
  assert.ok(closed.includes('name="code"'), 'the code is asked for');
  assert.ok(closed.includes('running a while'), 'and the change is explained');

  // Somebody who was never on the machine is not told about a half hour
  // that was never theirs.
  const outside = claimPage({ local: false, late: false });
  assert.ok(outside.includes('name="code"'));
  assert.ok(!outside.includes('running a while'));
});

// ---------------------------------------------------------------------
// The same thing over a real socket
// ---------------------------------------------------------------------

test('from the machine itself there is no code to type and none mentioned', async () => {
  const page = await request({ to: '127.0.0.1', host: `127.0.0.1:${PORT}` });
  assert.strictEqual(page.status, 200);
  assert.ok(!page.text.includes('Setup code'), 'no field');
  assert.ok(!page.text.includes('name="code"'), 'nothing to fill in');
  assert.ok(!page.text.includes('docker compose logs'), 'and no explaining of a field that is gone');
});

test('from another machine the code is asked for, and a forged header is not it', async (t) => {
  if (!OUTSIDE) {
    t.skip('this machine has no address but loopback');
    return;
  }

  const page = await request({ from: OUTSIDE, to: OUTSIDE });
  assert.strictEqual(page.status, 200);
  assert.ok(page.text.includes('name="code"'), 'the field is there');
  assert.ok(page.text.includes('docker compose logs app'), 'and says where the code is');

  // No code at all.
  const bare = await request({
    from: OUTSIDE,
    to: OUTSIDE,
    method: 'POST',
    form: { email: 'thief@example.test', password: PASSWORD, again: PASSWORD },
  });
  assert.strictEqual(bare.status, 403);

  // A wrong one.
  const wrong = await request({
    from: OUTSIDE,
    to: OUTSIDE,
    method: 'POST',
    form: { code: '000-000', email: 'thief@example.test', password: PASSWORD, again: PASSWORD },
  });
  assert.strictEqual(wrong.status, 403);

  // The one that matters: claiming to be loopback, in the header a
  // proxy writes and anybody can write, and asking for the loopback
  // name as well so nothing else gives it away.
  const forged = await request({
    from: OUTSIDE,
    to: OUTSIDE,
    method: 'POST',
    host: `127.0.0.1:${PORT}`,
    headers: { 'X-Forwarded-For': '127.0.0.1', 'X-Real-IP': '127.0.0.1' },
    form: { email: 'thief@example.test', password: PASSWORD, again: PASSWORD },
  });
  assert.strictEqual(forged.status, 403, 'a forged address claims nothing');

  const forgedPage = await request({
    from: OUTSIDE,
    to: OUTSIDE,
    host: `127.0.0.1:${PORT}`,
    headers: { 'X-Forwarded-For': '127.0.0.1' },
  });
  assert.ok(forgedPage.text.includes('name="code"'), 'and is still shown the field');

  assert.deepStrictEqual(users(), [], 'nothing was claimed');
});

test('one sign-up and no more, from the machine itself as much as from outside', async () => {
  const claim = await request({
    to: '127.0.0.1',
    host: `127.0.0.1:${PORT}`,
    method: 'POST',
    form: { email: 'owner@example.test', password: PASSWORD, again: PASSWORD },
  });
  assert.strictEqual(claim.status, 303);
  assert.strictEqual(claim.headers.location, '/admin/setup/protect');
  assert.strictEqual(users().length, 1);

  // Being on the box was never permission to make a second owner. It
  // was permission to make the first one, and that is spent.
  const again = await request({
    to: '127.0.0.1',
    host: `127.0.0.1:${PORT}`,
    method: 'POST',
    form: { email: 'second@example.test', password: PASSWORD, again: PASSWORD },
  });
  assert.strictEqual(again.status, 303);
  assert.strictEqual(again.headers.location, '/admin/login');

  const screen = await request({ to: '127.0.0.1', host: `127.0.0.1:${PORT}` });
  assert.strictEqual(screen.status, 303);
  assert.strictEqual(screen.headers.location, '/admin/login', 'the setup screen is gone');

  if (OUTSIDE) {
    const outside = await request({
      from: OUTSIDE,
      to: OUTSIDE,
      method: 'POST',
      form: { code: '000-000', email: 'third@example.test', password: PASSWORD, again: PASSWORD },
    });
    assert.strictEqual(outside.status, 303);
    assert.strictEqual(outside.headers.location, '/admin/login');
  }

  assert.strictEqual(users().length, 1, 'still the one owner');
  assert.strictEqual(users()[0].email, 'owner@example.test');
});

'use strict';
// Export and import: one file that is the whole instance, so a podcast
// can be moved to another server or put back after a mistake. The test
// runs two real servers and moves one into the other, because that is
// the thing being claimed.
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');

const { pack, unpack } = require('../lib/archive');

const A_PORT = 4520 + Math.floor(Math.random() * 20);
const B_PORT = A_PORT + 40;
const A = `http://127.0.0.1:${A_PORT}`;
const B = `http://127.0.0.1:${B_PORT}`;
const A_DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'fosscast-from-'));
const B_DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'fosscast-to-'));
const PASSWORD = 'the password on the first box';
const OTHER = 'a different password over here';
const children = [];
let cookieA = '';
let cookieB = '';

async function until(fn, ms = 6000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try { return await fn(); } catch { await new Promise((r) => setTimeout(r, 100)); }
  }
  throw new Error('timed out');
}

function start(port, dir, email, password) {
  const child = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    env: { ...process.env, HTTP_PORT: String(port), DATA_DIR: dir, ADMIN_EMAIL: email, ADMIN_PASSWORD: password },
    stdio: 'ignore',
  });
  children.push(child);
  return child;
}

async function signIn(base, email, password) {
  const res = await fetch(`${base}/admin/login`, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ email, password }).toString(),
  });
  return res.headers.get('set-cookie').split(';')[0];
}

before(async () => {
  start(A_PORT, A_DATA, 'first@example.org', PASSWORD);
  start(B_PORT, B_DATA, 'second@example.org', OTHER);
  for (const base of [A, B]) {
    await until(async () => { if (!(await fetch(`${base}/healthz`)).ok) throw new Error('not up'); });
  }
  cookieA = await signIn(A, 'first@example.org', PASSWORD);
  cookieB = await signIn(B, 'second@example.org', OTHER);

  // A podcast worth moving: a show, an episode, and an uploaded file.
  await fetch(`${A}/admin/shows`, {
    method: 'POST', redirect: 'manual',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', cookie: cookieA },
    body: new URLSearchParams({ name: 'The Moving Show', description: 'It goes elsewhere.' }).toString(),
  });
  await fetch(`${A}/admin/shows/the-moving-show/episodes`, {
    method: 'POST', redirect: 'manual',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', cookie: cookieA },
    body: new URLSearchParams({
      title: 'The one that travelled', date: '2026-01-02',
      mediaUrl: 'https://example.org/one.mp3', description: 'Packed.',
    }).toString(),
  });
  fs.mkdirSync(path.join(A_DATA, 'media', 'the-moving-show'), { recursive: true });
  fs.writeFileSync(path.join(A_DATA, 'media', 'the-moving-show', 'cover.jpg'), Buffer.from('a picture'));
});

after(() => {
  for (const c of children) c.kill();
  fs.rmSync(A_DATA, { recursive: true, force: true });
  fs.rmSync(B_DATA, { recursive: true, force: true });
});

test('the archive is an ordinary tar.gz, and long names survive it', () => {
  const long = `media/${'a'.repeat(120)}.mp3`;
  const gz = pack([{ name: 'shows.json', body: Buffer.from('[]') }, { name: long, body: Buffer.from('bytes') }]);
  // gzip, not a format of our own: the first two bytes say so.
  assert.strictEqual(gz[0], 0x1f);
  assert.strictEqual(gz[1], 0x8b);
  const back = unpack(gz);
  assert.deepStrictEqual(back.map((f) => f.name), ['shows.json', long]);
  assert.strictEqual(back[1].body.toString(), 'bytes');
});

test('nobody who is not signed in can take a copy, or put one back', async () => {
  assert.strictEqual((await fetch(`${A}/admin/api/export`)).status, 401);
  const res = await fetch(`${B}/admin/api/import`, { method: 'PUT', body: Buffer.from('anything') });
  assert.strictEqual(res.status, 401);
});

test('a whole instance moves to another server', async () => {
  const res = await fetch(`${A}/admin/api/export`, { headers: { cookie: cookieA } });
  assert.strictEqual(res.status, 200);
  assert.match(res.headers.get('content-disposition'), /fosscast-\d{4}-\d{2}-\d{2}\.tar\.gz/);
  const archive = Buffer.from(await res.arrayBuffer());
  const inside = unpack(archive).map((f) => f.name);
  assert.ok(inside.includes('shows.json'), 'the podcast is in it');
  assert.ok(inside.includes('episodes.json'), 'so are the episodes');
  assert.ok(inside.includes('media/the-moving-show/cover.jpg'), 'and the uploads');

  // The other box has nothing on it yet.
  assert.match(await (await fetch(`${B}/`)).text(), /Nothing published here yet/);

  const put = await fetch(`${B}/admin/api/import`, {
    method: 'PUT', headers: { cookie: cookieB }, body: archive,
  });
  assert.strictEqual(put.status, 200);
  assert.deepStrictEqual((await put.json()).refused, []);

  // It is now the first podcast, served from the second server - and
  // the memory copy went with it, which is the part that used to be
  // wrong: the store caches, so a file swapped underneath it is not
  // enough on its own.
  const page = await (await fetch(`${B}/`)).text();
  assert.match(page, /The Moving Show/);
  assert.match(page, /The one that travelled/);
  const feed = await (await fetch(`${B}/shows/the-moving-show/feed.xml`)).text();
  assert.match(feed, /The one that travelled/);
  assert.strictEqual(fs.readFileSync(path.join(B_DATA, 'media', 'the-moving-show', 'cover.jpg'), 'utf8'), 'a picture');
});

test('the login travels with it, because a move is a move', async () => {
  // The password from the first box now opens the second one, and the
  // second box's own password does not. That is what makes it a move
  // rather than a copy of the words, and why the screen says so.
  const moved = await fetch(`${B}/admin/login`, {
    method: 'POST', redirect: 'manual',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ email: 'first@example.org', password: PASSWORD }).toString(),
  });
  assert.strictEqual(moved.status, 303);
  const gone = await fetch(`${B}/admin/login`, {
    method: 'POST', redirect: 'manual',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ email: 'second@example.org', password: OTHER }).toString(),
  });
  assert.strictEqual(gone.status, 401);
});

test('an archive is not trusted about where its files belong', async () => {
  const cookie = await signIn(B, 'first@example.org', PASSWORD);
  const nasty = pack([
    { name: 'shows.json', body: Buffer.from('[]') },
    { name: 'users.json', body: fs.readFileSync(path.join(B_DATA, 'users.json')) },
    { name: '../../../../tmp/fosscast-escaped', body: Buffer.from('nope') },
    { name: '/etc/passwd', body: Buffer.from('nope') },
    { name: 'media/../../escaped.json', body: Buffer.from('nope') },
  ]);
  const res = await fetch(`${B}/admin/api/import`, { method: 'PUT', headers: { cookie }, body: nasty });
  assert.strictEqual(res.status, 200);
  const { refused } = await res.json();
  assert.strictEqual(refused.length, 3, 'all three are refused, not written');
  assert.ok(!fs.existsSync('/tmp/fosscast-escaped'));
});

test('something that is not an export is refused before anything is deleted', async () => {
  const cookie = await signIn(B, 'first@example.org', PASSWORD);
  const before = fs.readdirSync(B_DATA).sort();
  const wrong = pack([{ name: 'notes.json', body: Buffer.from('{}') }]);
  const res = await fetch(`${B}/admin/api/import`, { method: 'PUT', headers: { cookie }, body: wrong });
  assert.strictEqual(res.status, 400);
  assert.match((await res.json()).error, /does not look like a FOSSCast export/);
  assert.deepStrictEqual(fs.readdirSync(B_DATA).sort(), before, 'nothing was removed');

  // An archive with a podcast but no login would empty the login and
  // lock the owner out, because importing replaces rather than merges.
  const noUsers = pack([{ name: 'shows.json', body: Buffer.from('[]') }]);
  const half = await fetch(`${B}/admin/api/import`, { method: 'PUT', headers: { cookie }, body: noUsers });
  assert.strictEqual(half.status, 400);
  assert.match((await half.json()).error, /there is no login in it/);
  assert.deepStrictEqual(fs.readdirSync(B_DATA).sort(), before);

  // And a file that is not an archive at all says so rather than
  // throwing something a person cannot read.
  const junk = await fetch(`${B}/admin/api/import`, {
    method: 'PUT', headers: { cookie }, body: Buffer.from('this is not a gzip'),
  });
  assert.strictEqual(junk.status, 400);
  assert.deepStrictEqual(fs.readdirSync(B_DATA).sort(), before);
});

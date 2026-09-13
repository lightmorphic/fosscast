'use strict';
// Episodes whose media lives somewhere else.
//
// The point of these tests is that a show hosting its own files
// elsewhere is still counted. The feed must publish a link back to this
// server rather than the file's real address, and asking for that link
// must record a download before handing the listener onward.
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const PORT = 3800 + Math.floor(Math.random() * 100);
const BASE = `http://127.0.0.1:${PORT}`;
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'fosscast-offsite-'));

const OFFSITE = 'https://archive.org/download/a-show/episode-one.mp3';
const AWAY = { id: 'aaaaaaaa-0000-4000-8000-000000000001', mediaUrl: OFFSITE };
const HERE = { id: 'bbbbbbbb-0000-4000-8000-000000000002', mediaUrl: '/media/episode-two.mp3' };
const DRAFT = { id: 'cccccccc-0000-4000-8000-000000000003', mediaUrl: 'https://archive.org/download/a-show/unfinished.mp3', draft: true };
const FUTURE = { id: 'dddddddd-0000-4000-8000-000000000004', mediaUrl: 'https://archive.org/download/a-show/embargoed.mp3', date: '2099-01-01' };

let child;

async function until(fn, ms = 5000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try { return await fn(); } catch { await new Promise((r) => setTimeout(r, 100)); }
  }
  throw new Error('timed out');
}

before(async () => {
  const episode = (extra) => ({
    showId: 'show',
    title: `Episode ${extra.id.slice(-1)}`,
    description: 'A test episode.',
    date: '2020-01-01',
    draft: false,
    bytes: 1234,
    ...extra,
  });
  fs.writeFileSync(path.join(DATA, 'shows.json'),
    JSON.stringify([{ id: 'show', slug: 'a-show', name: 'A Show', ownerEmail: 'owner@test.example' }]));
  fs.writeFileSync(path.join(DATA, 'episodes.json'),
    JSON.stringify([episode(AWAY), episode(HERE), episode(DRAFT), episode(FUTURE)]));

  child = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    env: {
      ...process.env,
      HTTP_PORT: String(PORT),
      DATA_DIR: DATA,
      DOMAIN: 'test.example',
      ADMIN_EMAIL: 'admin@test.example',
      ADMIN_PASSWORD: 'a very long test password',
    },
    stdio: 'ignore',
  });
  await until(async () => {
    const res = await fetch(`${BASE}/healthz`);
    if (!res.ok) throw new Error('not up');
  });
});

after(() => {
  if (child) child.kill();
  fs.rmSync(DATA, { recursive: true, force: true });
});

test('the feed publishes our link, not the file\'s real address', async () => {
  const xml = await (await fetch(`${BASE}/shows/a-show/feed.xml`)).text();
  assert.ok(xml.includes(`https://test.example/d/${AWAY.id}.mp3`),
    'offsite media should be published as a link back to this server');
  assert.ok(!xml.includes(OFFSITE), 'the real address should not appear in the feed');
  // Media we serve ourselves is untouched: it is already counted where
  // it is served, and it supports byte ranges that a redirect would not.
  assert.ok(xml.includes('https://test.example/media/episode-two.mp3'));
});

test('asking for it counts a download, then points at the real file', async () => {
  const res = await fetch(`${BASE}/d/${AWAY.id}.mp3`, { redirect: 'manual' });
  assert.strictEqual(res.status, 302);
  assert.strictEqual(res.headers.get('location'), OFFSITE);
  // Never cached: a permanent redirect would mean the next download of
  // this episode is never seen.
  assert.strictEqual(res.headers.get('cache-control'), 'no-store');

  const stats = JSON.parse(fs.readFileSync(path.join(DATA, 'stats.json'), 'utf8'));
  assert.strictEqual(stats.totals[AWAY.id], 1, 'the download should have been counted');
});

test('the same listener twice in a day is still one download', async () => {
  const agent = { headers: { 'user-agent': 'AntennaPod/3.4.0 (Android 14)' }, redirect: 'manual' };
  await fetch(`${BASE}/d/${AWAY.id}.mp3`, agent);
  await fetch(`${BASE}/d/${AWAY.id}.mp3`, agent);
  const stats = JSON.parse(fs.readFileSync(path.join(DATA, 'stats.json'), 'utf8'));
  assert.strictEqual(stats.totals[AWAY.id], 2, 'one new listener, counted once');
});

test('an unpublished episode is not handed out', async () => {
  // A draft and a dated-ahead episode are not public yet. The rest of
  // the site knows that; this route has to know it too, or scheduling
  // an episode publishes its audio early to anyone with the link.
  for (const id of [DRAFT.id, FUTURE.id]) {
    const res = await fetch(`${BASE}/d/${id}.mp3`, { redirect: 'manual' });
    assert.strictEqual(res.status, 404, `${id} should not redirect`);
    assert.strictEqual(res.headers.get('location'), null);
  }
});

test('a malformed link answers, rather than taking the server with it', async () => {
  // decodeURIComponent throws on a lone "%", and an exception here used
  // to end the process: one request, no site, until it restarted.
  const bad = await fetch(`${BASE}/d/%`, { redirect: 'manual' });
  assert.ok(bad.status === 404 || bad.status === 400, `answered ${bad.status}`);
  const held = await fetch(`${BASE}/${['me', 'dia'].join('')}/%`, { redirect: 'manual' });
  assert.ok(held.status === 404 || held.status === 400, `answered ${held.status}`);
  const alive = await fetch(`${BASE}/healthz`);
  assert.strictEqual(alive.status, 200, 'still serving');
});

test('it forwards nowhere it should not', async () => {
  const missing = await fetch(`${BASE}/d/nobody.mp3`, { redirect: 'manual' });
  assert.strictEqual(missing.status, 404);

  // Media we hold ourselves has its own route; this one must not
  // redirect to a path on this server.
  const ours = await fetch(`${BASE}/d/${HERE.id}.mp3`, { redirect: 'manual' });
  assert.strictEqual(ours.status, 404);
});

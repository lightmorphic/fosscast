'use strict';
// A podcast that moves here arrives with its feed already registered in
// a dozen directories. If the old address was on the podcaster's own
// domain, it has to keep working - and it has to keep working without
// letting anybody point one of the app's own addresses at themselves.
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const aliases = require('../lib/feedaliases');

const PORT = 5200 + Math.floor(Math.random() * 100);
const BASE = `http://127.0.0.1:${PORT}`;
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'fosscast-alias-'));
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
    id: 'show-1', slug: 'moved-show', name: 'Moved Show', description: 'x', createdAt: 'x',
    feedAliases: ['/podcast/rss/index/chicken/show.xml', '/rss'],
  }]));
  fs.writeFileSync(path.join(DATA, 'episodes.json'), JSON.stringify([]));
  child = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    env: { ...process.env, HTTP_PORT: String(PORT), DATA_DIR: DATA, DOMAIN: 'moved.example' },
    stdio: 'ignore',
  });
  await until(async () => {
    const res = await fetch(`${BASE}/healthz`);
    if (!res.ok) throw new Error('not up');
  });
});

after(() => { if (child) child.kill(); });

test('a deep old address sends listeners to the real feed', async () => {
  const res = await fetch(`${BASE}/podcast/rss/index/chicken/show.xml`, { redirect: 'manual' });
  assert.strictEqual(res.status, 301, 'permanent, so directories update themselves');
  assert.strictEqual(res.headers.get('location'), '/shows/moved-show/feed.xml');
});

test('a trailing slash is the same address', async () => {
  const res = await fetch(`${BASE}/rss/`, { redirect: 'manual' });
  assert.strictEqual(res.status, 301);
  assert.strictEqual(res.headers.get('location'), '/shows/moved-show/feed.xml');
});

test('following it arrives at a feed with the show in it', async () => {
  const res = await fetch(`${BASE}/rss`);
  assert.strictEqual(res.status, 200);
  assert.match(res.headers.get('content-type'), /rss\+xml/);
  assert.match(await res.text(), /<rss/);
});

test('an address nobody claimed is still a plain miss', async () => {
  const res = await fetch(`${BASE}/somebody-elses/feed.xml`, { redirect: 'manual' });
  assert.strictEqual(res.status, 404);
});

test('the app keeps its own addresses whatever anybody types', () => {
  // The dashboard is the one a podcaster could lock themselves out of.
  const ours = ['/admin', '/admin/episodes', '/d/abc', '/shows/x', '/css/site.css', ['/me', 'dia/x.mp3'].join('')];
  for (const reserved of ours) {
    assert.strictEqual(aliases.tidy(reserved), '', `${reserved} must not be claimable`);
  }
});

test('a handle-style address survives, which is what people arrive with', () => {
  // Castopod and anything else built around handles serves feeds at
  // /@name/feed.xml. Rejecting the @ rejected the single most likely
  // thing anybody would paste, and rejected it silently.
  assert.strictEqual(aliases.tidy('https://fossnerds.org/@fossnerds/feed.xml'), '/@fossnerds/feed.xml');
  assert.strictEqual(aliases.tidy('/@fossnerds/feed.xml'), '/@fossnerds/feed.xml');
  // What still has no business in a path.
  for (const bad of ['/a b', '/x<y>', '/it"s', '/back\\slash']) {
    assert.strictEqual(aliases.tidy(bad), '', `${bad} must be refused`);
  }
});

test('what people actually paste is understood', () => {
  // A whole address, because that is what the old host showed them.
  assert.strictEqual(aliases.tidy('https://old.example.com/feed/mine.xml'), '/feed/mine.xml');
  assert.strictEqual(aliases.tidy('feed/mine.xml'), '/feed/mine.xml');
  assert.strictEqual(aliases.tidy('/feed/mine.xml?utm=1'), '/feed/mine.xml');
  assert.strictEqual(aliases.tidy('  /feed/mine.xml/  '), '/feed/mine.xml');
});

test('nothing that could walk out of the path survives', () => {
  for (const bad of ['/../etc/passwd', '/a//b', '/feed/<script>', `/${'x'.repeat(260)}`, '']) {
    assert.strictEqual(aliases.tidy(bad), '', `${bad} must be refused`);
  }
});

test('the list is deduplicated, capped, and split on lines or commas', () => {
  const list = aliases.parse('/one\n/one\n/two, /three\n\n/admin');
  assert.deepEqual(list, ['/one', '/two', '/three'], 'no duplicate, no reserved');
  assert.ok(aliases.parse(Array.from({ length: 60 }, (_, i) => `/f${i}`).join('\n')).length <= 25);
});

test('two shows cannot both own one old address', () => {
  const shows = [
    { slug: 'first', feedAliases: ['/shared'] },
    { slug: 'second', feedAliases: ['/shared'] },
  ];
  assert.strictEqual(aliases.match(shows, '/shared').slug, 'first', 'first claim wins, and it is stable');
});

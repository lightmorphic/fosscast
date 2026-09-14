'use strict';
// Two things, both about the same decision: there is the podcast and
// there is the episode, and the word "show" is not either of them.
//
// The first half drives the new admin addresses - no slug in a path
// that can only ever hold one value - and then posts to the old ones to
// prove a bookmark or a form somebody left open still works.
//
// The second half renders every admin page and looks for the word
// itself. The verb survives ("nothing to show yet"); what is banned is
// the noun, so the sweep looks for the plural and for the article that
// gives a noun away.
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const PORT = 3810 + Math.floor(Math.random() * 60);
const BASE = `http://127.0.0.1:${PORT}`;
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'fosscast-words-'));
let child;
let cookie = '';

async function until(fn, ms = 5000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try { return await fn(); } catch { await new Promise((r) => setTimeout(r, 100)); }
  }
  throw new Error('timed out');
}

function form(data) {
  return {
    method: 'POST',
    redirect: 'manual',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', cookie },
    body: new URLSearchParams(data).toString(),
  };
}

before(async () => {
  child = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    env: {
      ...process.env,
      HTTP_PORT: String(PORT),
      DATA_DIR: DATA,
      DOMAIN: 'words.example',
      ADMIN_EMAIL: 'admin@words.example',
      ADMIN_PASSWORD: 'a very long test password',
    },
    stdio: 'ignore',
  });
  await until(async () => {
    const res = await fetch(`${BASE}/healthz`);
    if (!res.ok) throw new Error('not up');
  });
  const res = await fetch(`${BASE}/admin/login`, form({
    email: 'admin@words.example', password: 'a very long test password',
  }));
  cookie = res.headers.get('set-cookie').split(';')[0];
});

after(() => {
  child.kill();
  fs.rmSync(DATA, { recursive: true, force: true });
});

test('the podcast and its episodes are made at the short addresses', async () => {
  let res = await fetch(`${BASE}/admin/podcast/create`, form({
    name: 'Test Podcast', description: 'A podcast about tests.',
  }));
  assert.strictEqual(res.status, 303);
  assert.strictEqual(res.headers.get('location'), '/admin/podcast');

  res = await fetch(`${BASE}/admin/episodes/new`, form({
    title: 'Episode One',
    date: '2026-08-15',
    mediaUrl: 'https://example.org/media/one.mp3',
    description: 'The first one.',
  }));
  assert.strictEqual(res.status, 303);
  assert.strictEqual(res.headers.get('location'), '/admin/episodes');

  const list = await (await fetch(`${BASE}/admin/episodes`, { headers: { cookie } })).text();
  assert.ok(list.includes('Episode One'));
});

test('the podcast settings and its old feed addresses post without a slug', async () => {
  let res = await fetch(`${BASE}/admin/podcast/settings`, form({
    name: 'Test Podcast', description: 'Still about tests.', author: 'A Tester',
    language: 'en', ownerName: 'A Tester', ownerEmail: 'owner@words.example',
  }));
  assert.strictEqual(res.status, 303);

  res = await fetch(`${BASE}/admin/podcast/aliases`, form({ feedAliases: '/old/feed.xml' }));
  assert.strictEqual(res.status, 303);

  const page = await (await fetch(`${BASE}/admin/podcast?s=feed`, { headers: { cookie } })).text();
  assert.ok(page.includes('/old/feed.xml'), 'the alias was stored');
});

test('the old addresses still answer, body and all', async () => {
  const res = await fetch(`${BASE}/admin/shows/test-podcast/settings`, form({
    name: 'Renamed By The Old Address', description: 'Still about tests.',
    author: 'A Tester', language: 'en',
  }));
  assert.strictEqual(res.status, 303);
  const page = await (await fetch(`${BASE}/admin/podcast`, { headers: { cookie } })).text();
  assert.ok(page.includes('Renamed By The Old Address'), 'the old address kept the form body');

  // The old list address is a link somebody may have bookmarked.
  const listed = await fetch(`${BASE}/admin/shows`, { headers: { cookie }, redirect: 'manual' });
  assert.strictEqual(listed.status, 303);
  assert.strictEqual(listed.headers.get('location'), '/admin/episodes');
});

// Strip the markup, leaving what a person actually reads. Attribute
// values go with it: data-show="..." is an identifier, not a word.
function visibleText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&middot;|&nbsp;/g, ' ')
    .replace(/\s+/g, ' ');
}

test('no admin page calls the podcast or an episode a show', async () => {
  const pages = [
    '/admin', '/admin/podcast', '/admin/podcast?s=feed', '/admin/podcast?s=artwork',
    '/admin/podcast?s=listen', '/admin/podcast?s=social', '/admin/podcast?s=support',
    '/admin/podcast?s=analytics', '/admin/episodes', '/admin/hosts', '/admin/look',
    '/admin/stats', '/admin/account', '/admin/login',
  ];
  const noun = /\b(a|an|the|this|that|your|our|its|their|each|every|one|another)\s+shows?\b/i;
  const plural = /\bshows\b/i;
  for (const p of pages) {
    const res = await fetch(`${BASE}${p}`, { headers: { cookie } });
    assert.strictEqual(res.status, 200, `${p} renders`);
    const words = visibleText(await res.text());
    assert.ok(!noun.test(words), `${p} calls something a show: ${(words.match(noun) || [])[0]}`);
    assert.ok(!plural.test(words), `${p} says shows: ${(words.match(plural) || [])[0]}`);
  }
});

test('the public pages say podcast too', async () => {
  for (const p of ['/', '/shows/test-podcast', '/hosts']) {
    const res = await fetch(`${BASE}${p}`);
    if (res.status === 404) continue; // no hosts added in this suite
    const words = visibleText(await res.text());
    assert.ok(!/\b(a|an|the|this|your|our|its|each|every|one)\s+shows?\b/i.test(words),
      `${p} calls something a show`);
  }
});

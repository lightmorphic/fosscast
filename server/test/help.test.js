'use strict';
// The help page lives in FOSSCast, so three things have to hold.
//
// It is behind the login, because everything in the dashboard is. It
// asks no other machine for anything, because a self-hosted box may
// have no internet at all and a page that half-loads is worse than a
// page that says nothing. And every link in the dashboard that points
// into it lands on a section that exists: a deep link to a heading that
// is not there drops somebody at the top of a long page and leaves them
// to hunt, which is precisely what the link was for.
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const PORT = 4950 + Math.floor(Math.random() * 40);
const BASE = `http://127.0.0.1:${PORT}`;
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'fosscast-help-'));
const SCREENS = path.join(__dirname, '..', 'lib', 'admin');
let child;
let cookie = '';
let page = '';

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
      DOMAIN: 'help.example',
      ADMIN_EMAIL: 'admin@help.example',
      ADMIN_PASSWORD: 'a very long test password',
    },
    stdio: 'ignore',
  });
  await until(async () => {
    const res = await fetch(`${BASE}/healthz`);
    if (!res.ok) throw new Error('not up');
  });
  const res = await fetch(`${BASE}/admin/login`, form({
    email: 'admin@help.example', password: 'a very long test password',
  }));
  cookie = res.headers.get('set-cookie').split(';')[0];
  await fetch(`${BASE}/admin/podcast/create`, form({ name: 'Help Podcast', description: 'For the test.' }));
  page = await (await fetch(`${BASE}/help`, { headers: { cookie } })).text();
});

after(() => {
  child.kill();
  fs.rmSync(DATA, { recursive: true, force: true });
});

test('signed out, /help is a login page', async () => {
  const res = await fetch(`${BASE}/help`, { redirect: 'manual' });
  assert.strictEqual(res.status, 303);
  assert.strictEqual(res.headers.get('location'), '/admin/login');
});

test('it asks no other machine for anything', () => {
  // Every src and href on the page, and every url() in its styles. Any
  // of them naming another host is a page that breaks on a box with no
  // internet - and a page that tells somebody else what this podcaster
  // is reading about.
  const outside = [];
  for (const [, url] of page.matchAll(/(?:src|href)="([^"]+)"/g)) {
    if (/^(https?:)?\/\//i.test(url)) outside.push(url);
  }
  for (const [, url] of page.matchAll(/url\(([^)]+)\)/g)) {
    if (/^["']?(https?:)?\/\//i.test(url)) outside.push(url);
  }
  assert.deepStrictEqual(outside, [], 'nothing on the page comes from anywhere else');
});

test('it answers questions rather than listing features', () => {
  // Only the help page's own headings: the admin shell carries a hidden
  // embed dialog with an h2 of its own on every page.
  const questions = [...page.matchAll(/class="help-section" id="[^"]+">\s*<h2>([^<]+)<\/h2>/g)]
    .map((m) => m[1]);
  assert.ok(questions.length >= 10, `${questions.length} sections`);
  const asking = questions.filter((q) => q.trim().endsWith('?'));
  assert.strictEqual(asking.length, questions.length,
    `these headings are not questions: ${questions.filter((q) => !q.trim().endsWith('?')).join(' / ')}`);

  // No table of contents pretending to be a product: no link on the
  // page that only goes somewhere else on the same page.
  const sections = page.match(/<section class="help-section"[\s\S]*<\/section>/)[0];
  assert.ok(!/href="#/.test(sections), 'the headings are the contents');
});

test('it covers what somebody running this actually has to know', () => {
  for (const [id, must] of [
    ['directories', 'Apple Podcasts Connect'],
    ['feed', 'Durations known'],
    ['files', 'anywhere that serves one'],
    ['door', 'No audio passes through this server'],
    ['numbers', 'downloads and never listens'],
    ['hosts', 'podcast:person'],
    ['importing', 'podcast:guid'],
    ['login', 'docker compose logs app'],
    ['passkeys', 'needs HTTPS'],
  ]) {
    const found = page.match(new RegExp(`id="${id}"[\\s\\S]*?</section>`));
    assert.ok(found, `there is a ${id} section`);
    // The source wraps at eighty columns, so a sentence is matched with
    // its spaces loosened rather than by pasting the line breaks in.
    const loose = new RegExp(must.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+'));
    assert.match(found[0], loose, `${id} says the thing that matters`);
  }
});

test('every deep link in the dashboard lands on a section that exists', async () => {
  const ids = new Set([...page.matchAll(/class="help-section" id="([^"]+)"/g)].map((m) => m[1]));
  assert.ok(ids.size >= 10);

  // Read the links out of the screens themselves rather than out of one
  // rendered page: a link on a screen this test never opens is exactly
  // the one that rots.
  const wanted = new Set();
  for (const file of fs.readdirSync(SCREENS).filter((f) => f.endsWith('.js'))) {
    const source = fs.readFileSync(path.join(SCREENS, file), 'utf8');
    for (const [, id] of source.matchAll(/href="\/help#([a-z-]+)"/g)) wanted.add(id);
  }
  assert.ok(wanted.size >= 8, `${wanted.size} deep links found in the screens`);
  for (const id of wanted) {
    assert.ok(ids.has(id), `a screen links to /help#${id}, which is not a section`);
  }

  // And the links are plain links, not icons or buttons dressed up.
  const account = await (await fetch(`${BASE}/admin/account`, { headers: { cookie } })).text();
  assert.match(account, /<a class="hint-link" href="\/help#passkeys">[^<]+<\/a>/);
});

test('Help is in the menu, and knows when it is the page you are on', () => {
  assert.match(page, /<a class="admin-link current" href="\/help">Help<\/a>/);
  const dashboard = /<a class="admin-link[^"]*" href="\/help">Help<\/a>/;
  assert.match(page, dashboard);
});

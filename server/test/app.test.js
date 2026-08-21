'use strict';
// Integration test: boots the real server on a random port with a
// temporary data directory and walks the admin flow end to end.
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const PORT = 3900 + Math.floor(Math.random() * 100);
const BASE = `http://127.0.0.1:${PORT}`;
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'fosscast-test-'));
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
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      cookie,
    },
    body: new URLSearchParams(data).toString(),
  };
}

before(async () => {
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
  child.kill();
  fs.rmSync(DATA, { recursive: true, force: true });
});

test('wrong password is rejected', async () => {
  const res = await fetch(`${BASE}/admin/login`, form({
    email: 'admin@test.example', password: 'wrong',
  }));
  assert.strictEqual(res.status, 401);
});

test('login sets a session cookie', async () => {
  const res = await fetch(`${BASE}/admin/login`, form({
    email: 'admin@test.example', password: 'a very long test password',
  }));
  assert.strictEqual(res.status, 303);
  const setCookie = res.headers.get('set-cookie');
  assert.ok(setCookie.includes('fosscast_admin='));
  assert.ok(setCookie.includes('HttpOnly'));
  cookie = setCookie.split(';')[0];
});

test('admin pages need the cookie', async () => {
  const anon = await fetch(`${BASE}/admin`, { redirect: 'manual' });
  assert.strictEqual(anon.status, 303);
  const authed = await fetch(`${BASE}/admin`, { headers: { cookie } });
  assert.strictEqual(authed.status, 200);
  assert.ok((await authed.text()).includes('Dashboard'));
});

test('create a show, publish an episode, see both publicly', async () => {
  let res = await fetch(`${BASE}/admin/shows`, form({
    name: 'Test Show', description: 'A show about tests.',
  }));
  assert.strictEqual(res.status, 303);
  assert.strictEqual(res.headers.get('location'), '/admin/podcast');

  res = await fetch(`${BASE}/admin/shows/test-show/episodes`, form({
    title: 'Episode One',
    date: '2026-08-15',
    mediaUrl: 'https://example.org/media/episode-one.mp3',
    description: 'The first one.',
  }));
  assert.strictEqual(res.status, 303);

  const page = await (await fetch(`${BASE}/shows/test-show`)).text();
  assert.ok(page.includes('Episode One'));
  assert.ok(page.includes('<audio'));

  const feed = await (await fetch(`${BASE}/shows/test-show/feed.xml`)).text();
  assert.ok(feed.includes('<rss'));
  assert.ok(feed.includes('Episode One'));
  assert.ok(feed.includes('type="audio/mpeg"'));
});

test('the episode edit page and the home page render', async () => {
  const list = JSON.parse(fs.readFileSync(path.join(DATA, 'episodes.json'), 'utf8'));
  const editRes = await fetch(`${BASE}/admin/episodes/${list[0].id}`, { headers: { cookie } });
  assert.strictEqual(editRes.status, 200);
  assert.ok((await editRes.text()).includes('Edit show'));

  const home = await (await fetch(`${BASE}/`)).text();
  assert.ok(home.includes('Test Show'));
  assert.ok(home.includes('Episode One'));
});

test('hosts: added, ordered, shown as cards, on their own pages and in the feed', async () => {
  // Nothing on the site until there is someone to show.
  assert.strictEqual((await fetch(`${BASE}/hosts`)).status, 200);
  let hostsPage = await (await fetch(`${BASE}/hosts`)).text();
  assert.ok(hostsPage.includes('No hosts listed yet.'));
  assert.ok(!(await (await fetch(`${BASE}/shows/test-show`)).text()).includes('site-nav'));

  let res = await fetch(`${BASE}/admin/hosts`, form({
    name: 'Sam Smith', role: 'host', bio: 'Sam started it.\n\nStill here.',
    link: 'https://sam.example',
  }));
  assert.strictEqual(res.status, 303);
  res = await fetch(`${BASE}/admin/hosts`, form({
    name: 'Ada Byron', role: 'co-host', bio: 'Ada joined later.',
  }));
  assert.strictEqual(res.status, 303);

  // The cards page carries both, and the menu now offers it.
  hostsPage = await (await fetch(`${BASE}/hosts`)).text();
  assert.ok(hostsPage.includes('Sam Smith'));
  assert.ok(hostsPage.includes('Ada Byron'));
  assert.ok(hostsPage.includes('host-card'));
  const home = await (await fetch(`${BASE}/shows/test-show`)).text();
  assert.ok(home.includes('href="/hosts"'));

  // A page each, with the write-up split into paragraphs.
  const samPage = await (await fetch(`${BASE}/hosts/sam-smith`)).text();
  assert.ok(samPage.includes('<h1>Sam Smith</h1>'));
  assert.ok(samPage.includes('Sam started it.'));
  assert.ok(samPage.includes('Still here.'));
  assert.ok(samPage.includes('sam.example'));
  assert.ok(samPage.includes('Ada Byron'), 'the rest of the team is linked');
  assert.strictEqual((await fetch(`${BASE}/hosts/nobody-here`)).status, 404);

  // The feed says who is on the show, and links their page.
  const feed = await (await fetch(`${BASE}/shows/test-show/feed.xml`)).text();
  assert.ok(feed.includes('<podcast:person role="host" href="https://sam.example">Sam Smith</podcast:person>'));
  assert.ok(feed.includes('href="https://test.example/hosts/ada-byron">Ada Byron</podcast:person>'));

  // The order is the operator's to set.
  const adminPage = await (await fetch(`${BASE}/admin/hosts`, { headers: { cookie } })).text();
  const ids = [...adminPage.matchAll(/\/admin\/hosts\/([a-f0-9-]{36})"/g)].map((m) => m[1]);
  const ada = ids[ids.length - 1];
  res = await fetch(`${BASE}/admin/hosts/${ada}/move`, form({ dir: 'up' }));
  assert.strictEqual(res.status, 303);
  hostsPage = await (await fetch(`${BASE}/hosts`)).text();
  assert.ok(hostsPage.indexOf('Ada Byron') < hostsPage.indexOf('Sam Smith'), 'Ada moved above Sam');

  // Editing keeps the same record; removing takes the page with it.
  res = await fetch(`${BASE}/admin/hosts/${ada}`, form({
    name: 'Ada Byron', role: 'producer', bio: 'Ada joined later.', link: '',
  }));
  assert.strictEqual(res.status, 303);
  assert.ok((await (await fetch(`${BASE}/hosts/ada-byron`)).text()).includes('producer'));
  res = await fetch(`${BASE}/admin/hosts/${ada}/delete`, form({}));
  assert.strictEqual(res.status, 303);
  assert.strictEqual((await fetch(`${BASE}/hosts/ada-byron`)).status, 404);
});

test('funding services show as buttons and as feed funding links', async () => {
  const res = await fetch(`${BASE}/admin/shows/test-show/settings`, form({
    name: 'Test Show',
    description: 'A show about tests.',
    language: 'en',
    support_patreon: 'https://www.patreon.com/testshow',
    support_buymeacoffee: 'https://buymeacoffee.com/testshow',
    support_kofi: 'not a url',
    fundingUrl: 'https://pay.example/test',
    fundingLabel: 'Chip in',
  }));
  assert.strictEqual(res.status, 303);

  const page = await (await fetch(`${BASE}/shows/test-show`)).text();
  assert.ok(page.includes('Support the show'));
  assert.ok(page.includes('https://www.patreon.com/testshow'));
  assert.ok(page.includes('Buy Me a Coffee'));
  assert.ok(!page.includes('not a url'), 'a bad URL is dropped, not shown');

  const feed = await (await fetch(`${BASE}/shows/test-show/feed.xml`)).text();
  assert.ok(feed.includes('<podcast:funding url="https://www.patreon.com/testshow">Patreon</podcast:funding>'));
  assert.ok(feed.includes('<podcast:funding url="https://pay.example/test">Chip in</podcast:funding>'));

  // The admin form offers a sign-up link for each service.
  const admin = await (await fetch(`${BASE}/admin/podcast`, { headers: { cookie } })).text();
  assert.ok(admin.includes('https://www.patreon.com/create'));
  assert.ok(admin.includes('https://buymeacoffee.com/signup'));
  assert.ok(admin.includes('Memberships'));
});

test('a second show is refused (this edition manages one podcast)', async () => {
  const res = await fetch(`${BASE}/admin/shows`, form({
    name: 'Second Show', description: 'One too many.',
  }));
  assert.strictEqual(res.status, 303);
  const shows = JSON.parse(fs.readFileSync(path.join(DATA, 'shows.json'), 'utf8'));
  assert.strictEqual(shows.length, 1);
});

test('login rate limiting locks out after repeated failures', async () => {
  for (let i = 0; i < 10; i++) {
    await fetch(`${BASE}/admin/login`, form({ email: 'admin@test.example', password: 'no' }));
  }
  const res = await fetch(`${BASE}/admin/login`, form({
    email: 'admin@test.example', password: 'a very long test password',
  }));
  assert.strictEqual(res.status, 429);
});

test('a one-time sign-in link logs in and cannot be reused', async () => {
  const auth = require('../lib/auth');
  const settings = JSON.parse(fs.readFileSync(path.join(DATA, 'settings.json'), 'utf8'));
  const users = JSON.parse(fs.readFileSync(path.join(DATA, 'users.json'), 'utf8'));
  const token = auth.signLoginLink(users[0].id, settings.secret, 60000);

  const first = await fetch(`${BASE}/admin/session?token=${encodeURIComponent(token)}`, { redirect: 'manual' });
  assert.strictEqual(first.status, 303);
  assert.strictEqual(first.headers.get('location'), '/admin');
  assert.ok(first.headers.get('set-cookie').includes('fosscast_admin='));

  // Same link a second time is refused.
  const second = await fetch(`${BASE}/admin/session?token=${encodeURIComponent(token)}`, { redirect: 'manual' });
  assert.strictEqual(second.status, 400);

  // A garbage token is refused.
  const bad = await fetch(`${BASE}/admin/session?token=nonsense`, { redirect: 'manual' });
  assert.strictEqual(bad.status, 400);
});

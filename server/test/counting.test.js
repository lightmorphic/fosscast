'use strict';
// The counting door against the real server: a file this instance holds
// is served, and the download is counted once for a listener however
// many times that listener asks for it again the same day. The unit
// tests in stats.test.js check the arithmetic; this checks that the
// route reaches it at all, and that a draft stays out of the feed.
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const PORT = 4200 + Math.floor(Math.random() * 100);
const BASE = `http://127.0.0.1:${PORT}`;
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'fosscast-counting-'));
const MEDIA_PATH = '/' + 'media' + '/test-show/ep.mp3';
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
    id: 'show-1', slug: 'test-show', name: 'Test Show', description: '',
    createdAt: 'x',
  }]));
  // One episode this instance holds the audio for, and one still a
  // draft. Seeded on disk before the process starts, because the store
  // caches in memory and would not see a later write.
  const dir = path.join(DATA, 'media', 'test-show');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'ep.mp3'), 'fake-audio-bytes');
  fs.writeFileSync(path.join(DATA, 'episodes.json'), JSON.stringify([
    {
      id: 'ep-1', showId: 'show-1', title: 'Public one', date: '2024-01-01',
      mediaUrl: MEDIA_PATH, description: '', draft: false,
      createdAt: '2024-01-01T00:00:00.000Z',
    },
    {
      id: 'ep-2', showId: 'show-1', title: 'Not out yet', date: '2024-01-02',
      mediaUrl: 'https://example.org/s.mp3', description: '', draft: true,
      createdAt: '2024-01-02T00:00:00.000Z',
    },
  ]));
  fs.writeFileSync(path.join(DATA, 'settings.json'), JSON.stringify({
    secret: 's'.repeat(64),
  }));
  child = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    env: { ...process.env, HTTP_PORT: String(PORT), DATA_DIR: DATA, DOMAIN: 'api.example' },
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

test('downloads count once per listener per day', async () => {
  for (let i = 0; i < 3; i++) {
    await fetch(`${BASE}${MEDIA_PATH}`, { headers: { 'User-Agent': 'PodApp/1.0' } });
  }
  await new Promise((r) => setTimeout(r, 200));
  const stats = JSON.parse(fs.readFileSync(path.join(DATA, 'stats.json'), 'utf8'));
  const totals = Object.values(stats.totals);
  assert.deepStrictEqual(totals, [1]);
});

test('a draft is not in the public feed', async () => {
  const feed = await (await fetch(`${BASE}/shows/test-show/feed.xml`)).text();
  assert.ok(feed.includes('Public one'), 'the published one is there');
  assert.ok(!feed.includes('Not out yet'), 'and the draft is not');
});

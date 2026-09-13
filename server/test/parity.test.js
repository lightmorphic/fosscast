'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { parseFeed, parseDuration } = require('../lib/import');
const { serveMedia, safeName } = require('../lib/media');
const { visible } = require('../lib/public');

test('import parses a typical feed', () => {
  const xml = `<?xml version="1.0"?><rss><channel>
    <title>Old Show</title><language>en-GB</language>
    <itunes:author>Jo Host</itunes:author>
    <itunes:image href="https://old.example/art.jpg"/>
    <itunes:category text="Technology"/>
    <item><title><![CDATA[Ep 1 & friends]]></title>
      <guid>abc-1</guid><pubDate>Mon, 03 Feb 2025 10:00:00 GMT</pubDate>
      <description><![CDATA[<p>Notes here</p>]]></description>
      <itunes:episode>1</itunes:episode><itunes:duration>1:02:03</itunes:duration>
      <enclosure url="https://old.example/ep1.mp3" length="123" type="audio/mpeg"/>
    </item>
    <item><title>No media</title></item>
  </channel></rss>`;
  const { channel, items } = parseFeed(xml);
  assert.strictEqual(channel.title, 'Old Show');
  assert.strictEqual(channel.author, 'Jo Host');
  assert.strictEqual(channel.category, 'Technology');
  assert.strictEqual(items.length, 1);
  assert.strictEqual(items[0].title, 'Ep 1 & friends');
  assert.strictEqual(items[0].mediaUrl, 'https://old.example/ep1.mp3');
  assert.strictEqual(items[0].description, 'Notes here');
  assert.strictEqual(items[0].date, '2025-02-03');
  assert.strictEqual(items[0].bytes, 123);
  assert.strictEqual(parseDuration(items[0].durationRaw), 3723);
});

test('draft and future episodes are hidden from the public', () => {
  const today = new Date().toISOString().slice(0, 10);
  const eps = [
    { title: 'ok', date: '2020-01-01', draft: false },
    { title: 'draft', date: '2020-01-01', draft: true },
    { title: 'future', date: '2999-01-01', draft: false },
    { title: 'today', date: today, draft: false },
  ];
  assert.deepStrictEqual(visible(eps).map((e) => e.title), ['ok', 'today']);
});

test('media serving honours byte ranges and blocks traversal', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fosscast-media-'));
  fs.mkdirSync(path.join(dir, 'show'));
  fs.writeFileSync(path.join(dir, 'show', 'a.mp3'), '0123456789');
  const server = http.createServer((req, res) => serveMedia(req, res, dir, req.url));
  await new Promise((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;

  const full = await fetch(`${base}/media/show/a.mp3`);
  assert.strictEqual(full.status, 200);
  assert.strictEqual(full.headers.get('accept-ranges'), 'bytes');
  assert.strictEqual(await full.text(), '0123456789');

  const part = await fetch(`${base}/media/show/a.mp3`, { headers: { Range: 'bytes=2-5' } });
  assert.strictEqual(part.status, 206);
  assert.strictEqual(part.headers.get('content-range'), 'bytes 2-5/10');
  assert.strictEqual(await part.text(), '2345');

  const tail = await fetch(`${base}/media/show/a.mp3`, { headers: { Range: 'bytes=-3' } });
  assert.strictEqual(tail.status, 206);
  assert.strictEqual(await tail.text(), '789');

  const evil = await fetch(`${base}/media/..%2F..%2Fetc%2Fpasswd`);
  assert.strictEqual(evil.status, 404);
  server.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('safeName strips hostile filenames', () => {
  assert.strictEqual(safeName('../../etc/passwd'), '....etcpasswd');
  assert.strictEqual(safeName('My Episode (final).mp3'), 'My-Episode-final.mp3');
});

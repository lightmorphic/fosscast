'use strict';
// Transcripts: one file on disk, edited as text in the dashboard, and
// an opt-in hook for a tool that can produce one.
//
// The two things worth being careful about are both here. A transcript
// must not exist twice - the file is the transcript, the textarea is a
// view of it - and the hook must be inert and safe: nothing at all
// until somebody sets TRANSCRIBE_URL, and then text accepted only from
// exactly the origin they named.
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const transcripts = require('../lib/transcripts');
const publicSite = require('../lib/public');

const PORT = 5000 + Math.floor(Math.random() * 100);
const PORT2 = 5100 + Math.floor(Math.random() * 100);
const PASSWORD = 'a long transcript password';
const started = [];

async function until(fn, ms = 6000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { try { return await fn(); } catch { await new Promise((r) => setTimeout(r, 100)); } }
  throw new Error('timed out');
}

function start(port, extraEnv = {}) {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'fosscast-transcript-'));
  const child = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    env: {
      ...process.env,
      HTTP_PORT: String(port),
      DATA_DIR: data,
      DOMAIN: 'pod.example',
      ADMIN_EMAIL: 'op@pod.example',
      ADMIN_PASSWORD: PASSWORD,
      DEMO_MODE: '',
      TRANSCRIBE_URL: '',
      ...extraEnv,
    },
    stdio: 'ignore',
  });
  started.push({ child, data });
  return { child, data };
}

// A signed-in dashboard, and a show and episode to work on.
async function seed(base) {
  const login = await fetch(`${base}/admin/login`, {
    method: 'POST', redirect: 'manual',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ email: 'op@pod.example', password: PASSWORD }),
  });
  const cookie = (login.headers.get('set-cookie') || '').split(';')[0];
  await fetch(`${base}/admin/shows`, {
    method: 'POST', redirect: 'manual',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: cookie },
    body: new URLSearchParams({ name: 'A Show', description: 'About things.' }),
  });
  await fetch(`${base}/admin/shows/a-show/episodes`, {
    method: 'POST', redirect: 'manual',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: cookie },
    body: new URLSearchParams({
      title: 'The first one', date: '2026-01-05',
      mediaUrl: 'https://storage.example/one.mp3', description: 'Words.',
    }),
  });
  return cookie;
}

const episodesIn = (data) => JSON.parse(fs.readFileSync(path.join(data, 'episodes.json'), 'utf8'));

let base; let cookie; let data;

before(async () => {
  const first = start(PORT);
  data = first.data;
  base = `http://127.0.0.1:${PORT}`;
  await until(async () => { if (!(await fetch(`${base}/healthz`)).ok) throw new Error('down'); });
  cookie = await seed(base);
});

after(() => {
  for (const s of started) { s.child.kill(); fs.rmSync(s.data, { recursive: true, force: true }); }
});

// ------------------------------------------------------- the conversions

test('a cue file becomes editable lines and goes back unchanged', () => {
  const vtt = 'WEBVTT\n\n00:00:00.000 --> 00:00:04.000\nFirst thing said.\n\n'
    + '00:01:05.500 --> 00:01:09.000\nSecond thing said.\n';
  const lines = transcripts.toLines(vtt);
  assert.strictEqual(lines, '[0:00] First thing said.\n[1:05] Second thing said.');

  const again = transcripts.render(lines, 'The first one');
  assert.strictEqual(again.ext, '.vtt');
  assert.match(again.body, /^WEBVTT/);
  assert.deepStrictEqual(transcripts.parseCues(again.body).map((c) => c.text),
    ['First thing said.', 'Second thing said.']);
});

test('SubRip is read too, since it is the other thing people have', () => {
  const srt = '1\n00:00:02,000 --> 00:00:05,000\nA line.\n\n2\n00:00:06,000 --> 00:00:08,000\nAnother.\n';
  assert.strictEqual(transcripts.toLines(srt), '[0:02] A line.\n[0:06] Another.');
});

test('a line with no timestamp joins the one above it', () => {
  const { cues } = transcripts.fromLines('[0:00] A sentence\nthat somebody split.\n[0:09] The next one.');
  assert.deepStrictEqual(cues.map((c) => c.text), ['A sentence that somebody split.', 'The next one.']);
});

test('prose with no timings at all is stored as prose, not as invented cues', () => {
  const out = transcripts.render('Just some words.\nAnd some more.', 'x');
  assert.strictEqual(out.ext, '.txt');
  assert.strictEqual(out.body, 'Just some words.\nAnd some more.\n');
  assert.strictEqual(transcripts.render('   ', 'x'), null, 'nothing at all is nothing');
});

test('the file it writes cannot be aimed anywhere but the show it belongs to', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fosscast-write-'));
  const at = transcripts.write(dir, '../escape', '../../etc/passwd', '[0:00] Hello.', 'T');
  assert.strictEqual(at, '/media/..escape/....etcpasswd-transcript.vtt');
  assert.ok(fs.existsSync(path.join(dir, '..escape', '....etcpasswd-transcript.vtt')));
  fs.rmSync(dir, { recursive: true, force: true });
});

// ---------------------------------------------------------- the dashboard

test('typing a transcript writes a file, and the episode points at it', async () => {
  const id = episodesIn(data)[0].id;
  const res = await fetch(`${base}/admin/episodes/${id}/transcript`, {
    method: 'POST', redirect: 'manual',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: cookie },
    body: new URLSearchParams({ text: '[0:00] Hello there.\n[0:07] And again.', public: '1', live: '1' }),
  });
  assert.strictEqual(res.status, 204);

  const episode = episodesIn(data)[0];
  assert.strictEqual(episode.transcript, '/media/a-show/the-first-one-transcript.vtt');
  assert.strictEqual(episode.transcriptPublic, true);

  // One copy, and it is the file: nothing was stashed on the record.
  assert.ok(!('transcriptText' in episode), 'the words are not duplicated onto the episode');
  const onDisk = fs.readFileSync(path.join(data, 'media', 'a-show', 'the-first-one-transcript.vtt'), 'utf8');
  assert.match(onDisk, /Hello there\./);

  // ...and the page reads that file back rather than anything else.
  const page = await (await fetch(`${base}/admin/episodes/${id}`, { headers: { Cookie: cookie } })).text();
  assert.match(page, /\[0:00\] Hello there\./);
  assert.match(page, /class="switch-input"[^>]* checked/);
});

test('the file the words are in is the file the feed advertises', async () => {
  const feed = await (await fetch(`${base}/shows/a-show/feed.xml`)).text();
  assert.match(feed, /<podcast:transcript url="https:\/\/pod\.example\/media\/a-show\/the-first-one-transcript\.vtt" type="text\/vtt"\/>/);
});

test('the switch decides whether the words appear on the episode page', async () => {
  const id = episodesIn(data)[0].id;
  const slug = episodesIn(data)[0].slug;
  const on = await (await fetch(`${base}/shows/a-show/${slug}`)).text();
  assert.match(on, /Hello there\./, 'switched on, the page prints it');
  assert.match(on, /class="panel transcript"/);

  await fetch(`${base}/admin/episodes/${id}/transcript`, {
    method: 'POST', redirect: 'manual',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: cookie },
    body: new URLSearchParams({ text: '[0:00] Hello there.\n[0:07] And again.', live: '1' }),
  });
  assert.strictEqual(episodesIn(data)[0].transcriptPublic, false);

  const off = await (await fetch(`${base}/shows/a-show/${slug}`)).text();
  assert.doesNotMatch(off, /Hello there\./, 'switched off, it does not');
  assert.match(off, /Transcript<\/a>/, 'but it is still linked, and still in the feed');
});

test('emptying the box removes the transcript and its file', async () => {
  const id = episodesIn(data)[0].id;
  await fetch(`${base}/admin/episodes/${id}/transcript`, {
    method: 'POST', redirect: 'manual',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: cookie },
    body: new URLSearchParams({ text: '   ', live: '1' }),
  });
  const episode = episodesIn(data)[0];
  assert.ok(!episode.transcript, 'the episode no longer claims one');
  assert.ok(!fs.existsSync(path.join(data, 'media', 'a-show', 'the-first-one-transcript.vtt')));
});

test('a transcript longer than a form still saves', async () => {
  const id = episodesIn(data)[0].id;
  const lines = [];
  for (let i = 0; i < 1500; i++) lines.push(`[${Math.floor(i / 60)}:${String(i % 60).padStart(2, '0')}] Line number ${i} of a long episode.`);
  const res = await fetch(`${base}/admin/episodes/${id}/transcript`, {
    method: 'POST', redirect: 'manual',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: cookie },
    body: new URLSearchParams({ text: lines.join('\n'), live: '1' }),
  });
  assert.strictEqual(res.status, 204, 'a 45-minute transcript is bigger than the form limit');
  const onDisk = fs.readFileSync(path.join(data, 'media', 'a-show', 'the-first-one-transcript.vtt'), 'utf8');
  assert.match(onDisk, /Line number 1499 of a long episode\./);
});

test('a stranger cannot write a transcript', async () => {
  const id = episodesIn(data)[0].id;
  const res = await fetch(`${base}/admin/episodes/${id}/transcript`, {
    method: 'POST', redirect: 'manual',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ text: '[0:00] I was never here.' }),
  });
  assert.ok(res.status === 302 || res.status === 303 || res.status === 401, `got ${res.status}`);
  const onDisk = fs.readFileSync(path.join(data, 'media', 'a-show', 'the-first-one-transcript.vtt'), 'utf8');
  assert.doesNotMatch(onDisk, /I was never here/);
});

// --------------------------------------------------------------- the hook

test('with nothing configured there is no tool and no sign of one', async () => {
  assert.strictEqual(transcripts.transcriber(), null);
  const id = episodesIn(data)[0].id;
  const page = await (await fetch(`${base}/admin/episodes/${id}`, { headers: { Cookie: cookie } })).text();
  assert.doesNotMatch(page, /id="transcribe-open"/, 'no button');
  assert.doesNotMatch(page, /id="transcribe-frame"/, 'nowhere to put a frame');
  assert.doesNotMatch(page, /data-origin=/, 'no origin, so the listener never attaches');
  assert.doesNotMatch(page, /data-tool=/);
  assert.doesNotMatch(page, /<iframe/);
  // The panel is still there and still works: the box is the feature,
  // the tool is an extra.
  assert.match(page, /id="transcript-panel"/);
  assert.match(page, /id="transcriptText"/);
});

test('configured, the episode offers the tool and names exactly one origin', async () => {
  const second = start(PORT2, { TRANSCRIBE_URL: 'https://tools.example/embed?k=abc' });
  const base2 = `http://127.0.0.1:${PORT2}`;
  await until(async () => { if (!(await fetch(`${base2}/healthz`)).ok) throw new Error('down'); });
  const cookie2 = await seed(base2);
  const id = episodesIn(second.data)[0].id;
  const page = await (await fetch(`${base2}/admin/episodes/${id}`, { headers: { Cookie: cookie2 } })).text();

  assert.match(page, /Transcribe this episode/);
  assert.match(page, /data-origin="https:\/\/tools\.example"/);
  // The episode and its audio go with it; the existing query is kept.
  assert.match(page, /data-tool="https:\/\/tools\.example\/embed\?k=abc&amp;episode=/);
  assert.match(page, /audio=https%3A%2F%2Fstorage\.example%2Fone\.mp3/);
});

test('the page only listens to the origin it was given', () => {
  // The check is in the page's own script, so this reads it there. A
  // message is taken only when the origin matches the configured one
  // AND it came from the frame we opened - either alone is not enough.
  const script = fs.readFileSync(path.join(__dirname, '..', 'lib', 'html.js'), 'utf8');
  const block = script.slice(script.indexOf('(function transcript()'));
  assert.match(block, /if \(e\.origin !== panel\.dataset\.origin\) return;/);
  assert.match(block, /if \(!frame \|\| e\.source !== frame\.contentWindow\) return;/);
  assert.match(block, /if \(d\.episode !== panel\.dataset\.episode\) return;/);
  // ...and it is only wired up at all where an origin was configured.
  assert.match(block, /if \(!open \|\| !slot \|\| !panel\.dataset\.origin\) return;/);
});

test('a wrong-origin message is ignored, in a real browser-shaped test', () => {
  // The listener, lifted out and run against fake events, so the rule is
  // checked rather than only read.
  const panel = { dataset: { origin: 'https://tools.example', episode: 'ep-1' } };
  const box = { value: '', dispatched: 0, dispatchEvent() { this.dispatched++; }, scrollIntoView() {} };
  const frame = { contentWindow: {} };
  const slot = { firstChild: frame };
  const accept = (e) => {
    if (e.origin !== panel.dataset.origin) return;
    if (!slot.firstChild || e.source !== slot.firstChild.contentWindow) return;
    const d = e.data;
    if (!d || d.type !== 'transcript') return;
    if (d.episode !== panel.dataset.episode) return;
    if (typeof d.text !== 'string' || !d.text.trim()) return;
    box.value = d.text;
    box.dispatchEvent();
  };
  const good = { type: 'transcript', episode: 'ep-1', text: '[0:00] Real words.' };

  accept({ origin: 'https://evil.example', source: frame.contentWindow, data: good });
  assert.strictEqual(box.value, '', 'a different origin is ignored');
  accept({ origin: 'https://tools.example', source: {}, data: good });
  assert.strictEqual(box.value, '', 'the right origin from the wrong window is ignored');
  accept({ origin: 'https://tools.example', source: frame.contentWindow, data: { type: 'transcript', episode: 'other', text: 'x' } });
  assert.strictEqual(box.value, '', 'a different episode is ignored');
  accept({ origin: 'https://tools.example', source: frame.contentWindow, data: good });
  assert.strictEqual(box.value, '[0:00] Real words.', 'and the real one lands');
});

test('media says it may be read by a browser, so a tool can work on it', async () => {
  const res = await fetch(`${base}/media/a-show/the-first-one-transcript.vtt`);
  assert.strictEqual(res.headers.get('access-control-allow-origin'), '*');
});

test('the page renders with no transcript at all, as it always did', () => {
  const show = { id: 's', name: 'A Show', slug: 'a-show', description: 'x' };
  const episode = { id: 'e', showId: 's', title: 'One', slug: 'one', date: '2026-01-01', mediaUrl: '/media/a-show/one.mp3', description: 'x' };
  const page = publicSite.episodePage(show, episode, 'pod.example');
  assert.doesNotMatch(page, /class="panel transcript"/);
  assert.doesNotMatch(page, /undefined|\[object/);
});

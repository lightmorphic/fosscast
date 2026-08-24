'use strict';
// The Internet Archive connector. The upload itself is tested against a
// throwaway local server that answers the way the Archive does, so the
// request the Archive would actually receive is the request under test -
// headers, body and all - without anybody's account being involved.

const test = require('node:test');
const assert = require('node:assert');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

const archiveorg = require('../lib/archiveorg');

function tempFile(contents) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fosscast-ia-'));
  const file = path.join(dir, 'episode.mp3');
  fs.writeFileSync(file, contents);
  return file;
}

// A stand-in Archive: records what it was sent, answers how the real one
// answers.
function fakeArchive(handler) {
  return new Promise((resolve) => {
    const seen = { headers: null, body: null, method: null, url: null };
    const server = http.createServer((req, res) => {
      seen.method = req.method;
      seen.url = req.url;
      seen.headers = req.headers;
      const chunks = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        seen.body = Buffer.concat(chunks);
        handler(req, res, seen);
      });
    });
    server.listen(0, '127.0.0.1', () => {
      resolve({
        endpoint: `http://127.0.0.1:${server.address().port}`,
        seen,
        close: () => new Promise((done) => server.close(done)),
      });
    });
  });
}

test('an identifier is derived from the show, the date and the episode', () => {
  assert.equal(
    archiveorg.identifierFor('FossNerds', 'The First One!', '2026-07-05'),
    'fossnerds-20260705-the-first-one',
  );
});

test('an identifier survives titles that are all punctuation', () => {
  const id = archiveorg.identifierFor('', '?!?', '');
  assert.match(id, /^[a-z0-9][a-z0-9-]*$/);
});

test('an identifier stays inside the length the Archive allows', () => {
  const id = archiveorg.identifierFor('show', 'a'.repeat(300), '2026-07-05');
  assert.ok(id.length <= 90, `identifier was ${id.length} characters`);
  assert.doesNotMatch(id, /-$/);
});

test('metadata becomes the headers the Archive expects', () => {
  const headers = archiveorg.metaHeaders({ title: 'Hello', subject: ['podcast', 'tech'] });
  assert.equal(headers['x-archive-meta-title'], 'Hello');
  assert.equal(headers['x-archive-meta01-subject'], 'podcast');
  assert.equal(headers['x-archive-meta02-subject'], 'tech');
});

test('a value a header cannot carry is encoded the way the Archive asks', () => {
  assert.equal(archiveorg.headerValue('Café'), 'uri(Caf%C3%A9)');
  assert.equal(archiveorg.headerValue('plain text'), 'plain text');
});

test('a newline cannot be smuggled into a header', () => {
  const headers = archiveorg.metaHeaders({ title: 'One\r\nx-archive-meta-collection: someone-elses' });
  assert.doesNotMatch(headers['x-archive-meta-title'], /[\r\n]/);
});

test("the Archive's refusal is repeated in words that mean something", () => {
  const xml = '<?xml version="1.0"?><Error><Code>InvalidAccessKeyId</Code>'
    + '<Message>The AWS Access Key Id you provided does not exist in our records.</Message></Error>';
  assert.match(archiveorg.errorFrom(403, xml), /does not recognise that access key/);
  assert.match(archiveorg.errorFrom(503, ''), /slower pace|few minutes/);
});

test('an identifier already taken at the Archive is not reused', async () => {
  const asked = [];
  const fetchImpl = async (url) => {
    asked.push(url);
    const taken = url.endsWith('/taken-one');
    return { ok: true, status: 200, json: async () => (taken ? { metadata: { identifier: 'taken-one' } } : {}) };
  };
  const free = await archiveorg.freeIdentifier('taken-one', { fetchImpl });
  assert.notEqual(free, 'taken-one');
  assert.match(free, /^taken-one-[a-z0-9]{4}$/);
  assert.ok(asked.length >= 2);
});

test('an unused identifier is left alone', async () => {
  const fetchImpl = async () => ({ ok: true, status: 200, json: async () => ({}) });
  assert.equal(await archiveorg.freeIdentifier('brand-new', { fetchImpl }), 'brand-new');
});

test('the upload sends the file, the authorization and the metadata', async () => {
  const archive = await fakeArchive((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/xml' });
    res.end('<Ok/>');
  });
  const file = tempFile('audio-bytes-pretend');
  const progress = [];
  try {
    const result = await archiveorg.put({
      accessKey: 'ACCESS', secretKey: 'SECRET',
      identifier: 'show-20260705-one', filename: 'show-20260705-one.mp3',
      file, endpoint: archive.endpoint,
      metadata: { mediatype: 'audio', collection: 'opensource_audio', title: 'One', contentType: 'audio/mpeg' },
      onProgress: (sent, total) => progress.push([sent, total]),
    });
    const { seen } = archive;
    assert.equal(seen.method, 'PUT');
    assert.equal(seen.url, '/show-20260705-one/show-20260705-one.mp3');
    assert.equal(seen.headers.authorization, 'LOW ACCESS:SECRET');
    assert.equal(seen.headers['x-archive-auto-make-bucket'], '1');
    assert.equal(seen.headers['x-archive-meta-mediatype'], 'audio');
    assert.equal(seen.headers['x-archive-meta-collection'], 'opensource_audio');
    assert.equal(seen.headers['x-archive-meta-title'], 'One');
    assert.equal(seen.headers['content-type'], 'audio/mpeg');
    // contentType is how we set the header, not something the Archive
    // should be told to store as metadata.
    assert.equal(seen.headers['x-archive-meta-contenttype'], undefined);
    assert.equal(seen.body.toString(), 'audio-bytes-pretend');
    assert.equal(Number(seen.headers['content-length']), seen.body.length);
    assert.equal(result.url, 'https://archive.org/download/show-20260705-one/show-20260705-one.mp3');
    assert.ok(progress.length > 0);
  } finally {
    await archive.close();
    fs.rmSync(path.dirname(file), { recursive: true, force: true });
  }
});

test('a refusal from the Archive reaches the podcaster as words, not a status code', async () => {
  const archive = await fakeArchive((req, res) => {
    res.writeHead(403, { 'Content-Type': 'text/xml' });
    res.end('<Error><Code>AccessDenied</Code><Message>You lack permission to write to this item.</Message></Error>');
  });
  const file = tempFile('x');
  try {
    await assert.rejects(
      archiveorg.put({
        accessKey: 'a', secretKey: 'b', identifier: 'i', filename: 'f.mp3',
        file, endpoint: archive.endpoint, metadata: {},
      }),
      /You lack permission to write to this item/,
    );
  } finally {
    await archive.close();
    fs.rmSync(path.dirname(file), { recursive: true, force: true });
  }
});

test('a missing file is refused before anything is sent', async () => {
  await assert.rejects(
    archiveorg.put({
      accessKey: 'a', secretKey: 'b', identifier: 'i', filename: 'f.mp3',
      file: '/nowhere/at/all.mp3', endpoint: 'http://127.0.0.1:1', metadata: {},
    }),
    /no longer on this server/,
  );
});

test('an episode carries the podcast\'s own details to the Archive', () => {
  const show = { title: 'FossNerds', author: 'Charlie', language: 'en', description: 'A show' };
  const episode = { title: 'Episode one', date: '2026-07-05', description: 'The first', guid: 'abc' };
  const meta = archiveorg.metadataFor(show, episode, { link: 'https://fossnerds.org/x/y' });
  assert.equal(meta.mediatype, 'audio');
  assert.equal(meta.collection, archiveorg.COLLECTION);
  assert.equal(meta.title, 'Episode one');
  assert.equal(meta.creator, 'Charlie');
  assert.equal(meta.date, '2026-07-05');
  assert.equal(meta.originalurl, 'https://fossnerds.org/x/y');
  assert.deepEqual(meta.subject, ['podcast', 'FossNerds']);
  // Nothing empty is sent: the Archive would store the emptiness.
  assert.ok(!Object.values(meta).some((v) => v === undefined || v === ''));
});

test('the file keeps an extension a browser will understand', () => {
  assert.equal(archiveorg.filenameFor('show-one', '/data/media/x/episode.mp3'), 'show-one.mp3');
  assert.equal(archiveorg.filenameFor('show-one', '/data/media/x/episode'), 'show-one.mp3');
  assert.equal(archiveorg.filenameFor('show-one', '/data/media/x/episode.M4A'), 'show-one.m4a');
});

test('a rate-limit check that fails does not stop an upload being tried', async () => {
  const fetchImpl = async () => { throw new Error('network down'); };
  assert.equal(await archiveorg.overLimit('key', 'item', { fetchImpl }), false);
});

test('a rate-limited account is reported as rate-limited', async () => {
  const fetchImpl = async () => ({ ok: true, json: async () => ({ over_limit: 1 }) });
  assert.equal(await archiveorg.overLimit('key', 'item', { fetchImpl }), true);
});

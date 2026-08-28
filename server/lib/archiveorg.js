'use strict';
// Uploading an episode to the Internet Archive.
//
// The Archive speaks an S3-shaped dialect: PUT the file at
// https://s3.us.archive.org/<identifier>/<filename>, say who you are in
// an "authorization: LOW key:secret" header, and describe the item with
// x-archive-meta-* headers. Nothing is signed, so no crypto and no SDK -
// an https request with the right headers is the whole protocol.
//
// The keys belong to the podcaster, not to us: they sign up at
// archive.org and generate a pair at archive.org/account/s3.php. We hold
// them the way we hold the studio key and never show them again.
//
// Why bother: an episode uploaded here gets a permanent home that
// outlives the podcaster's VPS, and its address goes into mediaUrl, at
// which point the /d/ redirect counts every download of it. The feed
// keeps pointing at this instance; only the audio moves.

const fs = require('fs');
const https = require('https');
const path = require('path');
const { URL } = require('url');

const ENDPOINT = 'https://s3.us.archive.org';
const METADATA = 'https://archive.org/metadata';
const DOWNLOAD = 'https://archive.org/download';

// Community Audio: the collection anyone with an account may upload to.
// A curated collection needs the Archive's say-so, and an upload naming
// one the account cannot write to is refused outright.
const COLLECTION = 'opensource_audio';

// No progress for ten minutes means the connection is dead rather than
// slow. A big episode over a domestic uplink is still fine: the clock
// only starts when nothing at all is moving.
const IDLE_MS = 10 * 60 * 1000;

// Identifiers are global to the Archive, permanent, and appear in the
// URL, so they are lowercase, dashed, and unmistakably this podcast's.
function identifierFor(showSlug, episodeSlug, date) {
  const clean = (s) => String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const parts = [clean(showSlug), clean(date).replace(/-/g, ''), clean(episodeSlug)].filter(Boolean);
  // Identifiers must start with a letter or digit and stay under 100
  // characters. The episode slug is the part worth keeping whole, so the
  // trim comes off the end and the result is tidied again.
  return parts.join('-').slice(0, 90).replace(/-+$/, '') || 'episode';
}

// The Archive refuses an upload to somebody else's item, and quite
// right too. Anything already there gets a short suffix rather than a
// failure the podcaster has to decipher.
async function freeIdentifier(wanted, { fetchImpl = fetch } = {}) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const candidate = attempt === 0 ? wanted : `${wanted}-${Math.random().toString(36).slice(2, 6)}`;
    if (!(await exists(candidate, { fetchImpl }))) return candidate;
  }
  throw new Error('could not find a free identifier at archive.org');
}

async function exists(identifier, { fetchImpl = fetch } = {}) {
  const res = await fetchImpl(`${METADATA}/${encodeURIComponent(identifier)}`, {
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`archive.org answered ${res.status} when asked about ${identifier}`);
  const body = await res.json();
  // An item that does not exist is an empty object, not a 404.
  return Boolean(body && body.metadata);
}

// Metadata values may be any UTF-8, but a header may not. The Archive
// takes uri(...) around a percent-encoded value; plain ASCII is left
// alone so the request stays readable in a log.
function headerValue(value) {
  const text = String(value).replace(/[\r\n]+/g, ' ').trim();
  return /^[\x20-\x7e]*$/.test(text) ? text : `uri(${encodeURIComponent(text)})`;
}

// { title: 'x', subject: ['a', 'b'] } becomes the x-archive-meta headers
// the Archive expects, repeated fields numbered as it asks.
function metaHeaders(metadata) {
  const headers = {};
  for (const [field, value] of Object.entries(metadata)) {
    const values = (Array.isArray(value) ? value : [value])
      .map((v) => (v == null ? '' : String(v).trim()))
      .filter(Boolean);
    if (values.length === 1) {
      headers[`x-archive-meta-${field}`] = headerValue(values[0]);
    } else {
      values.forEach((v, i) => {
        headers[`x-archive-meta${String(i + 1).padStart(2, '0')}-${field}`] = headerValue(v);
      });
    }
  }
  return headers;
}

// What the Archive says when it refuses, said plainly. Its errors are
// XML, and the message inside is usually the useful part.
function errorFrom(status, body) {
  const message = /<Message>([\s\S]*?)<\/Message>/.exec(body || '');
  const code = /<Code>([\s\S]*?)<\/Code>/.exec(body || '');
  if (message) {
    const text = message[1].trim();
    if (code && code[1] === 'InvalidAccessKeyId') {
      return 'archive.org does not recognise that access key. Check the pair at archive.org/account/s3.php.';
    }
    if (code && code[1] === 'SignatureDoesNotMatch') {
      return 'archive.org rejected the secret key. Check the pair at archive.org/account/s3.php.';
    }
    return `archive.org refused the upload: ${text}`;
  }
  if (status === 503) return 'archive.org is asking for a slower pace; try again in a few minutes.';
  return `archive.org answered ${status}`;
}

// Before starting a long upload, ask whether the account is already at
// its limit. Better a clear "not now" than a 503 halfway through.
async function overLimit(accessKey, identifier, { fetchImpl = fetch, endpoint = ENDPOINT } = {}) {
  try {
    const url = `${endpoint}/?check_limit=1&accesskey=${encodeURIComponent(accessKey)}&bucket=${encodeURIComponent(identifier)}`;
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(20000) });
    const body = await res.json();
    return Boolean(body && body.over_limit);
  } catch {
    // The check is a courtesy. If it fails, the upload itself is still
    // allowed to try and to report its own trouble.
    return false;
  }
}

// The upload. The file is streamed from disk, never held in memory, and
// the request carries a Content-Length because the Archive will not take
// a chunked body.
function put({ accessKey, secretKey, identifier, filename, file, metadata = {}, endpoint = ENDPOINT, onProgress }) {
  return new Promise((resolve, reject) => {
    let bytes;
    try {
      bytes = fs.statSync(file).size;
    } catch {
      reject(new Error('the media file is no longer on this server'));
      return;
    }
    const target = new URL(`${endpoint}/${encodeURIComponent(identifier)}/${encodeURIComponent(filename)}`);
    const transport = target.protocol === 'http:' ? require('http') : https;
    const req = transport.request({
      protocol: target.protocol,
      hostname: target.hostname,
      port: target.port || undefined,
      path: target.pathname,
      method: 'PUT',
      headers: {
        authorization: `LOW ${accessKey}:${secretKey}`,
        'content-length': bytes,
        'content-type': metadata.contentType || 'application/octet-stream',
        'x-archive-auto-make-bucket': '1',
        'x-archive-size-hint': String(bytes),
        ...metaHeaders({ ...metadata, contentType: undefined }),
      },
    });

    let sent = 0;
    req.setTimeout(IDLE_MS, () => {
      req.destroy(new Error('archive.org stopped responding partway through the upload'));
    });
    req.on('error', reject);
    req.on('response', (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { body += chunk.slice(0, 4000); });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve({
            identifier,
            filename,
            bytes,
            url: `${DOWNLOAD}/${encodeURIComponent(identifier)}/${encodeURIComponent(filename)}`,
            details: `https://archive.org/details/${encodeURIComponent(identifier)}`,
          });
        } else {
          reject(new Error(errorFrom(res.statusCode, body)));
        }
      });
    });

    const stream = fs.createReadStream(file);
    stream.on('error', (err) => { req.destroy(); reject(err); });
    if (onProgress) {
      stream.on('data', (chunk) => {
        sent += chunk.length;
        onProgress(sent, bytes);
      });
    }
    stream.pipe(req);
  });
}

// Everything the Archive should know about an episode, taken from what
// the podcaster already typed into FOSSCast. Nothing here is asked for
// twice.
function metadataFor(show, episode, { link } = {}) {
  const meta = {
    mediatype: 'audio',
    collection: COLLECTION,
    title: episode.title || show.title,
    creator: show.author || show.title,
    description: (episode.description || show.description || '').slice(0, 4000),
    date: episode.date || undefined,
    language: show.language || undefined,
    licenseurl: show.licenseUrl || undefined,
    subject: ['podcast', show.title].filter(Boolean),
    'external-identifier': episode.guid ? `urn:fosscast:${episode.guid}` : undefined,
    originalurl: link || undefined,
  };
  for (const key of Object.keys(meta)) if (meta[key] === undefined) delete meta[key];
  return meta;
}

// The name the file takes at the Archive: recognisable, and never a
// surprise to a browser that downloads it.
function filenameFor(identifier, localPath) {
  const ext = path.extname(localPath).toLowerCase().replace(/[^a-z0-9.]/g, '') || '.mp3';
  return `${identifier}${ext}`;
}


// ---- Reading the account, rather than writing to it ----

const SEARCH = 'https://archive.org/advancedsearch.php';

// Who the keys belong to. The Archive answers this without a signature -
// the key pair in the header is the whole question - and the reply
// carries the account's email, which is also how its uploads are found.
async function whoami({ accessKey, secretKey, fetchImpl = fetch, endpoint = ENDPOINT } = {}) {
  if (!accessKey || !secretKey) return { authorized: false, error: 'no keys saved yet' };
  try {
    const res = await fetchImpl(`${endpoint}/?check_auth=1`, {
      headers: { authorization: `LOW ${accessKey}:${secretKey}` },
      signal: AbortSignal.timeout(20000),
    });
    const body = await res.json();
    return {
      authorized: Boolean(body && body.authorized),
      email: (body && body.username) || '',
      screenname: (body && body.screenname) || '',
      error: (body && body.error) || '',
    };
  } catch (err) {
    return { authorized: false, error: err.message };
  }
}

// What this account has already put there. Public search, no keys - the
// items are public the moment they exist - asked by uploader, newest
// first, a page at a time.
async function itemsFor({ email, page = 1, rows = 50, fetchImpl = fetch } = {}) {
  if (!email) return { items: [], total: 0 };
  const params = new URLSearchParams({
    q: `uploader:"${email}"`, output: 'json', rows: String(Math.min(rows, 100)), page: String(Math.max(1, page)),
  });
  for (const field of ['identifier', 'title', 'publicdate', 'mediatype', 'item_size']) params.append('fl[]', field);
  params.append('sort[]', 'publicdate desc');
  const res = await fetchImpl(`${SEARCH}?${params}`, { signal: AbortSignal.timeout(25000) });
  if (!res.ok) throw new Error(`archive.org answered ${res.status} when asked what you have uploaded`);
  const body = await res.json();
  const found = (body && body.response) || {};
  return {
    total: Number(found.numFound || 0),
    items: (found.docs || []).map((d) => ({
      identifier: d.identifier,
      title: d.title || d.identifier,
      date: String(d.publicdate || '').slice(0, 10),
      mediatype: d.mediatype || '',
      size: Number(d.item_size || 0),
    })),
  };
}

// The playable files inside one item, with the address a feed would
// use. Derivatives (the Archive makes its own copies) are offered too:
// a podcaster who uploaded a wav has an mp3 waiting for them here.
const AUDIO = /\.(mp3|m4a|m4b|aac|ogg|oga|opus|flac|wav)$/i;
async function audioFilesOf(identifier, { fetchImpl = fetch } = {}) {
  const res = await fetchImpl(`${METADATA}/${encodeURIComponent(identifier)}`, {
    signal: AbortSignal.timeout(25000),
  });
  if (!res.ok) throw new Error(`archive.org answered ${res.status} about ${identifier}`);
  const body = await res.json();
  if (!body || !body.metadata) return { title: identifier, files: [] };
  return {
    title: (body.metadata.title || identifier),
    files: (body.files || [])
      .filter((f) => AUDIO.test(f.name || ''))
      .map((f) => ({
        name: f.name,
        format: f.format || '',
        seconds: Math.round(Number(f.length || 0)) || 0,
        bytes: Number(f.size || 0),
        url: `${DOWNLOAD}/${encodeURIComponent(identifier)}/${f.name.split('/').map(encodeURIComponent).join('/')}`,
      })),
  };
}

module.exports = {
  identifierFor, freeIdentifier, exists, metaHeaders, headerValue, errorFrom,
  overLimit, put, metadataFor, filenameFor, COLLECTION, ENDPOINT,
  whoami, itemsFor, audioFilesOf, SEARCH,
};

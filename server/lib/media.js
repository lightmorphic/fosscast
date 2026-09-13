'use strict';
// Uploaded media: streamed straight to disk, served back with byte-range
// support (podcast apps and players require ranges).

const fs = require('fs');
const path = require('path');

const MAX_UPLOAD = 4 * 1024 * 1024 * 1024; // 4 GB

const MEDIA_TYPES = {
  '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.aac': 'audio/aac',
  '.flac': 'audio/flac', '.ogg': 'audio/ogg', '.oga': 'audio/ogg',
  '.opus': 'audio/opus', '.wav': 'audio/wav',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.webp': 'image/webp',
  '.vtt': 'text/vtt; charset=utf-8', '.srt': 'application/x-subrip',
  '.txt': 'text/plain; charset=utf-8', '.json': 'application/json',
  '.html': 'text/html; charset=utf-8',
};

function safeName(name) {
  return String(name).replace(/[^a-zA-Z0-9._ -]/g, '').replace(/\s+/g, '-').slice(0, 120) || 'file';
}

function typeFor(file) {
  return MEDIA_TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream';
}

// Stream an upload (raw request body) to DATA_DIR/media/<slug>/<name>.
function saveUpload(req, mediaDir, slug, filename) {
  return new Promise((resolve, reject) => {
    const dir = path.join(mediaDir, safeName(slug));
    fs.mkdirSync(dir, { recursive: true });
    let name = safeName(filename);
    if (fs.existsSync(path.join(dir, name))) {
      const ext = path.extname(name);
      name = `${path.basename(name, ext)}-${Date.now().toString(36)}${ext}`;
    }
    const dest = path.join(dir, name);
    const out = fs.createWriteStream(dest);
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_UPLOAD) {
        out.destroy();
        fs.rm(dest, { force: true }, () => {});
        req.destroy();
        reject(new Error('too large'));
      }
    });
    req.pipe(out);
    out.on('finish', () => resolve({ name, size, urlPath: `/media/${safeName(slug)}/${name}` }));
    out.on('error', reject);
    req.on('error', reject);
  });
}

// Serve /media/* with Range support.
function serveMedia(req, res, mediaDir, urlPath) {
  let rel;
  try {
    rel = decodeURIComponent(urlPath.replace(/^\/media\//, ''));
  } catch {
    // A malformed escape is not a file we have.
    res.writeHead(404); return res.end('not found');
  }
  const file = path.resolve(path.join(mediaDir, rel));
  if (!file.startsWith(path.resolve(mediaDir) + path.sep)) { res.writeHead(404); return res.end(); }
  fs.stat(file, (err, stat) => {
    if (err || !stat.isFile()) { res.writeHead(404); return res.end('not found'); }
    const type = typeFor(file);
    const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
    if (range && (range[1] || range[2])) {
      let start = range[1] ? Number(range[1]) : stat.size - Number(range[2]);
      let end = range[1] && range[2] ? Number(range[2]) : stat.size - 1;
      start = Math.max(0, start);
      end = Math.min(end, stat.size - 1);
      if (start > end) {
        res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` });
        return res.end();
      }
      res.writeHead(206, {
        'Content-Type': type,
        'Content-Length': end - start + 1,
        'Content-Range': `bytes ${start}-${end}/${stat.size}`,
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'public, max-age=86400',
      });
      return fs.createReadStream(file, { start, end }).pipe(res);
    }
    res.writeHead(200, {
      'Content-Type': type,
      'Content-Length': stat.size,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'public, max-age=86400',
    });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).pipe(res);
  });
}

// ---------- how long an episode runs ----------
//
// An MP3 says how long it is in its own frames, so the answer is in the
// first few kilobytes of the file and no other program is needed to
// read it. A constant-rate file is its size divided by its bitrate; a
// variable-rate one carries a Xing or Info header naming the number of
// frames, which is exact. Anything that is not an MP3 returns null and
// the podcaster types the length in themselves.

const BITRATES_V1_L3 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0];
const BITRATES_V2_L3 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0];
const RATES = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] };

// ID3v2 sits in front of the audio and its length is four seven-bit
// bytes, so it has to be stepped over before any frame will be found.
function audioStart(buf) {
  if (buf.length > 10 && buf.toString('latin1', 0, 3) === 'ID3') {
    const size = ((buf[6] & 0x7f) << 21) | ((buf[7] & 0x7f) << 14) | ((buf[8] & 0x7f) << 7) | (buf[9] & 0x7f);
    return 10 + size;
  }
  return 0;
}

function frameHeader(buf, at) {
  if (at + 4 > buf.length) return null;
  if (buf[at] !== 0xff || (buf[at + 1] & 0xe0) !== 0xe0) return null;
  const version = (buf[at + 1] >> 3) & 3;      // 3 = MPEG1, 2 = MPEG2, 0 = MPEG2.5
  const layer = (buf[at + 1] >> 1) & 3;        // 1 = Layer III
  const bitrateIndex = (buf[at + 2] >> 4) & 15;
  const rateIndex = (buf[at + 2] >> 2) & 3;
  if (version === 1 || layer !== 1 || rateIndex === 3) return null;
  const bitrate = (version === 3 ? BITRATES_V1_L3 : BITRATES_V2_L3)[bitrateIndex] * 1000;
  const sampleRate = RATES[version][rateIndex];
  if (!bitrate || !sampleRate) return null;
  return {
    at,
    bitrate,
    sampleRate,
    channels: ((buf[at + 3] >> 6) & 3) === 3 ? 1 : 2,
    // MPEG1 Layer III carries 1152 samples a frame, MPEG2 and 2.5 half that.
    samplesPerFrame: version === 3 ? 1152 : 576,
  };
}

// Duration in whole seconds from the head of an MP3, given the file's
// full length. Null when the bytes are not an MP3 at all.
function mp3Duration(buf, totalBytes) {
  const begin = audioStart(buf);
  let header = null;
  // A frame may not start exactly where the tag ends: a few files pad.
  for (let at = begin; at < Math.min(buf.length - 4, begin + 8192); at++) {
    header = frameHeader(buf, at);
    if (header) break;
  }
  if (!header) return null;
  // The Xing or Info block lives after the frame's side information,
  // whose length depends on the version and whether it is mono.
  const sideInfo = header.samplesPerFrame === 1152
    ? (header.channels === 1 ? 17 : 32)
    : (header.channels === 1 ? 9 : 17);
  const tagAt = header.at + 4 + sideInfo;
  const tag = buf.length >= tagAt + 4 ? buf.toString('latin1', tagAt, tagAt + 4) : '';
  if (tag === 'Xing' || tag === 'Info') {
    const flags = buf.readUInt32BE(tagAt + 4);
    if (flags & 1) {
      const frames = buf.readUInt32BE(tagAt + 8);
      if (frames > 0) return Math.round((frames * header.samplesPerFrame) / header.sampleRate);
    }
  }
  // Otherwise the file is a constant rate, and its length is its size.
  const audioBytes = Math.max(0, totalBytes - header.at);
  return Math.round((audioBytes * 8) / header.bitrate);
}

const DURATION_HEAD = 128 * 1024;

// How long a file on this box runs.
function readDuration(file) {
  return new Promise((resolve) => {
    fs.stat(file, (err, stat) => {
      if (err || !stat.isFile()) return resolve(null);
      const head = Buffer.alloc(Math.min(DURATION_HEAD, stat.size));
      fs.open(file, 'r', (openErr, fd) => {
        if (openErr) return resolve(null);
        fs.read(fd, head, 0, head.length, 0, (readErr) => {
          fs.close(fd, () => {});
          if (readErr) return resolve(null);
          try { resolve(mp3Duration(head, stat.size)); } catch { resolve(null); }
        });
      });
    });
  });
}

// How long a file somebody else is hosting runs: the same few kilobytes,
// asked for by range, so nothing like the whole episode is downloaded.
async function fetchDuration(url) {
  try {
    const res = await fetch(url, {
      headers: { Range: `bytes=0-${DURATION_HEAD - 1}` },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    // A 206 says how big the whole file is; a 200 means the server
    // ignored the range and handed over the lot, which is its length.
    const range = /\/(\d+)$/.exec(res.headers.get('content-range') || '');
    const head = Buffer.from(await res.arrayBuffer());
    const total = range ? Number(range[1]) : head.length;
    return mp3Duration(head, total);
  } catch {
    return null;
  }
}

module.exports = {
  saveUpload, serveMedia, typeFor, safeName, MEDIA_TYPES,
  readDuration, fetchDuration, mp3Duration,
};

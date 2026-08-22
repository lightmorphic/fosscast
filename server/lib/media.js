'use strict';
// Uploaded media: streamed straight to disk, served back with byte-range
// support (podcast apps and players require ranges).

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

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
  const rel = decodeURIComponent(urlPath.replace(/^\/media\//, ''));
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

// Duration in whole seconds via ffprobe; null when unavailable.
function probeDuration(file) {
  return new Promise((resolve) => {
    const p = spawn('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]);
    let out = '';
    p.stdout.on('data', (d) => { out += d; });
    p.on('error', () => resolve(null));
    p.on('close', (code) => {
      const n = parseFloat(out);
      resolve(code === 0 && Number.isFinite(n) ? Math.round(n) : null);
    });
  });
}

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp']);

// The web copy of an uploaded image: a small, fast version for pages.
// Lives next to the original as "<name>.web.jpg". The original (which
// may be 3000x3000 for the directories) is kept for the RSS feed.
function webPathFor(urlPath) {
  return `${urlPath}.web.jpg`;
}

// Make the small web copy if it does not exist yet. Longest side capped
// so a huge upload becomes a light, quick-loading image. Returns the web
// url path when one is available, else null. Never throws. maxSide moves
// the cap down: a host photo is shown far smaller than cover art, so it
// is made smaller still.
function ensureWebImage(dataDir, urlPath, maxSide = 1024) {
  return new Promise((resolve) => {
    if (typeof urlPath !== 'string' || !urlPath.startsWith('/media/')) return resolve(null);
    const ext = path.extname(urlPath).toLowerCase();
    if (!IMAGE_EXTS.has(ext)) return resolve(null);
    const file = path.join(dataDir, decodeURIComponent(urlPath.slice(1)));
    const out = `${file}.web.jpg`;
    if (fs.existsSync(out)) return resolve(webPathFor(urlPath));
    if (!fs.existsSync(file)) return resolve(null);
    // Fit within the cap, only shrinking (never enlarging a small one).
    const cap = Math.max(64, Math.min(4096, Number(maxSide) || 1024));
    const p = spawn('ffmpeg', [
      '-y', '-i', file,
      '-vf', `scale='min(${cap},iw)':'min(${cap},ih)':force_original_aspect_ratio=decrease`,
      '-q:v', '4', out,
    ], { stdio: 'ignore' });
    p.on('error', () => resolve(null));
    p.on('close', (code) => resolve(code === 0 && fs.existsSync(out) ? webPathFor(urlPath) : null));
  });
}

// A banner video plays on every visit to the front page, so it has to
// be small: the limits below are what a listener on a phone can afford
// and what a small VPS can serve. Nothing here re-encodes anything -
// the file is measured and kept or refused, because transcoding a video
// on the box the site runs on is exactly the kind of work a small
// server cannot spare.
const BANNER_VIDEO = {
  width: 1920,      // hard maximum; 1280 x 320 is the recommendation
  height: 480,
  bytes: 8 * 1024 * 1024,
  seconds: 20,
  ratio: 4,         // 4:1, the same strip as the still banner
  ratioTolerance: 0.6,
};

// Read a video's dimensions and duration. ffprobe reads the header, so
// this costs nothing like the encode it saves us.
function probeVideo(file) {
  return new Promise((resolve) => {
    const p = spawn('ffprobe', [
      '-v', 'error',
      '-select_streams', 'v:0',
      '-show_entries', 'stream=width,height:format=duration',
      '-of', 'json', file,
    ]);
    let out = '';
    p.stdout.on('data', (d) => { out += d; });
    p.on('error', () => resolve(null));
    p.on('close', (code) => {
      if (code !== 0) return resolve(null);
      try {
        const data = JSON.parse(out);
        const stream = (data.streams || [])[0] || {};
        resolve({
          width: Number(stream.width) || 0,
          height: Number(stream.height) || 0,
          duration: Math.round(Number((data.format || {}).duration) || 0),
        });
      } catch { resolve(null); }
    });
  });
}

// What is wrong with this video, in a sentence the operator can act on.
// Returns null when nothing is.
function bannerVideoProblem(info) {
  if (!info || !info.width || !info.height) {
    return 'That file could not be read as a video. MP4 (H.264) or WebM, please.';
  }
  if (info.bytes > BANNER_VIDEO.bytes) {
    return `That is ${(info.bytes / 1048576).toFixed(1)} MB. The limit is ${BANNER_VIDEO.bytes / 1048576} MB: every visitor downloads this file.`;
  }
  if (info.width > BANNER_VIDEO.width || info.height > BANNER_VIDEO.height) {
    return `That is ${info.width} x ${info.height}. The maximum is ${BANNER_VIDEO.width} x ${BANNER_VIDEO.height}, and 1280 x 320 is plenty - it is a strip across the top of a page, not a cinema screen.`;
  }
  if (info.duration > BANNER_VIDEO.seconds) {
    return `That is ${info.duration} seconds. The limit is ${BANNER_VIDEO.seconds}: it loops, so a few seconds is all it needs.`;
  }
  const ratio = info.width / info.height;
  if (Math.abs(ratio - BANNER_VIDEO.ratio) > BANNER_VIDEO.ratioTolerance) {
    return `That is ${ratio.toFixed(1)}:1. The banner is a 4:1 strip, so anything much taller gets cropped to fit - crop it yourself and you decide what survives.`;
  }
  return null;
}

module.exports = {
  saveUpload, serveMedia, typeFor, safeName, probeDuration,
  ensureWebImage, webPathFor, MEDIA_TYPES,
  probeVideo, bannerVideoProblem, BANNER_VIDEO,
};

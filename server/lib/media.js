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

module.exports = { saveUpload, serveMedia, typeFor, safeName, probeDuration, MEDIA_TYPES };

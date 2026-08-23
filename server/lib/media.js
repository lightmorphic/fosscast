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
function webPathFor(urlPath, suffix = 'web') {
  return `${urlPath}.${suffix}.jpg`;
}

// Make the small web copy if it does not exist yet. Longest side capped
// so a huge upload becomes a light, quick-loading image. Returns the web
// url path when one is available, else null. Never throws. maxSide moves
// the cap down: a host photo is shown far smaller than cover art, so it
// is made smaller still.
function ensureWebImage(dataDir, urlPath, maxSide = 1024, suffix = 'web') {
  return new Promise((resolve) => {
    if (typeof urlPath !== 'string' || !urlPath.startsWith('/media/')) return resolve(null);
    const ext = path.extname(urlPath).toLowerCase();
    if (!IMAGE_EXTS.has(ext)) return resolve(null);
    const file = path.join(dataDir, decodeURIComponent(urlPath.slice(1)));
    const out = `${file}.${suffix}.jpg`;
    if (fs.existsSync(out)) return resolve(webPathFor(urlPath, suffix));
    if (!fs.existsSync(file)) return resolve(null);
    // Fit within the cap, only shrinking (never enlarging a small one).
    const cap = Math.max(64, Math.min(4096, Number(maxSide) || 1024));
    const p = spawn('ffmpeg', [
      '-y', '-i', file,
      '-vf', `scale='min(${cap},iw)':'min(${cap},ih)':force_original_aspect_ratio=decrease`,
      '-q:v', '4', out,
    ], { stdio: 'ignore' });
    p.on('error', () => resolve(null));
    p.on('close', (code) => resolve(code === 0 && fs.existsSync(out) ? webPathFor(urlPath, suffix) : null));
  });
}

// A banner video plays on every visit to the front page, so it has to
// be small: the limits below are what a listener on a phone can afford
// and what a small VPS can serve. Nothing here re-encodes anything -
// the file is measured and kept or refused, because transcoding a video
// on the box the site runs on is exactly the kind of work a small
// server cannot spare.
// Every visit downloads this file in full - it autoplays - so the
// ceilings are set by what a small server can afford to send a thousand
// times, not by what looks nicest. 1280 x 320 at about 1 Mbps is a
// sharp banner and a third of a megabyte; two megabytes is the point at
// which a decorative strip costs more than it is worth.
// A banner video is not cropped before it is uploaded - the operator
// chooses which part of it shows, in the dashboard, over the moving
// picture. So the shape does not matter here; what matters is that it
// is big enough to fill the strip (1280 x 320) and small enough to
// serve a thousand times without thinking about it.
const BANNER_VIDEO = {
  // The banner is drawn 976 x 244 and that is the whole requirement.
  // It is a decorative strip, not a photograph anyone will study, so
  // there is no case for carrying twice the pixels it can show.
  // Anything larger is accepted - the ceiling is further down - but
  // nothing about it will look better.
  minWidth: 976,
  minHeight: 244,
  maxWidth: 1920,       // past this it is pixels nobody will ever see
  maxHeight: 1080,
  bytes: 2 * 1024 * 1024,
  seconds: 15,
  bitrate: 1500000,     // bits per second, averaged over the clip
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

// The first frame of a video, as a JPEG beside it. Used as the poster,
// so the strip shows the frame the video is about to start on rather
// than the still banner: with the still there, a refresh flashed the
// photograph for a moment before the video took over. Extracting one
// frame is a decode of a few kilobytes, not a transcode.
function posterPathFor(urlPath) {
  return `${urlPath}.poster.jpg`;
}

function ensureVideoPoster(dataDir, urlPath) {
  return new Promise((resolve) => {
    if (typeof urlPath !== 'string' || !urlPath.startsWith('/media/')) return resolve(null);
    const file = path.join(dataDir, decodeURIComponent(urlPath.slice(1)));
    const out = `${file}.poster.jpg`;
    if (fs.existsSync(out)) return resolve(posterPathFor(urlPath));
    if (!fs.existsSync(file)) return resolve(null);
    const p = spawn('ffmpeg', ['-y', '-i', file, '-frames:v', '1', '-q:v', '4', out], { stdio: 'ignore' });
    p.on('error', () => resolve(null));
    p.on('close', (code) => resolve(code === 0 && fs.existsSync(out) ? posterPathFor(urlPath) : null));
  });
}

// What is wrong with this video, in a sentence the operator can act on.
// Returns null when nothing is.
function bannerVideoProblem(info) {
  if (!info || !info.width || !info.height) {
    return 'That file could not be read as a video. MP4 (H.264) or WebM, please.';
  }
  if (info.bytes > BANNER_VIDEO.bytes) {
    // Rounded up, and the limit printed without a pointless .0, so a
    // file barely over never reads as "2.0 MB, limit 2.0 MB".
    const mb = Math.ceil((info.bytes / 1048576) * 10) / 10;
    const cap = BANNER_VIDEO.bytes / 1048576;
    return `That is ${mb.toFixed(1)} MB. The limit is ${Number.isInteger(cap) ? cap : cap.toFixed(1)} MB, and under 1 MB is the aim: every visitor downloads this file, in full, every time.`;
  }
  if (info.width < BANNER_VIDEO.minWidth || info.height < BANNER_VIDEO.minHeight) {
    return `That is ${info.width} x ${info.height}. The banner is drawn ${BANNER_VIDEO.minWidth} x ${BANNER_VIDEO.minHeight}, so it needs at least that to fill without stretching. Scale it down until the smaller side just clears it, keeping the shape it came in: the crop is chosen here.`;
  }
  if (info.width > BANNER_VIDEO.maxWidth || info.height > BANNER_VIDEO.maxHeight) {
    return `That is ${info.width} x ${info.height}. Scale it down: past ${BANNER_VIDEO.maxWidth} x ${BANNER_VIDEO.maxHeight} it is pixels nobody sees, in a file everybody downloads.`;
  }
  if (info.duration > BANNER_VIDEO.seconds) {
    return `That is ${info.duration} seconds. The limit is ${BANNER_VIDEO.seconds} and five to eight is the aim: a banner loops, so a few seconds is all it needs.`;
  }
  // The rate is what actually costs money: a short clip at a silly
  // bitrate is as expensive to serve as a long one at a sensible rate.
  const rate = info.duration ? (info.bytes * 8) / info.duration : 0;
  if (rate > BANNER_VIDEO.bitrate) {
    return `That runs at about ${(rate / 1000000).toFixed(1)} Mbps. A banner looks fine at 1, and ${BANNER_VIDEO.bitrate / 1000000} is the limit. In HandBrake, raise the quality slider's RF number (30 is about right) and delete the audio track: it is played muted.`;
  }
  return null;
}

module.exports = {
  saveUpload, serveMedia, typeFor, safeName, probeDuration,
  ensureWebImage, webPathFor, MEDIA_TYPES,
  probeVideo, bannerVideoProblem, BANNER_VIDEO,
  ensureVideoPoster, posterPathFor,
};

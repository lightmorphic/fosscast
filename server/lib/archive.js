'use strict';
// Reading and writing a .tar.gz, in Node and nothing else.
//
// The export is an ordinary gzipped tar so it can be opened with the
// tools anybody already has - `tar tzf` to see what is in a backup,
// `tar xzf` to pull one file out of it - rather than a format only this
// program understands. A backup you cannot inspect is a backup you have
// to trust.
//
// It is written here rather than by spawning tar because the app starts
// no processes: what the image contains is Node and our own files, and
// that stays true. The format is 512-byte headers and 512-byte blocks,
// which is little enough code to be worth owning.

const zlib = require('zlib');

const BLOCK = 512;

function octal(value, width) {
  return value.toString(8).padStart(width - 1, '0') + '\0';
}

function header(name, size, type = '0') {
  const buf = Buffer.alloc(BLOCK);
  buf.write(name, 0, 100, 'utf8');
  buf.write(octal(0o644, 8), 100, 8);        // mode
  buf.write(octal(0, 8), 108, 8);            // uid
  buf.write(octal(0, 8), 116, 8);            // gid
  buf.write(octal(size, 12), 124, 12);
  buf.write(octal(Math.floor(Date.now() / 1000), 12), 136, 12);
  buf.write('        ', 148, 8);             // checksum, spaces while summing
  buf.write(type, 156, 1);
  buf.write('ustar\0', 257, 6);
  buf.write('00', 263, 2);
  let sum = 0;
  for (const byte of buf) sum += byte;
  buf.write(octal(sum, 8), 148, 8);
  return buf;
}

function pad(size) {
  const over = size % BLOCK;
  return over ? Buffer.alloc(BLOCK - over) : Buffer.alloc(0);
}

// A name over 100 bytes gets a GNU long-name record in front of it: one
// header whose body is the real name. Podcast artwork routinely has
// names longer than that, so this is the normal case rather than an
// edge one.
function entry(name, body) {
  const raw = Buffer.from(name, 'utf8');
  const parts = [];
  if (raw.length > 100) {
    const nameBlock = Buffer.concat([raw, Buffer.from('\0')]);
    parts.push(header('././@LongLink', nameBlock.length, 'L'), nameBlock, pad(nameBlock.length));
  }
  parts.push(header(raw.subarray(0, 100).toString('utf8'), body.length), body, pad(body.length));
  return Buffer.concat(parts);
}

// files: [{ name, body }]. Returns the gzipped archive.
function pack(files) {
  const parts = files.map((f) => entry(f.name, f.body));
  parts.push(Buffer.alloc(BLOCK * 2));       // the end of the archive
  return zlib.gzipSync(Buffer.concat(parts), { level: 6 });
}

function unpack(gz) {
  const buf = zlib.gunzipSync(gz);
  const files = [];
  let at = 0;
  let longName = null;
  while (at + BLOCK <= buf.length) {
    const head = buf.subarray(at, at + BLOCK);
    if (head[0] === 0) break;                // the two empty blocks
    const type = String.fromCharCode(head[156]) || '0';
    const size = parseInt(head.subarray(124, 136).toString('utf8').replace(/\0.*$/, '').trim() || '0', 8);
    const stored = head.subarray(0, 100).toString('utf8').replace(/\0.*$/, '');
    at += BLOCK;
    const body = buf.subarray(at, at + size);
    at += size + (size % BLOCK ? BLOCK - (size % BLOCK) : 0);
    if (type === 'L') { longName = body.toString('utf8').replace(/\0.*$/, ''); continue; }
    const name = longName || stored;
    longName = null;
    if (type === '0' || type === '\0') files.push({ name, body: Buffer.from(body) });
  }
  return files;
}

module.exports = { pack, unpack };

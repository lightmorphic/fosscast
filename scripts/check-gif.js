#!/usr/bin/env node
'use strict';
// What is actually inside a GIF: how many frames, whether it loops, and
// whether it has a transparent background. A "GIF" exported from a
// design tool is often one frame with an opaque tile, which looks
// broken in a footer and cannot be told apart by looking at a thumbnail.
//
//   node scripts/check-gif.js web/img/lightmorphic-mark.gif

const fs = require('fs');

const file = process.argv[2];
if (!file) { console.error('usage: node scripts/check-gif.js <file.gif>'); process.exit(2); }
const b = fs.readFileSync(file);
if (b.slice(0, 3).toString() !== 'GIF') { console.error(`${file} is not a GIF.`); process.exit(1); }

const width = b.readUInt16LE(6);
const height = b.readUInt16LE(8);
const packed = b[10];
const gctSize = packed & 0x80 ? 3 * (2 ** ((packed & 7) + 1)) : 0;

let i = 13 + gctSize;
let frames = 0;
let loops = null;
let transparent = false;
const delays = [];

while (i < b.length) {
  const marker = b[i];
  if (marker === 0x3b) break;                     // trailer
  if (marker === 0x21) {                          // extension
    const label = b[i + 1];
    let p = i + 2;
    const blocks = [];
    while (b[p] !== 0) { blocks.push(b.slice(p + 1, p + 1 + b[p])); p += b[p] + 1; }
    const data = Buffer.concat(blocks);
    if (label === 0xf9) {                         // graphic control
      if (data[0] & 1) transparent = true;
      delays.push(data.readUInt16LE(1) * 10);     // hundredths -> ms
    }
    if (label === 0xff && data.slice(0, 11).toString() === 'NETSCAPE2.0') {
      // 11 bytes of "NETSCAPE2.0", then a sub-block of [1, loop-lo, loop-hi].
      loops = data.length >= 14 ? data.readUInt16LE(12) : 0;
    }
    i = p + 1;
  } else if (marker === 0x2c) {                   // image descriptor
    frames += 1;
    const local = b[i + 9];
    let p = i + 10 + (local & 0x80 ? 3 * (2 ** ((local & 7) + 1)) : 0);
    p += 1;                                       // LZW minimum code size
    while (b[p] !== 0) p += b[p] + 1;
    i = p + 1;
  } else {
    break;
  }
}

const total = delays.reduce((a, d) => a + d, 0);
console.log(`${file}`);
console.log(`  ${width} x ${height}, ${(b.length / 1024).toFixed(1)} KB`);
console.log(`  frames:      ${frames}${frames > 1 ? '' : '  <- not animated'}`);
console.log(`  loops:       ${loops === null ? 'no looping block (plays once)' : loops === 0 ? 'forever' : loops}`);
console.log(`  runs for:    ${total ? (total / 1000).toFixed(2) + 's' : 'n/a'}`);
console.log(`  transparent: ${transparent ? 'yes' : 'no  <- the corners will show'}`);

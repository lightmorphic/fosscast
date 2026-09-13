'use strict';
// How long an episode runs, read out of the MP3 itself. The feed wants a
// length and the directories check for one, so this is the difference
// between a listable podcast and an unlistable one.

const test = require('node:test');
const assert = require('node:assert');
const { mp3Duration } = require('../lib/media');

// A single MPEG1 Layer III frame header at 128 kbps, 44.1 kHz, stereo.
function frameHeader() {
  return Buffer.from([0xff, 0xfb, 0x90, 0x00]);
}

test('a constant-rate file is its size divided by its rate', () => {
  const head = Buffer.concat([frameHeader(), Buffer.alloc(1024)]);
  // Sixty seconds at 128 kbps is 960,000 bytes.
  assert.strictEqual(mp3Duration(head, 960000), 60);
});

test('an ID3 tag in front of the audio is stepped over', () => {
  // "ID3", two version bytes, flags, then the length as four seven-bit
  // bytes: 200 bytes of tag.
  const tag = Buffer.alloc(210);
  tag.write('ID3', 0, 'latin1');
  tag[9] = 200;
  const head = Buffer.concat([tag, frameHeader(), Buffer.alloc(1024)]);
  // The tag is not audio, so it does not count towards the length.
  assert.strictEqual(mp3Duration(head, 210 + 960000), 60);
});

test('a variable-rate file is counted in frames, not in bytes', () => {
  // A Xing header sits after the frame's side information - 32 bytes for
  // MPEG1 stereo - and names the number of frames.
  const head = Buffer.alloc(4096);
  frameHeader().copy(head, 0);
  const at = 4 + 32;
  head.write('Xing', at, 'latin1');
  head.writeUInt32BE(1, at + 4);        // the frames field is present
  head.writeUInt32BE(3830, at + 8);     // 3830 frames of 1152 samples
  // 3830 * 1152 / 44100 is a hundred seconds, whatever the file weighs.
  assert.strictEqual(mp3Duration(head, 12345678), 100);
});

test('anything that is not an MP3 has no length to read', () => {
  assert.strictEqual(mp3Duration(Buffer.alloc(4096), 100000), null);
  assert.strictEqual(mp3Duration(Buffer.from('RIFF....WAVE'), 100000), null);
});

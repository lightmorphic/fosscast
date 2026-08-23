'use strict';
// A banner video is measured and kept or refused - never re-encoded.
// These are the rules that decide, which is the part worth pinning down:
// the probe itself is ffprobe's job.
const { test } = require('node:test');
const assert = require('node:assert');
const { bannerVideoProblem, BANNER_VIDEO } = require('../lib/media');

// The recommendation: 1280 x 320, six seconds, about 1 Mbps.
const ok = { width: 976, height: 244, duration: 6, bytes: 700 * 1024 };

test('a sensible banner is accepted', () => {
  assert.strictEqual(bannerVideoProblem(ok), null);
  assert.strictEqual(bannerVideoProblem({ ...ok, duration: 10, bytes: 1.2 * 1024 * 1024 }), null, 'the maximum length is fine');
  // The ceilings sit near the recommendation, not far above it.
  assert.ok(BANNER_VIDEO.bytes <= 1.5 * 1024 * 1024);
  assert.ok(BANNER_VIDEO.seconds <= 10 && BANNER_VIDEO.bitrate <= 1500000);
});

test('any shape is welcome, so long as it covers the strip', () => {
  // The crop is chosen in the dashboard, so a video does not have to
  // arrive as a 4:1 strip - it only has to be big enough to fill one.
  assert.strictEqual(bannerVideoProblem({ width: 976, height: 549, duration: 6, bytes: 900 * 1024 }), null, '16:9 at the drawn size');
  assert.strictEqual(bannerVideoProblem({ width: 1280, height: 720, duration: 6, bytes: 900 * 1024 }), null, '16:9 larger');
  assert.strictEqual(bannerVideoProblem({ width: 1280, height: 960, duration: 6, bytes: 900 * 1024 }), null, '4:3');
  assert.strictEqual(bannerVideoProblem({ width: 1280, height: 1080, duration: 6, bytes: 900 * 1024 }), null, 'nearly square');
  assert.strictEqual(bannerVideoProblem({ width: 1920, height: 480, duration: 6, bytes: 900 * 1024 }), null, 'a wide strip');
});

test('too small to fill the strip is refused, and says by how much', () => {
  const problem = bannerVideoProblem({ width: 960, height: 540, duration: 6, bytes: 400 * 1024 });
  assert.match(problem, /960 x 540/);
  assert.match(problem, /976 x 244/, 'the size it has to clear, which is the size it is drawn at');
  assert.match(problem, /keeping the shape/i, 'and that the shape is not the problem');
});

test('a fat bitrate is refused even when the file is small enough', () => {
  // Two seconds at 6 Mbps: only 1.5 MB, but it costs the same to send
  // as ten seconds of something sensible.
  const problem = bannerVideoProblem({ width: 1280, height: 320, duration: 2, bytes: 1.5 * 1024 * 1024 });
  assert.match(problem, /Mbps/);
  assert.match(problem, /HandBrake/, 'and says how to fix it');
});

test('too many pixels is refused, and says so in pixels', () => {
  const problem = bannerVideoProblem({ ...ok, width: 3840, height: 2160 });
  assert.match(problem, /3840 x 2160/, 'what they gave');
  assert.match(problem, /1920 x 1080/, 'and the ceiling it passed');
});

test('too many megabytes is refused, and says whose bandwidth it costs', () => {
  const problem = bannerVideoProblem({ ...ok, duration: 10, bytes: 20 * 1024 * 1024 });
  assert.match(problem, /20\.0 MB/);
  assert.match(problem, /every visitor/);
});

test('too long is refused, since it loops anyway', () => {
  // Small and slow, so only the length is wrong.
  assert.match(bannerVideoProblem({ ...ok, duration: 45, bytes: 1.2 * 1024 * 1024 }), /45 seconds/);
});



test('something that is not a video at all is refused kindly', () => {
  assert.match(bannerVideoProblem(null), /MP4/);
  assert.match(bannerVideoProblem({ width: 0, height: 0, duration: 0, bytes: 10 }), /MP4/);
});

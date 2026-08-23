'use strict';
// A banner video is measured and kept or refused - never re-encoded.
// These are the rules that decide, which is the part worth pinning down:
// the probe itself is ffprobe's job.
const { test } = require('node:test');
const assert = require('node:assert');
const { bannerVideoProblem, BANNER_VIDEO } = require('../lib/media');

// The recommendation: 1280 x 320, six seconds, about 1 Mbps.
const ok = { width: 1280, height: 320, duration: 6, bytes: 700 * 1024 };

test('a sensible banner is accepted', () => {
  assert.strictEqual(bannerVideoProblem(ok), null);
  assert.strictEqual(bannerVideoProblem({ ...ok, width: 1440, height: 360 }), null, 'the maximum size itself is fine');
  assert.strictEqual(bannerVideoProblem({ ...ok, duration: 10, bytes: 1.2 * 1024 * 1024 }), null, 'and the maximum length');
  // The ceilings sit near the recommendation, not far above it.
  assert.ok(BANNER_VIDEO.bytes <= 1.5 * 1024 * 1024);
  assert.ok(BANNER_VIDEO.width <= 1440 && BANNER_VIDEO.seconds <= 10 && BANNER_VIDEO.bitrate <= 1500000);
  assert.match(bannerVideoProblem({ ...ok, width: 1920, height: 480 }), /1280 x 320/, 'the old 1920 x 480 is now too big');
});

test('a fat bitrate is refused even when the file is small enough', () => {
  // Two seconds at 6 Mbps: only 1.5 MB, but it costs the same to send
  // as ten seconds of something sensible.
  const problem = bannerVideoProblem({ width: 1280, height: 320, duration: 2, bytes: 1.5 * 1024 * 1024 });
  assert.match(problem, /Mbps/);
  assert.match(problem, /HandBrake/, 'and says how to fix it');
});

test('too many pixels is refused, and says so in pixels', () => {
  const problem = bannerVideoProblem({ ...ok, width: 3840, height: 960 });
  assert.match(problem, /3840 x 960/, 'what they gave');
  assert.match(problem, /1280 x 320/, 'and what to make it');
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

test('the wrong shape is refused rather than cropped silently', () => {
  const problem = bannerVideoProblem({ width: 1280, height: 720, duration: 8, bytes: 1e6 });
  assert.ok(problem, 'a 16:9 video is not a 4:1 banner');
});

test('something that is not a video at all is refused kindly', () => {
  assert.match(bannerVideoProblem(null), /MP4/);
  assert.match(bannerVideoProblem({ width: 0, height: 0, duration: 0, bytes: 10 }), /MP4/);
});

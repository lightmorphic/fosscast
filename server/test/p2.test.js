'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { feed, chaptersJson } = require('../lib/public');
const { slugify } = require('../lib/admin');

const show = {
  id: 'show-guid', slug: 'my-show', name: 'My Show', description: 'D',
  author: 'Jo', language: 'en', category: 'Technology', explicit: false,
  artwork: '/media/my-show/art.jpg', locked: true, lockedOwner: 'jo@x.y',
  funding: { url: 'https://pay.example/jo', label: 'Support' },
  persons: [{ name: 'Jo Host', role: 'host' }],
};
const episodes = [{
  id: 'ep-1', showId: 'x', title: 'Ep 1', date: '2020-01-01', draft: false,
  mediaUrl: '/media/my-show/ep1.mp3', bytes: 999, duration: 61,
  episode: 1, season: 2, type: 'full',
  transcript: '/media/my-show/ep1.vtt',
  chapters: [{ start: 0, title: 'Intro' }, { start: 330, title: 'Topic' }],
}];

test('feed carries the Podcasting 2.0 and iTunes tags', () => {
  const xml = feed(show, episodes, 'pod.example');
  for (const expected of [
    '<podcast:guid>show-guid</podcast:guid>',
    '<itunes:author>Jo</itunes:author>',
    '<itunes:image href="https://pod.example/media/my-show/art.jpg"/>',
    '<itunes:category text="Technology"/>',
    '<podcast:locked owner="jo@x.y">yes</podcast:locked>',
    '<podcast:funding url="https://pay.example/jo">Support</podcast:funding>',
    '<podcast:person role="host">Jo Host</podcast:person>',
    'url="https://pod.example/media/my-show/ep1.mp3" length="999" type="audio/mpeg"',
    '<itunes:episode>1</itunes:episode>',
    '<itunes:season>2</itunes:season>',
    '<itunes:duration>61</itunes:duration>',
    '<podcast:transcript url="https://pod.example/media/my-show/ep1.vtt" type="text/vtt"/>',
    '<podcast:chapters url="https://pod.example/api/v1/episodes/ep-1/chapters.json" type="application/json+chapters"/>',
  ]) assert.ok(xml.includes(expected), `missing: ${expected}`);
  assert.ok(!xml.includes('liveItem'));
});

test('feed announces liveItem while streaming', () => {
  const xml = feed(show, episodes, 'pod.example', { live: true, since: '2026-01-01T10:00:00Z' });
  assert.ok(xml.includes('<podcast:liveItem status="live" start="2026-01-01T10:00:00Z">'));
  assert.ok(xml.includes('https://pod.example/hls/my-show/index.m3u8'));
  assert.ok(xml.includes('<podcast:contentLink href="https://pod.example/live/my-show">'));
});

test('chapters json follows the namespace format', () => {
  assert.deepStrictEqual(chaptersJson(episodes[0]), {
    version: '1.2.0',
    chapters: [{ startTime: 0, title: 'Intro' }, { startTime: 330, title: 'Topic' }],
  });
});

test('slugify stays safe', () => {
  assert.strictEqual(slugify('  My Great Show!  '), 'my-great-show');
});

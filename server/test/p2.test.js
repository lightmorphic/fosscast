'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { feed, chaptersJson } = require('../lib/public');
const { slugify } = require('../lib/admin');

const show = {
  id: 'show-guid', slug: 'my-show', name: 'My Show', description: 'D',
  author: 'Jo', language: 'en', category: 'Technology', explicit: false,
  ownerName: 'Jo Host', ownerEmail: 'jo@x.y',
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
    '<itunes:owner>',
    '<itunes:email>jo@x.y</itunes:email>',
    '<itunes:name>Jo Host</itunes:name>',
    '<managingEditor>jo@x.y (Jo Host)</managingEditor>',
    '<itunes:type>episodic</itunes:type>',
    '<generator>FOSSCast</generator>',
    '<podcast:funding url="https://pay.example/jo">Support</podcast:funding>',
    '<podcast:person role="host">Jo Host</podcast:person>',
    'url="https://pod.example/media/my-show/ep1.mp3" length="999" type="audio/mpeg"',
    '<itunes:episode>1</itunes:episode>',
    '<itunes:season>2</itunes:season>',
    '<itunes:duration>61</itunes:duration>',
    '<podcast:transcript url="https://pod.example/media/my-show/ep1.vtt" type="text/vtt"/>',
    '<podcast:chapters url="https://pod.example/api/v1/episodes/ep-1/chapters.json" type="application/json+chapters"/>',
  ]) assert.ok(xml.includes(expected), `missing: ${expected}`);
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

test('every episode carries artwork, its own or the show\'s', () => {
  const { artFor } = require('../lib/public');
  const own = { artwork: '/media/my-show/ep1.jpg' };
  assert.strictEqual(artFor(own, show), '/media/my-show/ep1.jpg');
  assert.strictEqual(artFor({}, show), '/media/my-show/art.jpg');
  assert.strictEqual(artFor({}, { }), '');

  const xml = feed(show, [{ ...episodes[0], artwork: '/media/my-show/ep1.jpg' }], 'pod.example');
  assert.ok(xml.includes('<itunes:image href="https://pod.example/media/my-show/ep1.jpg"/>'));
  const inherited = feed(show, episodes, 'pod.example');
  assert.ok(inherited.includes('<itunes:image href="https://pod.example/media/my-show/art.jpg"/>'));
});

test('episodes have their own page, and the feed links to it', () => {
  const { episodeSlug, episodeUrl, episodePage } = require('../lib/public');
  assert.strictEqual(episodeSlug({ title: 'Ep 1: The Start!' }), 'ep-1-the-start');
  assert.strictEqual(episodeSlug({ slug: 'chosen', title: 'x' }), 'chosen');
  assert.strictEqual(episodeSlug({ id: 'abc' }), 'abc');
  assert.strictEqual(episodeUrl(show, episodes[0], 'pod.example'), 'https://pod.example/shows/my-show/ep-1');

  const xml = feed(show, episodes, 'pod.example');
  assert.ok(xml.includes('<link>https://pod.example/shows/my-show/ep-1</link>'));

  const page = episodePage(show, episodes[0], 'pod.example');
  assert.ok(page.includes('Ep 1'));
  assert.ok(page.includes('<audio'));
  assert.ok(page.includes('Intro'), 'chapters are listed');
  assert.ok(page.includes('og:image'), 'share card carries the artwork');
});

test('subscribe buttons appear only for platforms the show is on', () => {
  const { subscribeRow } = require('../lib/public');
  const bare = subscribeRow({ slug: 'my-show' }, 'pod.example');
  assert.ok(bare.includes('RSS'), 'RSS is always offered');
  assert.ok(bare.includes('data-copy-feed="https://pod.example/shows/my-show/feed.xml"'));
  assert.ok(!bare.includes('Spotify'), 'no button before there is a listing');

  const listed = subscribeRow({
    slug: 'my-show',
    links: { spotify: 'https://open.spotify.com/show/abc', apple: 'https://podcasts.apple.com/x' },
  }, 'pod.example');
  assert.ok(listed.includes('Spotify'));
  assert.ok(listed.includes('Apple Podcasts'));
  assert.ok(listed.includes('rel="noopener noreferrer"'));
  assert.ok(!listed.includes('YouTube'), 'only what is configured');
});

test('a feed with no owner email omits the tag rather than faking one', () => {
  const { ownerName, ownerEmail, ...noOwner } = show;
  const xml = feed(noOwner, episodes, 'pod.example');
  assert.ok(!xml.includes('<itunes:owner>'));
  assert.ok(!xml.includes('<managingEditor>'));
  assert.ok(xml.includes('<podcast:locked>yes</podcast:locked>'));
  assert.ok(!/\n\s*\n/.test(xml), 'no blank lines left by empty tags');
});

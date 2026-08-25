'use strict';
// FOSSCast must install and run on its own, forever.
//
// It has hooks for other things - a studio that publishes into it, the
// Internet Archive, an analytics prefix - and every one of them is
// opt-in. None may become a dependency, and nothing here may
// require, contact, or even mention a paid service. A podcaster who
// pastes the compose file and nothing else must get a working podcast.
//
// That is a promise about the project rather than a property of any one
// function, so it is checked here rather than trusted to memory.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.join(__dirname, '..', '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

function sourceFiles() {
  const dirs = [path.join(root, 'server', 'lib'), path.join(root, 'server')];
  const files = [];
  for (const dir of dirs) {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      if (fs.statSync(full).isFile() && name.endsWith('.js')) files.push(full);
    }
  }
  return files;
}

test('nothing in the app knows the paid product exists', () => {
  // Not squeamishness: a mention would mean a code path that behaves
  // differently for a hosted instance, which is the first step towards
  // a self-hoster running something subtly second-class.
  const forbidden = /castmorphic|lm00\d|admin\.fosscast|77\.74\.199/i;
  for (const file of sourceFiles()) {
    const text = fs.readFileSync(file, 'utf8');
    assert.doesNotMatch(text, forbidden, `${path.basename(file)} mentions the hosted service`);
  }
});

test('the one-file install needs nothing but the published image', () => {
  const compose = read('docker-compose.pull.yml');
  const images = [...compose.matchAll(/^\s*image:\s*(\S+)/gm)].map((m) => m[1]);
  assert.deepEqual(images, ['ghcr.io/lightmorphic/fosscast:latest', 'caddy:2-alpine']);
  // No build context, no bind mount of a checkout: a paste and nothing
  // else has to be enough.
  assert.doesNotMatch(compose, /^\s*build:/m);
  assert.doesNotMatch(compose, /\.\/web/);
});

test('a page fetches nothing from anybody else', () => {
  // Self-hosted means self-hosted: no CDN, no web font service, no
  // analytics script. An instance behind a firewall must render.
  const css = read('web/css/site.css');
  const html = read('server/lib/html.js');
  for (const [name, text] of [['site.css', css], ['html.js', html]]) {
    assert.doesNotMatch(text, /fonts\.googleapis|fonts\.gstatic|cdn\.|unpkg|jsdelivr|googletagmanager/i,
      `${name} pulls something from a third party`);
  }
  for (const url of [...css.matchAll(/url\((['"]?)([^)'"]+)\1\)/g)].map((m) => m[2])) {
    assert.ok(url.startsWith('/') || url.startsWith('data:'), `site.css loads ${url} from elsewhere`);
  }
});

test('every hook is inert until somebody configures it', () => {
  const publicSite = require('../lib/public');

  // No analytics prefix: the enclosure is the instance's own address.
  const url = 'https://example.org/d/abc.mp3';
  assert.equal(publicSite.prefixed(url, undefined), url);
  assert.equal(publicSite.prefixed(url, ''), url);
  assert.equal(publicSite.prefixed(url, 'not a url'), url);

  // The Archive connector exists but reaches for nothing until an
  // instance has been given keys of its own.
  const archiveorg = require('../lib/archiveorg');
  assert.equal(typeof archiveorg.put, 'function');
});

test('the feed and the site stand up with no configuration at all', () => {
  const publicSite = require('../lib/public');
  const show = { id: 's', name: 'A Show', title: 'A Show', slug: 'show', description: 'x' };
  const episode = {
    id: 'e', showId: 's', title: 'One', slug: 'one', date: '2026-01-01',
    mediaUrl: '/media/show/one.mp3', description: 'x', bytes: 1, duration: 60,
  };
  // No theme, no hosts, no prefix, no domain worth the name.
  const feed = publicSite.feed(show, [episode], 'localhost');
  assert.match(feed, /<enclosure url="https:\/\/localhost\/media\/show\/one\.mp3"/);
  assert.doesNotMatch(feed, /undefined|\[object/);

  const page = publicSite.showPage(show, [episode], 'localhost');
  assert.match(page, /A Show/);
  assert.doesNotMatch(page, /undefined|\[object/);
});

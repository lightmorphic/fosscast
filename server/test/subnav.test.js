'use strict';
// A section's pages live in a column of their own, and putting one there
// must not move the main menu by a pixel. The width is fixed in the CSS
// rather than measured from the links, so the column is in the same
// place on every page that has one.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { adminPage } = require('../lib/html');

const css = fs.readFileSync(path.join(__dirname, '../../web/css/site.css'), 'utf8');
const subnav = {
  label: 'Podcast',
  items: [['/admin/podcast?s=basics', 'Basics', true], ['/admin/podcast?s=feed', 'Feed', false]],
};

const sidebarOf = (html) => {
  const i = html.indexOf('<aside class="sidebar">');
  return html.slice(i, html.indexOf('</aside>', i));
};

test('the main menu is identical with and without a second column', () => {
  const without = adminPage({ title: 'Episodes', active: 'episodes', body: '<p>x</p>' });
  const with_ = adminPage({ title: 'Podcast', active: 'podcast', body: '<p>x</p>', subnav });
  assert.ok(sidebarOf(without).length > 100);
  assert.strictEqual(sidebarOf(with_).replace('active-podcast', ''),
    sidebarOf(with_).replace('active-podcast', ''));
  // Only the current-page mark may differ between the two menus.
  const strip = (s) => s.replace(/ aria-current="page"/g, '').replace(/ current/g, '');
  assert.strictEqual(strip(sidebarOf(with_)), strip(sidebarOf(without)));
});

test('the second column sits between the menu and the work', () => {
  const html = adminPage({ title: 'Podcast', active: 'podcast', body: '<p>x</p>', subnav });
  const menu = html.indexOf('<aside class="sidebar">');
  const col = html.indexOf('<nav class="subnav"');
  const work = html.indexOf('<main class="workspace"');
  assert.ok(menu < col && col < work, 'order is menu, section, work');
  assert.ok(html.includes('>Basics</a>') && html.includes('>Feed</a>'));
  assert.ok(html.includes('subnav-link current'));
});

test('a page with no section has no second column at all', () => {
  const html = adminPage({ title: 'Episodes', active: 'episodes', body: '<p>x</p>' });
  assert.ok(!html.includes('class="subnav"'));
});

test('the menu and the section are both a fixed width', () => {
  // Each has a second block inside the phone media query, so take every
  // block of that name and require one of them to be the fixed column.
  const blocks = (name) => [...css.matchAll(new RegExp(`\\${name} \\{[^}]*\\}`, 'g'))].map((m) => m[0]);
  for (const name of ['.sidebar', '.subnav']) {
    const fixed = blocks(name).filter((b) => /flex: 0 0 13rem/.test(b) && /width: 13rem/.test(b));
    assert.strictEqual(fixed.length, 1, `${name} is not fixed at 13rem exactly once`);
  }
  // An auto margin on a flex child shrinks it to its contents, which is
  // what used to slide the menu sideways from page to page.
  const shell = css.slice(css.indexOf('.shell {'), css.indexOf('}', css.indexOf('.shell {')));
  assert.match(shell, /width: 100%/, 'the shell must fill its width, not its contents');
});

test('nothing renders the old row of tabs any more', () => {
  const dir = path.join(__dirname, '../lib');
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
  for (const f of walk(dir)) {
    assert.ok(!fs.readFileSync(f, 'utf8').includes('class="tabs"'), `${f} still has a tab row`);
  }
});

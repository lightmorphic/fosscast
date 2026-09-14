#!/usr/bin/env node
'use strict';
// Draw the copies of docker-compose.pull.yml that live elsewhere - the
// block on the website, and the fenced block in the README - from the
// file itself.
//
// The block on fosscast.org was marked up by hand, span by span, with
// nothing checking it still matched the file people download. That is a
// page claiming to be a file, and a claim nobody verifies goes stale:
// the file changes, the page does not, and everybody who pastes from the
// site gets last month's stack. Now the page is made from the file.
//
// Run it after any change to docker-compose.pull.yml. The test fails if
// you forget.
//
//   node scripts/render-compose.js           write the page
//   node scripts/render-compose.js --check   say whether it is behind

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const COMPOSE = path.join(ROOT, 'docker-compose.pull.yml');
const PAGE = path.join(ROOT, 'docs', 'index.html');
const README = path.join(ROOT, 'README.md');
const FENCE_OPEN = '```yaml\n# FOSSCast, the whole thing, from a single file.';
const OPEN = '<pre id="compose"><code>';
const CLOSE = '</code></pre>';

// The block on the page starts at the first line of YAML. The header
// comment in the file is instructions for a person reading the file, and
// the page says all of that in its own words above the block.
const FIRST_LINE = /^services:/;

// The commented-out proxy at the foot of the file is drawn faintly, so
// somebody can see at a glance what is off. Everything from this line
// down that is a comment is part of it.
const PROXY_STARTS = /^\s*# HTTPS, and the certificate/;

// The one thing in the file a person has to change. Marked so the page
// can point at it.
const EDIT = /podcast\.example\.com/;

function escape(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

function span(cls, text) { return `<span class="${cls}">${escape(text)}</span>`; }

// One line of YAML: the anchor and alias in their own color, a trailing
// comment in another, and the rest as it is.
function body(line) {
  if (!line.trim()) return '';
  if (line.trimStart().startsWith('#')) return escape(line);

  const parts = [];
  const comment = line.match(/(\s+#.*)$/);
  const code = comment ? line.slice(0, comment.index) : line;

  // &log and *log: the one bit of YAML nobody reads at a glance.
  let rest = code;
  const anchor = rest.match(/([&*][A-Za-z0-9_-]+)/);
  if (anchor) {
    parts.push(escape(rest.slice(0, anchor.index)));
    parts.push(span('a', anchor[1]));
    rest = rest.slice(anchor.index + anchor[1].length);
  }
  parts.push(escape(rest));
  if (comment) parts.push(span('c', comment[1]));
  return parts.join('');
}

function render(text) {
  const lines = text.replace(/\n+$/, '').split('\n');
  const from = lines.findIndex((line) => FIRST_LINE.test(line));
  if (from < 0) throw new Error('docker-compose.pull.yml has no services: line');

  let offFrom = Infinity;
  lines.forEach((line, i) => { if (offFrom === Infinity && PROXY_STARTS.test(line)) offFrom = i; });

  return lines.slice(from).map((line, i) => {
    const at = from + i;
    const off = at >= offFrom && line.trimStart().startsWith('#');
    const edit = EDIT.test(line);
    const classes = `l${off ? ' off' : ''}${edit ? ' edit' : ''}`;
    return `<span class="${classes}">${body(line)}</span>`;
  }).join('');
}

// The README quotes the file whole, fence and all. Same problem, and
// the same answer: it is written from the file rather than kept in step
// by hand.
function withinFence(readme, compose) {
  const start = readme.indexOf(FENCE_OPEN);
  if (start < 0) throw new Error('README.md has no compose block');
  const end = readme.indexOf('\n```', start + FENCE_OPEN.length);
  return `${readme.slice(0, start)}\`\`\`yaml\n${compose.replace(/\n+$/, '')}${readme.slice(end)}`;
}

function main() {
  const compose = fs.readFileSync(COMPOSE, 'utf8');
  const drawn = render(compose);

  const page = fs.readFileSync(PAGE, 'utf8');
  const start = page.indexOf(OPEN);
  if (start < 0) throw new Error(`docs/index.html has no ${OPEN} block`);
  const end = page.indexOf(CLOSE, start);
  const freshPage = page.slice(0, start + OPEN.length) + drawn + page.slice(end);

  const readme = fs.readFileSync(README, 'utf8');
  const freshReadme = withinFence(readme, compose);

  if (process.argv.includes('--check')) {
    const behind = [];
    if (freshPage !== page) behind.push('docs/index.html');
    if (freshReadme !== readme) behind.push('README.md');
    if (!behind.length) return 0;
    console.error(`${behind.join(' and ')} behind docker-compose.pull.yml: run node scripts/render-compose.js`);
    return 1;
  }
  fs.writeFileSync(PAGE, freshPage);
  fs.writeFileSync(README, freshReadme);
  console.log(`drew ${drawn.split('<span class="l').length - 1} lines into docs/index.html and README.md`);
  return 0;
}

process.exit(main());

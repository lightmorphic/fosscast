'use strict';
// The compose block on the website is a picture of a file, and a
// picture goes stale. Nobody was checking that it still matched
// docker-compose.pull.yml, and everybody installing FOSSCast pastes
// from one or the other. This holds the two together.
const { test } = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');

test("the website's compose block is the compose file", () => {
  const run = spawnSync(process.execPath,
    [path.join(ROOT, 'scripts', 'render-compose.js'), '--check'], { encoding: 'utf8' });
  assert.strictEqual(run.status, 0, run.stdout + run.stderr);
});

test('the compose file asks nobody for a login', () => {
  const compose = fs.readFileSync(path.join(ROOT, 'docker-compose.pull.yml'), 'utf8');
  for (const gone of ['ADMIN_EMAIL', 'ADMIN_PASSWORD']) {
    assert.ok(!compose.includes(gone), `${gone} is a setting now, not a line in a compose file`);
  }
  // The domain is named once, in the commented-out proxy, because a
  // certificate has to be asked for before FOSSCast is running.
  const named = compose.split('\n').filter((line) => line.includes('podcast.example.com'));
  assert.strictEqual(named.length, 1, 'the domain appears exactly once');
  assert.ok(named[0].trimStart().startsWith('#'), 'and only in the part that is switched off');
});

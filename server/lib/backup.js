'use strict';
// Export and import the whole instance: one file that holds everything
// this podcast is, so it can be moved to another server or kept
// somewhere safe.
//
// What is in it: every collection the store keeps (the podcast, its
// hosts and episodes, the settings, the counts) and every uploaded file
// under media. That is the whole of the data folder, which is the whole
// of the instance - there is no database and nothing else on disk.
//
// It therefore also holds the login: the password hash, the two-factor
// secret and any passkeys. That is what makes it a move rather than a
// copy of the words, and it is why the screen says so plainly and why
// nobody who is not signed in can ask for one.

const fs = require('fs');
const path = require('path');
const { pack, unpack } = require('./archive');

// Anything else in the folder is ours to leave alone: a backup of a
// backup helps nobody, and a stray file is not part of the instance.
const KEEP = /^[a-z0-9-]+\.json$/i;

function walk(dir, base = '') {
  const out = [];
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = base ? `${base}/${item.name}` : item.name;
    if (item.isDirectory()) out.push(...walk(path.join(dir, item.name), rel));
    else out.push(rel);
  }
  return out;
}

function collect(dataDir) {
  const files = [];
  for (const name of fs.readdirSync(dataDir)) {
    if (!KEEP.test(name)) continue;
    files.push({ name, body: fs.readFileSync(path.join(dataDir, name)) });
  }
  const mediaDir = path.join(dataDir, 'media');
  if (fs.existsSync(mediaDir)) {
    for (const rel of walk(mediaDir)) {
      files.push({ name: `media/${rel}`, body: fs.readFileSync(path.join(mediaDir, rel)) });
    }
  }
  return files.sort((a, b) => (a.name < b.name ? -1 : 1));
}

function exportAll(dataDir) {
  return pack(collect(dataDir));
}

// A name out of the archive must land inside the data folder and
// nowhere else. An archive is a file somebody uploaded, so it is not
// trusted about where its own contents belong: "../../etc/passwd" is
// exactly what this is for.
function safeName(name) {
  if (!name || name.startsWith('/') || name.includes('..') || name.includes('\\')) return null;
  if (KEEP.test(name)) return name;
  if (/^media\/[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)*$/.test(name)) return name;
  return null;
}

// Replacing, not merging: half of one instance and half of another is
// a podcast with episodes pointing at files that are not there. What
// the archive holds is what the instance becomes.
function importAll(dataDir, archive) {
  const files = unpack(archive);
  const good = [];
  const refused = [];
  for (const f of files) {
    const name = safeName(f.name);
    if (name) good.push({ ...f, name });
    else refused.push(f.name);
  }
  // Both, or it is not a whole instance. Asking only for the podcast
  // was enough to let an archive with no users file through, and since
  // importing replaces rather than merges, that emptied the login and
  // locked the owner out of their own server. The test that found it
  // could not sign in again afterwards.
  for (const [file, missing] of [['shows.json', 'there is no podcast in it'],
    ['users.json', 'there is no login in it']]) {
    if (!good.some((f) => f.name === file)) {
      throw new Error(`that file does not look like a FOSSCast export: ${missing}`);
    }
  }
  for (const name of fs.readdirSync(dataDir)) {
    if (KEEP.test(name)) fs.rmSync(path.join(dataDir, name), { force: true });
  }
  fs.rmSync(path.join(dataDir, 'media'), { recursive: true, force: true });
  for (const f of good) {
    const target = path.join(dataDir, f.name);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, f.body);
  }
  return { written: good.length, refused };
}

module.exports = { exportAll, importAll, safeName };

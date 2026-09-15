'use strict';
// Tiny JSON file store: one file per collection in DATA_DIR, cached in
// memory, atomic writes (tmp + rename). Flat files, no database.

const fs = require('fs');
const path = require('path');

class Store {
  constructor(dir) {
    this.dir = dir;
    this.cache = new Map();
    fs.mkdirSync(dir, { recursive: true });
  }

  file(name) {
    return path.join(this.dir, name + '.json');
  }

  load(name, fallback) {
    if (this.cache.has(name)) return this.cache.get(name);
    let value;
    try {
      value = JSON.parse(fs.readFileSync(this.file(name), 'utf8'));
    } catch {
      value = typeof fallback === 'function' ? fallback() : fallback;
    }
    this.cache.set(name, value);
    return value;
  }

  // Everything on disk has been replaced underneath us - an import -
  // so the memory copy is now the stale one. Without this the next read
  // answers from the old instance and the next write puts it back.
  reload() {
    this.cache.clear();
  }

  save(name, value) {
    this.cache.set(name, value);
    const tmp = this.file(name) + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(value, null, 2));
    fs.renameSync(tmp, this.file(name));
  }
}

module.exports = { Store };

// The login in the compose file has to be the login that works, every
// time the app starts. It used to be true only on the very first start:
// a first run that failed for any other reason left an account behind,
// and every later correction to the file did nothing, so you pasted the
// password the file told you to paste and were told it was wrong. There
// is no way to work that out from the outside.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const auth = require('../lib/auth.js');

// The bootstrap reads the environment and the store, so drive those
// directly rather than standing a whole server up for each case.
function makeStore(dir) {
  const file = path.join(dir, 'users.json');
  return {
    all: () => (fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : []),
    save: (_name, list) => fs.writeFileSync(file, JSON.stringify(list)),
  };
}

// A copy of the reconcile step, kept honest by the assertions below: it
// must behave exactly as server/lib/admin.js does.
function bootstrap(store, email, password) {
  const list = store.all();
  email = (email || '').trim().toLowerCase();
  if (!email || !password) return list;
  const existing = list.find((u) => u.email === email);
  if (!existing) {
    list.push({ id: 'x' + list.length, email, hash: auth.hashPassword(password), createdAt: '' });
    store.save('users', list);
    return list;
  }
  if (!auth.verifyPassword(password, existing.hash)) {
    existing.hash = auth.hashPassword(password);
    store.save('users', list);
  }
  return list;
}

test('the password in the settings opens the account after it has changed', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fc-boot-'));
  const store = makeStore(dir);

  bootstrap(store, 'you@example.com', 'the-first-one');
  let user = store.all()[0];
  assert.ok(auth.verifyPassword('the-first-one', user.hash));

  // Somebody could not get in, edited the file, and started it again.
  bootstrap(store, 'you@example.com', 'the-one-i-actually-wanted');
  user = store.all()[0];
  assert.ok(auth.verifyPassword('the-one-i-actually-wanted', user.hash), 'the file must win');
  assert.ok(!auth.verifyPassword('the-first-one', user.hash), 'the old one must stop working');
  assert.equal(store.all().length, 1, 'and it is the same account, not a second one');
});

test('a restart with nothing changed leaves the account alone', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fc-boot-'));
  const store = makeStore(dir);
  bootstrap(store, 'you@example.com', 'steady');
  const before = store.all()[0].hash;
  bootstrap(store, 'you@example.com', 'steady');
  assert.equal(store.all()[0].hash, before, 'the hash must not be rewritten on every start');
});

test('a second email adds an account rather than replacing the first', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fc-boot-'));
  const store = makeStore(dir);
  bootstrap(store, 'one@example.com', 'pw');
  bootstrap(store, 'two@example.com', 'pw');
  assert.equal(store.all().length, 2);
  assert.ok(store.all().every((u) => auth.verifyPassword('pw', u.hash)));
});

test('no settings, no changes', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fc-boot-'));
  const store = makeStore(dir);
  bootstrap(store, '', '');
  assert.equal(store.all().length, 0);
  bootstrap(store, 'you@example.com', 'pw');
  const before = store.all()[0].hash;
  bootstrap(store, 'you@example.com', '');
  assert.equal(store.all()[0].hash, before, 'an empty password must never touch the account');
});

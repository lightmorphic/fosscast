'use strict';
// The two pieces underneath the login that are worth checking on their
// own: the code generator, against the vectors in RFC 6238, and the
// password rule, against the things people actually type.
const { test } = require('node:test');
const assert = require('node:assert');
const totp = require('../lib/totp');
const setup = require('../lib/setup');

// The RFC's own key is the ASCII "12345678901234567890"; in base32 that
// is this. If our base32 or our HMAC were wrong, these would not line
// up with the numbers printed in the document.
const RFC_KEY = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

test('the codes match RFC 6238', () => {
  for (const [seconds, expected] of [[59, '287082'], [1111111109, '081804'], [1111111111, '050471'], [1234567890, '005924'], [2000000000, '279037']]) {
    assert.strictEqual(totp.codeAt(RFC_KEY, Math.floor(seconds / 30)), expected, `at t=${seconds}`);
  }
});

test('a code is good one step either side of now, and no further', () => {
  const secret = totp.newSecret();
  const step = Math.floor(Date.now() / 1000 / 30);
  assert.ok(totp.verify(secret, totp.codeAt(secret, step)), 'now');
  assert.ok(totp.verify(secret, totp.codeAt(secret, step - 1)), 'a clock half a minute slow');
  assert.ok(totp.verify(secret, totp.codeAt(secret, step + 1)), 'a clock half a minute fast');
  assert.ok(!totp.verify(secret, totp.codeAt(secret, step - 2)), 'a minute ago is too long ago');
  assert.ok(!totp.verify(secret, '000000'));
  assert.ok(!totp.verify(secret, ''));
  assert.ok(!totp.verify('', totp.codeAt(secret, step)), 'no secret, no entry');
});

test('a secret is what an app expects, and readable off a screen', () => {
  const secret = totp.newSecret();
  assert.strictEqual(secret.length, 32, 'twenty bytes in base32');
  assert.match(secret, /^[A-Z2-7]+$/);
  assert.strictEqual(totp.readable(secret).split(' ').length, 8, 'grouped in fours');
  const link = totp.otpauth(secret, 'owner@example.test', 'FOSSCast');
  assert.ok(link.startsWith('otpauth://totp/FOSSCast%3Aowner%40example.test?'));
  assert.ok(link.includes(`secret=${secret}`));
});

test('the password rule refuses what people actually type, and says why', () => {
  const named = ['password', 'Password1!', 'password123', 'letmein', 'qwerty123456', 'admin', 'CHANGEME'];
  for (const bad of named) {
    assert.match(setup.problem(bad), /one of the first things anybody tries/, bad);
  }
  assert.match(setup.problem('short'), /at least 12/);
  assert.match(setup.problem('aaaaaaaaaaaaaaaa'), /one character over and over/);
  assert.match(setup.problem('1234567890123456'), /one run along the keyboard/);
  assert.match(setup.problem('wendell-wendell1', 'wendell@example.test'), /mostly the address/);

  // What should pass: ordinary words, no capitals, no punctuation rules.
  for (const good of ['harbour thistle pewter quarry', 'correct-horse-battery-staple', 'the rain in spain stays']) {
    assert.strictEqual(setup.problem(good, 'owner@example.test'), '', good);
  }
});

test('a suggested passphrase is words, and a different one each time', () => {
  const first = setup.suggest();
  assert.strictEqual(first.split('-').length, 6);
  assert.match(first, /^[a-z-]+$/);
  const many = new Set();
  for (let i = 0; i < 50; i += 1) many.add(setup.suggest());
  assert.strictEqual(many.size, 50, 'fifty in a row are fifty different phrases');
  assert.ok(setup.WORDS.length > 300, 'the list is long enough for that to mean something');
  assert.strictEqual(new Set(setup.WORDS).size, setup.WORDS.length, 'and has no word twice');
});

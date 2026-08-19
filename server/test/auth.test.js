'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const auth = require('../lib/auth');

test('password hash verifies and rejects', () => {
  const hash = auth.hashPassword('correct horse battery staple');
  assert.ok(auth.verifyPassword('correct horse battery staple', hash));
  assert.ok(!auth.verifyPassword('wrong', hash));
  assert.ok(!auth.verifyPassword('', hash));
  assert.ok(!auth.verifyPassword('x', 'garbage'));
});

test('session tokens round-trip and reject tampering', () => {
  const secret = 'top secret';
  const token = auth.signSession('user-1', secret);
  assert.strictEqual(auth.verifySession(token, secret), 'user-1');
  assert.strictEqual(auth.verifySession(token, 'other secret'), null);
  assert.strictEqual(auth.verifySession(token.replace('user-1', 'user-2'), secret), null);
  assert.strictEqual(auth.verifySession('nonsense', secret), null);
  assert.strictEqual(auth.verifySession(null, secret), null);
});

test('expired sessions are rejected', () => {
  const secret = 's';
  const token = auth.signSession('u', secret, -1000);
  assert.strictEqual(auth.verifySession(token, secret), null);
});

test('rate limiter locks after max failures and clears on success', () => {
  const limiter = new auth.RateLimiter({ max: 3, windowMs: 60000 });
  const ip = '10.0.0.1';
  assert.ok(!limiter.blocked(ip));
  limiter.fail(ip);
  limiter.fail(ip);
  assert.ok(!limiter.blocked(ip));
  limiter.fail(ip);
  assert.ok(limiter.blocked(ip));
  limiter.ok(ip);
  assert.ok(!limiter.blocked(ip));
});

test('login-link tokens verify once and reject tampering', () => {
  const secret = 'panel secret';
  const token = auth.signLoginLink('user-7', secret, 60000);
  const ok = auth.verifyLoginLink(token, secret);
  assert.strictEqual(ok.userId, 'user-7');
  assert.ok(ok.jti);
  assert.strictEqual(auth.verifyLoginLink(token, 'other'), null);
  assert.strictEqual(auth.verifyLoginLink(token.replace('user-7', 'user-8'), secret), null);
  // a normal session token must not pass as a login link, nor the reverse
  assert.strictEqual(auth.verifyLoginLink(auth.signSession('user-7', secret), secret), null);
  assert.strictEqual(auth.verifySession(token, secret), null);
});

test('login-link tokens expire', () => {
  const secret = 's';
  assert.strictEqual(auth.verifyLoginLink(auth.signLoginLink('u', secret, -1000), secret), null);
});

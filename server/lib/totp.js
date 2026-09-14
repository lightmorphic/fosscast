'use strict';
// Two-factor codes, the ordinary kind: RFC 6238, six digits, thirty
// seconds, which is what every authenticator app already does. A
// twenty-byte secret is made here, shown once as base32 for the person
// to type into their app, and checked with node:crypto.
//
// There is deliberately no QR code. A picture that might not scan is
// worse than no picture: the person stares at a camera that does
// nothing and has no idea whether the fault is theirs. The secret is
// printed in groups of four instead, which anybody can type, and the
// otpauth address is offered beside it for an app that takes a link.
//
// A code is accepted one step either side of now, so a clock that is
// half a minute out still works. Nothing wider: every extra step is
// another thirty seconds in which a code somebody shoulder-read is
// still good.

const crypto = require('crypto');

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const STEP_SECONDS = 30;
const DIGITS = 6;

function base32(buf) {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

function unbase32(text) {
  let bits = 0;
  let value = 0;
  const out = [];
  for (const ch of String(text).toUpperCase().replace(/[^A-Z2-7]/g, '')) {
    value = (value << 5) | ALPHABET.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

// Twenty bytes is what the RFC's own examples use and what every app
// expects; longer secrets are refused by some of them.
function newSecret() {
  return base32(crypto.randomBytes(20));
}

// Grouped for typing. Nobody copies thirty-two characters off a screen
// in one go without losing their place.
function readable(secret) {
  return String(secret).replace(/(.{4})/g, '$1 ').trim();
}

function codeAt(secret, step) {
  const key = unbase32(secret);
  const counter = Buffer.alloc(8);
  counter.writeUInt32BE(Math.floor(step / 2 ** 32), 0);
  counter.writeUInt32BE(step >>> 0, 4);
  const mac = crypto.createHmac('sha1', key).update(counter).digest();
  const offset = mac[mac.length - 1] & 0x0f;
  const value = mac.readUInt32BE(offset) & 0x7fffffff;
  return String(value % 10 ** DIGITS).padStart(DIGITS, '0');
}

function verify(secret, given) {
  const code = String(given || '').replace(/\D/g, '');
  if (code.length !== DIGITS || !secret) return false;
  const now = Math.floor(Date.now() / 1000 / STEP_SECONDS);
  // Compared without short-circuiting on the first match, so the time
  // taken says nothing about which step was the right one.
  let ok = false;
  for (const step of [now - 1, now, now + 1]) {
    const want = Buffer.from(codeAt(secret, step));
    const got = Buffer.from(code);
    if (want.length === got.length && crypto.timingSafeEqual(want, got)) ok = true;
  }
  return ok;
}

// What an app that reads a link wants. The label is the account, the
// issuer is what the app shows in its list.
function otpauth(secret, account, issuer) {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({ secret, issuer, algorithm: 'SHA1', digits: String(DIGITS), period: String(STEP_SECONDS) });
  return `otpauth://totp/${label}?${params}`;
}

module.exports = { newSecret, readable, verify, otpauth, codeAt };

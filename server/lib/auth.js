'use strict';
// Password hashing (scrypt), HMAC-signed session cookies and per-IP
// login rate limiting. No dependencies, just node:crypto.

const crypto = require('crypto');

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 32, maxmem: 64 * 1024 * 1024 };

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, SCRYPT.keylen, SCRYPT);
  return [
    'scrypt', SCRYPT.N, SCRYPT.r, SCRYPT.p,
    salt.toString('hex'), hash.toString('hex'),
  ].join('$');
}

function verifyPassword(password, stored) {
  try {
    const [kind, N, r, p, saltHex, hashHex] = String(stored).split('$');
    if (kind !== 'scrypt') return false;
    const salt = Buffer.from(saltHex, 'hex');
    const expect = Buffer.from(hashHex, 'hex');
    const got = crypto.scryptSync(password, salt, expect.length, {
      N: Number(N), r: Number(r), p: Number(p), maxmem: SCRYPT.maxmem,
    });
    return crypto.timingSafeEqual(got, expect);
  } catch {
    return false;
  }
}

function signSession(userId, secret, ttlMs = 7 * 24 * 3600 * 1000) {
  const exp = Date.now() + ttlMs;
  const payload = `${userId}.${exp}`;
  const mac = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${mac}`;
}

function verifySession(token, secret) {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [userId, expStr, mac] = parts;
  const expect = crypto
    .createHmac('sha256', secret)
    .update(`${userId}.${expStr}`)
    .digest('base64url');
  const a = Buffer.from(mac);
  const b = Buffer.from(expect);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  if (!/^\d+$/.test(expStr) || Date.now() > Number(expStr)) return null;
  return userId;
}

// Too many failed logins from one IP locks that IP out for a while;
// any successful login clears it.
class RateLimiter {
  constructor({ max = 10, windowMs = 15 * 60 * 1000 } = {}) {
    this.max = max;
    this.windowMs = windowMs;
    this.hits = new Map();
  }

  blocked(ip) {
    const entry = this.hits.get(ip);
    if (!entry) return false;
    if (Date.now() > entry.until) {
      this.hits.delete(ip);
      return false;
    }
    return entry.count >= this.max;
  }

  fail(ip) {
    const now = Date.now();
    const entry = this.hits.get(ip);
    if (!entry || now > entry.until) {
      this.hits.set(ip, { count: 1, until: now + this.windowMs });
    } else {
      entry.count += 1;
      entry.until = now + this.windowMs;
    }
  }

  ok(ip) {
    this.hits.delete(ip);
  }
}

module.exports = { hashPassword, verifyPassword, signSession, verifySession, RateLimiter };

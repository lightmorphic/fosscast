'use strict';
// Passkeys. The browser keeps the private key; this server keeps a
// public key and nothing else, so a stolen copy of the data folder
// contains nothing anybody can log in with. There is no shared secret
// to phish, because a browser will only sign for the exact domain the
// passkey was made on.
//
// That last property is also why the password does not go away. Move an
// instance to a new domain and every passkey made on the old one is so
// much dead weight; the password, and the one-time link from the
// container, are the ways back in.
//
// Written here rather than pulled from npm. This is the one file where
// reading the code yourself is the point, and FOSSCast has no runtime
// dependencies by design. node:crypto does the signature check, which
// is the only part that is hard to get right.
//
// Attestation is not examined. It answers "what make of authenticator
// is this", which matters to a bank deciding whether to trust a device
// model and not at all to a podcast host with one owner. Asking for it
// would make some authenticators refuse for no gain.

const crypto = require('crypto');

// ---------------------------------------------------------------------
// CBOR, as much of it as WebAuthn uses
// ---------------------------------------------------------------------
// The attestation object and the COSE key inside it are CBOR. Five of
// the eight major types appear in practice; the rest throw rather than
// guess.

function readItem(buf, at) {
  const head = buf[at];
  const major = head >> 5;
  const small = head & 0x1f;
  let length = small;
  let next = at + 1;
  if (small === 24) { length = buf[next]; next += 1; } else if (small === 25) { length = buf.readUInt16BE(next); next += 2; } else if (small === 26) { length = buf.readUInt32BE(next); next += 4; } else if (small === 27) { length = Number(buf.readBigUInt64BE(next)); next += 8; } else if (small > 27) { throw new Error('this passkey is in a shape FOSSCast cannot read'); }

  if (major === 0) return [length, next];
  if (major === 1) return [-1 - length, next];
  if (major === 2) return [buf.subarray(next, next + length), next + length];
  if (major === 3) return [buf.toString('utf8', next, next + length), next + length];
  if (major === 4) {
    const list = [];
    for (let i = 0; i < length; i += 1) {
      const [item, after] = readItem(buf, next);
      list.push(item);
      next = after;
    }
    return [list, next];
  }
  if (major === 5) {
    const map = new Map();
    for (let i = 0; i < length; i += 1) {
      const [key, afterKey] = readItem(buf, next);
      const [value, afterValue] = readItem(buf, afterKey);
      map.set(key, value);
      next = afterValue;
    }
    return [map, next];
  }
  if (major === 7) {
    if (small === 20) return [false, next];
    if (small === 21) return [true, next];
    return [null, next];
  }
  throw new Error('this passkey is in a shape FOSSCast cannot read');
}

function cbor(buf) { return readItem(buf, 0)[0]; }

// ---------------------------------------------------------------------
// The authenticator's own block
// ---------------------------------------------------------------------
// Fixed layout: the SHA-256 of the domain, one flags byte, a four-byte
// counter, and on a registration the new credential after that.

function authenticatorData(buf) {
  const flags = buf[32];
  const block = {
    domainHash: buf.subarray(0, 32),
    present: (flags & 0x01) !== 0,      // somebody touched it
    verified: (flags & 0x04) !== 0,     // ...and proved who they were
    counter: buf.readUInt32BE(33),
    credentialId: null,
    coseKey: null,
  };
  if (flags & 0x40) {
    const idBytes = buf.readUInt16BE(53);
    block.credentialId = buf.subarray(55, 55 + idBytes);
    block.coseKey = buf.subarray(55 + idBytes);
  }
  return block;
}

// A COSE key is a map keyed by small integers. Two algorithms cover
// everything a browser will offer: -7 is ECDSA on P-256, which is what
// a phone or a hardware key produces, and -257 is RSA, which is what
// Windows Hello produces.
function publicKeyFrom(coseBytes) {
  const cose = cbor(Buffer.from(coseBytes));
  const type = cose.get(1);
  const algorithm = cose.get(3);

  if (type === 2 && algorithm === -7) {
    // An uncompressed P-256 point wrapped in the SPKI header that names
    // the curve. The header never varies, so it is written out.
    const header = Buffer.from('3059301306072a8648ce3d020106082a8648ce3d030107034200', 'hex');
    const point = Buffer.concat([header, Buffer.from([0x04]), cose.get(-2), cose.get(-3)]);
    return { key: crypto.createPublicKey({ key: point, format: 'der', type: 'spki' }), algorithm };
  }
  if (type === 3 && algorithm === -257) {
    const key = crypto.createPublicKey({
      key: {
        kty: 'RSA',
        n: Buffer.from(cose.get(-1)).toString('base64url'),
        e: Buffer.from(cose.get(-2)).toString('base64url'),
      },
      format: 'jwk',
    });
    return { key, algorithm };
  }
  throw new Error('that passkey uses a kind of key FOSSCast does not accept');
}

// ---------------------------------------------------------------------
// Challenges
// ---------------------------------------------------------------------
// In memory, two minutes, used once. None of this belongs on disk: it
// is worthless a moment later and it is one more thing that could leak
// out of a backup.

const CHALLENGE_MS = 2 * 60 * 1000;
const open = new Map();

function challenge(purpose) {
  const value = crypto.randomBytes(32).toString('base64url');
  open.set(value, { purpose, until: Date.now() + CHALLENGE_MS });
  for (const [key, held] of open) if (held.until < Date.now()) open.delete(key);
  return value;
}

// Taking a challenge spends it, whether or not it turns out to be the
// right one, so nothing can be tried twice.
function spend(value, purpose) {
  const held = open.get(value);
  open.delete(value);
  return Boolean(held) && held.purpose === purpose && held.until > Date.now();
}

// ---------------------------------------------------------------------
// What the browser hands back
// ---------------------------------------------------------------------

// The name a passkey is bound to. It is taken from the host the person
// is actually looking at rather than from a setting: a key made on one
// name works on that name and nowhere else, which is the whole point,
// and a setting that disagreed with the address bar would simply make
// every passkey fail.
function domainOf(host) {
  return String(host || '').split(':')[0].toLowerCase();
}

// Passkeys need a secure context. Browsers make one exception, for
// localhost, and so does this: it is what lets somebody try the feature
// before they have a certificate.
function originIsOurs(origin, domain) {
  try {
    const url = new URL(origin);
    const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
    if (url.protocol !== 'https:' && !local) return false;
    return url.hostname.toLowerCase() === domain;
  } catch { return false; }
}

function clientData(base64url) {
  return JSON.parse(Buffer.from(base64url, 'base64url').toString('utf8'));
}

function sameDomain(hash, domain) {
  return hash.equals(crypto.createHash('sha256').update(domain).digest());
}

// Registration. The browser has generated a key pair and is handing
// over the public half. Three things are checked: it answers the
// challenge this server issued, it was made on this server's own
// domain, and the key is one that signatures can later be verified
// against - which is settled here, by reading it, rather than at the
// first failed sign-in.
function register({ response, domain, label }) {
  const data = clientData(response.clientDataJSON);
  if (data.type !== 'webauthn.create') throw new Error('that is not a passkey registration');
  if (!spend(data.challenge, 'register')) throw new Error('that registration has expired - start again');
  if (!originIsOurs(data.origin, domain)) throw new Error('that registration came from the wrong address');

  const attestation = cbor(Buffer.from(response.attestationObject, 'base64url'));
  const block = authenticatorData(attestation.get('authData'));
  if (!block.credentialId) throw new Error('that registration carries no key');
  if (!sameDomain(block.domainHash, domain)) throw new Error('that registration is for a different address');
  if (!block.present) throw new Error('nobody confirmed that registration');

  const { algorithm } = publicKeyFrom(block.coseKey);
  return {
    id: Buffer.from(block.credentialId).toString('base64url'),
    publicKey: Buffer.from(block.coseKey).toString('base64url'),
    algorithm,
    counter: block.counter,
    domain,
    label: String(label || '').trim().slice(0, 60) || 'Passkey',
    addedAt: new Date().toISOString(),
  };
}

// Signing in. The browser has signed this server's challenge with the
// private key it kept. What is signed is the authenticator's block
// followed by the hash of what the browser says it was asked to do, so
// a signature made for another site, or for another challenge, means
// nothing here.
function assertion({ response, domain, stored }) {
  const data = clientData(response.clientDataJSON);
  if (data.type !== 'webauthn.get') throw new Error('that is not a passkey signature');
  if (!spend(data.challenge, 'login')) throw new Error('that sign-in has expired - try again');
  if (!originIsOurs(data.origin, domain)) throw new Error('that sign-in came from the wrong address');

  const raw = Buffer.from(response.authenticatorData, 'base64url');
  const block = authenticatorData(raw);
  if (!sameDomain(block.domainHash, domain)) throw new Error('that passkey belongs to a different address');
  if (!block.present) throw new Error('nobody confirmed that sign-in');

  const { key, algorithm } = publicKeyFrom(Buffer.from(stored.publicKey, 'base64url'));
  const signed = Buffer.concat([
    raw,
    crypto.createHash('sha256').update(Buffer.from(response.clientDataJSON, 'base64url')).digest(),
  ]);
  const signature = Buffer.from(response.signature, 'base64url');
  const good = algorithm === -7
    ? crypto.verify('sha256', signed, { key, dsaEncoding: 'der' }, signature)
    : crypto.verify('sha256', signed, key, signature);
  if (!good) throw new Error('that passkey signature does not check out');

  // A counter that has gone backwards means somebody has a copy of the
  // key. Plenty of authenticators never count at all and report zero
  // forever, which is fine and says nothing; one that counted before
  // and counts lower now is not fine.
  if (stored.counter > 0 && block.counter > 0 && block.counter <= stored.counter) {
    throw new Error('that passkey looks like a copy of one already known here');
  }
  return { counter: block.counter };
}

module.exports = { challenge, register, assertion, domainOf };

'use strict';
// Old feed addresses that still have to work.
//
// A podcast that moves here usually arrives with its feed already
// registered at Apple, Spotify, Podcast Index and a dozen apps nobody
// remembers signing up to. If that old address was on the podcaster's
// own domain - example.com/podcast/rss/index/show.xml, whatever shape
// their last host chose - then pointing the domain here is enough to
// keep it alive, and they need never edit a directory entry again.
//
// The answer is a permanent redirect rather than the feed itself.
// Apple and the other directories follow one and update the address
// they hold, so the old path stops being load-bearing on its own; and
// one feed with one address stays the truth, instead of two addresses
// that could drift apart.
//
// Nothing here helps with an address on somebody else's domain. That
// is theirs, and no amount of configuration on this side reaches it.

// Paths the app answers on its own behalf. An alias may never take one
// of these: a podcaster who typed /admin would otherwise lock
// themselves out of their own dashboard with no way back.
const RESERVED = [
  '/admin', '/api', '/css', '/js', '/img', '/fonts', '/media', '/d',
  '/shows', '/healthz', '/version', '/presets', '/blog', '/newsletter',
  '/members', '/listen', '/push', '/hosts',
];

// One line of the box, cleaned up. Returns '' for anything unusable.
//
// A whole address is accepted and reduced to its path, because that is
// what people have to hand: they paste what their old host showed
// them. The host part is deliberately ignored rather than checked -
// this only ever runs for requests that already arrived here, so the
// domain in the paste says nothing about who is asking.
function tidy(line) {
  let raw = String(line || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) {
    try { raw = new URL(raw).pathname; } catch { return ''; }
  }
  if (!raw.startsWith('/')) raw = `/${raw}`;
  // A query string or fragment cannot be matched against a path, and
  // keeping one would make the entry silently never fire.
  raw = raw.split('?')[0].split('#')[0];
  // No walking out of the path, no doubled separators, nothing exotic.
  if (raw.includes('..') || raw.includes('//')) return '';
  if (!/^\/[A-Za-z0-9._~\-/]*$/.test(raw)) return '';
  if (raw.length > 200) return '';
  // A trailing slash and no trailing slash are the same address here.
  if (raw.length > 1 && raw.endsWith('/')) raw = raw.slice(0, -1);
  if (raw === '/') return '';
  const first = `/${raw.split('/')[1] || ''}`;
  if (RESERVED.includes(first)) return '';
  return raw;
}

// The box as the podcaster typed it, into a list worth storing.
function parse(text) {
  const seen = new Set();
  return String(text || '')
    .split(/[\r\n,]+/)
    .map(tidy)
    .filter((p) => p && !seen.has(p) && seen.add(p))
    .slice(0, 25);
}

// Every alias across every show, as a map to the show that owns it.
// First claim wins: two shows naming the same old address is a
// mistake, and the quiet alternative - last one loaded takes it - is
// the kind that gets noticed a month later.
function index(shows) {
  const map = new Map();
  for (const show of shows || []) {
    for (const alias of show.feedAliases || []) {
      if (!map.has(alias)) map.set(alias, show);
    }
  }
  return map;
}

// The show an incoming path belongs to, or null. Matching ignores a
// trailing slash for the same reason storing does.
function match(shows, pathname) {
  let p = String(pathname || '');
  if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);
  return index(shows).get(p) || null;
}

module.exports = { tidy, parse, index, match, RESERVED };

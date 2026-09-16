'use strict';
// The small shared pieces the admin screens and the router both use:
// the instance's switches, the two or three conversions that turn what
// somebody typed into what is stored, and the handful of replies that
// are not a page.

const { esc, ICONS } = require('../html');
const config = require('../config');

// Some instances hold no audio at all: the episodes live on the
// podcaster's own storage and the feed points there. Offering an upload
// box on such an instance is offering something that cannot work, so
// uploads have a switch of their own; the address box, which every
// instance has, becomes the way in.
//
// It is a setting rather than a constant: a switch you have to restart
// a container to flip is not a switch. The screens call it each time
// they draw.

// A public demo hands its login to strangers, so demo mode makes the
// whole instance read-only: nothing can be changed, uploaded or
// posted, and there is nothing for anyone to spoil for the next
// visitor.
const DEMO = process.env.DEMO_MODE === '1';

// This edition manages one podcast.
const MAX_SHOWS = 1;

// Host photos are shown at 140px on the cards and 200px on a host's own
// page, so a 640px web copy covers retina screens and keeps the hosts
// page light even with twenty faces on it. The browser makes the copy
// while the picture is being chosen, so the box does no image work.
const HOST_PHOTO_SIZE = 640;
const MAX_HOSTS = 40;

// The dashboard must never render inside a stranger's iframe, but an
// operator may name the one shell allowed to hold it - their own
// portal, a homelab wall, an agency panel. The setting is that name (a
// CSP source list, e.g. https://portal.example.com); empty means what
// it has always meant: nobody.

// A length on screen is minutes and seconds; stored, it is seconds.
// Empty either way means nobody knows yet.
function formatDuration(seconds) {
  const n = Number(seconds);
  if (!Number.isFinite(n) || n <= 0) return '';
  const parts = [Math.floor(n / 3600), Math.floor((n % 3600) / 60), Math.round(n % 60)];
  if (!parts[0]) parts.shift();
  return parts.map((v, i) => (i ? String(v).padStart(2, '0') : String(v))).join(':');
}

function parseDuration(text) {
  const parts = String(text || '').trim().split(':').map((v) => Number(v));
  if (!parts.length || parts.some((v) => !Number.isFinite(v) || v < 0)) return null;
  const seconds = parts.reduce((total, v) => total * 60 + v, 0);
  return seconds > 0 ? Math.round(seconds) : null;
}

// "HH:MM:SS Title" or "MM:SS Title", one per line -> chapter objects.
function parseChapters(text) {
  const chapters = [];
  for (const line of String(text).split('\n')) {
    const m = line.trim().match(/^(\d{1,2}:)?(\d{1,2}):(\d{2})\s+(.+)$/);
    if (!m) continue;
    const hours = m[1] ? Number(m[1].slice(0, -1)) : 0;
    chapters.push({ start: hours * 3600 + Number(m[2]) * 60 + Number(m[3]), title: m[4].trim().slice(0, 200) });
  }
  return chapters.sort((a, b) => a.start - b.start);
}

function formatChapters(chapters) {
  return (chapters || []).map((c) => {
    const h = Math.floor(c.start / 3600);
    const m = Math.floor((c.start % 3600) / 60);
    const s = c.start % 60;
    return `${h ? String(h).padStart(2, '0') + ':' : ''}${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')} ${c.title}`;
  }).join('\n');
}

function slugify(name) {
  return String(name).toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'show';
}

function parseCookies(req) {
  const out = {};
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}

function clientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  if (xff) return String(xff).split(',')[0].trim();
  return req.socket.remoteAddress || 'unknown';
}

function isSecure(req) {
  return req.headers['x-forwarded-proto'] === 'https';
}

function redirect(res, to, extraHeaders = {}) {
  res.writeHead(303, { Location: to, ...extraHeaders });
  res.end();
}

function html(res, page, status = 200) {
  const ancestors = config.frameAncestors();
  const headers = {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Security-Policy': `frame-ancestors ${ancestors || "'none'"}`,
  };
  // X-Frame-Options cannot say "this origin only", so when an ancestor
  // is allowed the CSP directive speaks alone. Every browser that
  // honors X-Frame-Options honors frame-ancestors.
  if (!ancestors) headers['X-Frame-Options'] = 'DENY';
  res.writeHead(status, headers);
  res.end(page);
}

// For the few things the page asks about rather than navigates to.
function sendJson(res, status, value) {
  const body = JSON.stringify(value);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
  return true;
}

// Saved from the page itself: no page to send back, and the browser
// stays where it is.
function noContent(res) {
  res.writeHead(204, { 'Content-Length': '0' });
  res.end();
}

async function formBody(req, readBody) {
  const raw = (await readBody(req)).toString();
  return new URLSearchParams(raw);
}

function deleteButton(action, label) {
  return `<form method="post" action="${action}" class="inline-form">
    <button class="btn-icon btn-confirm danger" type="submit" title="${esc(label)}" aria-label="${esc(label)}">
      <span class="icon-a">${ICONS.trash}</span><span class="icon-b">${ICONS.tick}</span>
    </button>
  </form>`;
}

module.exports = {
  DEMO, MAX_SHOWS, HOST_PHOTO_SIZE, MAX_HOSTS,
  formatDuration, parseDuration, parseChapters, formatChapters, slugify,
  parseCookies, clientIp, isSecure, redirect, html, sendJson, noContent,
  formBody, deleteButton,
};

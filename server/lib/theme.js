'use strict';
// The look of the public site: one accent color, and two lines of the
// podcaster's own words. The stylesheet already speaks in tokens, so
// this only has to redefine the accent tokens - no second stylesheet,
// no build step, and a show that has not chosen a color emits nothing
// at all.
//
// Everything here is a value the operator typed, so everything here is
// validated: a color must parse as a color or the default stands.

const DEFAULTS = { accent: '#ff5721', tagline: '', footer: '' };

function parseHex(value, fallback = null) {
  let hex = String(value || '').trim().replace(/^#/, '');
  if (/^[0-9a-fA-F]{3}$/.test(hex)) hex = hex.split('').map((c) => c + c).join('');
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) return fallback;
  return `#${hex.toLowerCase()}`;
}

function toRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// Blend one color towards another. Every shade the site needs - the
// hover, the soft container pair, a readable link - is the chosen
// color moved some distance towards black or towards white, which is
// why this is the only color arithmetic here.
function mix(hex, towards, amount) {
  const a = toRgb(hex);
  const b = toRgb(towards);
  const out = a.map((v, i) => Math.round(v + (b[i] - v) * amount));
  return `#${out.map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('')}`;
}

function luminance(hex) {
  const [r, g, b] = toRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a, b) {
  const l1 = luminance(a);
  const l2 = luminance(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

// Link text has to be readable, and a bright accent on white rarely is:
// deep orange manages 3.2:1 where body text wants 4.5:1. So links get
// their own shade, the accent walked towards black on a light page and
// towards white on a dark one until it clears the bar.
function linkShade(hex, page) {
  const towards = page === '#ffffff' ? '#000000' : '#ffffff';
  for (let amount = 0; amount <= 0.9; amount += 0.05) {
    const candidate = mix(hex, towards, amount);
    if (contrast(candidate, page) >= 4.5) return candidate;
  }
  return towards;
}

// One chosen color becomes the whole accent family. The two "dark"
// entries are the same color lifted when it is too dark to see against
// a near-black page at all.
function accentVars(hex) {
  const light = luminance(hex) > 0.7 ? mix(hex, '#000000', 0.25) : hex;
  const dark = luminance(hex) < 0.09 ? mix(hex, '#ffffff', 0.4) : hex;
  return {
    '--link-light': linkShade(hex, '#ffffff'),
    '--link-dark': linkShade(hex, '#0b0b0e'),
    '--accent-light': light,
    '--accent-hover-light': mix(light, '#000000', 0.12),
    '--accent-container-light': mix(light, '#ffffff', 0.88),
    '--on-accent-container-light': mix(light, '#000000', 0.65),
    '--accent-dark': dark,
    '--accent-hover-dark': mix(dark, '#ffffff', 0.12),
    '--accent-container-dark': mix(dark, '#000000', 0.72),
    '--on-accent-container-dark': mix(dark, '#ffffff', 0.55),
    '--on-accent': luminance(light) > 0.45 ? '#101014' : '#ffffff',
  };
}

function normalise(input = {}) {
  const t = { ...DEFAULTS, ...(input || {}) };
  return {
    accent: parseHex(t.accent, DEFAULTS.accent),
    tagline: String(t.tagline || '').trim().slice(0, 200),
    footer: String(t.footer || '').trim().slice(0, 300),
  };
}

// The accent as one style element. A show still on the default color
// pays nothing: the stylesheet's own palette is already that color.
function styleTag(theme) {
  const t = normalise(theme);
  if (t.accent === DEFAULTS.accent) return '';
  // The stylesheet's palette lives on :root[data-accent], so this has
  // to match that specificity to win; being later in the document
  // settles it.
  const vars = Object.entries(accentVars(t.accent)).map(([k, v]) => `  ${k}: ${v};`).join('\n');
  return `<style>\n:root[data-accent] {\n${vars}\n}\n</style>`;
}

module.exports = { normalise, styleTag, DEFAULTS };

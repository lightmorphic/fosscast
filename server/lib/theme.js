'use strict';
// The look of the public site: the podcaster's own colours, background,
// type and card style, stored on the show and emitted as CSS custom
// properties. The stylesheet already speaks in tokens, so a theme only
// has to redefine tokens - no second stylesheet, no build step, and a
// show with no theme renders exactly as before.
//
// Everything here is a value the operator typed, so everything here is
// validated: colours must parse as colours, numbers are clamped, and
// the one free-text field (custom CSS) can only ever land inside the
// style element it is written into.

// The standard selection. One hex each: every other shade the site
// needs is derived from it, so a custom colour behaves like a preset.
const PRESETS = [
  ['deep_orange', 'Deep orange', '#ff5721'],
  ['red', 'Red', '#e5342b'],
  ['pink', 'Pink', '#e91e63'],
  ['magenta', 'Magenta', '#c2185b'],
  ['purple', 'Purple', '#8b5cf6'],
  ['indigo', 'Indigo', '#4f46e5'],
  ['blue', 'Blue', '#2563eb'],
  ['sky', 'Sky', '#0ea5e9'],
  ['teal', 'Teal', '#0d9488'],
  ['green', 'Green', '#16a34a'],
  ['lime', 'Lime', '#65a30d'],
  ['amber', 'Amber', '#d97706'],
  ['brown', 'Brown', '#8d6e63'],
  ['slate', 'Slate', '#475569'],
];

const FONTS = [
  ['manrope', 'Manrope', "'Manrope', system-ui, sans-serif", 'The one this site ships with. Nothing is fetched from anyone.'],
  ['system', 'System', "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif", "Whatever the visitor's own device uses. Fastest of the lot."],
  ['serif', 'Serif', "Georgia, 'Iowan Old Style', 'Times New Roman', serif", 'Bookish and warm. Suits interview and history shows.'],
  ['rounded', 'Rounded', "'SF Pro Rounded', 'Nunito', 'Varela Round', system-ui, sans-serif", 'Softer and friendlier, where the device has it.'],
  ['mono', 'Mono', "ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace", 'Terminal energy. Tech shows love it.'],
];

const PANELS = [
  ['solid', 'Solid', 'Filled cards with a soft shadow. The default.'],
  ['outline', 'Outlined', 'Flat cards, a clean line, no shadow.'],
  ['glass', 'Glass', 'Translucent and blurred. Made for a background image.'],
];

const WIDTHS = [['narrow', 'Narrow', '52rem'], ['standard', 'Standard', '64rem'], ['wide', 'Wide', '76rem']];

const IMAGE_SHAPES = [
  ['round', 'Circles', 'Host photos as circles. The default.'],
  ['rounded', 'Rounded', 'Soft-cornered squares, matching the cards.'],
  ['square', 'Square', 'Hard corners, no rounding at all.'],
];

// Sizes are named rather than free numbers: every one of them has been
// checked against the layouts, so no choice can break a row.
const IMAGE_SIZES = [
  ['s', 'Small', ['4rem', '6.5rem', '2.75rem']],
  ['m', 'Medium', ['5.25rem', '8.5rem', '3.5rem']],
  ['l', 'Large', ['7rem', '11rem', '4.5rem']],
  ['xl', 'Extra large', ['9rem', '14rem', '5.5rem']],
];

const ART_SIZES = [
  ['s', 'Small', '7rem'],
  ['m', 'Medium', '10rem'],
  ['l', 'Large', '14rem'],
  ['xl', 'Extra large', '18rem'],
];

const EPISODE_LAYOUTS = [
  ['row', 'Image beside the text', ''],
  ['stacked', 'Image above the text', ''],
  ['compact', 'Compact list, small thumbnails', ''],
];

const DEFAULTS = {
  accent: '#ff5721',
  bgMode: 'default',      // default | solid | gradient | image
  bgColor: '#0f172a',
  bgColor2: '#334155',
  bgAngle: 160,
  bgImage: '',
  bgImageWeb: '',
  bgFit: 'cover',         // cover | tile
  bgAttach: 'fixed',      // fixed | scroll
  bgBlur: 0,              // px, 0-24
  bgDim: 30,              // %, 0-85
  panel: 'solid',
  radius: 22,             // px, 0-32
  font: 'manrope',
  mode: 'auto',           // auto | light | dark
  toggle: true,
  width: 'standard',
  episodes: 'row',
  imgShape: 'round',
  photoSize: 'm',
  artSize: 'm',
  bannerFull: false,
  tagline: '',
  footer: '',
  hideFooter: false,
  css: '',
};

// ---------- colour ----------

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

function toHex([r, g, b]) {
  const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
  return `#${[r, g, b].map((v) => clamp(v).toString(16).padStart(2, '0')).join('')}`;
}

function toHsl(hex) {
  const [r, g, b] = toRgb(hex).map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }
  return [h * 360, s * 100, l * 100];
}

function fromHsl(h, s, l) {
  const hue = ((h % 360) + 360) % 360 / 360;
  const sat = Math.max(0, Math.min(100, s)) / 100;
  const lum = Math.max(0, Math.min(100, l)) / 100;
  if (sat === 0) return toHex([lum * 255, lum * 255, lum * 255]);
  const q = lum < 0.5 ? lum * (1 + sat) : lum + sat - lum * sat;
  const p = 2 * lum - q;
  const channel = (t) => {
    let x = t;
    if (x < 0) x += 1;
    if (x > 1) x -= 1;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };
  return toHex([channel(hue + 1 / 3) * 255, channel(hue) * 255, channel(hue - 1 / 3) * 255]);
}

// Perceived brightness, for deciding whether text on this colour should
// be black or white.
function luminance(hex) {
  const [r, g, b] = toRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function readableOn(hex) {
  return luminance(hex) > 0.45 ? '#101014' : '#ffffff';
}

function contrast(a, b) {
  const l1 = luminance(a);
  const l2 = luminance(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

// Link text has to be readable, and a bright accent on white rarely is:
// deep orange manages 3.2:1 where body text wants 4.5:1. So links get
// their own shade of the chosen colour - walked darker for light mode
// and lighter for dark until it clears the bar.
function linkShade(hex, against) {
  const [h, s] = toHsl(hex);
  const darker = against === '#ffffff';
  for (let l = toHsl(hex)[2]; darker ? l >= 12 : l <= 92; l += darker ? -2 : 2) {
    const candidate = fromHsl(h, s, l);
    if (contrast(candidate, against) >= 4.5) return candidate;
  }
  return darker ? '#1a1a1f' : '#f5f5f5';
}

// One chosen colour becomes the whole accent family: a version that
// holds up on white, a brighter one for dark mode, hover states, and
// the soft "container" pair the nav pills and tags use.
function accentPalette(hex) {
  const [h, s] = toHsl(hex);
  const [, , l] = toHsl(hex);
  const sat = Math.max(35, Math.min(95, s));
  const light = l > 62 ? fromHsl(h, sat, 52) : hex;
  const dark = l < 45 ? fromHsl(h, Math.min(90, sat + 8), 62) : hex;
  return {
    '--link-light': linkShade(hex, '#ffffff'),
    '--link-dark': linkShade(hex, '#0b0b0e'),
    '--accent-light': light,
    '--accent-hover-light': fromHsl(h, sat, Math.max(20, toHsl(light)[2] - 8)),
    '--accent-container-light': fromHsl(h, Math.min(90, sat + 5), 93),
    '--on-accent-container-light': fromHsl(h, Math.min(90, sat), 24),
    '--accent-dark': dark,
    '--accent-hover-dark': fromHsl(h, sat, Math.min(80, toHsl(dark)[2] + 8)),
    '--accent-container-dark': fromHsl(h, Math.min(80, sat), 18),
    '--on-accent-container-dark': fromHsl(h, Math.min(85, sat), 78),
    '--on-accent': readableOn(light),
  };
}

// ---------- validation ----------

function clampInt(value, min, max, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function oneOf(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}

// Custom CSS is the operator's own, on their own site, so it is allowed
// - but it may never escape the style element it is written into, and
// it may not smuggle in anything that loads from elsewhere.
function safeCss(value) {
  return String(value || '')
    .slice(0, 8000)
    .replace(/<\/?(style|script)/gi, '')
    .replace(/[<>]/g, '')
    .replace(/@import[^;]*;?/gi, '')
    .replace(/url\(\s*(['"]?)(?!\/)[^)]*\)/gi, 'none');
}

function normalise(input = {}) {
  const t = { ...DEFAULTS, ...(input || {}) };
  const out = {
    accent: parseHex(t.accent, DEFAULTS.accent),
    bgMode: oneOf(t.bgMode, ['default', 'solid', 'gradient', 'image'], 'default'),
    bgColor: parseHex(t.bgColor, DEFAULTS.bgColor),
    bgColor2: parseHex(t.bgColor2, DEFAULTS.bgColor2),
    bgAngle: clampInt(t.bgAngle, 0, 360, DEFAULTS.bgAngle),
    bgImage: /^\/media\/[^/]+\/[^/]+$/.test(String(t.bgImage || '')) ? t.bgImage : '',
    bgImageWeb: /^\/media\/[^/]+\/[^/]+/.test(String(t.bgImageWeb || '')) ? t.bgImageWeb : '',
    bgFit: oneOf(t.bgFit, ['cover', 'tile'], 'cover'),
    bgAttach: oneOf(t.bgAttach, ['fixed', 'scroll'], 'fixed'),
    bgBlur: clampInt(t.bgBlur, 0, 24, 0),
    bgDim: clampInt(t.bgDim, 0, 85, DEFAULTS.bgDim),
    panel: oneOf(t.panel, PANELS.map(([k]) => k), 'solid'),
    radius: clampInt(t.radius, 0, 48, DEFAULTS.radius),
    font: oneOf(t.font, FONTS.map(([k]) => k), 'manrope'),
    mode: oneOf(t.mode, ['auto', 'light', 'dark'], 'auto'),
    toggle: t.toggle !== false,
    width: oneOf(t.width, WIDTHS.map(([k]) => k), 'standard'),
    episodes: oneOf(t.episodes, EPISODE_LAYOUTS.map(([k]) => k), 'row'),
    imgShape: oneOf(t.imgShape, IMAGE_SHAPES.map(([k]) => k), 'round'),
    photoSize: oneOf(t.photoSize, IMAGE_SIZES.map(([k]) => k), 'm'),
    artSize: oneOf(t.artSize, ART_SIZES.map(([k]) => k), 'm'),
    bannerFull: t.bannerFull === true,
    tagline: String(t.tagline || '').trim().slice(0, 200),
    footer: String(t.footer || '').trim().slice(0, 300),
    hideFooter: t.hideFooter === true,
    css: safeCss(t.css),
  };
  if (!out.bgImage) { out.bgImageWeb = ''; if (out.bgMode === 'image') out.bgMode = 'default'; }
  return out;
}

// Has the operator actually changed anything? A show that has not been
// themed emits no style block at all.
function isDefault(theme) {
  const t = normalise(theme);
  return Object.keys(DEFAULTS).every((k) => String(t[k]) === String(DEFAULTS[k]));
}

// ---------- CSS ----------

// A chosen background has to bring its own cards with it. Otherwise a
// pale background keeps dark-mode panels and the text - set to dark for
// contrast with the background - lands on a dark card and disappears.
// Surfaces follow the background, whatever the visitor's device prefers.
function surfaceVars(fg) {
  return fg === '#ffffff'
    ? `  --panel: rgba(22, 22, 30, 0.82);
  --panel-border: rgba(255, 255, 255, 0.12);
  --border: rgba(255, 255, 255, 0.16);
  --muted: rgba(255, 255, 255, 0.08);
  --muted-fg: rgba(255, 255, 255, 0.72);`
    : `  --panel: rgba(255, 255, 255, 0.9);
  --panel-border: rgba(16, 16, 20, 0.1);
  --border: rgba(16, 16, 20, 0.14);
  --muted: rgba(16, 16, 20, 0.05);
  --muted-fg: rgba(16, 16, 20, 0.62);`;
}

function backgroundCss(t) {
  if (t.bgMode === 'solid') {
    const fg = readableOn(t.bgColor);
    return `  --page-bg: ${t.bgColor};
  --page-fg: ${fg};
${surfaceVars(fg)}`;
  }
  if (t.bgMode === 'gradient') {
    const mid = toHex(toRgb(t.bgColor).map((c, i) => (c + toRgb(t.bgColor2)[i]) / 2));
    const fg = readableOn(mid);
    return `  --page-bg: linear-gradient(${t.bgAngle}deg, ${t.bgColor}, ${t.bgColor2});
  --page-fg: ${fg};
${surfaceVars(fg)}`;
  }
  return '';
}

function backgroundLayer(t) {
  if (t.bgMode !== 'image' || !t.bgImage) return '';
  const url = t.bgImageWeb || t.bgImage;
  // A separate fixed layer rather than a body background: it can be
  // blurred and dimmed without touching the text sitting on top of it.
  return `
body::before {
  content: '';
  position: fixed;
  inset: ${t.bgBlur ? `-${t.bgBlur * 2}px` : '0'};
  z-index: -2;
  background-image: url('${url}');
  background-size: ${t.bgFit === 'tile' ? 'auto' : 'cover'};
  background-repeat: ${t.bgFit === 'tile' ? 'repeat' : 'no-repeat'};
  background-position: center;
  background-attachment: ${t.bgAttach === 'fixed' ? 'fixed' : 'scroll'};
  ${t.bgBlur ? `filter: blur(${t.bgBlur}px);` : ''}
}
body::after {
  content: '';
  position: fixed;
  inset: 0;
  z-index: -1;
  background: rgba(0, 0, 0, ${(t.bgDim / 100).toFixed(2)});
}
body { background: transparent; color: #ffffff; }
:root[data-accent] {
  --fg: #ffffff;
${surfaceVars('#ffffff')}
}`;
}

function panelCss(t) {
  if (t.panel === 'outline') {
    return `.panel { box-shadow: none; border-color: var(--border); }`;
  }
  if (t.panel === 'glass') {
    return `.panel {
  background: color-mix(in srgb, var(--panel) 62%, transparent);
  backdrop-filter: blur(14px) saturate(1.2);
  -webkit-backdrop-filter: blur(14px) saturate(1.2);
  border-color: color-mix(in srgb, var(--fg) 14%, transparent);
}`;
  }
  return '';
}

function episodeCss(t) {
  if (t.episodes === 'stacked') {
    return `.episode { flex-direction: column; }
.episode-art, .episode-art-link img { width: 100%; height: auto; max-width: none; aspect-ratio: 16 / 9; object-fit: cover; }
.episode-art-link { width: 100%; }`;
  }
  if (t.episodes === 'compact') {
    return `.episodes { gap: 0.75rem; }
.episode { gap: 1rem; padding: 1rem 1.25rem; align-items: center; }
.episode-art { width: 4rem; height: 4rem; }
.episode video, .episode audio { margin-top: 0.5rem; }`;
  }
  return '';
}

// Host photos and the show's cover: their shape and their size. This is
// the "circle" people mean when they ask to make it bigger - the corner
// slider is for cards, and a circle has no corners to slide.
function imageCss(t) {
  const shape = IMAGE_SHAPES.find(([k]) => k === t.imgShape);
  const [, , sizes] = IMAGE_SIZES.find(([k]) => k === t.photoSize);
  const [, , art] = ART_SIZES.find(([k]) => k === t.artSize);
  const rules = [];
  if (shape[0] !== 'round') {
    const radius = shape[0] === 'square' ? '0' : 'var(--radius)';
    rules.push(`.host-photo, .host-thumb, .host-photo-blank { border-radius: ${radius}; }`);
  }
  if (t.photoSize !== 'm') {
    rules.push(`.host-photo { width: ${sizes[0]}; height: ${sizes[0]}; }
.host-photo.large { width: ${sizes[1]}; height: ${sizes[1]}; }
.host-thumb { width: ${sizes[2]}; height: ${sizes[2]}; }`);
  }
  if (t.artSize !== 'm') {
    rules.push(`.show-art { width: ${art}; height: ${art}; }`);
  }
  return rules.join('\n');
}

// The whole theme as one style element. Only the parts that differ from
// the default are written, so an unthemed show pays nothing.
function styleTag(theme) {
  const t = normalise(theme);
  if (isDefault(t)) return '';
  const font = FONTS.find(([k]) => k === t.font);
  const width = WIDTHS.find(([k]) => k === t.width);
  const vars = Object.entries(accentPalette(t.accent)).map(([k, v]) => `  ${k}: ${v};`).join('\n');
  const bg = backgroundCss(t);
  const rules = [
    // The stylesheet's own palette lives on :root[data-accent], so the
    // theme has to match that specificity to win; being later in the
    // document settles it.
    `:root[data-accent] {
${vars}
  --panel-radius: ${t.radius}px;
  --radius: ${Math.max(4, Math.round(t.radius * 0.6))}px;
${bg}
}`,
    t.font !== 'manrope' ? `body { font-family: ${font[2]}; }` : '',
    width[0] !== 'standard' ? `.wrap { max-width: ${width[2]}; }` : '',
    bg ? `body { background: var(--page-bg); background-attachment: fixed; color: var(--page-fg); }
:root[data-accent] { --fg: var(--page-fg); }` : '',
    backgroundLayer(t),
    panelCss(t),
    episodeCss(t),
    imageCss(t),
    t.bannerFull ? `.show-banner { border-radius: 0; margin: -1rem -1.5rem 0; }
.show-banner img { border-radius: 0; }` : '',
    t.css,
  ].filter(Boolean).join('\n');
  return `<style>\n${rules}\n</style>`;
}

module.exports = {
  PRESETS, FONTS, PANELS, WIDTHS, EPISODE_LAYOUTS, IMAGE_SHAPES, IMAGE_SIZES, ART_SIZES, DEFAULTS,
  normalise, isDefault, styleTag, accentPalette, parseHex, readableOn, safeCss,
};

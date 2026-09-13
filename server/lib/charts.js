'use strict';
// Charts, drawn as SVG on the server. No charting library, no script on
// the page, nothing fetched from anyone: the stats page is as private as
// the counting behind it, and it renders before a single byte of
// JavaScript would have arrived.
//
// Colours come from the stylesheet's own tokens, so a chart follows the
// theme - light, dark, and whatever accent the podcaster picked.

const { esc } = require('./html');

const SERIES = ['var(--c1)', 'var(--c2)', 'var(--c3)', 'var(--c4)', 'var(--c5)', 'var(--c6)', 'var(--c7)', 'var(--c8)'];

function niceMax(value) {
  if (value <= 5) return Math.max(1, value);
  const magnitude = 10 ** Math.floor(Math.log10(value));
  return Math.ceil(value / (magnitude / 2)) * (magnitude / 2);
}

function short(n) {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 10000) return `${Math.round(n / 1000)}k`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

// Vertical bars with a value above each and a label under it: the
// month-by-month chart, and anything else with a handful of columns.
function barChart(points, { height = 190, label = 'Chart', accentLast = true } = {}) {
  if (!points.length) return '';
  const width = 100;
  const max = niceMax(Math.max(1, ...points.map((p) => p.count)));
  const slot = width / points.length;
  const barWidth = Math.min(slot * 0.62, 9);
  const bars = points.map((p, i) => {
    const h = (p.count / max) * 68;
    const x = i * slot + (slot - barWidth) / 2;
    const y = 78 - h;
    const colour = accentLast && i === points.length - 1 ? 'var(--accent)' : 'var(--c1)';
    return `<g>
      <rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${barWidth.toFixed(2)}" height="${Math.max(h, 0.6).toFixed(2)}" rx="1" fill="${colour}"><title>${esc(p.label)}: ${p.count}</title></rect>
      ${p.count ? `<text class="chart-value" x="${(x + barWidth / 2).toFixed(2)}" y="${(y - 2.5).toFixed(2)}">${short(p.count)}</text>` : ''}
      <text class="chart-tick" x="${(x + barWidth / 2).toFixed(2)}" y="85">${esc(p.short || p.label)}</text>
    </g>`;
  }).join('');
  return `<svg class="chart" viewBox="0 0 100 90" preserveAspectRatio="none" style="height:${height}px" role="img" aria-label="${esc(label)}">
    <line class="chart-base" x1="0" y1="78" x2="100" y2="78"/>${bars}</svg>`;
}

// A filled line: daily numbers, where the shape matters more than any
// single column.
function areaChart(points, { height = 150, label = 'Chart' } = {}) {
  if (points.length < 2) return '';
  const max = niceMax(Math.max(1, ...points.map((p) => p.count)));
  const step = 100 / (points.length - 1);
  const coords = points.map((p, i) => [i * step, 72 - (p.count / max) * 64]);
  const line = coords.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
  const dots = points.map((p, i) => `<circle cx="${coords[i][0].toFixed(2)}" cy="${coords[i][1].toFixed(2)}" r="0.9" fill="var(--accent)" opacity="0"><title>${esc(p.label)}: ${p.count}</title></circle>`).join('');
  return `<svg class="chart" viewBox="0 0 100 82" preserveAspectRatio="none" style="height:${height}px" role="img" aria-label="${esc(label)}">
    <defs><linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="var(--accent)" stop-opacity="0.45"/>
      <stop offset="100%" stop-color="var(--accent)" stop-opacity="0.02"/>
    </linearGradient></defs>
    <line class="chart-base" x1="0" y1="72" x2="100" y2="72"/>
    <path d="${line} L100,72 L0,72 Z" fill="url(#fade)"/>
    <path d="${line}" fill="none" stroke="var(--accent)" stroke-width="1.2" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>
    ${dots}
    <text class="chart-tick" x="0" y="80" text-anchor="start">${esc(points[0].label)}</text>
    <text class="chart-tick" x="100" y="80" text-anchor="end">${esc(points[points.length - 1].label)}</text>
  </svg>`;
}

// A doughnut with its legend: apps, countries, platforms. Percentages
// are on the legend rather than crowded into the ring.
function donut(points, { label = 'Chart' } = {}) {
  const total = points.reduce((a, p) => a + p.count, 0);
  if (!total) return '';
  const radius = 15.9155; // circumference 100, so a percentage is a length
  let offset = 25;        // start at twelve o'clock
  const rings = points.map((p, i) => {
    const share = (p.count / total) * 100;
    const ring = `<circle class="donut-seg" cx="21" cy="21" r="${radius}" fill="none"
      stroke="${SERIES[i % SERIES.length]}" stroke-width="7"
      stroke-dasharray="${share.toFixed(2)} ${(100 - share).toFixed(2)}"
      stroke-dashoffset="${offset.toFixed(2)}"><title>${esc(p.label)}: ${p.count} (${share.toFixed(1)}%)</title></circle>`;
    offset = (offset - share + 100) % 100;
    return ring;
  }).join('');
  const legend = points.map((p, i) => `<li>
    <span class="key" style="background:${SERIES[i % SERIES.length]}"></span>
    <span class="key-label">${esc(p.label)}</span>
    <b>${((p.count / total) * 100).toFixed(0)}%</b>
    <span class="key-count">${short(p.count)}</span>
  </li>`).join('');
  return `<div class="donut-wrap">
    <svg class="donut" viewBox="0 0 42 42" role="img" aria-label="${esc(label)}">
      <circle cx="21" cy="21" r="${radius}" fill="none" stroke="var(--muted)" stroke-width="7"/>
      ${rings}
      <text class="donut-total" x="21" y="21.4">${short(total)}</text>
    </svg>
    <ul class="chart-legend">${legend}</ul>
  </div>`;
}

// Horizontal bars: long labels that would never fit under a column.
function barsAcross(points, { label = 'Chart', colour = 'var(--c2)' } = {}) {
  if (!points.length) return '';
  const max = Math.max(1, ...points.map((p) => p.count));
  return `<ul class="hbars" role="img" aria-label="${esc(label)}">${points.map((p, i) => `<li>
    <span class="hbar-label">${esc(p.label)}</span>
    <span class="hbar-track"><span class="hbar-fill" style="width:${((p.count / max) * 100).toFixed(1)}%;background:${i === 0 ? 'var(--accent)' : colour}"></span></span>
    <b>${short(p.count)}</b>
  </li>`).join('')}</ul>`;
}

// Seven rows of twenty-four: when people actually press play.
function heatmap(matrix, { label = 'When people listen' } = {}) {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const max = Math.max(1, ...matrix.flat());
  const cells = matrix.map((row, d) => row.map((count, h) => {
    const strength = count / max;
    return `<rect x="${h * 4 + 8}" y="${d * 4 + 1}" width="3.4" height="3.4" rx="0.7"
      fill="var(--accent)" fill-opacity="${count ? (0.12 + strength * 0.88).toFixed(2) : 0.05}"><title>${days[d]} ${String(h).padStart(2, '0')}:00 - ${count}</title></rect>`;
  }).join('')).join('');
  const rows = days.map((d, i) => `<text class="chart-tick" x="0" y="${i * 4 + 3.6}" text-anchor="start">${d}</text>`).join('');
  const hours = [0, 6, 12, 18, 23].map((h) => `<text class="chart-tick" x="${h * 4 + 9.7}" y="32" text-anchor="middle">${String(h).padStart(2, '0')}</text>`).join('');
  return `<svg class="chart heatmap" viewBox="0 0 104 34" role="img" aria-label="${esc(label)}">${cells}${rows}${hours}</svg>`;
}

// The big numbers across the top.
function tiles(items) {
  return `<div class="tiles">${items.map((t) => `<div class="tile">
    <span class="tile-n">${esc(t.value)}</span>
    <span class="tile-label">${esc(t.label)}</span>
    ${t.note ? `<span class="tile-note${t.tone ? ` ${t.tone}` : ''}">${esc(t.note)}</span>` : ''}
  </div>`).join('')}</div>`;
}

module.exports = { barChart, areaChart, donut, barsAcross, heatmap, tiles, short, SERIES };

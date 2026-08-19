'use strict';
// HTML helpers and the two page shells (public site and admin).

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

const ICONS = {
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>',
  tick: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12.5l5 5L20 6.5"/></svg>',
  eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="2.8"/></svg>',
  eyeOff: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3l18 18"/><path d="M10.6 5.9A10.7 10.7 0 0 1 12 5.5c6.5 0 10 6.5 10 6.5a17.2 17.2 0 0 1-3 3.9M6.3 6.7A16.4 16.4 0 0 0 2 12s3.5 6.5 10 6.5a10.4 10.4 0 0 0 4.2-.9"/><path d="M9.9 10.2a2.8 2.8 0 0 0 3.9 3.9"/></svg>',
  copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/></svg>',
  refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.6-6.3"/><path d="M21 3v5h-5"/></svg>',
  logout: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/></svg>',
};

function publicPage({ title, description, body, image }) {
  return `<!doctype html>
<html lang="en" data-accent="deep_orange">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description || 'Independent shows, live and on demand.')}">
<link rel="icon" href="/img/favicon.svg" type="image/svg+xml">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description || '')}">
${image ? `<meta property="og:image" content="${esc(image)}">
<meta name="twitter:card" content="summary_large_image">` : ''}
<link rel="stylesheet" href="/css/site.css?v=0.3.0">
<script>(function(){try{var t=localStorage.getItem('fosscast-theme');if(t)document.documentElement.setAttribute('data-theme',t);}catch(e){}})();</script>
</head>
<body>
<header class="top">
  <a class="wordmark" href="/" aria-label="FOSSCast home">
    <svg class="mark" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3.2" fill="currentColor"/><path d="M6.3 17.7a8 8 0 0 1 0-11.4M17.7 6.3a8 8 0 0 1 0 11.4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
    <span>FOSSCast</span>
  </a>
  <nav class="top-nav">
    <a class="top-link" href="/shows">Shows</a>
    <button class="btn-icon theme-toggle" type="button" id="theme-toggle" data-tip="Light or dark" aria-label="Switch between light and dark">
      <span class="icon-light"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="4.2"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4"/></svg></span>
      <span class="icon-dark"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 13.5A8.5 8.5 0 1 1 10.5 4a6.8 6.8 0 0 0 9.5 9.5z"/></svg></span>
    </button>
  </nav>
</header>
<main class="wrap">
${body}
</main>
<footer class="foot">
  <a class="lightmorphic-badge" href="https://lightmorphic.co.uk" target="_blank" rel="noopener noreferrer" translate="no">
    <span>Created by</span>
    <img src="/img/lightmorphic-dark-tb-250x50-sq.webp" alt="Lightmorphic" width="125" height="25" loading="lazy">
    <span class="external-link-icon" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
        <path d="M15 3h6v6"/>
        <line x1="10" y1="14" x2="21" y2="3"/>
      </svg>
    </span>
  </a>
  <div class="foot-line">FOSSCast &middot; <a href="https://github.com/lightmorphic/fosscast">GitHub</a> &middot; free software under the <a href="https://github.com/lightmorphic/fosscast/blob/main/LICENSE">GNU GPL v3</a></div>
</footer>
<script>
document.getElementById('theme-toggle').addEventListener('click', function () {
  var root = document.documentElement;
  var now = root.getAttribute('data-theme');
  if (!now) now = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  var next = now === 'dark' ? 'light' : 'dark';
  root.setAttribute('data-theme', next);
  try { localStorage.setItem('fosscast-theme', next); } catch (e) {}
});
document.addEventListener('click', function (e) {
  var copy = e.target.closest('[data-copy-feed]');
  if (!copy) return;
  navigator.clipboard.writeText(copy.getAttribute('data-copy-feed')).then(function () {
    var span = copy.querySelector('span');
    var was = span.textContent;
    span.textContent = 'Copied';
    setTimeout(function () { span.textContent = was; }, 1500);
  });
});
</script>
</body>
</html>
`;
}

// The tiny bit of client behaviour the admin needs: two-click delete
// confirmation, reveal/copy for secrets. No framework, no build step.
const ADMIN_SCRIPT = `
var themeButton = document.getElementById('theme-toggle');
if (themeButton) themeButton.addEventListener('click', function () {
  var root = document.documentElement;
  var now = root.getAttribute('data-theme');
  if (!now) now = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  var next = now === 'dark' ? 'light' : 'dark';
  root.setAttribute('data-theme', next);
  try { localStorage.setItem('fosscast-theme', next); } catch (e) {}
});

document.addEventListener('change', (e) => {
  const input = e.target.closest('input[type=file][data-upload]');
  if (!input || !input.files[0]) return;
  const file = input.files[0];
  const status = document.getElementById(input.dataset.status);
  const target = document.getElementById(input.dataset.target);
  status.textContent = 'Uploading ' + file.name + ' (' + (file.size / 1048576).toFixed(1) + ' MB)...';
  fetch('/admin/api/upload?show=' + encodeURIComponent(input.dataset.show) + '&filename=' + encodeURIComponent(file.name), {
    method: 'PUT', body: file,
  }).then((r) => r.json()).then((d) => {
    if (d.urlPath) { target.value = d.urlPath; status.textContent = 'Uploaded: ' + d.name; }
    else { status.textContent = 'Upload failed: ' + (d.error || 'unknown error'); }
  }).catch(() => { status.textContent = 'Upload failed.'; });
});
document.addEventListener('click', (e) => {
  const confirmBtn = e.target.closest('.btn-confirm');
  if (confirmBtn) {
    if (!confirmBtn.classList.contains('armed')) {
      e.preventDefault();
      confirmBtn.classList.add('armed');
      clearTimeout(confirmBtn._t);
      confirmBtn._t = setTimeout(() => confirmBtn.classList.remove('armed'), 3000);
    }
    return;
  }
  const reveal = e.target.closest('.btn-reveal');
  if (reveal) {
    const input = document.getElementById(reveal.dataset.for);
    const hidden = input.type === 'password';
    input.type = hidden ? 'text' : 'password';
    reveal.classList.toggle('revealed', hidden);
    return;
  }
  const copy = e.target.closest('.btn-copy');
  if (copy) {
    const input = document.getElementById(copy.dataset.for);
    navigator.clipboard.writeText(input.value).then(() => {
      copy.classList.add('copied');
      clearTimeout(copy._t);
      copy._t = setTimeout(() => copy.classList.remove('copied'), 1500);
    });
  }
});
`;

function adminPage({ title, body, active = '', authed = true }) {
  const nav = authed
    ? `<nav class="admin-nav">
        ${[['', 'Dashboard'], ['shows', 'Shows'], ['stats', 'Stats'], ['account', 'Account']]
          .map(([slug, label]) => `<a class="admin-link${active === (slug || 'dashboard') || (active === '' && slug === '') ? ' current' : ''}" href="/admin${slug ? '/' + slug : ''}">${label}</a>`)
          .join('')}
        <button class="btn-icon theme-toggle" type="button" id="theme-toggle" data-tip="Light or dark" aria-label="Switch between light and dark">
      <span class="icon-light"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="4.2"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4"/></svg></span>
      <span class="icon-dark"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 13.5A8.5 8.5 0 1 1 10.5 4a6.8 6.8 0 0 0 9.5 9.5z"/></svg></span>
    </button>
        <form method="post" action="/admin/logout" class="logout-form">
          <button class="btn-icon" type="submit" data-tip="Log out" aria-label="Log out">${ICONS.logout}</button>
        </form>
      </nav>`
    : '';
  return `<!doctype html>
<html lang="en" data-accent="deep_orange">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} - FOSSCast admin</title>
<meta name="robots" content="noindex">
<link rel="icon" href="/img/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/css/site.css?v=0.3.0">
<script>(function(){try{var t=localStorage.getItem('fosscast-theme');if(t)document.documentElement.setAttribute('data-theme',t);}catch(e){}})();</script>
</head>
<body class="admin">
${process.env.DEMO_MODE === '1' ? '<div class="demo-bar">Demo instance: you can look around, but nothing can be changed.</div>' : ''}
<header class="top">
  <a class="wordmark" href="/admin" aria-label="FOSSCast admin">
    <svg class="mark" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3.2" fill="currentColor"/><path d="M6.3 17.7a8 8 0 0 1 0-11.4M17.7 6.3a8 8 0 0 1 0 11.4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
    <span>FOSSCast <span class="admin-tag">admin</span></span>
  </a>
  ${nav}
</header>
<main class="wrap">
${body}
</main>
<script>${ADMIN_SCRIPT}</script>
</body>
</html>
`;
}

module.exports = { esc, publicPage, adminPage, ICONS };

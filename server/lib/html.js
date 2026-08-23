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

// The public site is more than one page now (the show, its episodes, the
// hosts), so the header carries a small menu. It stays the show's own:
// the only FOSSCast mark on the page is the one in the footer.
function siteMenu(nav = []) {
  if (!nav.length) return '';
  return `<nav class="site-nav">${nav
    .map(([href, label, current]) => `<a class="site-link${current ? ' current' : ''}"${current ? ' aria-current="page"' : ''} href="${esc(href)}">${esc(label)}</a>`)
    .join('')}</nav>`;
}

function publicPage({ title, description, body, image, icon, nav = [], theme = null, footer = '' }) {
  const look = theme ? require('./theme').normalise(theme) : null;
  // A fixed light or dark choice is the operator's; "auto" leaves it to
  // the visitor's own device and their toggle.
  const forced = look && look.mode !== 'auto' ? look.mode : '';
  const showToggle = !look || look.toggle;
  return `<!doctype html>
<html lang="en" data-accent="deep_orange"${forced ? ` data-theme="${forced}"` : ''}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description || '')}">
<link rel="icon" href="${icon ? esc(icon) : '/img/favicon.svg'}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description || '')}">
${image ? `<meta property="og:image" content="${esc(image)}">
<meta name="twitter:card" content="summary_large_image">` : ''}
<link rel="stylesheet" href="/css/site.css?v=0.14.0">
${look ? require('./theme').styleTag(look) : ''}
${forced ? '' : `<script>(function(){try{var t=localStorage.getItem('fosscast-theme');if(t)document.documentElement.setAttribute('data-theme',t);}catch(e){}})();</script>`}
</head>
<body>
<header class="top top-minimal${nav.length ? ' top-nav' : ''}">
  ${siteMenu(nav)}
  ${!showToggle ? '' : `<button class="btn-icon theme-toggle" type="button" id="theme-toggle" data-tip="Light or dark" aria-label="Switch between light and dark">
    <span class="icon-light"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="4.2"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4"/></svg></span>
    <span class="icon-dark"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 13.5A8.5 8.5 0 1 1 10.5 4a6.8 6.8 0 0 0 9.5 9.5z"/></svg></span>
  </button>`}
</header>
<main class="wrap">
${body}
</main>
<footer class="foot site-foot">
  <a class="foot-brand" href="https://fosscast.org" target="_blank" rel="noopener noreferrer" translate="no">
    <svg class="mark" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3.2" fill="currentColor"/><path d="M6.3 17.7a8 8 0 0 1 0-11.4M17.7 6.3a8 8 0 0 1 0 11.4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
    <span>FOSSCast</span>
  </a>
  ${footer ? `<p class="foot-own">${esc(footer)}</p>` : ''}
  <a class="foot-lm" href="https://lightmorphic.com" target="_blank" rel="noopener noreferrer" aria-label="Lightmorphic">
    <img src="/img/lightmorphic-mark.webp" alt="Lightmorphic" width="34" height="34" loading="lazy">
  </a>
</footer>
<script>

// Tooltips: one bubble, appended to the body, positioned in viewport
// coordinates. Anything drawn inside its trigger can be clipped by a
// card's rounded corner, hidden under a sticky bar, or pushed off the
// edge of the page; this cannot be. It flips above or below depending
// on the room available, stays inside the viewport, and moves its tail
// to keep pointing at whatever it describes.
(function tooltips() {
  var bubble = null;
  var current = null;

  function make() {
    bubble = document.createElement('div');
    bubble.className = 'tip';
    bubble.setAttribute('role', 'tooltip');
    document.body.appendChild(bubble);
    return bubble;
  }

  function place(target) {
    var edge = 8;      // never closer than this to the edge of the page
    var gap = 10;      // between the bubble and what it describes
    var r = target.getBoundingClientRect();
    bubble.style.left = '0px';
    bubble.style.top = '0px';
    var w = bubble.offsetWidth;
    var h = bubble.offsetHeight;

    // Above by default; below when there is no room above but there is
    // below. When neither fits, take the roomier side and let the clamp
    // keep it on the page.
    var roomAbove = r.top - gap - edge;
    var roomBelow = window.innerHeight - r.bottom - gap - edge;
    var above = roomAbove >= h || roomAbove >= roomBelow;
    var top = above ? r.top - h - gap : r.bottom + gap;
    top = Math.max(edge, Math.min(top, window.innerHeight - h - edge));

    var left = r.left + r.width / 2 - w / 2;
    left = Math.max(edge, Math.min(left, window.innerWidth - w - edge));

    bubble.dataset.place = above ? 'above' : 'below';
    bubble.style.left = Math.round(left) + 'px';
    bubble.style.top = Math.round(top) + 'px';
    // The tail follows the trigger even when the bubble has been pushed
    // sideways to stay on the page.
    var tail = Math.round(r.left + r.width / 2 - left - 4);
    bubble.style.setProperty('--tail-x', Math.max(10, Math.min(tail, w - 19)) + 'px');
  }

  function show(target) {
    var text = target.getAttribute('data-tip');
    if (!text) return;
    if (!bubble) make();
    current = target;
    bubble.textContent = text;
    place(target);
    requestAnimationFrame(function () { if (current === target) bubble.classList.add('shown'); });
  }

  function hide() {
    current = null;
    if (bubble) bubble.classList.remove('shown');
  }

  document.addEventListener('mouseover', function (e) {
    var t = e.target.closest('[data-tip]');
    if (t && t !== current) show(t);
  });
  document.addEventListener('mouseout', function (e) {
    var t = e.target.closest('[data-tip]');
    if (t && t === current) hide();
  });
  document.addEventListener('focusin', function (e) {
    var t = e.target.closest('[data-tip]');
    if (t) show(t);
  });
  document.addEventListener('focusout', hide);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') hide(); });
  // A bubble pinned to the viewport would drift away from its trigger,
  // so it goes when the page moves under it.
  window.addEventListener('scroll', hide, true);
  window.addEventListener('resize', hide);
  document.addEventListener('click', function (e) { if (!e.target.closest('[data-tip]')) hide(); });
})();

var toggle = document.getElementById('theme-toggle');
if (toggle) toggle.addEventListener('click', function () {
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

// Tooltips: one bubble, appended to the body, positioned in viewport
// coordinates. Anything drawn inside its trigger can be clipped by a
// card's rounded corner, hidden under a sticky bar, or pushed off the
// edge of the page; this cannot be. It flips above or below depending
// on the room available, stays inside the viewport, and moves its tail
// to keep pointing at whatever it describes.
(function tooltips() {
  var bubble = null;
  var current = null;

  function make() {
    bubble = document.createElement('div');
    bubble.className = 'tip';
    bubble.setAttribute('role', 'tooltip');
    document.body.appendChild(bubble);
    return bubble;
  }

  function place(target) {
    var edge = 8;      // never closer than this to the edge of the page
    var gap = 10;      // between the bubble and what it describes
    var r = target.getBoundingClientRect();
    bubble.style.left = '0px';
    bubble.style.top = '0px';
    var w = bubble.offsetWidth;
    var h = bubble.offsetHeight;

    // Above by default; below when there is no room above but there is
    // below. When neither fits, take the roomier side and let the clamp
    // keep it on the page.
    var roomAbove = r.top - gap - edge;
    var roomBelow = window.innerHeight - r.bottom - gap - edge;
    var above = roomAbove >= h || roomAbove >= roomBelow;
    var top = above ? r.top - h - gap : r.bottom + gap;
    top = Math.max(edge, Math.min(top, window.innerHeight - h - edge));

    var left = r.left + r.width / 2 - w / 2;
    left = Math.max(edge, Math.min(left, window.innerWidth - w - edge));

    bubble.dataset.place = above ? 'above' : 'below';
    bubble.style.left = Math.round(left) + 'px';
    bubble.style.top = Math.round(top) + 'px';
    // The tail follows the trigger even when the bubble has been pushed
    // sideways to stay on the page.
    var tail = Math.round(r.left + r.width / 2 - left - 4);
    bubble.style.setProperty('--tail-x', Math.max(10, Math.min(tail, w - 19)) + 'px');
  }

  function show(target) {
    var text = target.getAttribute('data-tip');
    if (!text) return;
    if (!bubble) make();
    current = target;
    bubble.textContent = text;
    place(target);
    requestAnimationFrame(function () { if (current === target) bubble.classList.add('shown'); });
  }

  function hide() {
    current = null;
    if (bubble) bubble.classList.remove('shown');
  }

  document.addEventListener('mouseover', function (e) {
    var t = e.target.closest('[data-tip]');
    if (t && t !== current) show(t);
  });
  document.addEventListener('mouseout', function (e) {
    var t = e.target.closest('[data-tip]');
    if (t && t === current) hide();
  });
  document.addEventListener('focusin', function (e) {
    var t = e.target.closest('[data-tip]');
    if (t) show(t);
  });
  document.addEventListener('focusout', hide);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') hide(); });
  // A bubble pinned to the viewport would drift away from its trigger,
  // so it goes when the page moves under it.
  window.addEventListener('scroll', hide, true);
  window.addEventListener('resize', hide);
  document.addEventListener('click', function (e) { if (!e.target.closest('[data-tip]')) hide(); });
})();

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
  // Show the picked image straight away, before the upload even finishes.
  if (input.dataset.preview && file.type.indexOf('image/') === 0) {
    const preview = document.getElementById(input.dataset.preview);
    if (preview) { preview.src = URL.createObjectURL(file); preview.style.display = 'block'; }
  }
  status.textContent = 'Uploading ' + file.name + ' (' + (file.size / 1048576).toFixed(1) + ' MB)...';
  var check = input.dataset.check ? '&check=' + encodeURIComponent(input.dataset.check) : '';
  fetch('/admin/api/upload?show=' + encodeURIComponent(input.dataset.show) + '&filename=' + encodeURIComponent(file.name) + check, {
    method: 'PUT', body: file,
  }).then((r) => r.json()).then((d) => {
    if (d.urlPath) { target.value = d.urlPath; status.textContent = 'Uploaded: ' + d.name; }
    else { status.textContent = 'Upload failed: ' + (d.error || 'unknown error'); }
  }).catch(() => { status.textContent = 'Upload failed.'; });
});
// A page with a lot of cards gets a rail down the right-hand side: one
// link per section, the one you are looking at marked. Built from
// whatever sections the page has rather than kept in step by hand, and
// only when there are enough of them to be worth it.
(function sectionRail() {
  var sections = [].slice.call(document.querySelectorAll('main .panel[id], main details.panel[id]'))
    .map(function (el) {
      var heading = el.querySelector('h2');
      return heading ? { el: el, title: heading.textContent.trim() } : null;
    })
    .filter(Boolean);
  if (sections.length < 5) return;

  var rail = document.createElement('nav');
  rail.className = 'section-rail';
  rail.setAttribute('aria-label', 'Sections on this page');
  rail.innerHTML = sections.map(function (s) {
    var label = s.title.replace(/&/g, '&amp;').replace(/</g, '&lt;');
    return '<a href="#' + s.el.id + '"><span></span>' + label + '</a>';
  }).join('');
  document.body.appendChild(rail);
  var links = rail.querySelectorAll('a');

  // Beside the cards, not out at the edge of the window: the rail is
  // put against the right edge of the content column, and steps aside
  // entirely when there is no room for it there.
  var column = document.querySelector('main.wrap');
  function place() {
    var box = column.getBoundingClientRect();
    // 12px off the column, 8px clear of the window edge; narrower than
    // its natural width when that is what it takes to fit beside the
    // cards, and gone entirely when even that will not do.
    var available = window.innerWidth - box.right - 20;
    var width = Math.min(184, available);
    if (width < 132) { rail.classList.remove('shown'); return; }
    rail.style.width = Math.round(width) + 'px';
    rail.style.left = Math.round(box.right + 12) + 'px';
    rail.classList.add('shown');
  }
  place();
  window.addEventListener('resize', place);

  function mark(index) {
    for (var i = 0; i < links.length; i++) links[i].classList.toggle('current', i === index);
  }
  mark(0);

  // Whichever section is nearest the top of the window without having
  // gone past it is the one being read.
  var ticking = false;
  function update() {
    ticking = false;
    var best = 0;
    for (var i = 0; i < sections.length; i++) {
      if (sections[i].el.getBoundingClientRect().top - 120 <= 0) best = i;
    }
    mark(best);
  }
  window.addEventListener('scroll', function () {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(update);
  }, { passive: true });
  window.addEventListener('resize', update);
  update();
})();

// Choosing what the banner looks at. The whole clip plays; a red 4:1
// box sits over it; dragging the box picks the part of the picture the
// strip shows. The box is the banner's shape, so what you frame is
// exactly what appears - and the result plays underneath as proof.
//
// The numbers stored are CSS object-position percentages, which is the
// same thing said in the language the public page speaks: 0% puts the
// left (or top) edge of the picture against the left (or top) edge of
// the strip, 100% the right (or bottom).
(function bannerFraming() {
  var picker = document.getElementById('focus-picker');
  var video = document.getElementById('focus-video');
  var box = document.getElementById('focus-box');
  if (!picker || !video || !box) return;
  var result = document.getElementById('focus-result-video');
  var fieldX = document.getElementById('bannerFocusX');
  var fieldY = document.getElementById('bannerFocusY');
  var x = Number(picker.dataset.x);
  var y = Number(picker.dataset.y);
  var slackX = 0;
  var slackY = 0;

  // The box is the largest 4:1 rectangle that fits the clip as shown,
  // so it can only travel along the axis with room to spare.
  function layout() {
    var w = video.clientWidth;
    var h = video.clientHeight;
    if (!w || !h) return;
    var boxW = Math.min(w, h * 4);
    var boxH = boxW / 4;
    box.style.width = boxW + 'px';
    box.style.height = boxH + 'px';
    slackX = Math.max(0, w - boxW);
    slackY = Math.max(0, h - boxH);
    picker.classList.toggle('locked-x', slackX < 1);
    picker.classList.toggle('locked-y', slackY < 1);
    draw();
  }

  function draw() {
    box.style.left = (slackX * x / 100) + 'px';
    box.style.top = (slackY * y / 100) + 'px';
    box.setAttribute('aria-valuenow', String(slackX >= 1 ? x : y));
    if (result) result.style.objectPosition = x + '% ' + y + '%';
  }

  function set(nextX, nextY, save) {
    x = Math.max(0, Math.min(100, nextX));
    y = Math.max(0, Math.min(100, nextY));
    draw();
    if (fieldX) fieldX.value = Math.round(x);
    if (fieldY) fieldY.value = Math.round(y);
    // The form saves itself; tell it something changed.
    if (save && fieldX && fieldX.form) fieldX.form.dispatchEvent(new Event('input', { bubbles: true }));
  }

  var dragging = false;
  function fromPointer(e) {
    var area = video.getBoundingClientRect();
    var boxRect = box.getBoundingClientRect();
    var left = e.clientX - area.left - boxRect.width / 2;
    var top = e.clientY - area.top - boxRect.height / 2;
    set(slackX ? (left / slackX) * 100 : 50, slackY ? (top / slackY) * 100 : 50, false);
  }

  box.addEventListener('pointerdown', function (e) {
    dragging = true;
    box.setPointerCapture(e.pointerId);
    picker.classList.add('dragging');
    e.preventDefault();
  });
  box.addEventListener('pointermove', function (e) { if (dragging) fromPointer(e); });
  box.addEventListener('pointerup', function (e) {
    if (!dragging) return;
    dragging = false;
    picker.classList.remove('dragging');
    box.releasePointerCapture(e.pointerId);
    set(x, y, true);
  });
  // A click anywhere on the clip centres the box there.
  picker.addEventListener('click', function (e) {
    if (e.target === box) return;
    fromPointer(e);
    set(x, y, true);
  });
  // And the keyboard moves it, for anyone not using a mouse.
  box.addEventListener('keydown', function (e) {
    var step = e.shiftKey ? 10 : 2;
    var handled = true;
    if (e.key === 'ArrowLeft') set(x - step, y, true);
    else if (e.key === 'ArrowRight') set(x + step, y, true);
    else if (e.key === 'ArrowUp') set(x, y - step, true);
    else if (e.key === 'ArrowDown') set(x, y + step, true);
    else if (e.key === 'Home') set(0, 0, true);
    else if (e.key === 'End') set(100, 100, true);
    else handled = false;
    if (handled) e.preventDefault();
  });

  video.addEventListener('loadedmetadata', layout);
  window.addEventListener('resize', layout);
  if (video.readyState >= 1) layout();
  draw();
})();

// Editing saves itself. Any form marked data-autosave stores what has
// been typed half a second after the typing stops, so there is no Save
// button to find and nothing is lost by wandering off. Forms that
// create something - a new episode, a new host, logging in - keep their
// button, because those are decisions rather than edits.
(function autosave() {
  var forms = document.querySelectorAll('form[data-autosave]');
  if (!forms.length) return;

  // File inputs upload themselves and write their path into a hidden
  // field, so they are left out of the body sent here.
  function body(form) {
    var params = new URLSearchParams();
    Array.prototype.forEach.call(form.elements, function (el) {
      if (!el.name || el.disabled || el.type === 'file' || el.type === 'submit') return;
      if ((el.type === 'checkbox' || el.type === 'radio') && !el.checked) return;
      params.append(el.name, el.value);
    });
    params.set('live', '1');
    return params;
  }

  Array.prototype.forEach.call(forms, function (form) {
    var state = form.querySelector('.save-state');
    var timer = null;
    function say(text, cls) {
      if (!state) return;
      state.textContent = text;
      state.className = 'save-state' + (cls ? ' ' + cls : '');
    }
    function save() {
      timer = null;
      fetch(form.action, { method: 'POST', body: body(form) })
        .then(function (r) {
          if (!r.ok) throw new Error('save failed');
          say('Saved', 'saved');
          setTimeout(function () { if (state && state.textContent === 'Saved') say(''); }, 2000);
        })
        .catch(function () { say('Not saved - check your connection', 'failed'); });
    }
    function queue() {
      clearTimeout(timer);
      say('Saving...', 'saving');
      timer = setTimeout(save, 500);
    }
    form.addEventListener('input', queue);
    form.addEventListener('change', queue);
    // Whatever is still waiting when the page is left goes now.
    window.addEventListener('pagehide', function () {
      if (!timer) return;
      clearTimeout(timer);
      navigator.sendBeacon(form.action, body(form));
    });
  });
})();

// The Look page: swatches, live labels, fields that appear only when
// they apply, and a preview that is the real page rendered by the
// server with the pending theme - so it cannot drift from the result.
(function look() {
  const form = document.getElementById('look-form');
  const frame = document.getElementById('look-preview');
  if (!form) return;
  const hex = document.getElementById('accent-hex');
  const picker = document.getElementById('accent-pick');

  function relevant() {
    const mode = form.querySelector('input[name=bgMode]:checked');
    const which = mode ? mode.value : 'default';
    form.querySelectorAll('.bg-colors').forEach((el) => {
      el.style.display = which === 'solid' || which === 'gradient' ? '' : 'none';
    });
    form.querySelectorAll('.bg-image-fields').forEach((el) => {
      el.style.display = which === 'image' ? '' : 'none';
    });
    form.querySelectorAll('.pick').forEach((p) => {
      const input = p.querySelector('input');
      p.classList.toggle('current', input.checked);
    });
  }

  function labels() {
    const set = (id, value) => {
      const el = form.querySelector('label[for=' + id + '] b');
      if (el) el.textContent = value;
    };
    set('radius', form.radius.value + 'px');
    set('bg-dim', form.bgDim.value + '%');
    set('bg-blur', form.bgBlur.value + 'px');
    // One note, for whichever chip is chosen, rather than a note per chip.
    form.querySelectorAll('.picks').forEach((group) => {
      const chosen = group.querySelector('input:checked');
      const note = document.getElementById('note-' + (chosen ? chosen.name : ''));
      if (chosen && note) note.textContent = chosen.dataset.note || '';
    });
  }

  // The look saves itself. One request stores the change and returns the
  // front page as it now stands, so the preview is the saved truth
  // rather than a guess at it.
  var timer;
  var state = document.getElementById('save-state');
  function say(text, cls) {
    if (!state) return;
    state.textContent = text;
    state.className = 'save-state' + (cls ? ' ' + cls : '');
  }
  function preview() {
    clearTimeout(timer);
    say('Saving...', 'saving');
    timer = setTimeout(() => {
      const body = new URLSearchParams(new FormData(form));
      body.set('live', '1');
      fetch('/admin/look', { method: 'POST', body })
        .then((r) => { if (!r.ok) throw new Error('save failed'); return r.text(); })
        .then((html) => {
          if (frame) frame.srcdoc = html;
          say('Saved', 'saved');
          setTimeout(() => { if (state && state.textContent === 'Saved') say(''); }, 2000);
        })
        .catch(() => say('Not saved - check your connection', 'failed'));
    }, 500);
  }

  form.addEventListener('input', () => { relevant(); labels(); preview(); });
  form.addEventListener('change', () => { relevant(); labels(); preview(); });

  form.querySelectorAll('.swatch').forEach((sw) => {
    sw.addEventListener('click', () => {
      const value = sw.dataset.accent;
      hex.value = value;
      if (picker) picker.value = value;
      form.querySelectorAll('.swatch').forEach((s) => s.classList.toggle('current', s === sw));
      preview();
    });
  });
  if (picker) picker.addEventListener('input', () => { hex.value = picker.value; preview(); });
  if (hex) hex.addEventListener('input', () => {
    if (/^#?[0-9a-fA-F]{6}$/.test(hex.value) && picker) picker.value = hex.value.startsWith('#') ? hex.value : '#' + hex.value;
  });
  // A change still inside the debounce when the page is left is sent
  // immediately rather than lost.
  window.addEventListener('pagehide', () => {
    if (!timer) return;
    clearTimeout(timer);
    const body = new URLSearchParams(new FormData(form));
    body.set('live', '1');
    navigator.sendBeacon('/admin/look', body);
  });

  relevant();
  labels();
})();

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
        ${[['', 'Dashboard'], ['podcast', 'Podcast'], ['hosts', 'Hosts'], ['episodes', 'Shows'], ['look', 'Look'], ['stats', 'Stats'], ['account', 'Account']]
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
<link rel="stylesheet" href="/css/site.css?v=0.14.0">
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

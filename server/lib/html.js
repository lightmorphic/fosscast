'use strict';
// HTML helpers and the two page shells (public site and admin).

const fs = require('fs');
const path = require('path');

// The Lightmorphic mark in the footer. Drop an animated GIF in as
// web/img/lightmorphic-mark.gif and it is used instead of the still
// one, no code change and no deploy-time flag: an <img> animates a GIF
// by itself. Checked once at startup rather than per request.
const WEB_DIR = path.resolve(process.env.WEB_DIR || path.join(__dirname, '..', '..', 'web'));
const LM_MARK = fs.existsSync(path.join(WEB_DIR, 'img', 'lightmorphic-mark.gif'))
  ? '/img/lightmorphic-mark.gif'
  : '/img/lightmorphic-mark.webp';

// The mark in the footer's right-hand corner. An operator running
// this for other people puts their own there - a path, or a data URI
// so nothing has to be fetched from anybody else. Unset, it is
// Lightmorphic's, as it has always been.
const BRAND_MARK = (process.env.BRAND_MARK || '').trim() || LM_MARK;


function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

// Whether the page being built right now was asked for by an embedding
// shell. It travels with the request rather than through every page
// function's arguments, and AsyncLocalStorage rather than a module
// variable because the router awaits: two requests in flight would
// otherwise read each other's answer.
const { AsyncLocalStorage } = require('async_hooks');
const requestScope = new AsyncLocalStorage();

function withEmbedded(embedded, run) {
  return requestScope.run({ embedded }, run);
}

// An operator may run this for somebody else - a host, an agency, a
// club - and put their own name on the dashboard. The software is
// still FOSSCast, its source still says so and its feed still declares
// it; this is the label on the door, not a fork. Unset, it is FOSSCast.
const BRAND = (process.env.BRAND_NAME || '').trim() || 'FOSSCast';
// Where the footer mark points, and whether there is a built-in mark to
// draw at all. An operator who has put their own name on the software
// gets their name in the footer; the FOSSCast roundel belongs to
// FOSSCast, so it is drawn only when nobody has renamed anything.
const BRANDED = Boolean((process.env.BRAND_NAME || '').trim());
const BRAND_URL = (process.env.BRAND_URL || '').trim() || 'https://fosscast.org';

function isEmbedded() {
  const store = requestScope.getStore();
  return Boolean(store && store.embedded);
}

const ICONS = {
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>',
  tick: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12.5l5 5L20 6.5"/></svg>',
  eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="2.8"/></svg>',
  eyeOff: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3l18 18"/><path d="M10.6 5.9A10.7 10.7 0 0 1 12 5.5c6.5 0 10 6.5 10 6.5a17.2 17.2 0 0 1-3 3.9M6.3 6.7A16.4 16.4 0 0 0 2 12s3.5 6.5 10 6.5a10.4 10.4 0 0 0 4.2-.9"/><path d="M9.9 10.2a2.8 2.8 0 0 0 3.9 3.9"/></svg>',
  copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/></svg>',
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

// An operator may run something beside this that wants a script on
// every public page - a chat bubble, a form helper, analytics they host
// themselves. PAGE_EMBED names a same-site path to that script and it is
// loaded at the end of every public page. Unset, nothing is loaded.
const PAGE_EMBED = (() => {
  const raw = (process.env.PAGE_EMBED || '').trim();
  return raw.startsWith('/') && !raw.includes('//') ? raw : '';
})();

function publicPage({ title, description, body, image, icon, nav = [], theme = null, footer = '' }) {
  const look = theme ? require('./theme').normalise(theme) : null;
  return `<!doctype html>
<html lang="en" data-accent="deep_orange">
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
<link rel="stylesheet" href="/css/site.css?v=0.18.0">
${look ? require('./theme').styleTag(look) : ''}
</head>
<body>
<header class="top top-minimal${nav.length ? ' top-nav' : ''}">
  ${siteMenu(nav)}
</header>
<main class="wrap">
${body}
</main>
<footer class="foot site-foot">
  ${BRANDED ? '' : `<a class="foot-brand" href="${esc(BRAND_URL)}" target="_blank" rel="noopener noreferrer" translate="no">
    <svg class="mark" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3.2" fill="currentColor"/><path d="M6.3 17.7a8 8 0 0 1 0-11.4M17.7 6.3a8 8 0 0 1 0 11.4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
    <span>${esc(BRAND)}</span>
  </a>`}
  ${footer ? `<p class="foot-own">${esc(footer)}</p>` : ''}
  <a class="foot-lm" href="${esc(BRANDED ? BRAND_URL : 'https://lightmorphic.com')}" target="_blank" rel="noopener noreferrer" aria-label="${esc(BRANDED ? BRAND : 'Lightmorphic')}">
    <img src="${BRAND_MARK}" alt="${esc(BRANDED ? BRAND : 'Lightmorphic')}" width="32" height="32" loading="lazy">
  </a>
</footer>
${PAGE_EMBED ? `<script src="${esc(PAGE_EMBED)}" defer></script>` : ''}
<script>


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

// The tiny bit of client behavior the admin needs: two-click delete
// confirmation, reveal/copy for secrets. No framework, no build step.
const ADMIN_SCRIPT = `
// A chart is drawn in its own units and then stretched sideways to
// fill the card. Text stretches with it, so a label goes wide and flat
// and a figure on top of a column becomes unreadable. Measure how much
// wider than taller the stretch is and give the text the inverse.
function fitChartText() {
  document.querySelectorAll('svg.chart').forEach(function (svg) {
    var box = svg.viewBox && svg.viewBox.baseVal;
    var w = svg.clientWidth, h = svg.clientHeight;
    if (!box || !box.width || !box.height || !w || !h) return;
    svg.style.setProperty('--tx', String((h / box.height) / (w / box.width)));
  });
}
fitChartText();
addEventListener('resize', fitChartText);
// A chart inside a frame is often measured before the frame has
// settled on its width; one more pass costs nothing and catches it.
addEventListener('load', fitChartText);
`.trim() + `




document.addEventListener('change', (e) => {
  const input = e.target.closest('input[type=file][data-upload]');
  if (!input || !input.files[0]) return;
  const file = input.files[0];
  const status = document.getElementById(input.dataset.status);
  const target = document.getElementById(input.dataset.target);
  // Show the picked image right away, before the upload even finishes.
  if (input.dataset.preview && file.type.indexOf('image/') === 0) {
    const preview = document.getElementById(input.dataset.preview);
    if (preview) { preview.src = URL.createObjectURL(file); preview.style.display = 'block'; }
  }
  // A refusal explains what to change about the file, which is no use
  // whispered in gray under the picker: it gets a red panel and a
  // warning sign, so it cannot be mistaken for the progress line.
  const say = (text, failed) => {
    status.textContent = '';
    status.className = failed ? 'upload-failed' : 'hint';
    if (failed) {
      const icon = document.createElement('span');
      icon.className = 'upload-failed-icon';
      icon.setAttribute('aria-hidden', 'true');
      icon.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 3.5 1.8 21h20.4z"/><path d="M12 9.5v5"/><circle cx="12" cy="17.6" r="0.6" fill="currentColor" stroke="none"/></svg>';
      status.appendChild(icon);
      const words = document.createElement('span');
      words.textContent = text;
      status.appendChild(words);
      status.setAttribute('role', 'alert');
    } else {
      status.removeAttribute('role');
      status.textContent = text;
    }
  };

  var put = function (body, filename) {
    return fetch('/admin/api/upload?show=' + encodeURIComponent(input.dataset.show) + '&filename=' + encodeURIComponent(filename), {
      method: 'PUT', body: body,
    }).then((r) => r.json());
  };

  say('Uploading ' + file.name + ' (' + (file.size / 1048576).toFixed(1) + ' MB)...', false);
  put(file, file.name).then((d) => {
    if (!d.urlPath) {
      say(d.error || 'That upload did not work, and the server did not say why.', true);
      input.value = '';   // so the same file can be picked again after fixing it
      return;
    }
    target.value = d.urlPath;
    say('Uploaded: ' + d.name, false);
    // The hidden field changing is what the form saves; setting it in
    // script fires nothing, so the upload has to say so itself. The
    // change event on the picker fired before the file had finished
    // arriving, which saved the previous value over the new one.
    target.dispatchEvent(new Event('input', { bubbles: true }));
    return webCopy(file, Number(input.dataset.web)).then((copy) => {
      const webField = input.dataset.webTarget && document.getElementById(input.dataset.webTarget);
      if (!webField) return;
      if (!copy) { webField.value = ''; webField.dispatchEvent(new Event('input', { bubbles: true })); return; }
      return put(copy, file.name + '.web.jpg').then((w) => {
        webField.value = w.urlPath || '';
        webField.dispatchEvent(new Event('input', { bubbles: true }));
      });
    });
  }).catch(() => say('That upload did not finish - check your connection and try again.', true));
});

// The small copy the website shows. Cover art goes to the directories at
// 3000 x 3000 and nothing on a web page needs that, so a shrunk copy is
// made here, on the machine that already has the picture open, and sent
// up beside the original. The box never opens an image.
function webCopy(file, maxSide) {
  if (!maxSide || file.type.indexOf('image/') !== 0) return Promise.resolve(null);
  return createImageBitmap(file).then((bitmap) => {
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    // Already small enough: the original is the web copy, and making a
    // second one would only cost a re-encode.
    if (scale === 1) { bitmap.close(); return null; }
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.82));
  }).catch(() => null);   // an image this browser cannot open is served whole
}
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

// The transcript panel. Two jobs: an uploaded file has to be adopted by
// the episode and the page reloaded so the box shows what was uploaded,
// and - only where an instance has been given a transcribing tool - the
// tool is opened in a frame and its answer accepted.
//
// The origin check is the whole security of the second half. A page
// that takes text from whoever posts at it is a page anybody can write
// on, so the message must come from the exact origin this instance was
// configured with AND from the frame we opened ourselves. Everything
// else is dropped without a word.
(function transcript() {
  var panel = document.getElementById('transcript-panel');
  if (!panel) return;
  var action = panel.dataset.action;

  var uploaded = document.getElementById('transcriptPath');
  if (uploaded) {
    uploaded.addEventListener('input', function () {
      if (!uploaded.value) return;
      var body = new URLSearchParams();
      body.set('transcript', uploaded.value);
      body.set('live', '1');
      fetch(action, { method: 'POST', body: body })
        .then(function () { location.reload(); });
    });
  }

  var open = document.getElementById('transcribe-open');
  var slot = document.getElementById('transcribe-frame');
  var box = document.getElementById('transcriptText');
  if (!open || !slot || !panel.dataset.origin) return;

  var shut = 'Transcribe this episode';
  open.addEventListener('click', function () {
    if (slot.firstChild) {
      slot.textContent = '';
      open.textContent = shut;
      return;
    }
    var frame = document.createElement('iframe');
    frame.className = 'transcribe-frame';
    // Where to send the answer: this page's own address, whichever of
    // the instance's names it happens to be open at.
    frame.src = panel.dataset.tool
      + (panel.dataset.tool.indexOf('?') === -1 ? '?' : '&')
      + 'origin=' + encodeURIComponent(location.origin);
    frame.title = 'Transcribe this episode';
    slot.appendChild(frame);
    open.textContent = 'Close the transcriber';
  });

  window.addEventListener('message', function (e) {
    if (e.origin !== panel.dataset.origin) return;
    var frame = slot.firstChild;
    if (!frame || e.source !== frame.contentWindow) return;
    var d = e.data;
    if (!d || d.type !== 'transcript') return;
    if (d.episode !== panel.dataset.episode) return;
    if (typeof d.text !== 'string' || !d.text.trim()) return;
    box.value = d.text;
    // The autosave listens on the form, so saying so is what stores it.
    box.dispatchEvent(new Event('input', { bubbles: true }));
    box.scrollIntoView({ block: 'nearest' });
  });
})();

// The Look page: the accent color, the podcaster's own words, and a
// preview that is the real page rendered by the server from what has
// just been saved - so it cannot drift from the result.
(function look() {
  const form = document.getElementById('look-form');
  const frame = document.getElementById('look-preview');
  if (!form) return;
  const hex = document.getElementById('accent-hex');
  const picker = document.getElementById('accent-pick');

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

  form.addEventListener('input', preview);
  form.addEventListener('change', preview);

  if (picker) picker.addEventListener('input', () => { hex.value = picker.value; });
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
})();

// The embed code, where somebody who wants it is standing: the row in
// the episode list. Clicking used to open the player itself, which is
// the one thing nobody needs at that moment - they need the line of
// HTML that puts it on their own page.
(() => {
  const table = document.querySelector('table');
  if (!table || !table.querySelector('[data-embed]')) return;

  const back = document.createElement('div');
  back.className = 'modal-back';
  back.hidden = true;
  back.innerHTML = '<div class="modal-card" role="dialog" aria-modal="true" aria-label="Embed code">'
    + '<button class="modal-x" type="button" aria-label="Close">&times;</button>'
    + '<h2>Put this episode on a page</h2>'
    + '<p class="hint" id="embed-for"></p>'
    + '<div class="embed-code"><button class="btn-secondary btn-small embed-copy" type="button">Copy</button>'
    + '<pre id="embed-snip"></pre></div>'
    + '<p class="hint">Paste it into any web page. It plays there, and the '
    + 'download counts as one of yours like every other.</p></div>';
  document.body.appendChild(back);

  const snip = back.querySelector('#embed-snip');
  const forWho = back.querySelector('#embed-for');
  const copy = back.querySelector('.embed-copy');
  const close = () => { back.hidden = true; };
  back.addEventListener('click', (ev) => { if (ev.target === back || ev.target.closest('.modal-x')) close(); });
  document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && !back.hidden) close(); });

  copy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(snip.textContent);
      copy.textContent = 'Copied';
      setTimeout(() => { copy.textContent = 'Copy'; }, 1600);
    } catch {
      const range = document.createRange();
      range.selectNodeContents(snip);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    }
  });

  table.addEventListener('click', (ev) => {
    const button = ev.target.closest('[data-embed]');
    if (!button) return;
    const url = window.location.origin + '/embed/' + button.dataset.embed;
    forWho.textContent = button.dataset.embedTitle || '';
    snip.textContent = '<iframe src="' + url + '" width="100%" height="150" '
      + 'frameborder="0" scrolling="no" loading="lazy" title="Podcast episode player"></iframe>';
    back.hidden = false;
  });
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

// Some operators run the dashboard inside their own shell - a homelab
// wall, an agency panel, somebody's portal. Drawing our own top bar
// inside a page that already has navigation is chrome within chrome, so
// an embedded request gets the content and nothing around it. What is
// dropped is decoration; what carries information - page titles, the
// in-page section rails, the demo notice - stays. Signing out belongs
// to the shell as well: it owns the session the visitor thinks in.
// Hosts, Episodes, Look and Stats all need a podcast to exist, and
// before one does they redirect to the Podcast page. A menu item that
// silently returns you to where you were reads as a menu that does
// nothing, which is how Charlie found it. So until the podcast is made
// they are drawn as plain text, out of the tab order, saying why when
// you point at them.
const NEEDS_PODCAST = new Set(['hosts', 'episodes', 'look', 'stats']);

function adminPage({ title, body, active = '', authed = true, embedded = isEmbedded(), hasPodcast = true, subnav = null }) {
  // The menu is a column down the left, the same shape the studio uses:
  // the pages of the product grouped by quiet headings, then Account and
  // Help pushed to the foot of the card. A row of tabs across the top
  // ran out of room the moment there were nine of them, and a page's
  // own name had nowhere to sit.
  const GROUPS = [
    [null, [['', 'Dashboard']]],
    ['The podcast', [['podcast', 'Podcast'], ['hosts', 'Hosts'], ['episodes', 'Episodes']]],
    ['Presentation', [['look', 'Look']]],
    ['The server', [['stats', 'Stats'], ['settings', 'Settings'], ['backup', 'Backup']]],
  ];
  const FOOT = [['account', 'Account'], ['../help', 'Help']];

  const item = ([slug, label]) => {
    if (!hasPodcast && NEEDS_PODCAST.has(slug)) {
      return `<span class="admin-link waiting" aria-disabled="true" title="Create your podcast first">${label}</span>`;
    }
    // Help is the one page outside /admin, so it is the one entry that
    // names its own address rather than a tail.
    const href = slug === '../help' ? '/help' : `/admin${slug ? '/' + slug : ''}`;
    const here = slug === '../help' ? active === 'help'
      : active === (slug || 'dashboard') || (active === '' && slug === '');
    return `<a class="admin-link${here ? ' current' : ''}" href="${href}"${here ? ' aria-current="page"' : ''}>${label}</a>`;
  };

  const sidebar = authed && !embedded
    ? `<aside class="sidebar">
  <a class="wordmark" href="/admin" aria-label="${esc(BRAND)} admin">
    ${BRANDED ? '' : '<svg class="mark" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3.2" fill="currentColor"/><path d="M6.3 17.7a8 8 0 0 1 0-11.4M17.7 6.3a8 8 0 0 1 0 11.4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>'}
    <span>${esc(BRAND)} <span class="admin-tag">admin</span></span>
  </a>
  <nav class="mainmenu" aria-label="Main">
    ${GROUPS.map(([head, items]) =>
      (head ? `<p class="menu-head">${head}</p>` : '') + items.map(item).join('')).join('')}
    <div class="menu-foot">
      <hr>
      ${FOOT.map(item).join('')}
      <form method="post" action="/admin/logout" class="logout-form">
        <button class="admin-link logout" type="submit">Log out</button>
      </form>
    </div>
  </nav>
</aside>`
    : '';

  // A section's own pages, in a column of their own between the menu and
  // the work. It is always in the same place and always the same width,
  // so the menu beside it never moves and neither does anything else;
  // the work simply has more room on a page that has no section.
  // A page with no section still leaves the column empty rather than
  // taking the room back: the work is the same width on every page, so
  // nothing shuffles sideways as you move around the admin.
  const section = !authed || embedded ? ''
    : subnav && subnav.items && subnav.items.length
      ? `<nav class="subnav" aria-label="${esc(subnav.label || 'Section')}">
  <p class="subnav-title">${esc(subnav.label || '')}</p>
  ${subnav.items.map(([href, label, here]) =>
    `<a class="subnav-link${here ? ' current' : ''}" href="${esc(href)}"${here ? ' aria-current="page"' : ''}>${esc(label)}</a>`).join('')}
</nav>`
      : '<div class="subnav-gap" aria-hidden="true"></div>';

  return `<!doctype html>
<html lang="en" data-accent="deep_orange">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} - ${esc(BRAND)} admin</title>
<meta name="robots" content="noindex">
<link rel="icon" href="/img/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/css/site.css?v=0.19.0">
</head>
<body class="admin${embedded ? ' embedded' : ''}">
${process.env.DEMO_MODE === '1' ? '<div class="demo-bar">Demo instance: you can look around, but nothing can be changed.</div>' : ''}
${sidebar ? `<div class="shell">
${sidebar}
${section}
<main class="workspace" id="content">
${body}
</main>
</div>` : `<main class="wrap">
${body}
</main>`}
<script>${ADMIN_SCRIPT}</script>
</body>
</html>
`;
}

module.exports = { esc, publicPage, adminPage, ICONS, withEmbedded, isEmbedded, BRAND };

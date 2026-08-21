'use strict';
// The admin area: login, dashboard, show and episode management,
// account settings.
//
// Roles, from day one: 'admin' runs the instance and sees everything;
// 'owner' (coming next) manages only their own podcasts. That is the
// whole hosted-service layer: same code for everyone, the instance
// admin can simply create podcasts and owner accounts for others.

const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const { esc, adminPage, ICONS } = require('./html');
const auth = require('./auth');
const CATEGORIES = require('./categories');
const { probeDuration, ensureWebImage } = require('./media');
const importer = require('./import');
const { sendMail, configured: mailConfigured } = require('./mailer');
const { APPS, SUPPORT } = require('./public');

// This edition manages one podcast.
const MAX_SHOWS = 1;

// Host photos are shown at 140px on the cards and 200px on a host's own
// page, so a 640px web copy covers retina screens and keeps the hosts
// page light even with twenty faces on it.
const HOST_PHOTO_SIZE = 640;
const MAX_HOSTS = 40;

// A public demo hands its login to strangers, so demo mode makes the
// whole instance read-only: nothing can be changed, uploaded, posted
// or published, and there is nothing for anyone to spoil for the next
// visitor.
const DEMO = process.env.DEMO_MODE === '1';

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
  res.writeHead(status, {
    'Content-Type': 'text/html; charset=utf-8',
    // The dashboard must never render inside anyone's iframe.
    'Content-Security-Policy': "frame-ancestors 'none'",
    'X-Frame-Options': 'DENY',
  });
  res.end(page);
}

async function formBody(req, readBody) {
  const raw = (await readBody(req)).toString();
  return new URLSearchParams(raw);
}

function deleteButton(action, label) {
  return `<form method="post" action="${action}" class="inline-form">
    <button class="btn-icon btn-confirm danger" type="submit" data-tip="${esc(label)}" aria-label="${esc(label)}">
      <span class="icon-a">${ICONS.trash}</span><span class="icon-b">${ICONS.tick}</span>
    </button>
  </form>`;
}

function createAdminRouter(ctx) {
  // Episode permalinks must stay unique within a show: podcast apps
  // link to them from the feed.
  function uniqueEpisodeSlug(title, showId, exceptId) {
    const taken = new Set(
      ctx.store.load('episodes', [])
        .filter((e) => e.showId === showId && e.id !== exceptId)
        .map((e) => e.slug)
        .filter(Boolean),
    );
    const base = slugify(title);
    let slug = base;
    let n = 2;
    while (taken.has(slug)) { slug = `${base}-${n}`; n += 1; }
    return slug;
  }

  const { store, readBody, mediaDir, dataDir, stats } = ctx;

  function statsPage() {
    const episodeList = episodes();
    const days = stats ? stats.lastDays(30) : [];
    const max = Math.max(1, ...days.map((d) => d.count));
    const bars = days.map((d, i) => `<rect x="${i * 12}" y="${60 - (d.count / max) * 56}" width="9" height="${(d.count / max) * 56 + 1}" rx="1.5"><title>${esc(d.day)}: ${d.count}</title></rect>`).join('');
    const rows = episodeList
      .map((e) => ({ e, n: stats ? stats.total(e.id) : 0 }))
      .sort((a, b) => b.n - a.n)
      .map(({ e, n }) => `<tr><td>${esc(e.title)}</td><td>${esc(e.date)}</td><td>${n}</td></tr>`)
      .join('');
    return adminPage({
      title: 'Stats',
      active: 'stats',
      body: `<h1 class="page-title">Stats</h1>
      <p class="hint">Downloads of episodes hosted on this instance: one
      per listener per episode per day, no cookies, nothing stored about
      any individual. Externally hosted media can't be counted here.</p>
      <section class="panel">
        <h2>Last 30 days</h2>
        <svg class="stats-chart" viewBox="0 0 360 64" role="img" aria-label="Daily downloads, last 30 days">${bars}</svg>
      </section>
      <section class="panel">
        <h2>Per episode</h2>
        ${rows ? `<table><thead><tr><th>Episode</th><th>Date</th><th>Downloads</th></tr></thead><tbody>${rows}</tbody></table>` : '<p class="hint">No episodes yet.</p>'}
      </section>`,
    });
  }

  // Fill in size and duration for an episode's media, async.
  async function measure(episodeId) {
    const list = episodes();
    const episode = list.find((e) => e.id === episodeId);
    if (!episode) return;
    try {
      if (episode.mediaUrl.startsWith('/media/')) {
        const file = path.join(dataDir, decodeURIComponent(episode.mediaUrl.slice(1)));
        episode.bytes = fs.statSync(file).size;
        episode.duration = await probeDuration(file);
      } else {
        if (!episode.bytes) {
          const res = await fetch(episode.mediaUrl, { method: 'HEAD', signal: AbortSignal.timeout(10000) });
          episode.bytes = Number(res.headers.get('content-length')) || 0;
        }
        // Directories want a duration, and ffprobe reads a remote file
        // without downloading all of it.
        if (!episode.duration) episode.duration = await probeDuration(episode.mediaUrl);
      }
      store.save('episodes', list);
    } catch { /* sizes stay unknown */ }
  }
  // Make sure every uploaded image has a small, fast web copy, and record
  // its path on the show/episode. Runs at startup (to catch images that
  // were uploaded before this existed) and after any image is saved.
  async function refreshWebImages() {
    const showList = shows();
    let showsChanged = false;
    for (const show of showList) {
      for (const field of ['artwork', 'banner']) {
        if (!show[field]) { if (show[`${field}Web`]) { delete show[`${field}Web`]; showsChanged = true; } continue; }
        const web = await ensureWebImage(dataDir, show[field]);
        if (web && show[`${field}Web`] !== web) { show[`${field}Web`] = web; showsChanged = true; }
      }
      // A host photo is shown at a few hundred pixels at most, so its
      // web copy is capped smaller than cover art.
      for (const host of show.hosts || []) {
        if (!host.photo) { if (host.photoWeb) { delete host.photoWeb; showsChanged = true; } continue; }
        const web = await ensureWebImage(dataDir, host.photo, HOST_PHOTO_SIZE);
        if (web && host.photoWeb !== web) { host.photoWeb = web; showsChanged = true; }
      }
    }
    if (showsChanged) store.save('shows', showList);

    const episodeList = episodes();
    let epChanged = false;
    for (const ep of episodeList) {
      if (!ep.artwork) { if (ep.artworkWeb) { delete ep.artworkWeb; epChanged = true; } continue; }
      const web = await ensureWebImage(dataDir, ep.artwork);
      if (web && ep.artworkWeb !== web) { ep.artworkWeb = web; epChanged = true; }
    }
    if (epChanged) store.save('episodes', episodeList);
  }

  const limiter = new auth.RateLimiter();

  function settings() {
    const value = store.load('settings', () => ({}));
    // Persist on first creation, so the cookie secret and publisher
    // token stay stable across restarts rather than logging everyone
    // out and rotating the token on every deploy.
    let changed = false;
    if (!value.secret) { value.secret = crypto.randomBytes(32).toString('hex'); changed = true; }
    if (!value.publisherToken) {
      value.publisherToken = (process.env.PUBLISHER_TOKEN || '').trim() || crypto.randomBytes(32).toString('hex');
      changed = true;
    }
    if (changed) store.save('settings', value);
    return value;
  }

  function users() { return store.load('users', []); }
  function shows() { return store.load('shows', []); }
  function episodes() { return store.load('episodes', []); }

  // Bootstrap: with no users yet, ADMIN_EMAIL + ADMIN_PASSWORD from the
  // environment create the first admin account at startup.
  function bootstrap() {
    const list = users();
    const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
    const password = process.env.ADMIN_PASSWORD || '';
    if (list.length === 0 && email && password) {
      list.push({
        id: crypto.randomUUID(),
        email,
        hash: auth.hashPassword(password),
        role: 'admin',
        createdAt: new Date().toISOString(),
      });
      store.save('users', list);
      console.log(`Created admin account ${email} from environment`);
    }
  }

  function currentUser(req) {
    const token = parseCookies(req).fosscast_admin;
    const userId = auth.verifySession(token, settings().secret);
    if (!userId) return null;
    return users().find((u) => u.id === userId) || null;
  }

  function sessionCookie(req, value, maxAge) {
    const secure = isSecure(req) ? '; Secure' : '';
    return `fosscast_admin=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
  }

  function loginPage(message = '') {
    return adminPage({
      title: 'Log in',
      authed: false,
      body: `<section class="panel narrow">
        <h1 class="page-title">Log in</h1>
        ${DEMO ? `<p class="demo-creds">This is the demo: log in with
        <code>${esc(process.env.ADMIN_EMAIL || '')}</code> and
        <code>${esc(process.env.ADMIN_PASSWORD || '')}</code>.
        Everything is read-only.</p>` : ''}
        ${message ? `<p class="form-error">${esc(message)}</p>` : ''}
        <form method="post" action="/admin/login">
          <label for="email">Email</label>
          <input id="email" name="email" type="email" autocomplete="username" required>
          <label for="password">Password</label>
          <input id="password" name="password" type="password" autocomplete="current-password" required>
          <button class="btn-primary" type="submit">Log in</button>
        </form>
        ${DEMO ? '' : '<p class="hint"><a href="/admin/forgot">Forgotten your password?</a></p>'}
      </section>`,
    });
  }

  function forgotPage(message = '', sent = false) {
    return adminPage({
      title: 'Reset your password',
      authed: false,
      body: `<section class="panel narrow">
        <h1 class="page-title">Reset your password</h1>
        ${sent
          ? `<p class="form-ok">If that address has an account here, a link
             is on its way. It works once and expires in an hour.</p>
             <p><a href="/admin/login">Back to logging in</a></p>`
          : `${message ? `<p class="form-error">${esc(message)}</p>` : ''}
             <p class="hint">We will email you a link to set a new one.</p>
             <form method="post" action="/admin/forgot">
               <label for="email">Email</label>
               <input id="email" name="email" type="email" autocomplete="username" required>
               <button class="btn-primary" type="submit">Send the link</button>
             </form>
             <p class="hint"><a href="/admin/login">Back to logging in</a></p>`}
      </section>`,
    });
  }

  function resetPage(token, error = '') {
    return adminPage({
      title: 'Choose a new password',
      authed: false,
      body: `<section class="panel narrow">
        <h1 class="page-title">Choose a new password</h1>
        ${error ? `<p class="form-error">${esc(error)}</p>` : ''}
        <form method="post" action="/admin/reset">
          <input type="hidden" name="token" value="${esc(token)}">
          <label for="next">New password (12 characters or more)</label>
          <input id="next" name="next" type="password" autocomplete="new-password" minlength="12" required>
          <label for="again">New password again</label>
          <input id="again" name="again" type="password" autocomplete="new-password" minlength="12" required>
          <button class="btn-primary" type="submit">Save and log in</button>
        </form>
      </section>`,
    });
  }

  // Reset links are single use and short lived; only their hash is kept.
  function resets() { return store.load('resets', []); }
  function hashToken(token) {
    return crypto.createHash('sha256').update(String(token)).digest('hex');
  }

  function dashboard(user) {
    const show = shows()[0];
    const episodeList = episodes();
    const drafts = episodeList.filter((e) => e.draft).length;
    const hero = show
      ? `<section class="panel hero">
        <p class="status"><span aria-hidden="true">&#9679;</span> Your podcast</p>
        <h1>${esc(show.name)}</h1>
        <p class="lede">${esc(show.description || 'No description yet: add one on the podcast page.')}</p>
        <p class="hint"><a href="/shows/${esc(show.slug)}">Public page</a>
        &middot; <a href="/shows/${esc(show.slug)}/feed.xml">RSS feed</a>
        &middot; <a href="/admin/podcast">podcast</a>
        &middot; <a href="/admin/episodes">shows</a></p>
      </section>`
      : `<section class="panel hero">
        <h1>Welcome to FOSSCast</h1>
        <p class="lede">One thing to do first: create your podcast. Its
        public pages and RSS feed all follow from it, and then you add as
        many shows (episodes) as you like.</p>
        <p><a class="btn-primary" href="/admin/podcast">Create your podcast</a></p>
      </section>`;
    return adminPage({
      title: 'Dashboard',
      active: 'dashboard',
      body: `${hero}
      <section class="grid">
        <a class="panel stat" href="/admin/episodes"><span class="stat-n">${episodeList.length - drafts}</span><span>published show${episodeList.length - drafts === 1 ? '' : 's'}</span></a>
        <a class="panel stat" href="/admin/episodes"><span class="stat-n">${drafts}</span><span>draft${drafts === 1 ? '' : 's'}</span></a>
        <a class="panel stat" href="/admin/stats"><span class="stat-n">${stats ? Object.values(stats.data().totals).reduce((a, b) => a + b, 0) : 0}</span><span>downloads all time</span></a>
      </section>
      <p class="hint">Signed in as ${esc(user.email)}.</p>`,
    });
  }

  // The Shows page: the day-to-day work of adding and editing shows
  // (episodes) of the podcast.
  function episodesPage(show, notice = '') {
    const items = episodes()
      .filter((e) => e.showId === show.id)
      .sort((a, b) => (a.date < b.date ? 1 : -1));
    const nextEpisode = items.reduce((n, e) => Math.max(n, e.episode || 0), 0) + 1;
    const rows = items.map((episode) => `<tr>
      <td><a href="/admin/episodes/${esc(episode.id)}">${esc(episode.title)}</a>${episode.draft ? ' <span class="tag">draft</span>' : ''}</td>
      <td>${esc(episode.date)}</td>
      <td class="media-cell"><a href="/shows/${esc(show.slug)}/${esc(episode.slug || episode.id)}">page</a> &middot; <a href="/embed/${esc(episode.id)}">embed</a></td>
      <td class="actions">${deleteButton(`/admin/episodes/${esc(episode.id)}/delete`, 'Delete show')}</td>
    </tr>`).join('');
    return adminPage({
      title: 'Shows',
      active: 'episodes',
      body: `<h1 class="page-title">Shows</h1>
      ${notice ? `<p class="form-ok">${esc(notice)}</p>` : ''}
      <p class="hint">${esc(show.name)} &middot; <a href="/shows/${esc(show.slug)}">public page</a>
      &middot; <a href="/shows/${esc(show.slug)}/feed.xml">RSS feed</a>
      &middot; <a href="/admin/podcast">podcast details</a></p>

      <section class="panel">
        <h2>All shows</h2>
        <table>
          <caption class="sr-only">Shows of ${esc(show.name)}</caption>
          <thead><tr><th>Title</th><th>Date</th><th>Links</th><th></th></tr></thead>
          <tbody>${rows || '<tr><td colspan="4" class="hint">No shows yet.</td></tr>'}</tbody>
        </table>
      </section>

      <div class="cols">
      <div>
      <section class="panel">
        <h2>New show</h2>
        <form method="post" action="/admin/shows/${esc(show.slug)}/episodes">
          <label for="title">Title</label>
          <input id="title" name="title" required maxlength="200">
          <div class="field-row">
            <div><label for="date">Date</label>
            <input id="date" name="date" type="date" required value="${new Date().toISOString().slice(0, 10)}"></div>
            <div><label for="epnum">Episode #</label>
            <input id="epnum" name="episode" type="number" min="1" value="${nextEpisode}"></div>
            <div><label for="season">Season</label>
            <input id="season" name="season" type="number" min="1" placeholder=""></div>
            <div><label for="eptype">Type</label>
            <select id="eptype" name="type"><option value="full">Full</option><option value="trailer">Trailer</option><option value="bonus">Bonus</option></select></div>
          </div>
          <label for="mediaFile">Media file (uploads to this server)</label>
          <input id="mediaFile" type="file" accept="audio/*,video/*" data-upload data-show="${esc(show.slug)}" data-target="mediaUrl" data-status="upload-status">
          <p class="hint" id="upload-status"></p>
          <label for="mediaUrl">Or media URL (your own storage, archive.org, anywhere reachable)</label>
          <input id="mediaUrl" name="mediaUrl" maxlength="1000" placeholder="https://archive.org/download/...">
          <label for="epArt">Show cover art (optional)</label>
          <p class="hint">Square, <strong>3000 x 3000</strong> pixels. Leave it
          empty and the show uses the podcast's artwork.</p>
          <input id="epArt" type="file" accept="image/*" data-upload data-show="${esc(show.slug)}" data-target="epArtwork" data-status="epart-status" data-preview="epart-preview-img">
          <p class="hint" id="epart-status"></p>
          <input type="hidden" id="epArtwork" name="artwork" value="">
          <img class="art-preview" id="epart-preview-img" alt="" src="" style="display:none">
          <label for="epDescription">Description</label>
          <textarea id="epDescription" name="description" rows="4" maxlength="4000"></textarea>
          <label class="check-label"><input type="checkbox" name="draft" value="1" class="check"> Save as draft (hidden from the public site and feed)</label>
          <button class="btn-primary" type="submit">Publish show</button>
        </form>
      </section>
      </div>
      <div>
      <section class="panel">
        <h2>Import from an existing feed</h2>
        <p class="hint">Paste a podcast's RSS URL: every show (episode)
        comes in with its metadata (media stays at the old URLs until you
        re-upload). Missing details are filled from the feed.</p>
        <form method="post" action="/admin/shows/${esc(show.slug)}/import">
          <label for="feedUrl">Feed URL</label>
          <input id="feedUrl" name="feedUrl" type="url" required maxlength="1000" placeholder="https://example.com/feed.xml">
          <button class="btn-primary" type="submit">Import shows</button>
        </form>
      </section>
      </div>
      </div>`,
    });
  }

  // ---------- Hosts ----------
  // A podcast is its people. Each host is a record of their own -- name,
  // role, photo, and a write-up -- because the site turns them into
  // cards and a page each. Two hosts or twenty, it is the same form.
  function hostList(show) {
    return Array.isArray(show.hosts) ? show.hosts : [];
  }

  function uniqueHostSlug(name, show, keepId) {
    let base = slugify(name) || 'host';
    let slug = base;
    let n = 2;
    while (hostList(show).some((h) => h.slug === slug && h.id !== keepId)) slug = `${base}-${n++}`;
    return slug;
  }

  // Older instances kept people as "Name | role" lines. Carry them over
  // once, so nothing typed in before is lost.
  function migrateHosts() {
    const list = shows();
    let changed = false;
    for (const show of list) {
      if (Array.isArray(show.hosts)) continue;
      show.hosts = (show.persons || []).map((person) => ({
        id: crypto.randomUUID(),
        name: String(person.name || '').slice(0, 120),
        role: String(person.role || '').slice(0, 60),
        slug: slugify(person.name || '') || 'host',
        bio: '',
        photo: '',
        link: '',
      })).filter((h) => h.name);
      // Two people called the same thing would collide; make them unique.
      const seen = new Set();
      for (const host of show.hosts) {
        let slug = host.slug;
        let n = 2;
        while (seen.has(slug)) slug = `${host.slug}-${n++}`;
        host.slug = slug;
        seen.add(slug);
      }
      changed = true;
    }
    if (changed) store.save('shows', list);
  }

  function hostFields(show, host = {}, prefix = 'h') {
    const photo = host.photoWeb || host.photo || '';
    return `
      <div class="field-row">
        <div><label for="${prefix}name">Name</label>
        <input id="${prefix}name" name="name" maxlength="120" required value="${esc(host.name || '')}" placeholder="Sam Smith"></div>
        <div><label for="${prefix}role">Role</label>
        <input id="${prefix}role" name="role" maxlength="60" value="${esc(host.role || '')}" placeholder="host, co-host, producer"></div>
      </div>
      <label for="${prefix}photo">Photo</label>
      <p class="hint">A square photo works best. Anything from 400x400 up is
      plenty: it is shrunk to a fast ${HOST_PHOTO_SIZE}px copy for the site,
      and the file you upload is kept as it is.</p>
      <input id="${prefix}photo" type="file" accept="image/*" data-upload data-show="${esc(show.slug)}" data-target="${prefix}photo-url" data-status="${prefix}photo-status" data-preview="${prefix}photo-img">
      <p class="hint" id="${prefix}photo-status">${photo ? 'Uploaded.' : 'None yet, so the card shows their initials.'}</p>
      <input type="hidden" id="${prefix}photo-url" name="photo" value="${esc(host.photo || '')}">
      <img class="host-preview" id="${prefix}photo-img" alt="" src="${esc(photo)}"${photo ? '' : ' style="display:none"'}>
      <label for="${prefix}bio">About them</label>
      <p class="hint">This is the write-up on their page. A blank line
      starts a new paragraph.</p>
      <textarea id="${prefix}bio" name="bio" rows="8" maxlength="6000" placeholder="Who they are, what they do on the show, what they are into.">${esc(host.bio || '')}</textarea>
      <label for="${prefix}link">Their own link (optional)</label>
      <input id="${prefix}link" name="link" type="url" maxlength="500" value="${esc(host.link || '')}" placeholder="https://">`;
  }

  // One place where a submitted host form becomes a host record, so the
  // add and edit routes cannot drift apart.
  function applyHostForm(host, form, show) {
    host.role = String(form.get('role') || '').trim().slice(0, 60);
    host.bio = String(form.get('bio') || '').trim().slice(0, 6000);
    const link = String(form.get('link') || '').trim().slice(0, 500);
    host.link = /^https?:\/\//.test(link) ? link : '';
    const photo = String(form.get('photo') || '').trim();
    if (/^\/media\/[^/]+\/[^/]+$/.test(photo)) host.photo = photo;
    else if (!photo) { host.photo = ''; delete host.photoWeb; }
    host.slug = uniqueHostSlug(host.name, show, host.id);
    return host;
  }

  function hostsPage(show, notice = '') {
    const list = hostList(show);
    const cards = list.map((host, i) => {
      const photo = host.photoWeb || host.photo || '';
      const initials = String(host.name).trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
      return `
      <article class="panel host-row">
        ${photo
          ? `<img class="host-thumb" src="${esc(photo)}" alt="" width="72" height="72" loading="lazy">`
          : `<span class="host-thumb host-thumb-blank" aria-hidden="true">${esc(initials)}</span>`}
        <div class="host-row-text">
          <h2><a href="/admin/hosts/${esc(host.id)}">${esc(host.name)}</a></h2>
          <p class="hint">${host.role ? esc(host.role) : 'No role set'}${host.bio ? '' : ' &middot; no write-up yet'}${photo ? '' : ' &middot; no photo yet'}</p>
          ${host.bio ? `<p class="host-row-snip">${esc(host.bio.slice(0, 160))}${host.bio.length > 160 ? '&hellip;' : ''}</p>` : ''}
        </div>
        <div class="host-row-actions">
          <form method="post" action="/admin/hosts/${esc(host.id)}/move" class="inline-form">
            <input type="hidden" name="dir" value="up">
            <button class="btn-icon" type="submit" data-tip="Move up" aria-label="Move up"${i === 0 ? ' disabled' : ''}>&uarr;</button>
          </form>
          <form method="post" action="/admin/hosts/${esc(host.id)}/move" class="inline-form">
            <input type="hidden" name="dir" value="down">
            <button class="btn-icon" type="submit" data-tip="Move down" aria-label="Move down"${i === list.length - 1 ? ' disabled' : ''}>&darr;</button>
          </form>
          <a class="btn-secondary btn-small" href="/admin/hosts/${esc(host.id)}">Edit</a>
        </div>
      </article>`;
    }).join('');

    return adminPage({
      title: 'Hosts',
      active: 'hosts',
      body: `<h1 class="page-title">Hosts</h1>
      ${notice ? `<p class="form-ok">${esc(notice)}</p>` : ''}
      <p class="hint">Everyone who appears on ${esc(show.name)}. Each one gets
      a card on <a href="/hosts">the hosts page</a> and a page of their own,
      and they travel in the feed as well, so apps can show who is on the
      show. Drag-free ordering: the arrows set the order they appear in.</p>

      ${list.length ? `<section class="host-rows">${cards}</section>`
        : `<section class="panel"><p class="hint">No hosts yet. Add the first
          one below and a Hosts page appears on your site.</p></section>`}

      ${list.length >= MAX_HOSTS ? `<section class="panel"><p class="hint">That
        is ${MAX_HOSTS} hosts, which is the limit.</p></section>` : `
      <form method="post" action="/admin/hosts">
        <section class="panel" id="sec-add-host">
          <h2>Add a host</h2>
          ${hostFields(show, {}, 'new')}
          <p><button class="btn-primary" type="submit">Add host</button></p>
        </section>
      </form>`}`,
    });
  }

  function hostEditPage(show, host, notice = '') {
    return adminPage({
      title: host.name,
      active: 'hosts',
      body: `<p class="hint"><a href="/admin/hosts">&larr; Hosts</a></p>
      <h1 class="page-title">${esc(host.name)}</h1>
      ${notice ? `<p class="form-ok">${esc(notice)}</p>` : ''}
      <p class="hint"><a href="/hosts/${esc(host.slug || host.id)}">their page</a>
      on the site</p>
      <form method="post" action="/admin/hosts/${esc(host.id)}">
        <section class="panel">
          <h2>Details</h2>
          ${hostFields(show, host, 'e')}
          <p><button class="btn-primary" type="submit">Save host</button></p>
        </section>
      </form>
      <div class="page-actions">
        ${deleteButton(`/admin/hosts/${esc(host.id)}/delete`, `Remove ${host.name}`)}
      </div>`,
    });
  }

  // The Podcast page: everything about the overall podcast on one page.
  // The instance hosts a single podcast; its details are filled in once
  // and rarely change, so they live here, apart from the shows
  // (episodes). The feed check lives here too, since it is about the
  // podcast as a whole.
  function podcastPage(show, notice = '') {
    const items = episodes().filter((e) => e.showId === show.id);
    const checks = feedChecks(show, items);
    const failed = checks.filter(([, ok]) => !ok);
    return adminPage({
      title: 'Podcast',
      active: 'podcast',
      body: `<h1 class="page-title">Podcast</h1>
      ${notice ? `<p class="form-ok">${esc(notice)}</p>` : ''}
      <p class="hint">${esc(show.name)} &middot; <a href="/shows/${esc(show.slug)}">public page</a>
      &middot; <a href="/shows/${esc(show.slug)}/feed.xml">RSS feed</a>
      &middot; <a href="/admin/episodes">shows</a></p>

      <section class="panel">
        <h2>Feed check</h2>
        <p class="hint">What Apple, Spotify and the rest look for before
        they accept a podcast. ${failed.length ? `<strong>${failed.length} still to sort out.</strong>` : 'All good.'}</p>
        <ul class="checks">
          ${checks.map(([label, ok, fix]) => `<li class="${ok ? 'check-ok' : 'check-bad'}">
            <span aria-hidden="true">${ok ? '&#10003;' : '!'}</span>
            <span>${esc(label)}${ok ? '' : ` &mdash; ${esc(fix)}`}</span>
          </li>`).join('')}
        </ul>
      </section>

      <form method="post" action="/admin/shows/${esc(show.slug)}/settings">
        <section class="panel" id="sec-basics">
          <h2>Basics</h2>
          <label for="sname">Name</label>
          <input id="sname" name="name" required maxlength="120" value="${esc(show.name)}">
          <label for="sdesc">Description</label>
          <textarea id="sdesc" name="description" rows="3" maxlength="2000">${esc(show.description)}</textarea>
          <div class="field-row">
            <div><label for="sauthor">Author</label>
            <input id="sauthor" name="author" maxlength="120" value="${esc(show.author || '')}"></div>
            <div><label for="slang">Language</label>
            <input id="slang" name="language" maxlength="10" value="${esc(show.language || 'en')}"></div>
            <div><label for="scat">Category</label>
            <select id="scat" name="category">${CATEGORIES.map((c) => `<option${show.category === c ? ' selected' : ''}>${esc(c)}</option>`).join('')}</select></div>
          </div>
          <div class="field-row">
            <div><label for="stype">Type</label>
            <select id="stype" name="serial">
              <option value="">Episodic (newest first, the usual)</option>
              <option value="1"${show.serial ? ' selected' : ''}>Serial (meant to be heard in order)</option>
            </select></div>
            <div><label for="scopyright">Copyright (optional)</label>
            <input id="scopyright" name="copyright" maxlength="200" value="${esc(show.copyright || '')}" placeholder="2026 Your Name"></div>
          </div>
        </section>

        <section class="panel" id="sec-ownership">
          <h2>Ownership</h2>
          <div class="field-row">
            <div><label for="sowner">Owner name</label>
            <input id="sowner" name="ownerName" maxlength="120" value="${esc(show.ownerName || '')}"></div>
            <div><label for="sowneremail">Owner email</label>
            <input id="sowneremail" name="ownerEmail" type="email" maxlength="200" value="${esc(show.ownerEmail || '')}"></div>
          </div>
          <p class="hint">Directories require an owner email in the feed
          and use it to verify you own the show: Spotify and Apple both
          reject a feed without one. It is published in the feed, so use an
          address you are happy to make public. It does not have to be the
          address you log in with.</p>
          <label class="check-label"><input type="checkbox" name="explicit" value="1" class="check"${show.explicit ? ' checked' : ''}> Explicit content</label>
          <label class="check-label"><input type="checkbox" name="locked" value="1" class="check"${show.locked ? ' checked' : ''}> Lock the feed (tells other hosts not to import it without permission)</label>
        </section>

        <section class="panel" id="sec-artwork">
          <h2>Artwork &amp; banner</h2>
          <label for="sart">Podcast artwork</label>
          <p class="hint">Square, <strong>3000 x 3000</strong> pixels (Apple
          accepts 1400 x 1400 upwards). JPG or PNG. The server makes a small
          fast copy for the website by itself.</p>
          <input id="sart" type="file" accept="image/*" data-upload data-show="${esc(show.slug)}" data-target="artwork" data-status="art-status" data-preview="art-preview-img">
          <p class="hint" id="art-status">${show.artwork ? 'Uploaded.' : 'None yet. Directories will not list a show without it.'}</p>
          <input type="hidden" id="artwork" name="artwork" value="${esc(show.artwork || '')}">
          <img class="art-preview" id="art-preview-img" alt="" src="${show.artwork ? esc(show.artworkWeb || show.artwork) : ''}"${show.artwork ? '' : ' style="display:none"'}>
          <label for="sbanner">Website banner</label>
          <p class="hint">Wide strip across the top of your site.
          <strong>2560 x 640</strong> pixels (4:1) keeps it sharp; anything
          from 1920 x 480 works. Keep the important part central: the edges
          crop on phones.</p>
          <input id="sbanner" type="file" accept="image/*" data-upload data-show="${esc(show.slug)}" data-target="banner" data-status="banner-status" data-preview="banner-preview-img">
          <p class="hint" id="banner-status">${show.banner ? 'Uploaded.' : 'None yet, so the page starts at the title.'}</p>
          <input type="hidden" id="banner" name="banner" value="${esc(show.banner || '')}">
          <img class="banner-preview" id="banner-preview-img" alt="" src="${show.banner ? esc(show.bannerWeb || show.banner) : ''}"${show.banner ? '' : ' style="display:none"'}>
        </section>

        <section class="panel" id="sec-people">
          <h2>Funding</h2>
          <div class="field-row">
            <div><label for="sfundurl">Funding URL (donations, memberships)</label>
            <input id="sfundurl" name="fundingUrl" type="url" maxlength="500" value="${esc(show.funding?.url || '')}"></div>
            <div><label for="sfundlabel">Funding label</label>
            <input id="sfundlabel" name="fundingLabel" maxlength="120" value="${esc(show.funding?.label || '')}" placeholder="Support the show"></div>
          </div>
        </section>

        <section class="panel" id="sec-support">
          <h2>Memberships &amp; tips</h2>
          <p class="hint">The services listeners already use to back a
          podcast. Paste your page on each one and its button appears on
          your show page, and goes into the feed as a funding link so apps
          can offer it too. No account yet? The sign-up link beside each
          one takes you straight there.</p>
          ${SUPPORT.map(([key, label, signup, placeholder]) => `<label for="sup-${key}">${esc(label)}
          <a class="hint-link" href="${esc(signup)}" target="_blank" rel="noopener noreferrer">sign up</a></label>
          <input id="sup-${key}" name="support_${key}" type="url" maxlength="500" value="${esc((show.support || {})[key] || '')}" placeholder="${esc(placeholder)}">`).join('')}
        </section>

        <section class="panel" id="sec-hosts">
          <h2>Hosts</h2>
          <p class="hint">${hostList(show).length
            ? `${hostList(show).length} host${hostList(show).length === 1 ? '' : 's'}: ${esc(hostList(show).map((h) => h.name).join(', '))}.`
            : 'Nobody listed yet.'} Each host has a photo and a write-up of
          their own, and they get a page on the site.</p>
          <p><a class="btn-secondary" href="/admin/hosts">${hostList(show).length ? 'Manage hosts' : 'Add the hosts'}</a></p>
        </section>

        <section class="panel" id="sec-listen">
          <h2>Listen on</h2>
          <p class="hint">Paste the address of your show on each platform
          and its button appears on your pages. You get these after
          submitting your RSS feed to them, which usually takes a few days.
          RSS is always offered, so listeners never wait on an approval.</p>
          ${APPS.map(([key, label]) => `<label for="link-${key}">${esc(label)}</label>
          <input id="link-${key}" name="link_${key}" type="url" maxlength="500" value="${esc((show.links || {})[key] || '')}" placeholder="https://">`).join('')}
        </section>

        <section class="panel" id="sec-guid">
          <h2>Moving from another host</h2>
          <label for="sguid">Feed GUID</label>
          <p class="hint">Only when moving from another host. Directories
          identify a podcast by this rather than by its address. Copy the
          <code>podcast:guid</code> from your old feed and the move is
          treated as the same show. Importing an old feed fills this in by
          itself. Leave it empty for a new podcast.</p>
          <input id="sguid" name="podcastGuid" maxlength="60" value="${esc(show.podcastGuid || '')}" placeholder="">
        </section>

        <button class="btn-primary" type="submit">Save details</button>
      </form>`,
    });
  }

  // Shown when no podcast exists yet: the one-time create form.
  function createPodcastPage() {
    return adminPage({
      title: 'Create your podcast',
      active: 'podcast',
      body: `<section class="panel hero">
        <h1>Create your podcast</h1>
        <p class="lede">Give it a name and a description to begin. You can
        add artwork, a banner and everything else straight after.</p>
      </section>
      <section class="panel">
        <form method="post" action="/admin/shows">
          <label for="name">Name</label>
          <input id="name" name="name" required maxlength="120">
          <label for="description">Description</label>
          <textarea id="description" name="description" rows="4" maxlength="2000"></textarea>
          <button class="btn-primary" type="submit">Create podcast</button>
        </form>
      </section>`,
    });
  }

  // What the directories insist on, checked against what is actually
  // in the show right now.
  function feedChecks(show, showEpisodes) {
    const published = showEpisodes.filter((e) => !e.draft);
    return [
      ['Title', !!show.name, 'Set the podcast name.'],
      ['Description', (show.description || '').length > 20, 'Write a description of a sentence or two.'],
      ['Artwork', !!show.artwork, 'Upload square artwork, 3000 x 3000.'],
      ['Owner email', !!show.ownerEmail, 'Add an owner email: Spotify and Apple reject feeds without one.'],
      ['Category', !!show.category, 'Choose a category.'],
      ['Language', !!show.language, 'Set the language.'],
      ['Author', !!show.author, 'Add an author name.'],
      ['A published show', published.length > 0, 'Publish at least one show before submitting.'],
      ['File sizes known', published.every((e) => Number(e.bytes) > 0),
        'A show has no file size in the feed. Re-save it so the size can be read.'],
      ['Durations known', published.every((e) => Number(e.duration) > 0),
        'A show has no duration. Re-save it so the length can be read.'],
    ];
  }


  function episodeEditPage(episode, show) {
    return adminPage({
      title: episode.title,
      active: 'episodes',
      body: `<h1 class="page-title">Edit show</h1>
      <p class="hint"><a href="/admin/episodes">&larr; Shows</a></p>
      <section class="panel">
        <form method="post" action="/admin/episodes/${esc(episode.id)}">
          <label for="title">Title</label>
          <input id="title" name="title" required maxlength="200" value="${esc(episode.title)}">
          <div class="field-row">
            <div><label for="date">Date</label>
            <input id="date" name="date" type="date" required value="${esc(episode.date)}"></div>
            <div><label for="epnum">Episode #</label>
            <input id="epnum" name="episode" type="number" min="1" value="${episode.episode || ''}"></div>
            <div><label for="season">Season</label>
            <input id="season" name="season" type="number" min="1" value="${episode.season || ''}"></div>
            <div><label for="eptype">Type</label>
            <select id="eptype" name="type">${['full', 'trailer', 'bonus'].map((t) => `<option value="${t}"${(episode.type || 'full') === t ? ' selected' : ''}>${t[0].toUpperCase()}${t.slice(1)}</option>`).join('')}</select></div>
          </div>
          <label for="mediaUrl">Media URL</label>
          <input id="mediaUrl" name="mediaUrl" maxlength="1000" value="${esc(episode.mediaUrl)}">
          <label for="epDescription">Description</label>
          <textarea id="epDescription" name="description" rows="4" maxlength="4000">${esc(episode.description)}</textarea>
          <label for="epArt">Show cover art (optional)</label>
          <p class="hint">Square, <strong>3000 x 3000</strong> pixels. Empty
          means the podcast's artwork is used.</p>
          <input id="epArt" type="file" accept="image/*" data-upload data-show="${esc(show.slug)}" data-target="epArtwork" data-status="epart-status">
          <p class="hint" id="epart-status">${episode.artwork ? `Current: ${esc(episode.artwork)}` : "Using the podcast's artwork."}</p>
          <input type="hidden" id="epArtwork" name="artwork" value="${esc(episode.artwork || '')}">
          ${episode.artwork ? `<img class="art-preview" src="${esc(episode.artwork)}" alt="Episode artwork" width="120" height="120">` : ''}
          <label for="transcriptFile">Transcript (.vtt, .srt, .txt or .json; podcast apps show it)</label>
          <input id="transcriptFile" type="file" accept=".vtt,.srt,.txt,.json,.html" data-upload data-show="${esc(show.slug)}" data-target="transcript" data-status="tr-status">
          <p class="hint" id="tr-status">${episode.transcript ? `Current: ${esc(episode.transcript)}` : 'None yet.'}</p>
          <input type="hidden" id="transcript" name="transcript" value="${esc(episode.transcript || '')}">
          <label for="chapters">Chapters (one per line: HH:MM:SS Title)</label>
          <textarea id="chapters" name="chapters" rows="5" placeholder="00:00 Intro&#10;05:30 The main topic">${esc(formatChapters(episode.chapters))}</textarea>
          <label class="check-label"><input type="checkbox" name="draft" value="1" class="check"${episode.draft ? ' checked' : ''}> Draft (hidden from the public site and feed)</label>
          <button class="btn-primary" type="submit">Save show</button>
        </form>
      </section>`,
    });
  }

  function accountPage(user, message = '', error = '') {
    return adminPage({
      title: 'Account',
      active: 'account',
      body: `<h1 class="page-title">Account</h1>
      <section class="panel narrow">
        <h2>Change password</h2>
        <p class="hint">Signed in as ${esc(user.email)}.</p>
        ${message ? `<p class="form-ok">${esc(message)}</p>` : ''}
        ${error ? `<p class="form-error">${esc(error)}</p>` : ''}
        <form method="post" action="/admin/account/password">
          <label for="current">Current password</label>
          <input id="current" name="current" type="password" autocomplete="current-password" required>
          <label for="next">New password (12 characters or more)</label>
          <input id="next" name="next" type="password" autocomplete="new-password" minlength="12" required>
          <label for="again">New password again</label>
          <input id="again" name="again" type="password" autocomplete="new-password" minlength="12" required>
          <button class="btn-primary" type="submit">Change password</button>
        </form>
      </section>`,
    });
  }

  // Returns true when the request was handled.
  async function handle(req, res, url) {
    const p = url.pathname;
    if (!p.startsWith('/admin')) return false;
    const domain = (process.env.DOMAIN || 'localhost').trim();

    // One-time sign-in link (from the fleet panel's auto-login). The
    // token is minted on the box and used once; consuming it burns the
    // nonce so the link cannot be replayed.
    if (p === '/admin/session' && req.method === 'GET') {
      const parsed = auth.verifyLoginLink(url.searchParams.get('token') || '', settings().secret);
      const used = store.load('login-nonces', []).filter((n) => n.exp > Date.now());
      if (!parsed || used.some((n) => n.jti === parsed.jti) || !users().some((u) => u.id === parsed.userId)) {
        html(res, loginPage('That sign-in link has expired or has already been used.'), 400);
        return true;
      }
      used.push({ jti: parsed.jti, exp: Date.now() + 20 * 60 * 1000 });
      store.save('login-nonces', used);
      const session = auth.signSession(parsed.userId, settings().secret);
      redirect(res, '/admin', { 'Set-Cookie': sessionCookie(req, session, 7 * 24 * 3600) });
      return true;
    }

    if (p === '/admin/login') {
      if (req.method === 'GET') {
        if (currentUser(req)) { redirect(res, '/admin'); return true; }
        html(res, loginPage());
        return true;
      }
      if (req.method === 'POST') {
        const ip = clientIp(req);
        if (limiter.blocked(ip)) {
          html(res, loginPage('Too many attempts. Try again later.'), 429);
          return true;
        }
        const form = await formBody(req, readBody);
        const email = String(form.get('email') || '').trim().toLowerCase();
        const password = String(form.get('password') || '');
        const user = users().find((u) => u.email === email);
        if (!user || !auth.verifyPassword(password, user.hash)) {
          limiter.fail(ip);
          html(res, loginPage('Wrong email or password.'), 401);
          return true;
        }
        limiter.ok(ip);
        const token = auth.signSession(user.id, settings().secret);
        redirect(res, '/admin', { 'Set-Cookie': sessionCookie(req, token, 7 * 24 * 3600) });
        return true;
      }
    }

    if (p === '/admin/forgot' && !DEMO) {
      if (req.method === 'GET') { html(res, forgotPage()); return true; }
      if (req.method === 'POST') {
        const ip = clientIp(req);
        if (limiter.blocked(ip)) { html(res, forgotPage('Too many attempts. Try again later.'), 429); return true; }
        limiter.fail(ip);
        const form = await formBody(req, readBody);
        const email = String(form.get('email') || '').trim().toLowerCase();
        const user = users().find((u) => u.email === email);
        if (user && mailConfigured()) {
          const token = crypto.randomBytes(32).toString('base64url');
          const list = resets().filter((r) => r.userId !== user.id);
          list.push({
            userId: user.id,
            tokenHash: hashToken(token),
            expires: Date.now() + 3600 * 1000,
          });
          store.save('resets', list);
          const link = `https://${domain}/admin/reset?token=${encodeURIComponent(token)}`;
          await sendMail({
            to: user.email,
            subject: 'Reset your dashboard password',
            text: `Someone asked to reset the password for your podcast dashboard at ${domain}.\n\nOpen this link to choose a new one:\n${link}\n\nIt works once and expires in an hour. If this was not you, ignore this email: nothing has changed.\n`,
          });
        }
        // The same answer either way: never reveal who has an account.
        html(res, forgotPage('', true));
        return true;
      }
    }

    if (p === '/admin/reset' && !DEMO) {
      const token = req.method === 'GET'
        ? (url.searchParams.get('token') || '')
        : '';
      if (req.method === 'GET') {
        const entry = resets().find((r) => r.tokenHash === hashToken(token) && r.expires > Date.now());
        if (!entry) { html(res, forgotPage('That link has expired or has already been used.'), 400); return true; }
        html(res, resetPage(token));
        return true;
      }
      if (req.method === 'POST') {
        const form = await formBody(req, readBody);
        const given = String(form.get('token') || '');
        const next = String(form.get('next') || '');
        const entry = resets().find((r) => r.tokenHash === hashToken(given) && r.expires > Date.now());
        if (!entry) { html(res, forgotPage('That link has expired or has already been used.'), 400); return true; }
        if (next.length < 12 || next !== String(form.get('again') || '')) {
          html(res, resetPage(given, 'The passwords must match and be at least 12 characters.'), 400);
          return true;
        }
        const list = users();
        const user = list.find((u) => u.id === entry.userId);
        if (!user) { html(res, forgotPage('That account no longer exists.'), 400); return true; }
        user.hash = auth.hashPassword(next);
        store.save('users', list);
        store.save('resets', resets().filter((r) => r.userId !== entry.userId));
        const session = auth.signSession(user.id, settings().secret);
        redirect(res, '/admin', { 'Set-Cookie': sessionCookie(req, session, 7 * 24 * 3600) });
        return true;
      }
    }

    if (p === '/admin/logout' && req.method === 'POST') {
      redirect(res, '/admin/login', { 'Set-Cookie': sessionCookie(req, '', 0) });
      return true;
    }

    // Everything below needs a signed-in user.
    const user = currentUser(req);
    if (!user) { redirect(res, '/admin/login'); return true; }

    // Read-only demo: every state-changing request stops here.
    if (DEMO && req.method !== 'GET' && p !== '/admin/logout') {
      html(res, adminPage({
        title: 'Demo mode',
        body: `<section class="panel narrow">
          <h1 class="page-title">Nothing to see broken here</h1>
          <p>This is a demonstration instance, so it is read-only:
          settings, episodes, uploads and moderation are all disabled.
          Everything else works exactly as it would on your own
          instance.</p>
          <p><a class="btn-primary" href="/admin">Back to the dashboard</a></p>
        </section>`,
      }), 403);
      return true;
    }

    if (p === '/admin' && req.method === 'GET') { html(res, dashboard(user)); return true; }
    if (p === '/admin/episodes' && req.method === 'GET') {
      const show = shows()[0];
      if (!show) { redirect(res, '/admin/podcast'); return true; }
      html(res, episodesPage(show));
      return true;
    }
    if (p === '/admin/podcast' && req.method === 'GET') {
      const show = shows()[0];
      html(res, show ? podcastPage(show) : createPodcastPage());
      return true;
    }
    // The edit form now lives on the podcast page itself.
    if (p === '/admin/podcast/edit' && req.method === 'GET') { redirect(res, '/admin/podcast'); return true; }
    // Old links keep working.
    if (p === '/admin/shows' && req.method === 'GET') { redirect(res, '/admin/episodes'); return true; }
    // Hosts: the people on the podcast, each with a photo and a write-up.
    if (p === '/admin/hosts' && req.method === 'GET') {
      const show = shows()[0];
      if (!show) { redirect(res, '/admin/podcast'); return true; }
      html(res, hostsPage(show));
      return true;
    }
    if (p === '/admin/hosts' && req.method === 'POST') {
      const show = shows()[0];
      if (!show) { redirect(res, '/admin/podcast'); return true; }
      const form = await formBody(req, readBody);
      const list = shows();
      const entry = list.find((s) => s.id === show.id);
      if (!Array.isArray(entry.hosts)) entry.hosts = [];
      const name = String(form.get('name') || '').trim().slice(0, 120);
      if (name && entry.hosts.length < MAX_HOSTS) {
        const host = { id: crypto.randomUUID(), name };
        applyHostForm(host, form, entry);
        entry.hosts.push(host);
        store.save('shows', list);
        refreshWebImages().catch(() => {});
      }
      redirect(res, '/admin/hosts');
      return true;
    }
    const hostMatch = p.match(/^\/admin\/hosts\/([a-f0-9-]+)(\/delete|\/move)?$/);
    if (hostMatch) {
      const show = shows()[0];
      if (!show) { redirect(res, '/admin/podcast'); return true; }
      const list = shows();
      const entry = list.find((s) => s.id === show.id);
      const hosts = Array.isArray(entry.hosts) ? entry.hosts : (entry.hosts = []);
      const index = hosts.findIndex((h) => h.id === hostMatch[1]);
      if (index < 0) { redirect(res, '/admin/hosts'); return true; }
      const host = hosts[index];

      if (!hostMatch[2] && req.method === 'GET') { html(res, hostEditPage(entry, host)); return true; }
      if (hostMatch[2] === '/delete' && req.method === 'POST') {
        hosts.splice(index, 1);
        store.save('shows', list);
        redirect(res, '/admin/hosts');
        return true;
      }
      if (hostMatch[2] === '/move' && req.method === 'POST') {
        const form = await formBody(req, readBody);
        const to = form.get('dir') === 'up' ? index - 1 : index + 1;
        if (to >= 0 && to < hosts.length) {
          hosts.splice(to, 0, hosts.splice(index, 1)[0]);
          store.save('shows', list);
        }
        redirect(res, '/admin/hosts');
        return true;
      }
      if (!hostMatch[2] && req.method === 'POST') {
        const form = await formBody(req, readBody);
        const name = String(form.get('name') || '').trim().slice(0, 120);
        if (name) host.name = name;
        applyHostForm(host, form, entry);
        store.save('shows', list);
        refreshWebImages().catch(() => {});
        redirect(res, '/admin/hosts');
        return true;
      }
    }

    if (p === '/admin/stats' && req.method === 'GET') { html(res, statsPage()); return true; }
    if (p === '/admin/account' && req.method === 'GET') { html(res, accountPage(user)); return true; }

    if (p === '/admin/shows' && req.method === 'POST') {
      const form = await formBody(req, readBody);
      const name = String(form.get('name') || '').trim().slice(0, 120);
      const description = String(form.get('description') || '').trim().slice(0, 2000);
      if (!name) { redirect(res, '/admin/podcast'); return true; }
      const list = shows();
      if (list.length >= MAX_SHOWS) { redirect(res, '/admin/podcast'); return true; }
      let slug = slugify(name);
      while (list.some((s) => s.slug === slug)) slug += '-2';
      list.push({
        id: crypto.randomUUID(),
        slug,
        name,
        description,
        ownerId: user.id,
        createdAt: new Date().toISOString(),
      });
      store.save('shows', list);
      redirect(res, '/admin/podcast');
      return true;
    }

    if (p === '/admin/account/password' && req.method === 'POST') {
      const form = await formBody(req, readBody);
      const current = String(form.get('current') || '');
      const next = String(form.get('next') || '');
      const again = String(form.get('again') || '');
      if (!auth.verifyPassword(current, user.hash)) {
        html(res, accountPage(user, '', 'Current password is wrong.'), 400);
        return true;
      }
      if (next.length < 12 || next !== again) {
        html(res, accountPage(user, '', 'New passwords must match and be at least 12 characters.'), 400);
        return true;
      }
      const list = users();
      const entry = list.find((u) => u.id === user.id);
      entry.hash = auth.hashPassword(next);
      store.save('users', list);
      html(res, accountPage(user, 'Password changed.'));
      return true;
    }

    const showMatch = p.match(/^\/admin\/shows\/([a-z0-9-]+)(\/episodes|\/delete|\/settings|\/import)?$/);
    if (showMatch) {
      const show = shows().find((s) => s.slug === showMatch[1]);
      if (!show) { html(res, adminPage({ title: 'Not found', body: '<p>Show not found.</p>' }), 404); return true; }
      const action = showMatch[2] || '';

      if (!action && req.method === 'GET') { redirect(res, '/admin/episodes'); return true; }

      if (action === '/delete' && req.method === 'POST') {
        store.save('shows', shows().filter((s) => s.id !== show.id));
        store.save('episodes', episodes().filter((e) => e.showId !== show.id));
        redirect(res, '/admin/podcast');
        return true;
      }

      if (action === '/episodes' && req.method === 'POST') {
        const form = await formBody(req, readBody);
        const title = String(form.get('title') || '').trim().slice(0, 200);
        const date = String(form.get('date') || '').trim();
        const mediaUrl = String(form.get('mediaUrl') || '').trim().slice(0, 1000);
        const description = String(form.get('description') || '').trim().slice(0, 4000);
        const validDate = /^\d{4}-\d{2}-\d{2}$/.test(date);
        const validUrl = /^https?:\/\//.test(mediaUrl) || /^\/media\/[^/]+\/[^/]+$/.test(mediaUrl);
        if (title && validDate && validUrl) {
          const list = episodes();
          const episode = {
            id: crypto.randomUUID(),
            showId: show.id,
            title,
            date,
            mediaUrl,
            description,
            episode: Number(form.get('episode')) || null,
            season: Number(form.get('season')) || null,
            type: ['full', 'trailer', 'bonus'].includes(form.get('type')) ? form.get('type') : 'full',
            slug: uniqueEpisodeSlug(title, show.id),
            artwork: /^\/media\/[^/]+\/[^/]+$/.test(String(form.get('artwork') || '').trim())
              ? String(form.get('artwork')).trim() : undefined,
            draft: form.get('draft') === '1',
            createdAt: new Date().toISOString(),
          };
          list.push(episode);
          store.save('episodes', list);
          measure(episode.id);
          refreshWebImages().catch(() => {});
        }
        redirect(res, '/admin/episodes');
        return true;
      }

      if (action === '/settings' && req.method === 'POST') {
        const form = await formBody(req, readBody);
        const list = shows();
        const entry = list.find((s) => s.id === show.id);
        entry.name = String(form.get('name') || entry.name).trim().slice(0, 120) || entry.name;
        entry.description = String(form.get('description') || '').trim().slice(0, 2000);
        entry.author = String(form.get('author') || '').trim().slice(0, 120);
        entry.language = String(form.get('language') || 'en').trim().slice(0, 10);
        entry.category = CATEGORIES.includes(form.get('category')) ? form.get('category') : entry.category;
        entry.explicit = form.get('explicit') === '1';
        entry.ownerName = String(form.get('ownerName') || '').trim().slice(0, 120);
        const ownerEmail = String(form.get('ownerEmail') || '').trim().slice(0, 200);
        entry.ownerEmail = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(ownerEmail) ? ownerEmail : '';
        entry.serial = form.get('serial') === '1';
        entry.copyright = String(form.get('copyright') || '').trim().slice(0, 200);
        const guid = String(form.get('podcastGuid') || '').trim().slice(0, 60);
        entry.podcastGuid = /^[a-zA-Z0-9-]{8,}$/.test(guid) ? guid : undefined;
        entry.locked = form.get('locked') === '1';
        entry.lockedOwner = user.email;
        const fundingUrl = String(form.get('fundingUrl') || '').trim().slice(0, 500);
        entry.funding = /^https?:\/\//.test(fundingUrl)
          ? { url: fundingUrl, label: String(form.get('fundingLabel') || '').trim().slice(0, 120) }
          : null;
        // hosts have their own page and form now
        const artwork = String(form.get('artwork') || '').trim();
        if (/^\/media\/[^/]+\/[^/]+$/.test(artwork)) entry.artwork = artwork;
        const banner = String(form.get('banner') || '').trim();
        if (/^\/media\/[^/]+\/[^/]+$/.test(banner)) entry.banner = banner;
        // web copies of the new artwork/banner are made just after save
        entry.support = {};
        for (const [key] of SUPPORT) {
          const url = String(form.get(`support_${key}`) || '').trim().slice(0, 500);
          if (/^https?:\/\//.test(url)) entry.support[key] = url;
        }
        entry.links = {};
        for (const [key] of APPS) {
          const url = String(form.get(`link_${key}`) || '').trim().slice(0, 500);
          if (/^https?:\/\//.test(url)) entry.links[key] = url;
        }
        store.save('shows', list);
        refreshWebImages().catch(() => {});
        redirect(res, '/admin/podcast');
        return true;
      }

      if (action === '/import' && req.method === 'POST') {
        const form = await formBody(req, readBody);
        const feedUrl = String(form.get('feedUrl') || '').trim();
        let imported = 0;
        try {
          const { channel, items } = await importer.fetchFeed(feedUrl);
          const list = episodes();
          const existing = new Set(list.map((e) => e.guid || e.mediaUrl));
          for (const item of items) {
            if (existing.has(item.guid) || existing.has(item.mediaUrl)) continue;
            list.push({
              id: crypto.randomUUID(),
              showId: show.id,
              title: item.title,
              date: item.date,
              mediaUrl: item.mediaUrl,
              bytes: item.bytes,
              duration: importer.parseDuration(item.durationRaw),
              description: item.description.slice(0, 4000),
              episode: item.episode,
              season: item.season,
              type: 'full',
              draft: false,
              guid: item.guid || undefined,
              createdAt: new Date().toISOString(),
            });
            imported += 1;
          }
          store.save('episodes', list);
          const showList = shows();
          const entry = showList.find((s) => s.id === show.id);
          if (!entry.author && channel.author) entry.author = channel.author;
          if (!entry.language && channel.language) entry.language = channel.language.slice(0, 10);
          if (!entry.category && CATEGORIES.includes(channel.category)) entry.category = channel.category;
          // The old feed's identity moves with the episodes.
          if (!entry.podcastGuid && channel.podcastGuid) entry.podcastGuid = channel.podcastGuid;
          store.save('shows', showList);
          html(res, episodesPage(entry, `Imported ${imported} show${imported === 1 ? '' : 's'} from the feed.`));
        } catch (err) {
          html(res, episodesPage(show, `Import failed: ${err.message}`));
        }
        return true;
      }
    }

    const episodeMatch = p.match(/^\/admin\/episodes\/([a-f0-9-]+)(\/delete)?$/);
    if (episodeMatch) {
      const episode = episodes().find((e) => e.id === episodeMatch[1]);
      if (!episode) { redirect(res, '/admin/episodes'); return true; }
      const show = shows().find((s) => s.id === episode.showId);

      if (episodeMatch[2] === '/delete' && req.method === 'POST') {
        store.save('episodes', episodes().filter((e) => e.id !== episode.id));
        redirect(res, req.headers.referer || '/admin/episodes');
        return true;
      }
      if (!episodeMatch[2] && req.method === 'GET') {
        html(res, episodeEditPage(episode, show));
        return true;
      }
      if (!episodeMatch[2] && req.method === 'POST') {
        const form = await formBody(req, readBody);
        const list = episodes();
        const entry = list.find((e) => e.id === episode.id);
        const title = String(form.get('title') || '').trim().slice(0, 200);
        const date = String(form.get('date') || '').trim();
        const mediaUrl = String(form.get('mediaUrl') || '').trim().slice(0, 1000);
        if (title && title !== entry.title) {
          entry.title = title;
          entry.slug = uniqueEpisodeSlug(title, entry.showId, entry.id);
        }
        if (!entry.slug) entry.slug = uniqueEpisodeSlug(entry.title, entry.showId, entry.id);
        if (/^\d{4}-\d{2}-\d{2}$/.test(date)) entry.date = date;
        if (/^https?:\/\//.test(mediaUrl) || /^\/media\/[^/]+\/[^/]+$/.test(mediaUrl)) {
          if (mediaUrl !== entry.mediaUrl) { entry.mediaUrl = mediaUrl; entry.bytes = 0; entry.duration = null; }
        }
        entry.description = String(form.get('description') || '').trim().slice(0, 4000);
        entry.episode = Number(form.get('episode')) || null;
        entry.season = Number(form.get('season')) || null;
        entry.type = ['full', 'trailer', 'bonus'].includes(form.get('type')) ? form.get('type') : 'full';
        entry.draft = form.get('draft') === '1';
        const artwork = String(form.get('artwork') || '').trim();
        if (/^\/media\/[^/]+\/[^/]+$/.test(artwork)) entry.artwork = artwork;
        else if (!artwork) delete entry.artwork;
        const transcript = String(form.get('transcript') || '').trim();
        entry.transcript = /^\/media\/[^/]+\/[^/]+$/.test(transcript) ? transcript : entry.transcript;
        entry.chapters = parseChapters(form.get('chapters') || '');
        store.save('episodes', list);
        measure(entry.id);
        refreshWebImages().catch(() => {});
        redirect(res, '/admin/episodes');
        return true;
      }
    }

    html(res, adminPage({ title: 'Not found', body: '<p>Page not found.</p>' }), 404);
    return true;
  }

  bootstrap();
  migrateHosts();
  refreshWebImages().catch(() => {});
  return { handle, settings, shows, users, currentUser, measureEpisode: measure };
}

module.exports = { createAdminRouter, slugify };

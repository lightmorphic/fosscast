'use strict';
// The admin area's one router: who is signed in, which page they asked
// for, and what a submitted form does to the store. The screens
// themselves are in admin/, a file each, so a page can be read without
// this file beside it and this file stays a list of addresses.
//
// One signed-in user, no framework.

const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const { siteDomain } = require('./domain');
const { esc, adminPage, withEmbedded } = require('./html');
const auth = require('./auth');

const CATEGORIES = require('./categories');
const feedAliases = require('./feedaliases');
const { readDuration, fetchDuration } = require('./media');
const importer = require('./import');
const { APPS, SUPPORT, SOCIAL, showPage } = require('./public');
const themes = require('./theme');
const transcripts = require('./transcripts');
const config = require('./config');
const {
  DEMO, MAX_SHOWS, MAX_HOSTS,
  parseDuration, parseChapters, slugify, parseCookies, clientIp, isSecure,
  redirect, html, sendJson, noContent, formBody,
} = require('./admin/bits');
const statsScreen = require('./admin/stats-page');
const episodeScreens = require('./admin/episode-pages');
const lookScreen = require('./admin/look-page');
const hostScreens = require('./admin/host-pages');
const podcastScreens = require('./admin/podcast-page');
const accountScreens = require('./admin/account-pages');
const settingsScreen = require('./admin/settings-page');

// The admin addresses used to read /admin/shows/<slug>/settings and the
// like: a tool for managing many podcasts, with a slug in the path that
// can only ever have one value, on an instance that holds exactly one
// podcast. They are now /admin/podcast/... and /admin/episodes/new.
//
// The old ones still answer. They are rewritten here rather than
// redirected because every one of them is a form post, and a redirect
// would arrive without the body somebody just typed.
function modernPath(method, p) {
  if (method === 'POST' && p === '/admin/shows') return '/admin/podcast/create';
  const m = p.match(/^\/admin\/shows\/[a-z0-9-]+(\/episodes|\/delete|\/settings|\/import|\/aliases)$/);
  if (!m) return p;
  return m[1] === '/episodes' ? '/admin/episodes/new' : `/admin/podcast${m[1]}`;
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

  // Fill in an episode's file size and duration, in the background:
  // the feed wants both and neither is worth making a save wait for.
  // An MP3 says how long it is in its own frames, so only the head of
  // the file is ever read. A length typed in by hand is left alone.
  async function measure(episodeId) {
    const list = episodes();
    const episode = list.find((e) => e.id === episodeId);
    if (!episode) return;
    try {
      if (episode.mediaUrl.startsWith('/media/')) {
        const file = path.join(dataDir, decodeURIComponent(episode.mediaUrl.slice(1)));
        episode.bytes = fs.statSync(file).size;
        if (!episode.duration) episode.duration = await readDuration(file);
      } else {
        if (!episode.bytes) {
          const res = await fetch(episode.mediaUrl, { method: 'HEAD', signal: AbortSignal.timeout(10000) });
          episode.bytes = Number(res.headers.get('content-length')) || 0;
        }
        if (!episode.duration) episode.duration = await fetchDuration(episode.mediaUrl);
      }
      store.save('episodes', list);
    } catch { /* sizes stay unknown */ }
  }
  const limiter = new auth.RateLimiter();

  function settings() {
    const value = store.load('settings', () => ({}));
    // Persist on first creation, so the cookie secret and the studio
    // token stay stable across restarts rather than logging everyone
    // out and rotating the token on every deploy.
    let changed = false;
    if (!value.secret) { value.secret = crypto.randomBytes(32).toString('hex'); changed = true; }
    // Instances set up before the rename keep the token they already
    // have: it is in a studio's configuration somewhere, and silently
    // issuing a new one would break publishing without saying so.
    if (!value.studioToken && value.publisherToken) {
      value.studioToken = value.publisherToken;
      delete value.publisherToken;
      changed = true;
    }
    if (!value.studioToken) {
      const fromEnv = (process.env.FOSSSTUDIO_TOKEN || process.env.PUBLISHER_TOKEN || '').trim();
      value.studioToken = fromEnv || crypto.randomBytes(32).toString('hex');
      changed = true;
    }
    if (changed) store.save('settings', value);
    return value;
  }

  function users() { return store.load('users', []); }
  function shows() { return store.load('shows', []); }
  function episodes() { return store.load('episodes', []); }

  // The screens. Each one is handed only what it reads, so a page can be
  // opened and understood without the router beside it.
  const { statsPage } = statsScreen({ stats, shows, episodes });
  const { episodesPage, episodeEditPage } = episodeScreens({ episodes, mediaDir });
  const { lookPage } = lookScreen();
  const {
    hostList, uniqueHostSlug, migrateHosts, hostFields, applyHostForm,
    hostsPage, hostEditPage,
  } = hostScreens({ store, shows });
  const { podcastPage, createPodcastPage } = podcastScreens({ episodes, settings });
  const { dashboard, accountPage } = accountScreens({ settings, shows, episodes, stats });
  const { settingsPage, applySettingsForm } = settingsScreen();

  // ADMIN_EMAIL and ADMIN_PASSWORD are true every time the app starts,
  // not only the first time.
  //
  // They used to create the first account and then be ignored forever.
  // So a first run that failed for some other reason still left an
  // account behind, and every later correction to the compose file did
  // nothing: you pasted the password the file told you to paste and were
  // told it was wrong. There is no way to work that out from the outside,
  // and nobody should have to.
  //
  // While those two lines are in the file they decide what the login is.
  // Take them out and the account is yours to manage from the panel.
  function bootstrap() {
    const list = users();
    const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
    const password = process.env.ADMIN_PASSWORD || '';
    if (!email || !password) return;

    const existing = list.find((u) => u.email === email);
    if (!existing) {
      list.push({
        id: crypto.randomUUID(),
        email,
        hash: auth.hashPassword(password),
        createdAt: new Date().toISOString(),
      });
      store.save('users', list);
      console.log(`Created admin account ${email} from the settings`);
      return;
    }

    // The account is there but the password in the file no longer opens
    // it - somebody edited the file after the first run, which is exactly
    // what a person does when they cannot get in. Make the file true.
    if (!auth.verifyPassword(password, existing.hash)) {
      existing.hash = auth.hashPassword(password);
      store.save('users', list);
      console.log(`Reset the password for ${email} to the one in the settings`);
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
        ${DEMO ? '' : `<p class="hint">Locked out? Nobody can email you a
        link, because this instance sends no email. On the machine it runs
        on, <code>docker compose exec -T app node reset-password.js</code>
        prints a new password once, and
        <code>docker compose restart app</code> makes it count.</p>`}
      </section>`,
    });
  }

  // Returns true when the request was handled. The X-Embedded header
  // is how an embedding shell's proxy asks for pages without our own
  // chrome - a header rather than a query parameter so it survives
  // every link and form post without URL churn. It hides a menu and
  // nothing more; every permission check runs exactly as before, so a
  // visitor sending it by hand merely tidies their own view.
  async function handle(req, res, url) {
    return withEmbedded(req.headers['x-embedded'] === '1', () => route(req, res, url));
  }

  async function route(req, res, url) {
    const p = modernPath(req.method, url.pathname);
    if (!p.startsWith('/admin')) return false;
    const domain = siteDomain();

    // A one-time sign-in link. It can only be minted by something that
    // can run a command inside the container (see admin-login-link.js),
    // which is how an operator gets back in without a password and how
    // an outer shell can hand somebody straight through. Consuming it
    // burns the nonce, so the link cannot be replayed.
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
      // A shell that sends somebody here was showing them a particular
      // page, and landing them on the dashboard instead loses the thing
      // they clicked. `next` says where they were going. Only a local
      // admin path is honoured: anything else - another host, a
      // protocol-relative address, a path outside /admin - is ignored
      // rather than argued with, so this can never become an open
      // redirect wearing a session cookie.
      const asked = String(url.searchParams.get('next') || '');
      // A local admin path, optionally with a simple query - a shell that
      // sends somebody here may be pointing at one tab of a page. Still
      // nothing that could leave the site: no host, no protocol, no
      // protocol-relative address.
      const next = /^\/admin(\/[A-Za-z0-9/_-]*)?(\?[A-Za-z0-9=&_-]*)?$/.test(asked) ? asked : '/admin';
      redirect(res, next, { 'Set-Cookie': sessionCookie(req, session, 7 * 24 * 3600) });
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
      const only = String(url.searchParams.get('only') || '');
      html(res, episodesPage(show, '', ['all', 'new'].includes(only) ? only : ''));
      return true;
    }
    if (p === '/admin/podcast' && req.method === 'GET') {
      const show = shows()[0];
      html(res, show
        ? podcastPage(show, '', String(url.searchParams.get('s') || 'basics'))
        : createPodcastPage());
      return true;
    }
    // The edit form now lives on the podcast page itself.
    if (p === '/admin/podcast/edit' && req.method === 'GET') { redirect(res, '/admin/podcast'); return true; }
    // Old links keep working.
    if (req.method === 'GET' && /^\/admin\/shows(\/[a-z0-9-]+)?$/.test(p)) { redirect(res, '/admin/episodes'); return true; }
    // Look: the public site's accent colour and the podcaster's own words.
    if (p === '/admin/look' && req.method === 'GET') {
      const show = shows()[0];
      if (!show) { redirect(res, '/admin/podcast'); return true; }
      html(res, lookPage(show));
      return true;
    }
    if (p === '/admin/look' && req.method === 'POST') {
      const show = shows()[0];
      if (!show) { redirect(res, '/admin/podcast'); return true; }
      const form = await formBody(req, readBody);
      const list = shows();
      const entry = list.find((s) => s.id === show.id);
      if (form.get('reset')) delete entry.theme;
      else {
        entry.theme = themes.normalise({
          accent: form.get('accent'),
          tagline: form.get('tagline'),
          footer: form.get('footer'),
        });
      }
      store.save('shows', list);
      // Editing the look saves as it goes: the page answers with the
      // front page as it now stands, which is both the confirmation and
      // the preview, in one round trip. Only the reset button reloads.
      if (form.get('live')) {
        const items = episodes().filter((e) => e.showId === show.id)
          .sort((a, b) => (a.date < b.date ? 1 : -1));
        html(res, showPage(shows()[0], items, siteDomain()));
        return true;
      }
      html(res, lookPage(shows()[0], form.get('reset') ? 'Back to the default look.' : 'Saved.'));
      return true;
    }
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
          if (form.get('live')) { noContent(res); return true; }
        redirect(res, '/admin/hosts');
        return true;
      }
    }

    if (p === '/admin/stats' && req.method === 'GET') { html(res, statsPage()); return true; }
    if (p === '/admin/settings' && req.method === 'GET') { html(res, settingsPage()); return true; }
    if (p === '/admin/settings' && req.method === 'POST') {
      const form = await formBody(req, readBody);
      applySettingsForm(form);
      // Saved as it was typed, so there is nothing to send back and the
      // browser stays on the box somebody just left.
      if (form.get('live')) { noContent(res); return true; }
      html(res, settingsPage());
      return true;
    }
    if (p === '/admin/account' && req.method === 'GET') { html(res, accountPage(user)); return true; }
    // Switched off, this falls through to the page-not-found below.
    // Returning unhandled from here would leave the request unanswered.
    if (p === '/admin/account/studio-key' && req.method === 'POST' && config.studioPublishing()) {
      const value = settings();
      value.studioToken = crypto.randomBytes(32).toString('hex');
      store.save('settings', value);
      html(res, accountPage(user, 'New studio key generated. The old one no longer works.'));
      return true;
    }

    if (p === '/admin/podcast/create' && req.method === 'POST') {
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

    // What a form on the Podcast page posts to, plus the new-episode
    // form on the Episodes page. One instance is one podcast, so none of
    // these name it.
    const podcastMatch = p.match(/^\/admin\/(?:podcast\/(delete|settings|import|aliases)|(episodes)\/new)$/);
    if (podcastMatch && req.method === 'POST') {
      const show = shows()[0];
      // Nothing to act on until the podcast exists. The create form is
      // the Podcast page, so that is where to send them.
      if (!show) { redirect(res, '/admin/podcast'); return true; }
      const action = `/${podcastMatch[1] || podcastMatch[2]}`;

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
              // Asked for at the same time as the episode: the upload runs in
          // the background and the episode page shows how it is going.
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
        // Only a real http(s) prefix is kept: anything else would quietly
        // break every enclosure in the feed.
        const prefix = String(form.get('mediaPrefix') || '').trim().slice(0, 300);
        if (!prefix) delete entry.mediaPrefix;
        else if (/^https?:\/\//i.test(prefix)) entry.mediaPrefix = prefix;
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
        const fundingUrl = String(form.get('fundingUrl') || '').trim().slice(0, 500);
        entry.funding = /^https?:\/\//.test(fundingUrl)
          ? { url: fundingUrl, label: String(form.get('fundingLabel') || '').trim().slice(0, 120) }
          : null;
        const artwork = String(form.get('artwork') || '').trim();
        if (/^\/media\/[^/]+\/[^/]+$/.test(artwork)) entry.artwork = artwork;
        const banner = String(form.get('banner') || '').trim();
        if (/^\/media\/[^/]+\/[^/]+$/.test(banner)) entry.banner = banner;
        // The small copy the website uses, made in the browser beside the
        // original. Only kept while there is an original to be a copy of.
        for (const [field, web] of [['artwork', 'artworkWeb'], ['banner', 'bannerWeb']]) {
          const value = String(form.get(web) || '').trim();
          if (entry[field] && /^\/media\/[^/]+\/[^/]+$/.test(value)) entry[web] = value;
          else if (!entry[field]) delete entry[web];
        }
        // web copies of the new artwork/banner are made just after save
        entry.social = {};
        for (const [key] of SOCIAL) {
          const url = String(form.get(`social_${key}`) || '').trim().slice(0, 500);
          // Matrix rooms are often shared as a matrix: URI rather than a
          // matrix.to link, and both should work.
          if (/^https?:\/\//.test(url) || (key === 'matrix' && /^matrix:/.test(url))) entry.social[key] = url;
        }
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
          // Saved from the page as it was typed: nothing to redirect to,
        // the page is already showing what was stored.
        if (form.get('live')) { noContent(res); return true; }
        redirect(res, '/admin/podcast');
        return true;
      }

      // One field, its own route. A form that posts to the settings
      // handler is asking that handler to rewrite the whole show from
      // whatever the form happened to contain, which for a one-field
      // form means erasing everything else.
      if (action === '/aliases' && req.method === 'POST') {
        const form = await formBody(req, readBody);
        const list = shows();
        const entry = list.find((sh) => sh.id === show.id);
        entry.feedAliases = feedAliases.parse(form.get('feedAliases'));
        store.save('shows', list);
        if (form.get('live')) { sendJson(res, 200, { ok: true, aliases: entry.feedAliases }); return true; }
        redirect(res, '/admin/podcast?s=feed');
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
          html(res, episodesPage(entry, `Imported ${imported} episode${imported === 1 ? '' : 's'} from the feed.`));
        } catch (err) {
          html(res, episodesPage(show, `Import failed: ${err.message}`));
        }
        return true;
      }
    }

    const episodeMatch = p.match(/^\/admin\/episodes\/([a-f0-9-]+)(\/delete|\/transcript)?$/);
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
      // The transcript, saved as a file rather than as a field. The
      // episode record keeps only the path, exactly as it did when the
      // only way to get one here was to upload it - so the public link
      // and the feed tag go on working without knowing any of this
      // happened.
      if (episodeMatch[2] === '/transcript' && req.method === 'POST') {
        if (DEMO) return sendJson(res, 403, { error: 'demo instance is read-only' });
        // The transcript is filed under the show's slug, so an episode
        // with no show left is nowhere to put one. Bounce rather than
        // throw: a save route that 500s loses somebody's typing.
        if (!show) { redirect(res, '/admin/episodes'); return true; }
        // A transcript is far larger than a form: forty-five minutes of
        // speech is tens of kilobytes of words, and the default body
        // limit is a form's limit.
        const form = new URLSearchParams((await readBody(req, 4 * 1024 * 1024)).toString());
        const list = episodes();
        const entry = list.find((e) => e.id === episode.id);

        // An uploaded file speaks for itself: adopt the path and leave
        // its contents alone, whatever format they are in.
        const uploaded = String(form.get('transcript') || '').trim();
        if (uploaded) {
          if (!/^\/media\/[^/]+\/[^/]+$/.test(uploaded)) return sendJson(res, 400, { error: 'not a media path' });
          entry.transcript = uploaded;
        } else {
          const written = transcripts.write(mediaDir, show.slug, entry.slug || entry.id,
            form.get('text') || '', entry.title);
          if (written) entry.transcript = written;
          else delete entry.transcript;
          entry.transcriptPublic = form.get('public') === '1';
        }
        if (!entry.transcript) delete entry.transcriptPublic;
        store.save('episodes', list);
        if (form.get('live')) { noContent(res); return true; }
        redirect(res, `/admin/episodes/${entry.id}`);
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
          // A length typed in by hand wins: the file may be one this
          // cannot read, and an emptied box asks for it to be read again.
          if (form.has('duration')) entry.duration = parseDuration(form.get('duration'));
          const epArtWeb = String(form.get('artworkWeb') || '').trim();
          if (entry.artwork && /^\/media\/[^/]+\/[^/]+$/.test(epArtWeb)) entry.artworkWeb = epArtWeb;
          else if (!entry.artwork) delete entry.artworkWeb;
        }
        entry.description = String(form.get('description') || '').trim().slice(0, 4000);
        entry.episode = Number(form.get('episode')) || null;
        entry.season = Number(form.get('season')) || null;
        entry.type = ['full', 'trailer', 'bonus'].includes(form.get('type')) ? form.get('type') : 'full';
        entry.draft = form.get('draft') === '1';
        const artwork = String(form.get('artwork') || '').trim();
        if (/^\/media\/[^/]+\/[^/]+$/.test(artwork)) entry.artwork = artwork;
        else if (!artwork) delete entry.artwork;
        entry.chapters = parseChapters(form.get('chapters') || '');
        store.save('episodes', list);
        measure(entry.id);
          if (form.get('live')) { noContent(res); return true; }
        redirect(res, '/admin/episodes');
        return true;
      }
    }

    html(res, adminPage({ title: 'Not found', body: '<p>Page not found.</p>' }), 404);
    return true;
  }

  bootstrap();
  migrateHosts();
  return { handle, settings, currentUser, measureEpisode: measure };
}

module.exports = { createAdminRouter, slugify };

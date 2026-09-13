'use strict';
// The admin area: login, the dashboard, the podcast and its episodes,
// the hosts, the look of the public site, the statistics and the
// account page. One router, one signed-in user, no framework.

const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const { siteDomain } = require('./domain');
const { esc, adminPage, ICONS, withEmbedded, isEmbedded, BRAND } = require('./html');
const auth = require('./auth');
const CATEGORIES = require('./categories');

// Publishing from a studio is on unless the instance turns it off. The
// card below is the only way to reach the key, so it goes with it.
const STUDIO_PUBLISHING = !/^(0|off|false|no)$/i.test((process.env.STUDIO_PUBLISHING || '').trim());

// Some instances hold no audio at all: the episodes live on the
// podcaster's own storage and the feed points there. Offering an upload
// box on such an instance is offering something that cannot work.
// MEDIA_UPLOADS=off takes it off the forms; the address box, which
// every instance has, becomes the way in.
const MEDIA_UPLOADS = !/^(0|off|false|no)$/i.test((process.env.MEDIA_UPLOADS || '').trim());

const feedAliases = require('./feedaliases');
const { readDuration, fetchDuration, typeFor } = require('./media');
const importer = require('./import');
const { APPS, SUPPORT, SOCIAL, showPage, prefixed } = require('./public');
const themes = require('./theme');
const charts = require('./charts');
const transcripts = require('./transcripts');

// This edition manages one podcast.
const MAX_SHOWS = 1;

// Host photos are shown at 140px on the cards and 200px on a host's own
// page, so a 640px web copy covers retina screens and keeps the hosts
// page light even with twenty faces on it. The browser makes the copy
// while the picture is being chosen, so the box does no image work.
const HOST_PHOTO_SIZE = 640;
const MAX_HOSTS = 40;

// A public demo hands its login to strangers, so demo mode makes the
// whole instance read-only: nothing can be changed, uploaded, posted
// or published, and there is nothing for anyone to spoil for the next
// visitor.
const DEMO = process.env.DEMO_MODE === '1';

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

// The dashboard must never render inside a stranger's iframe, but an
// operator may name the one shell allowed to hold it - their own
// portal, a homelab wall, an agency panel. FRAME_ANCESTORS is that
// name (a CSP source list, e.g. https://portal.example.com); unset
// means what it has always meant: nobody.
const FRAME_ANCESTORS = (process.env.FRAME_ANCESTORS || '').trim();

function html(res, page, status = 200) {
  res.writeHead(status, {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Security-Policy': `frame-ancestors ${FRAME_ANCESTORS || "'none'"}`,
    // X-Frame-Options cannot say "this origin only", so when an
    // ancestor is allowed the CSP directive speaks alone. Every
    // browser that honours X-Frame-Options honours frame-ancestors.
    ...(FRAME_ANCESTORS ? {} : { 'X-Frame-Options': 'DENY' }),
  });
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
    const show = shows()[0];
    if (!stats) return adminPage({ title: 'Stats', active: 'stats', body: '<h1 class="page-title">Stats</h1><p class="hint">Statistics are not running on this instance.</p>' });

    const days = stats.lastDays(30);
    const days90 = stats.lastDays(90);
    const months = stats.lastMonths(12);
    const feed = stats.feedLastDays(30);
    const data = stats.data();

    // --- the numbers behind the tiles ---
    const allTime = stats.allTime();
    const last30 = days.reduce((a, d) => a + d.count, 0);
    const previous30 = days90.slice(30, 60).reduce((a, d) => a + d.count, 0);
    const change = previous30 ? Math.round(((last30 - previous30) / previous30) * 100) : null;
    const best = days90.reduce((b, d) => (d.count > b.count ? d : b), { day: '', count: 0 });
    const published = episodeList.filter((e) => !e.draft).length;
    const perEpisode = published ? Math.round(allTime / published) : 0;
    const thisMonth = months[months.length - 1] || { count: 0 };
    // Only days this instance can vouch for: before machines were
    // excluded, a crawler counted the same as a subscriber, and
    // averaging those in reports a readership that was never there.
    const trusted = data.machinesFrom
      // Strictly after: the day the filter arrived was already part
      // spent, and its count holds the machines recorded that morning.
      // The first day worth averaging is the one after it.
      ? feed.filter((d) => d.day > data.machinesFrom).slice(-7)
      : [];
    const subscribers = trusted.length
      ? Math.round(trusted.reduce((a, d) => a + d.count, 0) / trusted.length)
      : null;
    const countryCount = Object.keys(data.byCountry).filter((c) => c && data.byCountry[c] > 0).length;

    const monthPoints = months.map((m) => ({
      label: new Date(`${m.month}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }),
      short: new Date(`${m.month}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' }),
      count: m.count,
    }));
    const dayPoints = days.map((d) => ({
      label: new Date(`${d.day}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }),
      count: d.count,
    }));
    const feedPoints = feed.map((d) => ({
      label: new Date(`${d.day}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }),
      count: d.count,
    }));

    // --- the heatmap needs a day x hour grid; the counters hold the two
    // edges of it, so the grid is their product, scaled to the total ---
    const hours = stats.hours();
    const weekdays = stats.weekdays();
    const hourTotal = hours.reduce((a, h) => a + h.count, 0) || 1;
    const matrix = weekdays.map((d) => hours.map((h) => Math.round((d.count * h.count) / hourTotal)));

    const apps = stats.breakdown('byApp');
    const platforms = stats.breakdown('byPlatform', 6);
    const countries = stats.breakdown('byCountry', 8);
    const languages = stats.breakdown('byLanguage', 6);
    const ages = stats.ages();

    const topEpisodes = episodeList
      .map((e) => ({ label: e.title, count: stats.total(e.id), id: e.id, date: e.date }))
      .sort((a, b) => b.count - a.count);

    const rows = topEpisodes.map((e) => {
      const share = allTime ? Math.round((e.count / allTime) * 100) : 0;
      return `<tr>
        <td><a href="/admin/episodes/${esc(e.id)}">${esc(e.label)}</a></td>
        <td>${esc(e.date)}</td>
        <td class="num">${e.count}</td>
        <td class="num">${share}%</td>
      </tr>`;
    }).join('');

    const nothingYet = allTime === 0;

    return adminPage({
      title: 'Stats',
      active: 'stats',
      body: `<h1 class="page-title">Stats</h1>
      <p class="hint">One download per listener per episode per day, no
      cookies, nothing stored about any individual: every number here is
      a counter, and none of them can be joined back to a person.
      ${show ? `Episodes hosted elsewhere are not counted &mdash; only files served by this instance.` : ''}</p>

      ${nothingYet ? `<section class="panel"><p class="hint">Nothing to
      show yet. Numbers appear here as soon as somebody downloads an
      episode; the charts fill in over the following days.</p></section>` : ''}

      ${charts.tiles([
        { value: charts.short(allTime), label: 'Downloads all time' },
        { value: charts.short(last30), label: 'Last 30 days',
          note: change === null ? '' : `${change >= 0 ? '+' : ''}${change}% on the 30 before`,
          tone: change === null ? '' : change >= 0 ? 'up' : 'down' },
        { value: charts.short(thisMonth.count), label: 'This month so far' },
        ...(subscribers === null
          ? [{ value: '\u2013', label: 'Feed pulls a day', note: 'counting from tomorrow' }]
          : [{ value: charts.short(subscribers), label: 'Feed pulls a day', note: 'roughly, subscribers' }]),
        { value: charts.short(perEpisode), label: 'Average per episode' },
        { value: charts.short(best.count), label: 'Best day', note: best.day || '' },
        { value: String(published), label: 'Episodes published' },
        // Country comes from a header a geo-aware proxy sets. Plenty of
        // instances sit behind one that does not, and showing them a
        // hard 0 reads as "nobody, anywhere" rather than "we cannot
        // tell from here".
        ...(countryCount
          ? [{ value: String(countryCount), label: 'Countries' }]
          : [{ value: '\u2013', label: 'Countries', note: 'your proxy does not say' }]),
      ])}

      <section class="panel" id="sec-months">
        <h2>Month by month</h2>
        <p class="hint">The last twelve months. This month is still
        filling up, so it is short until it is over.</p>
        ${charts.barChart(monthPoints, { label: 'Downloads per month over the last twelve months' })}
      </section>

      <div class="cols-2">
        <section class="panel" id="sec-daily">
          <h2>Day by day</h2>
          <p class="hint">The last 30 days.</p>
          ${charts.areaChart(dayPoints, { label: 'Downloads per day over the last 30 days' })}
        </section>
        <section class="panel" id="sec-feed">
          <h2>Feed pulls</h2>
          <p class="hint">How many apps asked for the feed each day. It
          moves with your subscriber count.</p>
          ${charts.areaChart(feedPoints, { label: 'Feed pulls per day' })}
        </section>
      </div>

      <div class="cols-2">
        <section class="panel" id="sec-apps">
          <h2>Where they listen</h2>
          <p class="hint">Read from the app's own name in the request.</p>
          ${apps.length ? charts.donut(apps, { label: 'Downloads by app' }) : '<p class="hint">Nothing yet.</p>'}
        </section>
        <section class="panel" id="sec-countries">
          <h2>Where they are</h2>
          ${countries.length
            ? `<p class="hint">As reported by your proxy.</p>${charts.donut(countries, { label: 'Downloads by country' })}`
            : `<p class="hint">No country information. ${esc(BRAND)} never
               looks an address up itself &mdash; that would mean shipping a
               database or asking somebody else about your listeners. If
               your proxy knows, it can say so: Cloudflare sets
               <code>CF-IPCountry</code> for free, and nginx with the GeoIP
               module usually sets <code>X-Country-Code</code>. Either one
               fills this in.</p>`}
        </section>
      </div>

      <div class="cols-2">
        <section class="panel" id="sec-platforms">
          <h2>What they listen on</h2>
          ${platforms.length ? charts.barsAcross(platforms, { label: 'Downloads by platform', colour: 'var(--c3)' }) : '<p class="hint">Nothing yet.</p>'}
        </section>
        <section class="panel" id="sec-languages">
          <h2>What their device speaks</h2>
          <p class="hint">The language their app asked for.</p>
          ${languages.length ? charts.barsAcross(languages, { label: 'Downloads by language', colour: 'var(--c4)' }) : '<p class="hint">Nothing yet.</p>'}
        </section>
      </div>

      <section class="panel" id="sec-when">
        <h2>When they listen</h2>
        <p class="hint">Day of the week against hour of the day, in UTC.
        Darker is busier &mdash; useful for deciding when to publish.</p>
        ${charts.heatmap(matrix)}
      </section>

      <div class="cols-2">
        <section class="panel" id="sec-weekdays">
          <h2>Busiest days</h2>
          ${charts.barsAcross(weekdays.slice().sort((a, b) => b.count - a.count), { label: 'Downloads by day of the week', colour: 'var(--c5)' })}
        </section>
        <section class="panel" id="sec-age">
          <h2>How long an episode keeps earning</h2>
          <p class="hint">How old an episode was when it was downloaded.
          A long tail means your back catalogue is still working.</p>
          ${charts.barsAcross(ages, { label: 'Downloads by age of episode at the time', colour: 'var(--c6)' })}
        </section>
      </div>

      <section class="panel" id="sec-episodes">
        <h2>Every episode</h2>
        ${topEpisodes.length ? `<div class="table-scroll"><table>
          <thead><tr><th>Episode</th><th>Published</th><th class="num">Downloads</th><th class="num">Share</th></tr></thead>
          <tbody>${rows}</tbody>
        </table></div>` : '<p class="hint">No episodes yet.</p>'}
      </section>

      <section class="panel" id="sec-about-stats">
        <h2>What is and is not counted</h2>
        <ul class="ticks">
          <li>A download is one listener, one episode, one day &mdash; the same file fetched five times counts once</li>
          <li>Listeners are told apart by a salted hash of address and app that is never written down and changes every restart</li>
          <li>Day, month, app, platform, language and country are counters, not records: there is no row for anybody</li>
          <li>Daily figures are kept for 90 days, monthly ones for two years, and the rest are running totals</li>
          <li>Episodes whose media lives elsewhere cannot be counted here &mdash; their host counts them instead</li>
        </ul>
      </section>`,
    });
  }

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
        ${DEMO ? '' : `<p class="hint">Locked out? Nobody can email you a
        link, because this instance sends no email. On the machine it runs
        on, <code>docker compose exec -T app node reset-password.js</code>
        prints a new password once, and
        <code>docker compose restart app</code> makes it count.</p>`}
      </section>`,
    });
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
        &middot; <a href="/admin/episodes">episodes</a></p>
      </section>`
      : `<section class="panel hero">
        <h1>Welcome to ${esc(BRAND)}</h1>
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
        <a class="panel stat" href="/admin/episodes"><span class="stat-n">${episodeList.length - drafts}</span><span>published episode${episodeList.length - drafts === 1 ? '' : 's'}</span></a>
        <a class="panel stat" href="/admin/episodes"><span class="stat-n">${drafts}</span><span>draft${drafts === 1 ? '' : 's'}</span></a>
        <a class="panel stat" href="/admin/stats"><span class="stat-n">${stats ? Object.values(stats.data().totals).reduce((a, b) => a + b, 0) : 0}</span><span>downloads all time</span></a>
      </section>
      <p class="hint">Signed in as ${esc(user.email)}.</p>`,
    });
  }

  // The Shows page: the day-to-day work of adding and editing shows
  // (episodes) of the podcast.
  // A hundred episodes above the form for the hundred-and-first is a lot
  // of scrolling, so a menu can ask for one half or the other: "all" is
  // the list, "new" is the form, and neither is the whole page as before.
  function episodesPage(show, notice = '', only = '') {
    const items = episodes()
      .filter((e) => e.showId === show.id)
      .sort((a, b) => (a.date < b.date ? 1 : -1));
    const nextEpisode = items.reduce((n, e) => Math.max(n, e.episode || 0), 0) + 1;
    const rows = items.map((episode) => `<tr>
      <td class="art-cell">${(episode.artwork || show.artwork)
        ? `<img class="row-art" src="${esc(episode.artwork || show.artwork)}" alt="" loading="lazy">`
        : '<span class="row-art row-art-none" aria-hidden="true"></span>'}</td>
      <td><a href="/admin/episodes/${esc(episode.id)}">${esc(episode.title)}</a>${episode.draft ? ' <span class="tag">draft</span>' : ''}</td>
      <td>${esc(episode.date)}</td>
      <td class="media-cell"><a href="/shows/${esc(show.slug)}/${esc(episode.slug || episode.id)}" target="_blank" rel="noopener">page</a>
        &middot; <button type="button" class="linkish" data-embed="${esc(episode.id)}"
          data-embed-title="${esc(episode.title)}">embed</button></td>
      <td class="actions">${deleteButton(`/admin/episodes/${esc(episode.id)}/delete`, 'Delete episode')}</td>
    </tr>`).join('');
    return adminPage({
      title: 'Episodes',
      active: 'episodes',
      body: `<h1 class="page-title">Episodes</h1>
      ${notice ? `<p class="form-ok">${esc(notice)}</p>` : ''}

      ${only === 'new' ? '' : `<section class="panel">
        <h2>All episodes</h2>
        <table>
          <caption class="sr-only">Episodes of ${esc(show.name)}</caption>
          <thead><tr><th><span class="sr-only">Artwork</span></th><th>Title</th><th>Date</th><th>Links</th><th></th></tr></thead>
          <tbody>${rows || '<tr><td colspan="5" class="hint">No episodes yet.</td></tr>'}</tbody>
        </table>
      </section>`}

      ${only === 'all' ? '' : `<section class="panel">
        <h2>New episode</h2>
        <form method="post" action="/admin/shows/${esc(show.slug)}/episodes">
        <div class="form-cols">
        <div>
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
          <label for="epDescription">Description</label>
          <textarea id="epDescription" name="description" rows="8" maxlength="4000"></textarea>
        </div>
        <div>
          ${MEDIA_UPLOADS ? `<label for="mediaFile">Media file (uploads to this server)</label>
          <input id="mediaFile" type="file" accept="audio/*,video/*" data-upload data-show="${esc(show.slug)}" data-target="mediaUrl" data-status="upload-status">
          <p class="hint" id="upload-status"></p>` : ''}
          <label for="mediaUrl">${MEDIA_UPLOADS ? 'Or the address of the audio' : 'The address of the audio'}</label>
          <p class="hint">Where the file actually lives - your
          own storage, anywhere a listener's app can reach. MP3 is the one
          every app plays.</p>
          <input id="mediaUrl" name="mediaUrl" maxlength="1000" placeholder="https://files.example.com/ep12.mp3">
          <label for="epArt">Episode cover art (optional)</label>
          <p class="hint">Square, <strong>3000 x 3000</strong> pixels. Leave it
          empty and the show uses the podcast's artwork.</p>
          <input id="epArt" type="file" accept="image/*" data-upload data-show="${esc(show.slug)}" data-target="epArtwork" data-status="epart-status" data-preview="epart-preview-img">
          <p class="hint" id="epart-status"></p>
          <input type="hidden" id="epArtwork" name="artwork" value="">
          <img class="art-preview" id="epart-preview-img" alt="" src="" style="display:none">
          <label class="switch-label">
            <input type="checkbox" name="draft" value="1" class="switch-input">
            <span class="switch" aria-hidden="true"></span>
            <span>Save as draft (hidden from the public site and feed)</span>
          </label>
        </div>
        </div>
          <button class="btn-primary" type="submit">Publish episode</button>
        </form>
      </section>`}`,
    });
  }

  // ---------- Look ----------

  // The public site belongs to the podcaster, so its accent colour and
  // the two lines of words under its name are theirs to set. The
  // preview beside the form is the real front page, rendered by the
  // server from what has just been saved - no guessing, and nothing to
  // save twice.
  function lookPage(show, notice = '') {
    const t = themes.normalise(show.theme);
    return adminPage({
      title: 'Look',
      active: 'look',
      body: `<h1 class="page-title">Look</h1>
      ${notice ? `<p class="form-ok">${esc(notice)}</p>` : ''}
      <p class="hint">Your site, your colour. Every change saves itself and
      shows up in the preview as you go.</p>

      <div class="look-layout">
      <form method="post" action="/admin/look" id="look-form">
        <section class="panel" id="sec-colour">
          <h2>Colour</h2>
          <div class="inline-fields">
            <label class="inline-label" for="accent-hex">Hex</label>
            <input id="accent-hex" name="accent" class="hex-field" maxlength="7" value="${esc(t.accent)}">
            <input id="accent-pick" type="color" class="color-chip" value="${esc(t.accent)}" aria-label="Pick a colour">
          </div>
          <p class="hint">Every other shade -- hovers, tags, links, light and
          dark -- is worked out from this one.</p>
        </section>

        <section class="panel" id="sec-words">
          <h2>Words of your own</h2>
          <label for="tagline">Tagline</label>
          <p class="hint">One line under the name, on the front page.</p>
          <input id="tagline" name="tagline" maxlength="200" value="${esc(t.tagline)}" placeholder="Two nerds, one microphone">
          <label for="footer-text">Footer</label>
          <p class="hint">Your copyright, your credit, whatever you like.</p>
          <input id="footer-text" name="footer" maxlength="300" value="${esc(t.footer)}" placeholder="&copy; ${new Date().getFullYear()} ${esc(show.name)}">
        </section>

        <div class="save-bar">
          <span class="save-state" id="save-state" aria-live="polite"></span>
          <button class="btn-secondary btn-small" type="submit" name="reset" value="1">Back to the default</button>
        </div>
      </form>

      <div class="look-preview">
        <div class="panel preview-card">
          <h2>Preview</h2>
          <div class="preview-frame-wrap">
            <iframe id="look-preview" title="Preview of the public site" src="/shows/${esc(show.slug)}?preview=1"></iframe>
          </div>
          <p class="hint">Your front page, live &middot; <a href="/shows/${esc(show.slug)}" target="_blank" rel="noopener noreferrer">open the real one</a></p>
        </div>
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
      <input id="${prefix}photo" type="file" accept="image/*" data-upload data-show="${esc(show.slug)}" data-target="${prefix}photo-url" data-status="${prefix}photo-status" data-preview="${prefix}photo-img" data-web="${HOST_PHOTO_SIZE}" data-web-target="${prefix}photo-web">
      <p class="hint" id="${prefix}photo-status">${photo ? 'Uploaded.' : 'None yet, so the card shows their initials.'}</p>
      <input type="hidden" id="${prefix}photo-url" name="photo" value="${esc(host.photo || '')}">
      <input type="hidden" id="${prefix}photo-web" name="photoWeb" value="${esc(host.photoWeb || '')}">
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
    const photoWeb = String(form.get('photoWeb') || '').trim();
    if (host.photo && /^\/media\/[^/]+\/[^/]+$/.test(photoWeb)) host.photoWeb = photoWeb;
    else if (!host.photo) delete host.photoWeb;
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
            <button class="btn-icon" type="submit" title="Move up" aria-label="Move up"${i === 0 ? ' disabled' : ''}>&uarr;</button>
          </form>
          <form method="post" action="/admin/hosts/${esc(host.id)}/move" class="inline-form">
            <input type="hidden" name="dir" value="down">
            <button class="btn-icon" type="submit" title="Move down" aria-label="Move down"${i === list.length - 1 ? ' disabled' : ''}>&darr;</button>
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
      <form method="post" action="/admin/hosts/${esc(host.id)}" data-autosave>
        <section class="panel">
          <h2>Details</h2>
          ${hostFields(show, host, 'e')}
        </section>
        <div class="save-bar"><span class="save-state" aria-live="polite"></span></div>
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
  function podcastPage(show, notice = '', want = 'basics') {
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
      &middot; <a href="/admin/episodes">episodes</a></p>
      ${(() => {
        const tabs = [["basics", "Basics"], ["feed", "Feed"], ["artwork", "Artwork"], ["listen", "Where to listen"], ["social", "Social"], ["support", "Support"], ["analytics", "Analytics"]];
        const here = tabs.some(([id]) => id === want) ? want : tabs[0][0];
        return `<style>.pane{display:none}.pane-${here}{display:block}</style>
        <nav class="tabs" aria-label="Podcast settings">
          ${tabs.map(([id, label]) => `<a class="tab${id === here ? ' current' : ''}"
            href="/admin/podcast?s=${id}">${esc(label)}</a>`).join('')}
        </nav>`;
      })()}

      <section class="panel pane pane-feed" id="sec-import">
        <h2>Import from an existing feed</h2>
        <p class="hint">Paste a podcast's RSS address and every episode comes
        in with its details, keeping the identifiers that stop listeners
        re-downloading anything. The audio stays where it is until you move
        it yourself.</p>
        <form method="post" action="/admin/shows/${esc(show.slug)}/import">
          <label for="feedUrl">Feed address</label>
          <input id="feedUrl" name="feedUrl" type="url" required maxlength="1000" placeholder="https://example.com/feed.xml">
          <button class="btn-primary" type="submit">Import episodes</button>
        </form>
      </section>

      <section class="panel pane pane-feed" id="sec-old-addresses">
        <h2>Feed addresses you used to have</h2>
        <p class="hint">If this show has lived somewhere else, put the old feed
        address here and it keeps working: anyone still asking for it is sent
        to this show's feed, permanently, so Apple, Spotify and the rest
        update themselves. You never open a directory or fill in a form.</p>
        <form method="post" action="/admin/shows/${esc(show.slug)}/aliases" data-autosave>
          <label for="feedAliases">Old address</label>
          <input id="feedAliases" name="feedAliases" type="text" spellcheck="false"
            placeholder="/@${esc(show.slug)}/feed.xml"
            value="${esc((show.feedAliases || []).join(', '))}">
          <p class="hint">More than one? Separate them with commas. A whole web
          address is fine &mdash; only the part after the domain is used.</p>
          <p class="save-state" aria-live="polite"></p>
        </form>
        ${(show.feedAliases || []).length ? `<p class="hint">Answering now:
        ${(show.feedAliases || []).map((a) => `<code>${esc(a)}</code>`).join(' &middot; ')}</p>` : ''}
        <p class="hint">This only works for an address on a domain that points
        here. One on your old host's own domain belongs to them &mdash; ask them
        to forward it before you leave, which most hosts offer, and the
        directories follow that instead.</p>
      </section>

      <section class="panel pane pane-feed" id="sec-feed">
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

      <form method="post" action="/admin/shows/${esc(show.slug)}/settings" data-autosave>
        <section class="panel pane pane-basics" id="sec-basics">
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

        <section class="panel pane pane-basics" id="sec-ownership">
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
          <label class="switch-label">
            <input type="checkbox" name="explicit" value="1" class="switch-input"${show.explicit ? ' checked' : ''}>
            <span class="switch" aria-hidden="true"></span>
            <span>Explicit content</span>
          </label>
          <label class="switch-label">
            <input type="checkbox" name="locked" value="1" class="switch-input"${show.locked ? ' checked' : ''}>
            <span class="switch" aria-hidden="true"></span>
            <span>Lock the feed (tells other hosts not to import it without permission)</span>
          </label>

        </section>

        <section class="panel pane pane-artwork" id="sec-artwork">
          <h2>Artwork &amp; banner</h2>
          <div class="subsection">
          <label for="sart">Podcast artwork</label>
          <p class="hint">Square, <strong>3000 x 3000</strong> pixels (Apple
          accepts 1400 x 1400 upwards). JPG or PNG. Your browser makes the
          small fast copy the website uses; the file you choose is kept as
          it is for the directories.</p>
          <input id="sart" type="file" accept="image/*" data-upload data-show="${esc(show.slug)}" data-target="artwork" data-status="art-status" data-preview="art-preview-img" data-web="1024" data-web-target="artworkWeb">
          <p class="hint" id="art-status">${show.artwork ? 'Uploaded.' : 'None yet. Directories will not list a show without it.'}</p>
          <input type="hidden" id="artwork" name="artwork" value="${esc(show.artwork || '')}">
          <input type="hidden" id="artworkWeb" name="artworkWeb" value="${esc(show.artworkWeb || '')}">
          <img class="art-preview" id="art-preview-img" alt="" src="${show.artwork ? esc(show.artworkWeb || show.artwork) : ''}"${show.artwork ? '' : ' style="display:none"'}>
          </div>

          <div class="subsection">
          <label for="sbanner">Website banner</label>
          <p class="hint">The strip across the top of your site, drawn
          <strong>976 x 244</strong> (4:1) &mdash; make it that and it is
          exactly right. Anything bigger is fine too: your browser shrinks
          a copy to 976 for the website and the file you chose is kept as
          it is. On a phone the strip goes 3:1 and takes the sides off, so
          keep anything that matters near the middle.</p>
          <input id="sbanner" type="file" accept="image/*" data-upload data-show="${esc(show.slug)}" data-target="banner" data-status="banner-status" data-preview="banner-preview-img" data-web="976" data-web-target="bannerWeb">
          <p class="hint" id="banner-status">${show.banner ? 'Uploaded.' : 'None yet, so the page starts at the title.'}</p>
          <input type="hidden" id="banner" name="banner" value="${esc(show.banner || '')}">
          <input type="hidden" id="bannerWeb" name="bannerWeb" value="${esc(show.bannerWeb || '')}">
          <img class="banner-preview" id="banner-preview-img" alt="" src="${show.banner ? esc(show.bannerWeb || show.banner) : ''}"${show.banner ? '' : ' style="display:none"'}>

          </div>

        </section>

        <section class="panel pane pane-support" id="sec-people">
          <h2>Funding</h2>
          <div class="field-row">
            <div><label for="sfundurl">Support page address</label>
            <input id="sfundurl" name="fundingUrl" type="url" maxlength="500" value="${esc(show.funding?.url || '')}"></div>
            <div><label for="sfundlabel">Funding label</label>
            <input id="sfundlabel" name="fundingLabel" maxlength="120" value="${esc(show.funding?.label || '')}" placeholder="Support the show"></div>
          </div>
        </section>

        <section class="panel pane pane-analytics" id="sec-prefix">
          <h2>Analytics prefix</h2>
          <p class="hint">Third-party download measurement, the way the
          rest of the podcast world does it. Services such as
          <a href="https://op3.dev" target="_blank" rel="noopener noreferrer">OP3</a>
          (open, free) or Podtrac work by sitting in front of the audio:
          paste their prefix here and every enclosure in your feed points
          at them first, then on to you.</p>
          <label for="smediaprefix">Prefix URL</label>
          <input id="smediaprefix" name="mediaPrefix" maxlength="300" value="${esc(show.mediaPrefix || '')}" placeholder="https://op3.dev/e/">
          <p class="hint">Several can be chained by pasting them one after
          another, longest-lived first. Leave it empty and nobody but this
          server ever sees a download.</p>
          ${show.mediaPrefix ? `<p class="hint">Your enclosures now read
          <code>${esc(prefixed(`https://${siteDomain('example.org')}/d/EPISODE.mp3`, show.mediaPrefix))}</code></p>
          <p class="hint">This does send your listeners through somebody
          else on their way to the audio, the player on your own site
          included. That is what a prefix is for, but it is a third party
          in the path and worth deciding on purpose.</p>` : ''}
        </section>

        <section class="panel pane pane-support" id="sec-support">
          <h2>Where listeners can support you</h2>
          <p class="hint">The services listeners already use to back a
          podcast. Paste your page on each one and its button appears on
          your show page, and goes into the feed as a funding link so apps
          can offer it too. No account yet? The sign-up link beside each
          one takes you straight there.</p>
          ${SUPPORT.map(([key, label, signup, placeholder]) => `<label for="sup-${key}">${esc(label)}
          <a class="hint-link" href="${esc(signup)}" target="_blank" rel="noopener noreferrer">sign up</a></label>
          <input id="sup-${key}" name="support_${key}" type="url" maxlength="500" value="${esc((show.support || {})[key] || '')}" placeholder="${esc(placeholder)}">`).join('')}
        </section>

        <section class="panel pane pane-listen" id="sec-listen">
          <h2>Listen on</h2>
          <p class="hint">Paste the address of your show on each platform
          and its button appears on your pages. You get these after
          submitting your RSS feed to them, which usually takes a few days.
          RSS is always offered, so listeners never wait on an approval.</p>
          ${APPS.map(([key, label]) => `<label for="link-${key}">${esc(label)}</label>
          <input id="link-${key}" name="link_${key}" type="url" maxlength="500" value="${esc((show.links || {})[key] || '')}" placeholder="https://">`).join('')}
        </section>

        <section class="panel pane pane-social" id="sec-social">
          <h2>Find us on</h2>
          <p class="hint">Where the show talks to its audience. Anything
          you fill in becomes a button on your page. Matrix first, then
          the rest of the open places, then the big platforms.</p>
          ${SOCIAL.map(([key, label, placeholder]) => `<label for="social-${key}">${esc(label)}</label>
          <input id="social-${key}" name="social_${key}" type="url" maxlength="500" value="${esc((show.social || {})[key] || '')}" placeholder="${esc(placeholder)}">`).join('')}
        </section>

        <section class="panel pane pane-feed" id="sec-guid">
          <h2>Moving from another host</h2>
          <label for="sguid">Feed GUID</label>
          <p class="hint">Only when moving from another host. Directories
          identify a podcast by this rather than by its address. Copy the
          <code>podcast:guid</code> from your old feed and the move is
          treated as the same show. Importing an old feed fills this in by
          itself. Leave it empty for a new podcast.</p>
          <input id="sguid" name="podcastGuid" maxlength="60" value="${esc(show.podcastGuid || '')}" placeholder="">
        </section>

        <div class="save-bar"><span class="save-state" aria-live="polite"></span></div>
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
      ['A published episode', published.length > 0, 'Publish at least one episode before submitting.'],
      ['File sizes known', published.every((e) => Number(e.bytes) > 0),
        'A show has no file size in the feed. Re-save it so the size can be read.'],
      ['Durations known', published.every((e) => Number(e.duration) > 0),
        'A show has no duration. Re-save it so the length can be read.'],
    ];
  }


  // The transcript panel on an episode. The words live in a file beside
  // the audio - that is what the public page links to and what the feed
  // advertises - and this box is that file, read out and parsed back.
  // There is no second copy anywhere, so there is nothing to fall out of
  // step.
  //
  // The "transcribe this" control appears only when somebody has named a
  // tool with TRANSCRIBE_URL. Unset, this panel is a text box, a switch
  // and a file picker, and says nothing about a tool that does not exist.
  function transcriptPanel(episode, show) {
    const stored = episode.transcript ? transcripts.read(mediaDir, episode.transcript) : null;
    const editable = stored !== null;
    const text = editable ? transcripts.toLines(stored) : '';
    const tool = transcripts.transcriber();
    const domain = siteDomain();
    const audio = /^https?:\/\//i.test(episode.mediaUrl || '')
      ? episode.mediaUrl
      : `https://${domain}${episode.mediaUrl || ''}`;
    // No `origin` here on purpose. The reply address is whatever host
    // this dashboard is actually being served at, which the server
    // cannot know: an instance may answer at its own domain and at
    // another name at the same time, and naming the wrong one means the
    // browser silently drops the answer. The page adds its own.
    const toolUrl = tool
      ? `${tool.url}${tool.url.includes('?') ? '&' : '?'}episode=${encodeURIComponent(episode.id)}`
        + `&audio=${encodeURIComponent(audio)}&title=${encodeURIComponent(episode.title)}`
      : '';

    // An episode whose transcript is a file we cannot read back as text -
    // somebody's uploaded .srt or .json - is not silently overwritten.
    // It is named, and the box says what typing in it would do.
    const foreign = episode.transcript && !editable;

    return `<section class="panel" id="transcript-panel"
      data-action="/admin/episodes/${esc(episode.id)}/transcript"
      data-episode="${esc(episode.id)}"${tool ? `
      data-tool="${esc(toolUrl)}" data-origin="${esc(tool.origin)}"` : ''}>
      <h2>Transcript</h2>
      <p class="hint">Podcast apps show this, search engines read it, and
      people who would rather read than listen need it. Fix the words the
      way you would fix a typo - the timings in brackets stay where they
      are and keep the file in step with the audio.</p>
      ${tool ? `<p class="hint">Nothing is uploaded: the tool below works in
      this browser, on this machine, and hands the words straight back to
      this box.</p>
      <button class="btn-secondary" type="button" id="transcribe-open">Transcribe this episode</button>
      <div id="transcribe-frame"></div>` : ''}
      ${foreign ? `<p class="hint">This episode's transcript is
      <code>${esc(episode.transcript)}</code>, which is not a format this box
      reads. Typing here and saving would replace it.</p>` : ''}
      <form method="post" action="/admin/episodes/${esc(episode.id)}/transcript" data-autosave>
        <label for="transcriptText">The words</label>
        <textarea id="transcriptText" name="text" rows="14" spellcheck="true"
          placeholder="[0:00] Anything you type here becomes the episode's transcript.">${esc(text)}</textarea>
        <label class="switch-label">
          <input type="checkbox" name="public" value="1" class="switch-input"${episode.transcriptPublic ? ' checked' : ''}>
          <span class="switch" aria-hidden="true"></span>
          <span>Show the words on the episode's own page</span>
        </label>
        <p class="hint">Off, the transcript is still offered to podcast
        apps and still has its own address - a transcript is a public
        thing either way. This decides whether the episode's page also
        prints it underneath the player.</p>
        <p class="save-state transcript-save" aria-live="polite"></p>
      </form>
      <label for="transcriptFile">Or upload one you already have (.vtt, .srt, .txt, .json)</label>
      <input id="transcriptFile" type="file" accept=".vtt,.srt,.txt,.json,.html"
        data-upload data-show="${esc(show.slug)}" data-target="transcriptPath" data-status="tr-status">
      <p class="hint" id="tr-status">${episode.transcript ? `Current: ${esc(episode.transcript)}` : 'None yet.'}</p>
      <input type="hidden" id="transcriptPath" value="">
    </section>`;
  }

  function episodeEditPage(episode, show) {
    return adminPage({
      title: episode.title,
      active: 'episodes',
      body: `<h1 class="page-title">Edit episode</h1>
      <p class="hint"><a href="/admin/episodes">&larr; Episodes</a></p>
      <section class="panel">
        <form method="post" action="/admin/episodes/${esc(episode.id)}" data-autosave>
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
          <label for="epDuration">Length (minutes:seconds)</label>
          <p class="hint">Read from an MP3 by itself. Fill it in for any
          other kind of file: the directories want a length.</p>
          <input id="epDuration" name="duration" maxlength="9" value="${esc(formatDuration(episode.duration))}" placeholder="42:30">
          <label for="epDescription">Description</label>
          <textarea id="epDescription" name="description" rows="4" maxlength="4000">${esc(episode.description)}</textarea>
          <label for="epArt">Episode cover art (optional)</label>
          <p class="hint">Square, <strong>3000 x 3000</strong> pixels. Empty
          means the podcast's artwork is used.</p>
          <input id="epArt" type="file" accept="image/*" data-upload data-show="${esc(show.slug)}" data-target="epArtwork" data-status="epart-status" data-web="1024" data-web-target="epArtworkWeb">
          <p class="hint" id="epart-status">${episode.artwork ? `Current: ${esc(episode.artwork)}` : "Using the podcast's artwork."}</p>
          <input type="hidden" id="epArtwork" name="artwork" value="${esc(episode.artwork || '')}">
          <input type="hidden" id="epArtworkWeb" name="artworkWeb" value="${esc(episode.artworkWeb || '')}">
          ${episode.artwork ? `<img class="art-preview" src="${esc(episode.artwork)}" alt="Episode artwork" width="120" height="120">` : ''}
          <label for="chapters">Chapters (one per line: HH:MM:SS Title)</label>
          <textarea id="chapters" name="chapters" rows="5" placeholder="00:00 Intro&#10;05:30 The main topic">${esc(formatChapters(episode.chapters))}</textarea>
          <label class="switch-label">
            <input type="checkbox" name="draft" value="1" class="switch-input"${episode.draft ? ' checked' : ''}>
            <span class="switch" aria-hidden="true"></span>
            <span>Draft (hidden from the public site and feed)</span>
          </label>
          <div class="save-bar"><span class="save-state" aria-live="polite"></span></div>
        </form>
      </section>
      ${transcriptPanel(episode, show)}`,
    });
  }

  function accountPage(user, message = '', error = '') {
    // Framed inside somebody else's dashboard, signing in is their job:
    // the person reading this got here through their sign-in, not this
    // one, and a second password box only invites them to change a
    // credential they never use. The page is then what is left of it.
    const embedded = isEmbedded();
    return adminPage({
      title: 'Account',
      active: 'account',
      body: `<h1 class="page-title">Account</h1>
      ${embedded ? '' : `<section class="panel narrow">
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
      </section>`}

      ${STUDIO_PUBLISHING ? `<section class="panel narrow">
        <h2>Studio publishing</h2>
        <p class="hint">The key FOSSStudio &mdash; or any other studio &mdash;
        uses to publish a finished recording straight into this instance.
        It was generated when the instance started; copy it into the
        studio's settings. Anyone holding it can publish here, so treat it
        like a password.</p>
        <label for="studio-token">Studio key</label>
        <div class="key-field">
          <input id="studio-token" type="password" value="${esc(settings().studioToken || '')}" readonly>
          <button class="btn-icon btn-reveal" type="button" data-for="studio-token" title="Show or hide" aria-label="Show or hide the key">
            <span class="icon-a">${ICONS.eye}</span><span class="icon-b">${ICONS.eyeOff}</span>
          </button>
          <button class="btn-icon btn-copy" type="button" data-for="studio-token" title="Copy" aria-label="Copy the key">
            <span class="icon-a">${ICONS.copy}</span><span class="icon-b">${ICONS.tick}</span>
          </button>
        </div>
        <p class="hint">Episodes arrive as drafts for you to look over
        before they go out. See <a href="https://github.com/lightmorphic/fosscast/blob/main/docs/studio-integration.md" target="_blank" rel="noopener">the studio integration notes</a>.</p>
        <form method="post" action="/admin/account/studio-key">
          <button class="btn-secondary btn-confirm" type="submit">Generate a new key</button>
        </form>
        <p class="hint">A new key stops the old one working at once, so
        any studio using it needs the new one.</p>
      </section>` : ''}`,
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
    const p = url.pathname;
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
    if (p === '/admin/shows' && req.method === 'GET') { redirect(res, '/admin/episodes'); return true; }
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
    if (p === '/admin/account' && req.method === 'GET') { html(res, accountPage(user)); return true; }
    // Switched off, this falls through to the page-not-found below.
    // Returning unhandled from here would leave the request unanswered.
    if (p === '/admin/account/studio-key' && req.method === 'POST' && STUDIO_PUBLISHING) {
      const value = settings();
      value.studioToken = crypto.randomBytes(32).toString('hex');
      store.save('settings', value);
      html(res, accountPage(user, 'New studio key generated. The old one no longer works.'));
      return true;
    }

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

    const showMatch = p.match(/^\/admin\/shows\/([a-z0-9-]+)(\/episodes|\/delete|\/settings|\/import|\/aliases)?$/);
    if (showMatch) {
      const show = shows().find((s) => s.slug === showMatch[1]);
      if (!show) { html(res, adminPage({ title: 'Not found', body: '<p>Episode not found.</p>' }), 404); return true; }
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
          html(res, episodesPage(entry, `Imported ${imported} show${imported === 1 ? '' : 's'} from the feed.`));
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

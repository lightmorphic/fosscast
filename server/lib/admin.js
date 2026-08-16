'use strict';
// The admin area: login, dashboard, shows and episodes management,
// per-show stream keys, account settings.
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
const { probeDuration } = require('./media');
const importer = require('./import');

// This edition manages one podcast.
const MAX_SHOWS = 1;

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

function keyField(id, value, { regenerateAction } = {}) {
  return `<div class="key-field">
    <input id="${id}" type="password" readonly value="${esc(value)}" aria-label="Stream key">
    <button class="btn-icon btn-reveal" type="button" data-for="${id}" data-tip="Show or hide" aria-label="Show or hide">
      <span class="icon-a">${ICONS.eye}</span><span class="icon-b">${ICONS.eyeOff}</span>
    </button>
    <button class="btn-icon btn-copy" type="button" data-for="${id}" data-tip="Copy" aria-label="Copy">
      <span class="icon-a">${ICONS.copy}</span><span class="icon-b">${ICONS.tick}</span>
    </button>
    ${regenerateAction ? `<form method="post" action="${regenerateAction}" class="inline-form">
      <button class="btn-icon btn-confirm danger" type="submit" data-tip="Regenerate (old key stops working)" aria-label="Regenerate stream key">
        <span class="icon-a">${ICONS.refresh}</span><span class="icon-b">${ICONS.tick}</span>
      </button>
    </form>` : ''}
  </div>`;
}

function deleteButton(action, label) {
  return `<form method="post" action="${action}" class="inline-form">
    <button class="btn-icon btn-confirm danger" type="submit" data-tip="${esc(label)}" aria-label="${esc(label)}">
      <span class="icon-a">${ICONS.trash}</span><span class="icon-b">${ICONS.tick}</span>
    </button>
  </form>`;
}

function createAdminRouter(ctx) {
  const { store, readBody, chat, recordings, mediaDir, dataDir, stats } = ctx;

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
      } else if (!episode.bytes) {
        const res = await fetch(episode.mediaUrl, { method: 'HEAD', signal: AbortSignal.timeout(10000) });
        episode.bytes = Number(res.headers.get('content-length')) || 0;
      }
      store.save('episodes', list);
    } catch { /* sizes stay unknown */ }
  }
  const limiter = new auth.RateLimiter();

  function settings() {
    const value = store.load('settings', () => ({
      secret: crypto.randomBytes(32).toString('hex'),
      publisherToken: (process.env.PUBLISHER_TOKEN || '').trim() || crypto.randomBytes(32).toString('hex'),
    }));
    if (!value.secret) {
      value.secret = crypto.randomBytes(32).toString('hex');
      store.save('settings', value);
    }
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
        <p class="lede">${esc(show.description || 'No description yet: add one in the show settings.')}</p>
        <p class="hint"><a href="/shows/${esc(show.slug)}">Public page</a>
        &middot; <a href="/live/${esc(show.slug)}">live page</a>
        &middot; <a href="/shows/${esc(show.slug)}/feed.xml">RSS feed</a>
        &middot; <a href="/admin/shows/${esc(show.slug)}">manage</a></p>
      </section>`
      : `<section class="panel hero">
        <h1>Welcome to FOSSCast</h1>
        <p class="lede">One thing to do first: create your show. Its
        public pages, RSS feed, stream key and live stage all follow
        from it.</p>
        <p><a class="btn-primary" href="/admin/shows">Create your show</a></p>
      </section>`;
    return adminPage({
      title: 'Dashboard',
      active: 'dashboard',
      body: `${hero}
      <section class="grid">
        <a class="panel stat" href="${show ? `/admin/shows/${esc(show.slug)}` : '/admin/shows'}"><span class="stat-n">${episodeList.length - drafts}</span><span>published episode${episodeList.length - drafts === 1 ? '' : 's'}</span></a>
        <a class="panel stat" href="${show ? `/admin/shows/${esc(show.slug)}` : '/admin/shows'}"><span class="stat-n">${drafts}</span><span>draft${drafts === 1 ? '' : 's'}</span></a>
        <a class="panel stat" href="/admin/recordings"><span class="stat-n">${show && recordings ? recordings.sessions(show.streamKey).length : 0}</span><span>live recording${show && recordings && recordings.sessions(show.streamKey).length === 1 ? '' : 's'} waiting</span></a>
        <a class="panel stat" href="/admin/stats"><span class="stat-n">${stats ? Object.values(stats.data().totals).reduce((a, b) => a + b, 0) : 0}</span><span>downloads all time</span></a>
      </section>
      <p class="hint">Signed in as ${esc(user.email)}.</p>`,
    });
  }

  function showsPage() {
    const episodeList = episodes();
    const rows = shows().map((show) => {
      const count = episodeList.filter((e) => e.showId === show.id).length;
      return `<tr>
        <td><a href="/admin/shows/${esc(show.slug)}">${esc(show.name)}</a></td>
        <td><a href="/shows/${esc(show.slug)}">/shows/${esc(show.slug)}</a></td>
        <td>${count}</td>
        <td class="actions">${deleteButton(`/admin/shows/${esc(show.slug)}/delete`, 'Delete show and its episodes')}</td>
      </tr>`;
    }).join('');
    return adminPage({
      title: 'Shows',
      active: 'shows',
      body: `<h1 class="page-title">Shows</h1>
      <section class="panel">
        <table>
          <caption class="sr-only">All shows</caption>
          <thead><tr><th>Show</th><th>Public page</th><th>Episodes</th><th></th></tr></thead>
          <tbody>${rows || '<tr><td colspan="4" class="hint">No shows yet. Create the first one below.</td></tr>'}</tbody>
        </table>
      </section>
      ${shows().length >= MAX_SHOWS
        ? '<section class="panel"><p class="hint">This edition manages one podcast. Delete the existing show to start over.</p></section>'
        : `<section class="panel">
        <h2>New show</h2>
        <form method="post" action="/admin/shows">
          <label for="name">Name</label>
          <input id="name" name="name" required maxlength="120">
          <label for="description">Description</label>
          <textarea id="description" name="description" rows="4" maxlength="2000"></textarea>
          <button class="btn-primary" type="submit">Create show</button>
        </form>
      </section>`}`,
    });
  }

  function showDetail(show, notice = '') {
    const items = episodes()
      .filter((e) => e.showId === show.id)
      .sort((a, b) => (a.date < b.date ? 1 : -1));
    const nextEpisode = items.reduce((n, e) => Math.max(n, e.episode || 0), 0) + 1;
    const rows = items.map((episode) => `<tr>
      <td><a href="/admin/episodes/${esc(episode.id)}">${esc(episode.title)}</a>${episode.draft ? ' <span class="tag">draft</span>' : ''}</td>
      <td>${esc(episode.date)}</td>
      <td class="media-cell"><a href="${esc(episode.mediaUrl)}">media</a> &middot; <a href="/embed/${esc(episode.id)}">embed</a></td>
      <td class="actions">${deleteButton(`/admin/episodes/${esc(episode.id)}/delete`, 'Delete episode')}</td>
    </tr>`).join('');
    return adminPage({
      title: show.name,
      active: 'shows',
      body: `<h1 class="page-title">${esc(show.name)}</h1>
      ${notice ? `<p class="form-ok">${esc(notice)}</p>` : ''}
      <p class="hint">Public page: <a href="/shows/${esc(show.slug)}">/shows/${esc(show.slug)}</a>
      &middot; RSS: <a href="/shows/${esc(show.slug)}/feed.xml">/shows/${esc(show.slug)}/feed.xml</a>
      &middot; <a href="/live/${esc(show.slug)}">live page</a></p>
      <div class="cols">
      <div>
      <section class="panel">
        <h2>Episodes</h2>
        <table>
          <caption class="sr-only">Episodes of ${esc(show.name)}</caption>
          <thead><tr><th>Title</th><th>Date</th><th>Links</th><th></th></tr></thead>
          <tbody>${rows || '<tr><td colspan="4" class="hint">No episodes yet.</td></tr>'}</tbody>
        </table>
      </section>
      <section class="panel">
        <h2>New episode</h2>
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
          <label for="epDescription">Description</label>
          <textarea id="epDescription" name="description" rows="4" maxlength="4000"></textarea>
          <label class="check-label"><input type="checkbox" name="draft" value="1" class="check"> Save as draft (hidden from the public site and feed)</label>
          <button class="btn-primary" type="submit">Publish episode</button>
        </form>
      </section>
      </div>
      <div>
      <section class="panel">
        <h2>Show settings</h2>
        <form method="post" action="/admin/shows/${esc(show.slug)}/settings">
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
          <label for="sart">Artwork (square, 3000x3000 recommended, JPG or PNG)</label>
          <input id="sart" type="file" accept="image/*" data-upload data-show="${esc(show.slug)}" data-target="artwork" data-status="art-status">
          <p class="hint" id="art-status">${show.artwork ? `Current: ${esc(show.artwork)}` : 'No artwork yet (directories require it).'}</p>
          <input type="hidden" id="artwork" name="artwork" value="${esc(show.artwork || '')}">
          <label class="check-label"><input type="checkbox" name="explicit" value="1" class="check"${show.explicit ? ' checked' : ''}> Explicit content</label>
          <div class="field-row">
            <div><label for="sfundurl">Funding URL (donations, memberships)</label>
            <input id="sfundurl" name="fundingUrl" type="url" maxlength="500" value="${esc(show.funding?.url || '')}"></div>
            <div><label for="sfundlabel">Funding label</label>
            <input id="sfundlabel" name="fundingLabel" maxlength="120" value="${esc(show.funding?.label || '')}" placeholder="Support the show"></div>
          </div>
          <label for="spersons">People (one per line: Name | role, e.g. "Sam Smith | host")</label>
          <textarea id="spersons" name="persons" rows="3">${esc((show.persons || []).map((p) => p.role ? `${p.name} | ${p.role}` : p.name).join('\n'))}</textarea>
          <label class="check-label"><input type="checkbox" name="locked" value="1" class="check"${show.locked ? ' checked' : ''}> Lock the feed (tells other hosts not to import it without permission)</label>
          <button class="btn-primary" type="submit">Save settings</button>
        </form>
      </section>
      <section class="panel">
        <h2>Import from an existing feed</h2>
        <p class="hint">Paste a podcast's RSS URL: every episode comes in
        with its metadata (media stays at the old URLs until you
        re-upload). Missing show settings are filled from the feed.</p>
        <form method="post" action="/admin/shows/${esc(show.slug)}/import">
          <label for="feedUrl">Feed URL</label>
          <input id="feedUrl" name="feedUrl" type="url" required maxlength="1000" placeholder="https://example.com/feed.xml">
          <button class="btn-primary" type="submit">Import episodes</button>
        </form>
      </section>
      </div>
      </div>`,
    });
  }

  function recordingsPage(domain) {
    const cards = shows().map((show) => {
      const sessions = recordings ? recordings.sessions(show.streamKey) : [];
      const rows = sessions.map((s) => `<tr>
        <td>${esc(new Date(s.end).toISOString().slice(0, 16).replace('T', ' '))}</td>
        <td>${(s.bytes / 1048576).toFixed(0)} MB (${s.files.length} part${s.files.length === 1 ? '' : 's'})</td>
        <td class="actions">
          <form method="post" action="/admin/recordings/${esc(show.slug)}/publish" class="inline-form">
            <input type="hidden" name="sessionId" value="${esc(s.id)}">
            <button class="btn-primary btn-small" type="submit">Publish as episode</button>
          </form>
          ${(() => deleteButton(`/admin/recordings/${esc(show.slug)}/discard?sessionId=${encodeURIComponent(s.id)}`, 'Discard recording'))()}
        </td>
      </tr>`).join('');
      return `<section class="panel">
        <h2>${esc(show.name)}</h2>
        ${rows ? `<table><thead><tr><th>Recorded</th><th>Size</th><th></th></tr></thead><tbody>${rows}</tbody></table>`
          : '<p class="hint">No live recordings waiting. Go live and the recording appears here.</p>'}
      </section>`;
    }).join('');
    return adminPage({
      title: 'Recordings',
      active: 'recordings',
      body: `<h1 class="page-title">Live recordings</h1>
      <p class="hint">Every live stream is recorded automatically.
      Publish one as an episode (no re-encoding, instant) or discard it.
      Unpublished recordings are deleted after 7 days, with an email
      reminder on day 5.</p>
      ${cards || '<section class="panel"><p class="hint">No shows yet.</p></section>'}`,
    });
  }

  function streamPage(domain) {
    // Ingest is raw RTMP, so it cannot ride an HTTP tunnel or a proxied
    // DNS record: INGEST_HOST points studios straight at this server
    // when DOMAIN does not.
    const ingestHost = (process.env.INGEST_HOST || '').trim() || domain;
    const rtmpPort = (process.env.RTMP_PORT || '1935').trim();
    const ingestUrl = `rtmp://${ingestHost}${rtmpPort === '1935' ? '' : `:${rtmpPort}`}/live`;
    const cards = shows().map((show) => `<section class="panel">
      <h2>${esc(show.name)}</h2>
      <p class="hint">In the studio, set the stream URL to
      <code>${esc(ingestUrl)}</code> and use this stream key:</p>
      ${keyField(`key-${esc(show.id)}`, show.streamKey, { regenerateAction: `/admin/shows/${esc(show.slug)}/regenerate-key` })}
    </section>`).join('');
    return adminPage({
      title: 'Stream',
      active: 'stream',
      body: `<h1 class="page-title">Stream</h1>
      <p class="hint">Every show has its own stream key. Publishing without
      a valid key is refused; playback is public.</p>
      ${cards || '<section class="panel"><p class="hint">No shows yet: create one under Shows and its stream key appears here.</p></section>'}`,
    });
  }

  function chatPage() {
    const rooms = shows().map((show) => {
      const messages = chat ? chat.recent(show.id, 30) : [];
      const withIps = chat ? chat.room(show.id).messages.slice(-30) : [];
      const rows = withIps.map((m) => `<tr>
        <td class="chat-when">${esc(m.at.slice(11, 16))}</td>
        <td><strong>${esc(m.name)}</strong></td>
        <td>${esc(m.text)}</td>
        <td class="actions">
          <form method="post" action="/admin/chat/${esc(show.id)}/ban" class="inline-form">
            <input type="hidden" name="messageId" value="${esc(m.id)}">
            <button class="btn-icon btn-confirm danger" type="submit" data-tip="Ban this IP and remove their messages" aria-label="Ban sender">
              <span class="icon-a">${ICONS.trash}</span><span class="icon-b">${ICONS.tick}</span>
            </button>
          </form>
        </td>
      </tr>`).join('');
      return `<section class="panel">
        <h2>${esc(show.name)}</h2>
        ${messages.length
          ? `<table><thead><tr><th>Time</th><th>Name</th><th>Message</th><th></th></tr></thead><tbody>${rows}</tbody></table>`
          : '<p class="hint">No recent messages.</p>'}
      </section>`;
    }).join('');

    const bans = (chat ? chat.bannedIps() : []).map((ban) => `<tr>
      <td><code>${esc(ban.ip)}</code></td>
      <td class="hint">${esc(ban.at.slice(0, 16).replace('T', ' '))}</td>
      <td class="actions">
        <form method="post" action="/admin/chat/unban" class="inline-form">
          <input type="hidden" name="ip" value="${esc(ban.ip)}">
          <button class="btn-icon btn-confirm" type="submit" data-tip="Unban" aria-label="Unban">
            <span class="icon-a">${ICONS.refresh}</span><span class="icon-b">${ICONS.tick}</span>
          </button>
        </form>
      </td>
    </tr>`).join('');

    return adminPage({
      title: 'Chat',
      active: 'chat',
      body: `<h1 class="page-title">Chat</h1>
      ${rooms || '<section class="panel"><p class="hint">No shows yet.</p></section>'}
      <section class="panel">
        <h2>Banned IPs</h2>
        ${bans ? `<table><thead><tr><th>IP</th><th>Since</th><th></th></tr></thead><tbody>${bans}</tbody></table>` : '<p class="hint">Nobody is banned.</p>'}
      </section>
      <section class="panel narrow">
        <h2>Filtered words</h2>
        <p class="hint">One per line. Matches are star-masked in chat
        (first and last letter kept) instead of dropping the message.</p>
        <form method="post" action="/admin/chat/words">
          <textarea name="words" rows="6">${esc((chat ? chat.bannedWords() : []).join('\n'))}</textarea>
          <button class="btn-primary" type="submit">Save list</button>
        </form>
      </section>`,
    });
  }

  function episodeEditPage(episode, show) {
    return adminPage({
      title: episode.title,
      active: 'shows',
      body: `<h1 class="page-title">Edit episode</h1>
      <p class="hint"><a href="/admin/shows/${esc(show.slug)}">&larr; ${esc(show.name)}</a></p>
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
          <label for="transcriptFile">Transcript (.vtt, .srt, .txt or .json; podcast apps show it)</label>
          <input id="transcriptFile" type="file" accept=".vtt,.srt,.txt,.json,.html" data-upload data-show="${esc(show.slug)}" data-target="transcript" data-status="tr-status">
          <p class="hint" id="tr-status">${episode.transcript ? `Current: ${esc(episode.transcript)}` : 'None yet.'}</p>
          <input type="hidden" id="transcript" name="transcript" value="${esc(episode.transcript || '')}">
          <label for="chapters">Chapters (one per line: HH:MM:SS Title)</label>
          <textarea id="chapters" name="chapters" rows="5" placeholder="00:00 Intro&#10;05:30 The main topic">${esc(formatChapters(episode.chapters))}</textarea>
          <label class="check-label"><input type="checkbox" name="draft" value="1" class="check"${episode.draft ? ' checked' : ''}> Draft (hidden from the public site and feed)</label>
          <button class="btn-primary" type="submit">Save episode</button>
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
    if (p === '/admin/shows' && req.method === 'GET') { html(res, showsPage()); return true; }
    if (p === '/admin/stream' && req.method === 'GET') { html(res, streamPage(domain)); return true; }
    if (p === '/admin/chat' && req.method === 'GET') { html(res, chatPage()); return true; }
    if (p === '/admin/recordings' && req.method === 'GET') { html(res, recordingsPage(domain)); return true; }
    if (p === '/admin/stats' && req.method === 'GET') { html(res, statsPage()); return true; }
    if (p === '/admin/account' && req.method === 'GET') { html(res, accountPage(user)); return true; }

    const recMatch = p.match(/^\/admin\/recordings\/([a-z0-9-]+)\/(publish|discard)$/);
    if (recMatch && req.method === 'POST' && recordings) {
      const show = shows().find((s) => s.slug === recMatch[1]);
      if (!show) { redirect(res, '/admin/recordings'); return true; }
      const form = await formBody(req, readBody);
      const sessionId = String(form.get('sessionId') || url.searchParams.get('sessionId') || '');
      if (recMatch[2] === 'discard') {
        recordings.discard(show.streamKey, sessionId);
        redirect(res, '/admin/recordings');
        return true;
      }
      const outName = await recordings.publish(show.streamKey, sessionId, mediaDir, show.slug);
      if (outName) {
        const list = episodes();
        const episode = {
          id: crypto.randomUUID(),
          showId: show.id,
          title: `Live show, ${sessionId.slice(0, 10)}`,
          date: new Date().toISOString().slice(0, 10),
          mediaUrl: `/media/${show.slug}/${outName}`,
          description: '',
          type: 'full',
          draft: true,
          createdAt: new Date().toISOString(),
        };
        list.push(episode);
        store.save('episodes', list);
        measure(episode.id);
        redirect(res, `/admin/shows/${show.slug}`);
      } else {
        redirect(res, '/admin/recordings');
      }
      return true;
    }

    if (p === '/admin/chat/words' && req.method === 'POST') {
      const form = await formBody(req, readBody);
      if (chat) chat.saveBannedWords(String(form.get('words') || '').split('\n'));
      redirect(res, '/admin/chat');
      return true;
    }

    if (p === '/admin/chat/unban' && req.method === 'POST') {
      const form = await formBody(req, readBody);
      if (chat) chat.unbanIp(String(form.get('ip') || ''));
      redirect(res, '/admin/chat');
      return true;
    }

    const banMatch = p.match(/^\/admin\/chat\/([a-f0-9-]+)\/ban$/);
    if (banMatch && req.method === 'POST') {
      const form = await formBody(req, readBody);
      if (chat) chat.banBySender(banMatch[1], String(form.get('messageId') || ''), `by ${user.email}`);
      redirect(res, '/admin/chat');
      return true;
    }

    if (p === '/admin/shows' && req.method === 'POST') {
      const form = await formBody(req, readBody);
      const name = String(form.get('name') || '').trim().slice(0, 120);
      const description = String(form.get('description') || '').trim().slice(0, 2000);
      if (!name) { redirect(res, '/admin/shows'); return true; }
      const list = shows();
      if (list.length >= MAX_SHOWS) { redirect(res, '/admin/shows'); return true; }
      let slug = slugify(name);
      while (list.some((s) => s.slug === slug)) slug += '-2';
      list.push({
        id: crypto.randomUUID(),
        slug,
        name,
        description,
        ownerId: user.id,
        streamKey: crypto.randomBytes(16).toString('hex'),
        createdAt: new Date().toISOString(),
      });
      store.save('shows', list);
      redirect(res, `/admin/shows/${slug}`);
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

    const showMatch = p.match(/^\/admin\/shows\/([a-z0-9-]+)(\/episodes|\/delete|\/regenerate-key|\/settings|\/import)?$/);
    if (showMatch) {
      const show = shows().find((s) => s.slug === showMatch[1]);
      if (!show) { html(res, adminPage({ title: 'Not found', body: '<p>Show not found.</p>' }), 404); return true; }
      const action = showMatch[2] || '';

      if (!action && req.method === 'GET') { html(res, showDetail(show)); return true; }

      if (action === '/delete' && req.method === 'POST') {
        store.save('shows', shows().filter((s) => s.id !== show.id));
        store.save('episodes', episodes().filter((e) => e.showId !== show.id));
        redirect(res, '/admin/shows');
        return true;
      }

      if (action === '/regenerate-key' && req.method === 'POST') {
        const list = shows();
        list.find((s) => s.id === show.id).streamKey = crypto.randomBytes(16).toString('hex');
        store.save('shows', list);
        redirect(res, '/admin/stream');
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
            draft: form.get('draft') === '1',
            createdAt: new Date().toISOString(),
          };
          list.push(episode);
          store.save('episodes', list);
          measure(episode.id);
        }
        redirect(res, `/admin/shows/${show.slug}`);
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
        entry.locked = form.get('locked') === '1';
        entry.lockedOwner = user.email;
        const fundingUrl = String(form.get('fundingUrl') || '').trim().slice(0, 500);
        entry.funding = /^https?:\/\//.test(fundingUrl)
          ? { url: fundingUrl, label: String(form.get('fundingLabel') || '').trim().slice(0, 120) }
          : null;
        entry.persons = String(form.get('persons') || '').split('\n')
          .map((line) => {
            const [name, role] = line.split('|').map((s) => s.trim());
            return name ? { name: name.slice(0, 120), role: (role || '').slice(0, 60) } : null;
          })
          .filter(Boolean)
          .slice(0, 20);
        const artwork = String(form.get('artwork') || '').trim();
        if (/^\/media\/[^/]+\/[^/]+$/.test(artwork)) entry.artwork = artwork;
        store.save('shows', list);
        redirect(res, `/admin/shows/${show.slug}`);
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
          store.save('shows', showList);
          html(res, showDetail(entry, `Imported ${imported} episode${imported === 1 ? '' : 's'} from the feed.`));
        } catch (err) {
          html(res, showDetail(show, `Import failed: ${err.message}`));
        }
        return true;
      }
    }

    const episodeMatch = p.match(/^\/admin\/episodes\/([a-f0-9-]+)(\/delete)?$/);
    if (episodeMatch) {
      const episode = episodes().find((e) => e.id === episodeMatch[1]);
      if (!episode) { redirect(res, '/admin/shows'); return true; }
      const show = shows().find((s) => s.id === episode.showId);

      if (episodeMatch[2] === '/delete' && req.method === 'POST') {
        store.save('episodes', episodes().filter((e) => e.id !== episode.id));
        redirect(res, req.headers.referer || '/admin/shows');
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
        if (title) entry.title = title;
        if (/^\d{4}-\d{2}-\d{2}$/.test(date)) entry.date = date;
        if (/^https?:\/\//.test(mediaUrl) || /^\/media\/[^/]+\/[^/]+$/.test(mediaUrl)) {
          if (mediaUrl !== entry.mediaUrl) { entry.mediaUrl = mediaUrl; entry.bytes = 0; entry.duration = null; }
        }
        entry.description = String(form.get('description') || '').trim().slice(0, 4000);
        entry.episode = Number(form.get('episode')) || null;
        entry.season = Number(form.get('season')) || null;
        entry.type = ['full', 'trailer', 'bonus'].includes(form.get('type')) ? form.get('type') : 'full';
        entry.draft = form.get('draft') === '1';
        const transcript = String(form.get('transcript') || '').trim();
        entry.transcript = /^\/media\/[^/]+\/[^/]+$/.test(transcript) ? transcript : entry.transcript;
        entry.chapters = parseChapters(form.get('chapters') || '');
        store.save('episodes', list);
        measure(entry.id);
        redirect(res, `/admin/shows/${show.slug}`);
        return true;
      }
    }

    html(res, adminPage({ title: 'Not found', body: '<p>Page not found.</p>' }), 404);
    return true;
  }

  bootstrap();
  return { handle, settings, shows, users, currentUser, measureEpisode: measure };
}

module.exports = { createAdminRouter, slugify };

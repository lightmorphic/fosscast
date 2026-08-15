'use strict';
// The admin area: login, dashboard, shows and episodes management,
// per-show stream keys, account settings.
//
// Roles, from day one: 'admin' runs the instance and sees everything;
// 'owner' (coming next) manages only their own podcasts. That is the
// whole hosted-service layer: same code for everyone, the instance
// admin can simply create podcasts and owner accounts for others.

const crypto = require('crypto');
const { esc, adminPage, ICONS } = require('./html');
const auth = require('./auth');

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
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' });
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
  const { store, readBody, chat } = ctx;
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
    const showList = shows();
    const episodeCount = episodes().length;
    return adminPage({
      title: 'Dashboard',
      active: 'dashboard',
      body: `<h1 class="page-title">Dashboard</h1>
      <section class="grid">
        <a class="panel stat" href="/admin/shows"><span class="stat-n">${showList.length}</span><span>show${showList.length === 1 ? '' : 's'}</span></a>
        <a class="panel stat" href="/admin/shows"><span class="stat-n">${episodeCount}</span><span>episode${episodeCount === 1 ? '' : 's'}</span></a>
        <a class="panel stat" href="/admin/stream"><span class="stat-n">${showList.length}</span><span>stream key${showList.length === 1 ? '' : 's'}</span></a>
      </section>
      <section class="panel">
        <h2>Signed in as</h2>
        <p>${esc(user.email)} (${esc(user.role)})</p>
      </section>`,
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
      <section class="panel">
        <h2>New show</h2>
        <form method="post" action="/admin/shows">
          <label for="name">Name</label>
          <input id="name" name="name" required maxlength="120">
          <label for="description">Description</label>
          <textarea id="description" name="description" rows="4" maxlength="2000"></textarea>
          <button class="btn-primary" type="submit">Create show</button>
        </form>
      </section>`,
    });
  }

  function showDetail(show) {
    const items = episodes()
      .filter((e) => e.showId === show.id)
      .sort((a, b) => (a.date < b.date ? 1 : -1));
    const rows = items.map((episode) => `<tr>
      <td>${esc(episode.title)}</td>
      <td>${esc(episode.date)}</td>
      <td class="media-cell"><a href="${esc(episode.mediaUrl)}">media</a></td>
      <td class="actions">${deleteButton(`/admin/episodes/${esc(episode.id)}/delete`, 'Delete episode')}</td>
    </tr>`).join('');
    return adminPage({
      title: show.name,
      active: 'shows',
      body: `<h1 class="page-title">${esc(show.name)}</h1>
      <p class="hint">Public page: <a href="/shows/${esc(show.slug)}">/shows/${esc(show.slug)}</a>
      &middot; RSS: <a href="/shows/${esc(show.slug)}/feed.xml">/shows/${esc(show.slug)}/feed.xml</a></p>
      <section class="panel">
        <h2>Episodes</h2>
        <table>
          <caption class="sr-only">Episodes of ${esc(show.name)}</caption>
          <thead><tr><th>Title</th><th>Date</th><th>Media</th><th></th></tr></thead>
          <tbody>${rows || '<tr><td colspan="4" class="hint">No episodes yet.</td></tr>'}</tbody>
        </table>
      </section>
      <section class="panel">
        <h2>New episode</h2>
        <form method="post" action="/admin/shows/${esc(show.slug)}/episodes">
          <label for="title">Title</label>
          <input id="title" name="title" required maxlength="200">
          <label for="date">Date</label>
          <input id="date" name="date" type="date" required value="${new Date().toISOString().slice(0, 10)}">
          <label for="mediaUrl">Media URL (the episode file: your own storage, archive.org, anywhere reachable)</label>
          <input id="mediaUrl" name="mediaUrl" type="url" required maxlength="1000" placeholder="https://archive.org/download/...">
          <label for="epDescription">Description</label>
          <textarea id="epDescription" name="description" rows="4" maxlength="4000"></textarea>
          <button class="btn-primary" type="submit">Publish episode</button>
        </form>
      </section>`,
    });
  }

  function streamPage(domain) {
    const cards = shows().map((show) => `<section class="panel">
      <h2>${esc(show.name)}</h2>
      <p class="hint">In the studio, set the stream URL to
      <code>rtmp://${esc(domain)}/live</code> and use this stream key:</p>
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

    if (p === '/admin' && req.method === 'GET') { html(res, dashboard(user)); return true; }
    if (p === '/admin/shows' && req.method === 'GET') { html(res, showsPage()); return true; }
    if (p === '/admin/stream' && req.method === 'GET') { html(res, streamPage(domain)); return true; }
    if (p === '/admin/chat' && req.method === 'GET') { html(res, chatPage()); return true; }
    if (p === '/admin/account' && req.method === 'GET') { html(res, accountPage(user)); return true; }

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

    const showMatch = p.match(/^\/admin\/shows\/([a-z0-9-]+)(\/episodes|\/delete|\/regenerate-key)?$/);
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
        const validUrl = /^https?:\/\//.test(mediaUrl);
        if (title && validDate && validUrl) {
          const list = episodes();
          list.push({
            id: crypto.randomUUID(),
            showId: show.id,
            title,
            date,
            mediaUrl,
            description,
            createdAt: new Date().toISOString(),
          });
          store.save('episodes', list);
        }
        redirect(res, `/admin/shows/${show.slug}`);
        return true;
      }
    }

    const episodeMatch = p.match(/^\/admin\/episodes\/([a-f0-9-]+)\/delete$/);
    if (episodeMatch && req.method === 'POST') {
      store.save('episodes', episodes().filter((e) => e.id !== episodeMatch[1]));
      redirect(res, req.headers.referer || '/admin/shows');
      return true;
    }

    html(res, adminPage({ title: 'Not found', body: '<p>Page not found.</p>' }), 404);
    return true;
  }

  bootstrap();
  return { handle, settings, shows, users };
}

module.exports = { createAdminRouter, slugify };

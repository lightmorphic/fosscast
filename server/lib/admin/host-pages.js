'use strict';
// The hosts: a podcast is its people, and each of them is a record of
// their own because the site turns them into cards and a page each.

const crypto = require('crypto');
const { esc, adminPage } = require('../html');
const { HOST_PHOTO_SIZE, MAX_HOSTS, slugify, deleteButton } = require('./bits');

module.exports = function create({ store, shows }) {
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
      <p class="hint" id="${prefix}photo-status">${photo ? 'Uploaded.' : 'None yet, so the card uses their initials.'}</p>
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
      and they travel in the feed as well, so apps can name who is on the
      podcast. Drag-free ordering: the arrows set the order they appear in.
      <a class="hint-link" href="/help#hosts">Why they go in the feed</a></p>

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

  return { hostList, uniqueHostSlug, migrateHosts, hostFields, applyHostForm, hostsPage, hostEditPage };
};

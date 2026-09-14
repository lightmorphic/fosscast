'use strict';
// The dashboard and the account page: the two screens that are about
// the person using this rather than about the podcast itself.

const { esc, adminPage, ICONS, isEmbedded, BRAND } = require('../html');
const config = require('../config');

module.exports = function create({ settings, shows, episodes, stats }) {
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
        many episodes as you like.</p>
        <p><a class="btn-primary" href="/admin/podcast">Create your podcast</a></p>
      </section>`;
    return adminPage({
      title: 'Dashboard',
      active: 'dashboard',
      hasPodcast: Boolean(show),
      body: `${hero}
      <section class="grid">
        <a class="panel stat" href="/admin/episodes"><span class="stat-n">${episodeList.length - drafts}</span><span>published episode${episodeList.length - drafts === 1 ? '' : 's'}</span></a>
        <a class="panel stat" href="/admin/episodes"><span class="stat-n">${drafts}</span><span>draft${drafts === 1 ? '' : 's'}</span></a>
        <a class="panel stat" href="/admin/stats"><span class="stat-n">${stats ? Object.values(stats.data().totals).reduce((a, b) => a + b, 0) : 0}</span><span>downloads all time</span></a>
      </section>
      <p class="hint">Signed in as ${esc(user.email)}.</p>`,
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

      ${config.studioPublishing() ? `<section class="panel narrow">
        <h2>Studio publishing</h2>
        <p class="hint">The key FOSSStudio, or any other studio,
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

  return { dashboard, accountPage };
};

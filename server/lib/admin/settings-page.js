'use strict';
// The Settings page: the instance itself, as opposed to the podcast on
// it (the Podcast page) or the person using it (Account).
//
// /admin/settings used to answer with the page-not-found. It was never
// a screen that lost its link and it is not a leftover from splitting
// admin.js up - it has never existed in this repository at all. What was
// missing was the thing itself, because these settings were environment
// variables in a compose file. They are settings now, so the address has
// something to be.

const { esc, adminPage } = require('../html');
const config = require('../config');

module.exports = function create() {
  function settingsPage() {
    const domain = config.get('domain') || '';
    return adminPage({
      title: 'Settings',
      active: 'settings',
      body: `<h1 class="page-title">Settings</h1>
      <p class="hint">This instance, rather than the podcast on it. Every
      box saves itself as you leave it.</p>

      <form method="post" action="/admin/settings" data-autosave>
        <section class="panel" id="sec-address">
          <h2>Site address</h2>
          <label for="domain">Domain</label>
          <input id="domain" name="domain" spellcheck="false" maxlength="200"
            value="${esc(domain)}" placeholder="podcast.example.com">
          <p class="hint">The public name this site answers on. It goes
          into every address in your RSS feed, so a directory that has
          already listed you is sent to it. A whole web address is fine -
          only the part that names the machine is kept.
          <a class="hint-link" href="/help#address">What this is for</a></p>
          ${domain ? `<p class="hint">Your feed reads
          <code>https://${esc(domain)}/shows/…/feed.xml</code></p>`
        : `<p class="hint">Nothing set yet, so addresses in the feed say
          <code>localhost</code>, which is no use to a podcast app.</p>`}
        </section>

        <section class="panel" id="sec-uploads">
          <h2>What this instance does</h2>
          <label class="switch-label">
            <input type="checkbox" name="mediaUploads" value="1" class="switch-input"${config.mediaUploads() ? ' checked' : ''}>
            <span class="switch" aria-hidden="true"></span>
            <span>Accept audio uploaded to this server</span>
          </label>
          <p class="hint">Off, the only way to add an episode is to paste
          the address of a file you keep somewhere else, and no upload box
          is drawn. The counting door works either way.
          <a class="hint-link" href="/help#files">Where files live</a></p>

          <label class="switch-label">
            <input type="checkbox" name="studioPublishing" value="1" class="switch-input"${config.studioPublishing() ? ' checked' : ''}>
            <span class="switch" aria-hidden="true"></span>
            <span>Let a studio publish into this instance</span>
          </label>
          <p class="hint">FOSSStudio, or anything else holding the studio
          key, can push a finished recording here as a draft. Off, that
          door is shut and the key on the Account page is not offered.</p>
        </section>

        <section class="panel" id="sec-elsewhere">
          <h2>Pages served by something else</h2>
          <label for="contactPath">Contact page</label>
          <input id="contactPath" name="contactPath" spellcheck="false" maxlength="200"
            value="${esc(config.get('contactPath') || '')}" placeholder="/contact">
          <p class="hint">Running a contact form of your own beside this -
          a helpdesk, a static page your proxy serves? Name its path and
          Contact joins the menu on your site. A path on this same site
          only: anything else is ignored.</p>

          <label for="maillistEmbed">Mailing-list box</label>
          <input id="maillistEmbed" name="maillistEmbed" spellcheck="false" maxlength="200"
            value="${esc(config.get('maillistEmbed') || '')}" placeholder="/newsletter/box">
          <p class="hint">A path that returns a small piece of HTML - a
          sign-up box from listmonk or similar - and the front page draws
          whatever comes back. Empty, nothing is fetched at all.</p>
        </section>

        <section class="panel" id="sec-framing">
          <h2>Framing this dashboard</h2>
          <label for="frameAncestors">Allowed to hold it in a frame</label>
          <input id="frameAncestors" name="frameAncestors" spellcheck="false" maxlength="300"
            value="${esc(config.get('frameAncestors') || '')}" placeholder="https://portal.example.com">
          <p class="hint">Empty, and no page anywhere may put this
          dashboard in an iframe, which is what you want unless you run
          your own shell around it. Name that shell here and only it may.
          This is a browser rule, not a login: it is one origin, written
          in full.</p>
        </section>

        <div class="save-bar"><span class="save-state" aria-live="polite"></span></div>
      </form>`,
    });
  }

  // A form sends only the boxes that are ticked, so a switch that is
  // absent is a switch somebody turned off. Every field is read from
  // this one form, so an absent text box means an emptied one.
  function applySettingsForm(form) {
    config.set('domain', require('../domain').cleanDomain(form.get('domain')).slice(0, 200));
    config.set('mediaUploads', form.get('mediaUploads') === '1');
    config.set('studioPublishing', form.get('studioPublishing') === '1');
    for (const name of ['contactPath', 'maillistEmbed', 'frameAncestors']) {
      config.set(name, String(form.get(name) || '').trim().slice(0, 300));
    }
  }

  return { settingsPage, applySettingsForm };
};

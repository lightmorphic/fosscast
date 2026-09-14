'use strict';
// The Look page: the accent color of the public site, and the two
// lines of the podcaster's own words that go under its name.

const { esc, adminPage } = require('../html');
const themes = require('../theme');

module.exports = function create() {
  // ---------- Look ----------

  // The public site belongs to the podcaster, so its accent color and
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
      <p class="hint">Your site, your color. Every change saves itself and
      appears in the preview as you go.</p>

      <div class="look-layout">
      <form method="post" action="/admin/look" id="look-form">
        <section class="panel" id="sec-colour">
          <h2>Color</h2>
          <div class="inline-fields">
            <label class="inline-label" for="accent-hex">Hex</label>
            <input id="accent-hex" name="accent" class="hex-field" maxlength="7" value="${esc(t.accent)}">
            <input id="accent-pick" type="color" class="color-chip" value="${esc(t.accent)}" aria-label="Pick a color">
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

  return { lookPage };
};

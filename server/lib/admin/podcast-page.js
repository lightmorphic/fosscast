'use strict';
// The Podcast page: everything about the podcast as a whole, on one
// page of tabs, plus the one-time create form and the feed check.

const { esc, adminPage } = require('../html');
const CATEGORIES = require('../categories');
const { APPS, SUPPORT, SOCIAL, prefixed } = require('../public');
const { siteDomain } = require('../domain');

module.exports = function create({ episodes }) {
  // The Podcast page: everything about the overall podcast on one page.
  // The instance hosts a single podcast; its details are filled in once
  // and rarely change, so they live here, apart from the episodes.
  // The feed check lives here too, since it is about the podcast as a
  // whole.
  function podcastPage(show, notice = '', want = 'basics') {
    const items = episodes().filter((e) => e.showId === show.id);
    const checks = feedChecks(show, items);
    const failed = checks.filter(([, ok]) => !ok);
    // The podcast's own pages, in a column beside the main menu rather
    // than a row of tabs across the top of the work.
    const sections = [['basics', 'Basics'], ['feed', 'Feed'], ['artwork', 'Artwork'],
      ['listen', 'Where to listen'], ['social', 'Social'], ['support', 'Support'],
      ['analytics', 'Analytics']];
    const here = sections.some(([id]) => id === want) ? want : sections[0][0];
    return adminPage({
      title: 'Podcast',
      active: 'podcast',
      subnav: {
        label: 'Podcast',
        items: sections.map(([id, label]) => [`/admin/podcast?s=${id}`, label, id === here]),
      },
      body: `<h1 class="page-title">Podcast</h1>
      ${notice ? `<p class="form-ok">${esc(notice)}</p>` : ''}
      <p class="hint">${esc(show.name)} &middot; <a href="/shows/${esc(show.slug)}">public page</a>
      &middot; <a href="/shows/${esc(show.slug)}/feed.xml">RSS feed</a>
      &middot; <a href="/admin/episodes">episodes</a></p>
      <style>.pane{display:none}.pane-${here}{display:block}</style>

      <section class="panel pane pane-feed" id="sec-import">
        <h2>Import from an existing feed</h2>
        <p class="hint">Paste a podcast's RSS address and every episode comes
        in with its details, keeping the identifiers that stop listeners
        re-downloading anything. The audio stays where it is until you move
        it yourself.
        <a class="hint-link" href="/help#importing">Moving from another host</a></p>
        <form method="post" action="/admin/podcast/import">
          <label for="feedUrl">Feed address</label>
          <input id="feedUrl" name="feedUrl" type="url" required maxlength="1000" placeholder="https://example.com/feed.xml">
          <button class="btn-primary" type="submit">Import episodes</button>
        </form>
      </section>

      <section class="panel pane pane-feed" id="sec-old-addresses">
        <h2>Feed addresses you used to have</h2>
        <p class="hint">If this podcast has lived somewhere else, put the old feed
        address here and it keeps working: anyone still asking for it is sent
        to this podcast's feed, permanently, so Apple, Spotify and the rest
        update themselves. You never open a directory or fill in a form.</p>
        <form method="post" action="/admin/podcast/aliases" data-autosave>
          <label for="feedAliases">Old address</label>
          <input id="feedAliases" name="feedAliases" type="text" spellcheck="false"
            placeholder="https://old.example/@${esc(show.slug)}/feed.xml"
            value="${esc((show.feedAliases || []).join(', '))}">
          <p class="hint">Either shape does: the whole address as your old host
          showed it to you, <code>https://old.example/feed.xml</code>, or
          just the part after the domain, <code>/feed.xml</code>. Only the path
          is kept, so the two come to the same thing. More than one? Separate
          them with commas.</p>
          <p class="save-state" aria-live="polite"></p>
        </form>
        ${(show.feedAliases || []).length ? `<p class="hint">Answering now:
        ${(show.feedAliases || []).map((a) => `<code>${esc(a)}</code>`).join(' &middot; ')}</p>` : ''}
        <p class="hint">This only works for an address on a domain that points
        here. One on your old host's own domain belongs to them - ask them
        to forward it before you leave, which most hosts offer, and the
        directories follow that instead.</p>
      </section>

      <section class="panel pane pane-feed" id="sec-feed">
        <h2>Feed check</h2>
        <p class="hint">What Apple, Spotify and the rest look for before
        they accept a podcast. ${failed.length ? `<strong>${failed.length} still to sort out.</strong>` : 'All good.'}
        <a class="hint-link" href="/help#feed">What these mean</a></p>
        <ul class="checks">
          ${checks.map(([label, ok, fix]) => `<li class="${ok ? 'check-ok' : 'check-bad'}">
            <span aria-hidden="true">${ok ? '&#10003;' : '!'}</span>
            <span>${esc(label)}${ok ? '' : ` - ${esc(fix)}`}</span>
          </li>`).join('')}
        </ul>
      </section>

      <form method="post" action="/admin/podcast/settings" data-autosave>
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
          and use it to verify you own the podcast: Spotify and Apple both
          reject a feed without one. It is published in the feed, so use an
          address you are happy to make public. It does not have to be the
          address you log in with.
          <a class="hint-link" href="/help#directories">Why a feed gets refused</a></p>
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
          <p class="hint" id="art-status">${show.artwork ? 'Uploaded.' : 'None yet. Directories will not list a podcast without it.'}</p>
          <input type="hidden" id="artwork" name="artwork" value="${esc(show.artwork || '')}">
          <input type="hidden" id="artworkWeb" name="artworkWeb" value="${esc(show.artworkWeb || '')}">
          <img class="art-preview" id="art-preview-img" alt="" src="${show.artwork ? esc(show.artworkWeb || show.artwork) : ''}"${show.artwork ? '' : ' style="display:none"'}>
          </div>

          <div class="subsection">
          <label for="sbanner">Website banner</label>
          <p class="hint">The strip across the top of your site, drawn
          <strong>976 x 244</strong> (4:1) - make it that and it is
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
            <input id="sfundlabel" name="fundingLabel" maxlength="120" value="${esc(show.funding?.label || '')}" placeholder="Support the podcast"></div>
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
          server ever sees a download.
          <a class="hint-link" href="/help#prefix">What a prefix costs</a></p>
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
          your podcast page, and goes into the feed as a funding link so apps
          can offer it too. No account yet? The sign-up link beside each
          one takes you straight there.</p>
          ${SUPPORT.map(([key, label, signup, placeholder]) => `<label for="sup-${key}">${esc(label)}
          <a class="hint-link" href="${esc(signup)}" target="_blank" rel="noopener noreferrer">sign up</a></label>
          <input id="sup-${key}" name="support_${key}" type="url" maxlength="500" value="${esc((show.support || {})[key] || '')}" placeholder="${esc(placeholder)}">`).join('')}
        </section>

        <section class="panel pane pane-listen" id="sec-listen">
          <h2>Listen on</h2>
          <p class="hint">Paste the address of your podcast on each platform
          and its button appears on your pages. You get these after
          submitting your RSS feed to them, which usually takes a few days.
          RSS is always offered, so listeners never wait on an approval.</p>
          ${APPS.map(([key, label]) => `<label for="link-${key}">${esc(label)}</label>
          <input id="link-${key}" name="link_${key}" type="url" maxlength="500" value="${esc((show.links || {})[key] || '')}" placeholder="https://">`).join('')}
        </section>

        <section class="panel pane pane-social" id="sec-social">
          <h2>Find us on</h2>
          <p class="hint">Where the podcast talks to its audience. Anything
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
          treated as the same podcast. Importing an old feed fills this in by
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
      hasPodcast: false,
      body: `<section class="panel hero">
        <h1>Create your podcast</h1>
        <p class="lede">Give it a name and a description to begin. You can
        add artwork, a banner and everything else straight after.</p>
      </section>
      <section class="panel">
        <form method="post" action="/admin/podcast/create">
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
  // in the podcast right now.
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
        'An episode has no file size in the feed. Re-save it so the size can be read.'],
      ['Durations known', published.every((e) => Number(e.duration) > 0),
        'An episode has no duration. Re-save it so the length can be read.'],
    ];
  }

  return { podcastPage, createPodcastPage, feedChecks };
};

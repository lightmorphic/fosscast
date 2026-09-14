'use strict';
// The episode screens: the list with the new-episode form under it,
// one episode's own page, and the transcript panel that sits on it.

const { esc, adminPage } = require('../html');
const { siteDomain } = require('../domain');
const transcripts = require('../transcripts');
const { MEDIA_UPLOADS, DEMO, formatDuration, formatChapters, deleteButton } = require('./bits');

module.exports = function create({ episodes, mediaDir }) {
  // The Episodes page: the day-to-day work of adding and editing the
  // podcast's episodes.
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
        <form method="post" action="/admin/episodes/new">
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
          empty and the episode uses the podcast's artwork.</p>
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

  return { episodesPage, transcriptPanel, episodeEditPage };
};

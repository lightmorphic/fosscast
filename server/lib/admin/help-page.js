'use strict';
// The help page, inside FOSSCast.
//
// It is served from here rather than linked to a website for two
// reasons. A self-hosted box may have no internet at all, and a page on
// fosscast.org describes whatever is current rather than the version
// somebody actually installed. So it ships with the code, it makes no
// request to any other machine, and it sits behind the login like every
// other screen.
//
// It is written as answers to the questions people ask, not as a
// reference manual. Every section opens with the question, in the words
// somebody would use, and each has an id so a screen can link straight
// to it - /help#feed, never the top of the page.

const { adminPage, esc } = require('../html');

// The topics, in the order they are written below. The column beside
// the page is built from this list, so a section added without a line
// here is a section nobody can jump to - which a test checks.
const TOPICS = [
  ['directories', 'Getting listed'],
  ['feed', 'The feed check'],
  ['files', 'Where audio lives'],
  ['door', 'The counting door'],
  ['numbers', 'What the numbers mean'],
  ['prefix', 'Analytics prefix'],
  ['hosts', 'Hosts in the feed'],
  ['importing', 'Moving in from elsewhere'],
  ['address', 'The site address'],
  ['login', 'Signing in'],
  ['passkeys', 'Passkeys'],
  ['backups', 'Backups'],
];

// One question and its answer. The heading is the question, and a
// drawing goes above the words when there is a shape to the answer.
function section(id, question, body, figure = '') {
  return `<section class="help-section" id="${id}">
    <h2>${question}</h2>
    ${figure}
    ${body}
  </section>`;
}

// The pictures are drawn here, in the page. A screenshot would be a
// lie the first time the screen it photographed changed, and a file
// fetched from anywhere would break the promise that this page works
// on a machine with no internet at all. They are built from three
// parts - a labeled box, an arrow, and the accent color for the part
// that is this server - so they look like one another rather than like
// twelve drawings.
const FIG_W = 560;

function figure(caption, svg) {
  return `<figure class="help-fig">${svg}<figcaption>${esc(caption)}</figcaption></figure>`;
}

// A row of labeled boxes with arrows between them. Each item is
// [title, under, isThisServer].
function flow(caption, items) {
  const gap = 30;
  const w = Math.round((FIG_W - gap * (items.length - 1)) / items.length);
  const parts = [];
  let x = 0;
  items.forEach(([title, under, mine], i) => {
    parts.push(`<g class="node${mine ? ' mine' : ''}">
<rect x="${x}" y="16" width="${w}" height="78" rx="12"/>
<text class="t" x="${x + w / 2}" y="${under ? 51 : 61}">${esc(title)}</text>
${under ? `<text class="s" x="${x + w / 2}" y="72">${esc(under)}</text>` : ''}
</g>`);
    if (i < items.length - 1) {
      const from = x + w + 6;
      const to = x + w + gap - 6;
      parts.push(`<g class="arrow"><line x1="${from}" y1="55" x2="${to - 7}" y2="55"/>
<polygon points="${to - 7},50 ${to},55 ${to - 7},60"/></g>`);
    }
    x += w + gap;
  });
  return figure(caption, `<svg class="help-diagram" viewBox="0 0 ${FIG_W} 110" role="img" aria-label="${esc(caption)}">${parts.join('')}</svg>`);
}

// A short list of what is true and what is not, with a mark against
// each. The cross is drawn, not colored red: this is a fact about what
// a podcast host can know, not a warning.
function marks(caption, rows) {
  const parts = rows.map(([yes, label], i) => {
    const y = 20 + i * 34;
    return `<g class="mark${yes ? ' yes' : ' no'}">
<circle cx="14" cy="${y}" r="11"/>
${yes ? `<path d="M9 ${y} l4 4 8 -9"/>` : `<path d="M10 ${y - 4} l8 8 M18 ${y - 4} l-8 8"/>`}
<text x="38" y="${y + 5}">${esc(label)}</text>
</g>`;
  });
  return figure(caption, `<svg class="help-diagram help-marks" viewBox="0 0 ${FIG_W} ${rows.length * 34 + 10}" role="img" aria-label="${esc(caption)}">${parts.join('')}</svg>`);
}

// One box with the things inside it named, for an answer whose shape
// is "all of this is in one place".
function bundle(caption, title, items) {
  const cols = 3;
  const cw = Math.round((FIG_W - 40 - 14 * (cols - 1)) / cols);
  const chips = items.map((label, i) => {
    const x = 20 + (i % cols) * (cw + 14);
    const y = 54 + Math.floor(i / cols) * 40;
    return `<g class="chip"><rect x="${x}" y="${y}" width="${cw}" height="30" rx="8"/>
<text x="${x + cw / 2}" y="${y + 20}">${esc(label)}</text></g>`;
  });
  const h = 54 + Math.ceil(items.length / cols) * 40 + 14;
  return figure(caption, `<svg class="help-diagram" viewBox="0 0 ${FIG_W} ${h}" role="img" aria-label="${esc(caption)}">
<g class="node mine"><rect x="2" y="12" width="${FIG_W - 4}" height="${h - 20}" rx="14"/>
<text class="t" x="${FIG_W / 2}" y="38">${esc(title)}</text></g>
${chips.join('')}
</svg>`);
}


// The search. Twelve answers is more than anybody wants to scroll
// through to find the one about robots, so typing narrows the page and
// the column beside it at once. It matches the words of the answer,
// not only the question, because somebody looking for "locked out"
// should land on the sign-in answer whose heading does not say it.
const SEARCH_JS = `(function () {
  var box = document.getElementById('help-q');
  if (!box) return;
  var sections = [].slice.call(document.querySelectorAll('.help-section'));
  var links = [].slice.call(document.querySelectorAll('.subnav-link'));
  var count = document.querySelector('.help-count');
  var none = document.querySelector('.help-none');
  var text = sections.map(function (s) { return s.textContent.toLowerCase(); });
  function run() {
    var q = box.value.trim().toLowerCase();
    var shown = 0;
    sections.forEach(function (s, i) {
      var hit = !q || text[i].indexOf(q) !== -1;
      s.hidden = !hit;
      if (links[i]) links[i].hidden = !hit;
      if (hit) shown++;
    });
    if (none) none.hidden = shown !== 0;
    if (count) count.textContent = q
      ? (shown === 0 ? 'No answers match' : shown + ' of ' + sections.length + ' answers')
      : '';
  }
  box.addEventListener('input', run);
  // Escape clears it, because a search that can only be emptied by
  // holding backspace is a search people stop using.
  box.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { box.value = ''; run(); }
  });
  run();
})();`;

module.exports = function create() {
  function helpPage() {
    return adminPage({
      title: 'Help',
      active: 'help',
      subnav: { label: 'Help', items: TOPICS.map(([id, label]) => [`#${id}`, label, false]) },
      body: `<h1 class="page-title">Help</h1>
      <p class="lede">This page is part of FOSSCast, not a website. It
      works with no internet connection and it describes the version you
      have installed rather than whatever is current somewhere else.</p>

      <form class="help-search" role="search" onsubmit="return false">
        <label class="sr-only" for="help-q">Search the help</label>
        <input id="help-q" type="search" autocomplete="off" spellcheck="false"
          placeholder="Search - artwork, robots, locked out, passkey">
        <p class="help-count" aria-live="polite"></p>
      </form>

      ${section('directories', 'Why is my podcast not showing up in Apple or Spotify?', `
        <p>Because nothing has told them about it yet. FOSSCast makes
        your feed and serves it; getting listed is one form each, filled
        in once, and then they poll the feed forever.</p>
        <p>Submit the address on the Podcast page - the one ending
        <code>/feed.xml</code> - at Apple Podcasts Connect, at Spotify
        for Creators, and at Podcast Index, which is free and feeds a
        good number of smaller apps. Approval takes a few days. Nothing
        stops anybody subscribing by RSS in the meantime.</p>
        <p><b>Why a feed gets refused.</b> Almost always one of five
        things, and the Feed check on the Podcast page lists all of
        them: no artwork, or artwork that is not square and at least
        1400 pixels; no owner email in the feed, which both Apple and
        Spotify insist on; no category; nothing published yet; or an
        address that is not reachable from the outside world. A feed
        behind a private network or a login is a feed they cannot
        read.</p>
        <p>Fix what the check complains about, then submit again. They
        do not tell you which of the five it was.</p>`, flow('One feed, submitted once to each directory, and then they come back for it on their own', [
        ['Your feed', '/feed.xml', true], ['A directory', 'one form each'], ['Listeners', 'in their app']]))}

      ${section('feed', 'The Feed check is complaining. What now?', `
        <p>Every line on it is something a directory looks for before it
        will accept a podcast, so a line with a mark against it is a
        reason to be turned down later. Each one says what to do.</p>
        <p>Two of them catch people out. <b>File sizes known</b> and
        <b>Durations known</b> are about the episodes rather than the
        podcast: the feed has to say how big a file is and how long it
        runs, and FOSSCast works both out by reading the head of the
        file. If it could not - the file moved, or it is somewhere that
        would not answer - the line stays marked. Open the episode and
        save it again and it tries once more; a length typed in by hand
        is always believed.</p>
        <p>The check runs every time the page is drawn, so there is
        nothing to refresh. When it says all good, your feed is
        submittable.</p>`)}

      ${section('files', 'Where should my audio files live?', `
        <p>Wherever you like. FOSSCast is happy with either, and the
        numbers come out the same.</p>
        <p><b>On this server.</b> Upload the file when you add the
        episode and it sits in the data volume beside everything else.
        Simple, and there is nothing else to pay for or keep working.
        The limit is disk.</p>
        <p><b>Somewhere else.</b> Paste the address of a file you keep
        anywhere that serves one - your own storage, a bucket, another
        web server. Nothing is copied here.</p>
        <p>Uploads can be switched off entirely on the Settings page for
        an instance whose audio always lives elsewhere; then the address
        box is the only way in, and no upload box is drawn at all.</p>`, flow('Either place, and the feed and the counting are the same in both', [
        ['Uploaded here', 'the data volume', true], ['Or kept elsewhere', 'your own storage']]))}

      ${section('door', 'What is the counting door?', `
        <p>Every episode in your feed points at this server, even when
        the file itself is somewhere else. A podcast app asks us for the
        episode; we count that request; and then either we hand over the
        file or we tell the app where the file really is and it goes and
        fetches it from there.</p>
        <p>That is the whole trick, and it is why the numbers are the
        same whichever answer you gave to the question above. No audio
        passes through this server for an episode hosted elsewhere - we
        only ever see the request.</p>
        <p>It also means a redirect that is deliberately temporary. A
        permanent one would be remembered by the app, and every download
        after the first would happen without us ever knowing.</p>`, flow('The app always asks this server first, which is the only reason the numbers exist', [
        ['A podcast app', 'asks for the episode'], ['This server', 'counts the request', true], ['The audio', 'here, or fetched\u00a0elsewhere']]))}

      ${section('numbers', 'What do the download numbers actually mean?', `
        <p>They mean a file was sent, and that is all any podcast host
        can honestly tell you. Nobody serving a podcast can know whether
        anybody pressed play, listened to the end, or deleted it
        unheard. Anyone who tells you otherwise is guessing and calling
        it data.</p>
        <p>So FOSSCast says downloads and never listens, and counts them
        to the same rules the industry agreed: one download per listener
        per episode per day, known robots not counted at all, and a
        partial fetch counted only when it starts at the beginning of
        the file.</p>
        <p>A listener is told apart by a salted hash of their address
        and their app. The salt is made fresh on every restart and never
        written down, so the same person is a different anonymous
        counter next week and there is no way to work backwards from
        anything stored here to a person. What is kept is counters - by
        day, by month, by app, by country - and not one row about
        anybody.</p>
        <p>Two consequences worth knowing. Numbers from your old host
        will not match, because every host draws the line somewhere
        slightly different. And an episode whose file lives elsewhere is
        still counted, as long as its address in the feed is this
        server's.</p>`, marks('What a download is, and what no podcast host anywhere can tell you', [
        [true, 'The file was sent'], [true, 'Once per listener, per episode, per day'],
        [false, 'Somebody pressed play'], [false, 'Somebody listened to the end']]))}

      ${section('prefix', 'What is the analytics prefix for?', `
        <p>It puts somebody else in front of your audio so that they
        count it too. OP3 (free and open) and Podtrac work this way: you
        paste their prefix on the Podcast page, and every enclosure in
        your feed points at them first and then on to you.</p>
        <p>Advertisers sometimes want a third party's number rather than
        yours. That is the reason to use one. The cost is real: every
        listener, including the player on your own site, goes through
        somebody else's machine on the way to the audio. Worth deciding
        on purpose rather than because the box was there.</p>`)}

      ${section('hosts', 'Why do the hosts go in the feed?', `
        <p>Because apps have somewhere to put them. A host you add gets
        a card on your site and a page of their own, and goes out in the
        feed as a <code>podcast:person</code> tag with their photo and a
        link - so an app that understands it can show a face beside the
        episode and let somebody follow the person rather than only the
        podcast.</p>
        <p>Apps that do not understand it ignore the tag entirely.
        Nothing breaks either way, which is why it is on by
        default.</p>`)}

      ${section('importing', 'How do I move a podcast here from another host?', `
        <p>Three things, in this order, and none of them involves
        filling in a form at a directory.</p>
        <p><b>Import the episodes.</b> Paste your existing feed's
        address into Import on the Podcast page. Every episode comes
        across with its details and, crucially, the identifier each one
        already has - so nobody's app re-downloads your back catalog
        and shouts at them about ninety new episodes. The audio stays
        where it is until you choose to move it.</p>
        <p><b>Bring the feed's identity.</b> The
        <code>podcast:guid</code> from your old feed goes in the box on
        the Podcast page; importing fills it in by itself when the old
        feed has one. Directories identify a podcast by that rather than
        by its address, so the move is treated as the same podcast.</p>
        <p><b>Keep the old address answering.</b> Put it under "Feed
        addresses you used to have" and anyone still asking for it is
        sent here permanently, which is how Apple, Spotify and the rest
        update themselves without you touching a directory.</p>
        <p>That last one only works for an address on a domain that
        points at this machine. An address on your old host's own domain
        belongs to them: ask them to forward it before you leave, which
        most of them will, and the directories follow that instead.</p>`, flow('Three moves, and nobody has to touch a directory', [
        ['Import the episodes', 'from the old feed'], ['Bring the identity', 'podcast:guid'], ['Keep the old address', 'answering here', true]]))}

      ${section('address', 'What is the site address for?', `
        <p>It is the name this site answers on, and it goes into every
        address inside your RSS feed - the episode pages, the audio, the
        artwork. Get it wrong and a podcast app is handed addresses it
        cannot reach.</p>
        <p>Set it on the Settings page. A whole web address is fine;
        only the part naming the machine is kept. It takes effect on the
        next request, with nothing to restart.</p>
        <p>Leave it empty and the feed says <code>localhost</code>,
        which is no use to anybody but you.</p>`)}

      ${section('login', 'How does the login work, and what if I am locked out?', `
        <p><b>The first time.</b> An instance nobody has claimed asks
        you to set an email and a password, and nothing else. Whoever
        does that first owns it: there is no code to find and no log to
        read.</p>
        <p>So claim it as soon as it is running. Until somebody does,
        anybody who can reach the address could claim it instead of you.
        On a home network that is a minute long and nobody else is
        looking. If the port is open to the internet before you get
        there, it is a real window - keep the port shut until you have
        claimed it, or start FOSSCast with
        <code>REQUIRE_SETUP_CODE=1</code>. That makes it print a
        six-digit code when it starts and ask for it before it will let
        anybody in:</p>
        <p class="cmd"><code>docker compose logs app</code></p>
        <p>The code is held in memory only, never written to disk, and
        changes every time FOSSCast restarts. Lost it? Restart and read
        the new one.</p>
        <p><b>And that is the only sign-up.</b> Once somebody owns the
        instance the setup page is gone and the address refuses
        everybody. There is no second account to make and no way to make
        one.</p>
        <p><b>The password.</b> At least twelve characters, and not one
        of the ones everybody guesses. There are no rules about capitals
        and symbols: those produce <code>Password1!</code>, which is
        short, hard to remember and not much harder to guess. Four or
        five unrelated words in a row is longer, easier to keep in your
        head, and nobody has a list of them. FOSSCast offers you one.</p>
        <p><b>Two-factor.</b> A six-digit code from an app on your
        phone, asked for after the password. There is no square to scan:
        a picture that might not scan leaves you staring at a camera
        with no idea whose fault it is, so the secret is printed in
        groups of four for you to type, with a link beside it for an app
        that takes one.</p>
        <p><b>Locked out.</b> You have the machine, so you have a way
        in. On the server, this prints a new password once:</p>
        <p class="cmd"><code>docker compose exec -T app node reset-password.js</code><br>
        <code>docker compose restart app</code></p>
        <p>The restart is not optional. FOSSCast holds its data in
        memory and would otherwise write the old password back over the
        new one. There is also a link that signs you in once and expires
        in ten minutes:</p>
        <p class="cmd"><code>docker compose exec -T app node admin-login-link.js</code></p>
        <p>Nothing is ever emailed, by design. There is no SMTP to
        configure, no reset link to be filed as spam, and no token
        sitting in a file waiting to be found.</p>`)}

      ${section('passkeys', 'What is a passkey, and should I use one?', `
        <p>Yes, if your browser offers it. Your phone or laptop keeps a
        private key and this server keeps only the matching public half,
        so signing in is one tap with nothing typed, there is no
        password for anybody to phish out of you, and somebody who
        stole the whole data folder would find nothing in it they could
        log in with.</p>
        <p>Two things to know before you rely on one. A passkey needs
        HTTPS: on a plain <code>http://</code> address the browser will
        not make one at all. And a passkey belongs to the exact address
        it was made on - move FOSSCast to a different domain and every
        passkey made on the old one is dead.</p>
        <p>That is why the password stays rather than being replaced.
        Keep it somewhere you can get at it. Add or remove passkeys from
        the Account page; a passkey you remove stops working at
        once.</p>`)}

      ${section('backups', 'What do I need to back up?', `
        <p>One folder: the data volume. Everything FOSSCast knows is in
        it - your podcast, your episodes, your settings, your counters,
        your uploaded audio and artwork. There is no database.</p>
        <p>Copy it while FOSSCast is stopped, or accept that a file
        written during the copy may be a moment out of date. And do not
        write into it from outside while FOSSCast is running: it keeps
        its data in memory and its next save would put it all back the
        way it was.</p>`, bundle('One folder holds all of it - there is no database anywhere else', 'The data volume',
        ['Your podcast', 'Episodes', 'Settings', 'Counters', 'Uploaded audio', 'Artwork']))}

      <p class="help-none" hidden>Nothing here matches that. Try a word
      you would expect to see in the answer - <b>artwork</b>,
      <b>robots</b>, <b>locked out</b>, <b>passkey</b>.</p>

      <script>${SEARCH_JS}</script>`,
    });
  }

  return { helpPage };
};

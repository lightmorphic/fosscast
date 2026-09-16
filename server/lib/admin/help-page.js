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
//
// Nobody reads a wall of paragraphs looking for one fact. So every
// answer opens with a single sentence that is the whole answer, and
// what follows it has a shape - numbered moves, two choices side by
// side, a short list of things that are true, a drawing - rather than
// four more paragraphs. The words are the same words; the difference is
// that the eye can land.

const { adminPage, esc } = require('../html');

// ---------------------------------------------------------------- bits

// The one-sentence answer, before any detail. If somebody reads only
// this line they should still be able to walk away and do the thing.
function lead(text) {
  return `<p class="answer-lead">${text}</p>`;
}

function para(text) {
  return `<p>${text}</p>`;
}

// A named part of a long answer. Not a question, so not an h2.
function part(title) {
  return `<h3 class="help-h3">${esc(title)}</h3>`;
}

// Moves to make, in order, numbered down the side.
function steps(items) {
  return `<ol class="help-steps">${items.map(([title, body]) =>
    `<li><b>${esc(title)}</b>${body ? ` ${body}` : ''}</li>`).join('')}</ol>`;
}

// Two choices side by side, because a paragraph about one and then a
// paragraph about the other makes a reader hold the first in their head
// while they read the second.
function two(cards) {
  return `<div class="help-two">${cards.map(([title, body]) =>
    `<div class="help-mini"><h4>${esc(title)}</h4><p>${body}</p></div>`).join('')}</div>`;
}

// Short statements, one line each, with a mark against them.
function points(items) {
  return `<ul class="help-points">${items.map((t) => `<li>${t}</li>`).join('')}</ul>`;
}

// The aside that stops somebody making the mistake. A gray panel and
// nothing else - no color down the side, no shouting.
function note(text) {
  return `<p class="help-note">${text}</p>`;
}

// Something to type on the server, set apart from the sentence that
// asked for it.
function cmd(lines) {
  return `<p class="cmd">${lines.map((l) => `<code>${esc(l)}</code>`).join('<br>')}</p>`;
}

// ------------------------------------------------------------ drawings

// The pictures are drawn here, in the page. A screenshot would be a lie
// the first time the screen it photographed changed, and a file fetched
// from anywhere would break the promise that this page works on a
// machine with no internet at all. They are built from three parts - a
// labeled box, an arrow, and the accent color for the part that is this
// server - so they look like one another rather than like twelve
// drawings.
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

// What is true and what is not, with a mark against each. The cross is
// drawn rather than colored red: this is a fact about what a podcast
// host can know, not a warning about something going wrong.
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

// One box with the things inside it named, for an answer whose shape is
// "all of this is in one place".
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

// A window with a bar across the top of it, for an answer about an
// address rather than a flow.
function window_(caption, address, note_) {
  return figure(caption, `<svg class="help-diagram" viewBox="0 0 ${FIG_W} 132" role="img" aria-label="${esc(caption)}">
<g class="node"><rect x="2" y="10" width="${FIG_W - 4}" height="112" rx="12"/></g>
<g class="bar"><rect x="18" y="26" width="${FIG_W - 36}" height="30" rx="8"/>
<text x="32" y="46">${esc(address)}</text></g>
<text class="s" x="${FIG_W / 2}" y="92">${esc(note_)}</text>
</svg>`);
}

// -------------------------------------------------------------- topics

// The icon on a topic card. Twenty-four pixels, drawn in strokes, one
// idea each: nothing here is decoration, and none of it is an emoji.
const MARKS = {
  directories: '<path d="M4 18V6a2 2 0 0 1 2-2h5l2 2h5a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/>',
  feed: '<path d="M5 12l4 4 10-10"/>',
  files: '<path d="M3 8h18M3 8v9a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8M3 8l2-3h14l2 3"/>',
  door: '<path d="M5 20V4h9v16zM14 12h5M17 9l3 3-3 3"/>',
  numbers: '<path d="M4 20V10M10 20V5M16 20v-7M22 20H2"/>',
  prefix: '<path d="M4 12h5M15 12h5M9 8l6 8M9 16l6-8"/>',
  hosts: '<path d="M12 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM5 20a7 7 0 0 1 14 0"/>',
  importing: '<path d="M12 3v11M8 10l4 4 4-4M4 19h16"/>',
  address: '<path d="M3 7h18v12H3zM3 11h18M6 9h.01M9 9h.01"/>',
  login: '<path d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4M14 12H8M17 9l3 3-3 3"/>',
  passkeys: '<path d="M14 10a4 4 0 1 0-4 4h1l1 2 2-1 2 1 1-2v-3z"/>',
  backups: '<path d="M4 6a8 3 0 1 0 16 0 8 3 0 1 0-16 0M4 6v12a8 3 0 0 0 16 0V6M4 12a8 3 0 0 0 16 0"/>',
};

function icon(id) {
  return `<svg class="help-card-icon" viewBox="0 0 24 24" aria-hidden="true">${MARKS[id] || ''}</svg>`;
}

// Every topic: its id, the words on its card, and the one line under
// them. The column beside the page and the cards at the top are both
// built from this, so a section added without a line here is a section
// nobody can find - which a test checks.
const TOPICS = [
  ['directories', 'Getting listed', 'Apple, Spotify and the rest, one form each'],
  ['feed', 'The feed check', 'What each line wants, and the two that catch people'],
  ['files', 'Where audio lives', 'Here, or anywhere else that serves a file'],
  ['door', 'The counting door', 'Why every episode address points at this server'],
  ['numbers', 'What the numbers mean', 'Downloads, never listens, and how they are counted'],
  ['prefix', 'Analytics prefix', 'Letting somebody else count your audio too'],
  ['hosts', 'Hosts in the feed', 'A face beside the episode in apps that show one'],
  ['importing', 'Moving in from elsewhere', 'Three moves, and no forms at any directory'],
  ['address', 'The site address', 'The name that goes into every address in the feed'],
  ['login', 'Signing in', 'Claiming the instance, and getting back in'],
  ['passkeys', 'Passkeys', 'One tap, nothing typed, nothing to phish'],
  ['backups', 'Backups', 'One folder, and when to copy it'],
];

function cards() {
  return `<nav class="help-cards" aria-label="Every answer on this page">
    ${TOPICS.map(([id, title, line]) => `<a class="help-card" href="#${id}">
      ${icon(id)}
      <h3>${esc(title)}</h3>
      <p>${esc(line)}</p>
    </a>`).join('')}
  </nav>`;
}

// One question and its answer. The heading is the question.
function section(id, question, body) {
  return `<section class="help-section" id="${id}">
    <h2>${question}</h2>
    ${body}
  </section>`;
}

// The search. Twelve answers is more than anybody wants to scroll
// through to find the one about robots, so typing narrows the page, the
// cards and the column beside it at once. It matches the words of the
// answer, not only the question, because somebody looking for "locked
// out" should land on the sign-in answer whose heading does not say it.
const SEARCH_JS = `(function () {
  var box = document.getElementById('help-q');
  if (!box) return;
  var sections = [].slice.call(document.querySelectorAll('.help-section'));
  var links = [].slice.call(document.querySelectorAll('.subnav-link'));
  var cards = [].slice.call(document.querySelectorAll('.help-card'));
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
      if (cards[i]) cards[i].hidden = !hit;
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

      ${cards()}

      ${section('directories', 'Why is my podcast not showing up in Apple or Spotify?', `
        ${lead(`Because nothing has told them about it yet. FOSSCast makes your feed and serves it; getting listed is one form each, filled in once, and then they poll the feed forever.`)}
        ${flow('One feed, submitted once to each directory, and then they come back for it on their own', [
          ['Your feed', '/feed.xml', true], ['A directory', 'one form each'], ['Listeners', 'in their app']])}
        ${steps([
          ['Copy the feed address.', 'It is on the Podcast page, and it ends <code>/feed.xml</code>.'],
          ['Submit it at Apple Podcasts Connect.', 'Free, and the one most people mean by "listed".'],
          ['Submit it at Spotify for Creators.', 'Also free, and a separate form.'],
          ['Submit it at Podcast Index.', 'Free, and it feeds a good number of smaller apps.'],
        ])}
        ${note('Approval takes a few days. Nothing stops anybody subscribing by RSS in the meantime.')}
        ${part('Why a feed gets refused')}
        ${para('Almost always one of these five, and the Feed check on the Podcast page lists all of them.')}
        ${points([
          'No artwork, or artwork that is not square and at least 1400 pixels.',
          'No owner email in the feed, which both Apple and Spotify insist on.',
          'No category.',
          'Nothing published yet.',
          'An address that is not reachable from the outside world - a feed behind a private network or a login is a feed they cannot read.',
        ])}
        ${para('Fix what the check complains about, then submit again. They do not tell you which of the five it was.')}`)}

      ${section('feed', 'The Feed check is complaining. What now?', `
        ${lead(`Every line on it is something a directory looks for before it will accept a podcast, so a line with a mark against it is a reason to be turned down later. Each one says what to do.`)}
        ${part('The two that catch people out')}
        ${two([
          ['File sizes known', 'The feed has to say how big each file is. FOSSCast works it out by reading the head of the file.'],
          ['Durations known', 'And how long it runs. Same method, same moment.'],
        ])}
        ${para(`Both are about the episodes rather than the podcast. If FOSSCast could not read a file - it moved, or it is somewhere that would not answer - the line stays marked.`)}
        ${note('Open the episode and save it again and it tries once more. A length typed in by hand is always believed.')}
        ${para(`The check runs every time the page is drawn, so there is nothing to refresh. When it says all good, your feed is submittable.`)}`)}

      ${section('files', 'Where should my audio files live?', `
        ${lead('Wherever you like. FOSSCast is happy with either, and the numbers come out the same.')}
        ${two([
          ['On this server', 'Upload the file when you add the episode and it sits in the data volume beside everything else. Simple, and there is nothing else to pay for or keep working. The limit is disk.'],
          ['Somewhere else', 'Paste the address of a file you keep anywhere that serves one - your own storage, a bucket, another web server. Nothing is copied here.'],
        ])}
        ${note(`Uploads can be switched off entirely on the Settings page for an instance whose audio always lives elsewhere. Then the address box is the only way in, and no upload box is drawn at all.`)}`)}

      ${section('door', 'What is the counting door?', `
        ${lead(`Every episode in your feed points at this server, even when the file itself is somewhere else - so we see every request, and that is where the numbers come from.`)}
        ${flow('The app always asks this server first, which is the only reason the numbers exist', [
          ['A podcast app', 'asks for the episode'], ['This server', 'counts the request', true], ['The audio', 'here, or fetched elsewhere']])}
        ${steps([
          ['A podcast app asks us for the episode.', ''],
          ['We count that request.', ''],
          ['We hand over the file, or tell the app where it really is.', 'The app then fetches it from there.'],
        ])}
        ${points([
          'No audio passes through this server for an episode hosted elsewhere - we only ever see the request.',
          'The redirect is deliberately temporary. A permanent one would be remembered by the app, and every download after the first would happen without us ever knowing.',
        ])}`)}

      ${section('numbers', 'What do the download numbers actually mean?', `
        ${lead('They mean a file was sent, and that is all any podcast host can honestly tell you.')}
        ${marks('What a download is, and what no podcast host anywhere can tell you', [
          [true, 'The file was sent'], [true, 'Once per listener, per episode, per day'],
          [false, 'Somebody pressed play'], [false, 'Somebody listened to the end']])}
        ${para(`Nobody serving a podcast can know whether anybody pressed play, listened to the end, or deleted it unheard. Anyone who tells you otherwise is guessing and calling it data.`)}
        ${part('How they are counted')}
        ${para(`FOSSCast says downloads and never listens, and counts them to the same rules the industry agreed.`)}
        ${points([
          'One download per listener, per episode, per day.',
          'Known robots not counted at all.',
          'A partial fetch counted only when it starts at the beginning of the file.',
        ])}
        ${part('Who a listener is')}
        ${para(`A listener is told apart by a salted hash of their address and their app. The salt is made fresh on every restart and never written down, so the same person is a different anonymous counter next week and there is no way to work backwards from anything stored here to a person. What is kept is counters - by day, by month, by app, by country - and not one row about anybody.`)}
        ${note(`Numbers from your old host will not match, because every host draws the line somewhere slightly different. And an episode whose file lives elsewhere is still counted, as long as its address in the feed is this server’s.`)}`)}

      ${section('prefix', 'What is the analytics prefix for?', `
        ${lead('It puts somebody else in front of your audio so that they count it too.')}
        ${flow('With a prefix set, every listener goes through the other company first', [
          ['A podcast app', ''], ['OP3 or Podtrac', 'counts it'], ['This server', 'counts it', true]])}
        ${two([
          ['Why you might', 'Advertisers sometimes want a third party’s number rather than yours. That is the reason to use one.'],
          ['What it costs', 'Every listener, including the player on your own site, goes through somebody else’s machine on the way to the audio.'],
        ])}
        ${para(`OP3 is free and open; Podtrac works the same way. Paste the prefix on the Podcast page and every enclosure in your feed points at them first and then on to you.`)}
        ${note('Worth deciding on purpose rather than because the box was there.')}`)}

      ${section('hosts', 'Why do the hosts go in the feed?', `
        ${lead('Because apps have somewhere to put them.')}
        ${points([
          'A host you add gets a card on your site and a page of their own.',
          'They go out in the feed as a <code>podcast:person</code> tag, with their photo and a link.',
          'An app that understands it can show a face beside the episode and let somebody follow the person rather than only the podcast.',
        ])}
        ${note('Apps that do not understand it ignore the tag entirely. Nothing breaks either way, which is why it is on by default.')}`)}

      ${section('importing', 'How do I move a podcast here from another host?', `
        ${lead('Three moves, in this order, and none of them involves filling in a form at a directory.')}
        ${flow('Three moves, and nobody has to touch a directory', [
          ['Import the episodes', 'from the old feed'], ['Bring the identity', 'podcast:guid'], ['Keep the old address', 'answering here', true]])}
        ${steps([
          ['Import the episodes.', 'Paste your existing feed’s address into Import on the Podcast page. Every episode comes across with its details and, crucially, the identifier each one already has - so nobody’s app re-downloads your back catalog and shouts at them about ninety new episodes. The audio stays where it is until you choose to move it.'],
          ['Bring the feed’s identity.', 'The <code>podcast:guid</code> from your old feed goes in the box on the Podcast page; importing fills it in by itself when the old feed has one. Directories identify a podcast by that rather than by its address, so the move is treated as the same podcast.'],
          ['Keep the old address answering.', 'Put it under "Feed addresses you used to have" and anyone still asking for it is sent here permanently, which is how Apple, Spotify and the rest update themselves without you touching a directory.'],
        ])}
        ${note(`That last one only works for an address on a domain that points at this machine. An address on your old host’s own domain belongs to them: ask them to forward it before you leave, which most of them will, and the directories follow that instead.`)}`)}

      ${section('address', 'What is the site address for?', `
        ${lead(`It is the name this site answers on, and it goes into every address inside your RSS feed - the episode pages, the audio, the artwork.`)}
        ${window_('Every address in the feed is built from this one name',
          'https://your-podcast.example', 'Get it wrong and a podcast app is handed addresses it cannot reach')}
        ${points([
          'Set it on the Settings page.',
          'A whole web address is fine - only the part naming the machine is kept.',
          'It takes effect on the next request, with nothing to restart.',
        ])}
        ${note('Leave it empty and the feed says <code>localhost</code>, which is no use to anybody but you.')}`)}

      ${section('login', 'How does the login work, and what if I am locked out?', `
        ${lead(`An instance nobody has claimed asks you to set an email and a password. Whoever does that first owns it: there is no code to find and no log to read.`)}
        ${part('Claim it as soon as it is running')}
        ${para(`Until somebody does, anybody who can reach the address could claim it instead of you. On a home network that is a minute long and nobody else is looking. If the port is open to the internet before you get there, it is a real window.`)}
        ${para(`Keep the port shut until you have claimed it, or start FOSSCast with <code>REQUIRE_SETUP_CODE=1</code>. That makes it print a six-digit code when it starts and ask for it before it will let anybody in:`)}
        ${cmd(['docker compose logs app'])}
        ${note(`The code is held in memory only, never written to disk, and changes every time FOSSCast restarts. Lost it? Restart and read the new one.`)}
        ${para(`And that is the only sign-up. Once somebody owns the instance the setup page is gone and the address refuses everybody. There is no second account to make and no way to make one.`)}
        ${part('The password')}
        ${two([
          ['At least twelve characters', 'And not one of the ones everybody guesses. There are no rules about capitals and symbols: those produce <code>Password1!</code>, which is short, hard to remember and not much harder to guess.'],
          ['Four or five words in a row', 'Longer, easier to keep in your head, and nobody has a list of them. FOSSCast offers you one.'],
        ])}
        ${part('Two-factor')}
        ${para(`A six-digit code from an app on your phone, asked for after the password. There is no square to scan: a picture that might not scan leaves you staring at a camera with no idea whose fault it is, so the secret is printed in groups of four for you to type, with a link beside it for an app that takes one.`)}
        ${part('Locked out')}
        ${para('You have the machine, so you have a way in. On the server, this prints a new password once:')}
        ${cmd(['docker compose exec -T app node reset-password.js', 'docker compose restart app'])}
        ${note(`The restart is not optional. FOSSCast holds its data in memory and would otherwise write the old password back over the new one.`)}
        ${para('There is also a link that signs you in once and expires in ten minutes:')}
        ${cmd(['docker compose exec -T app node admin-login-link.js'])}
        ${para(`Nothing is ever emailed, by design. There is no SMTP to configure, no reset link to be filed as spam, and no token sitting in a file waiting to be found.`)}`)}

      ${section('passkeys', 'What is a passkey, and should I use one?', `
        ${lead('Yes, if your browser offers it.')}
        ${points([
          'Your phone or laptop keeps a private key and this server keeps only the matching public half.',
          'Signing in is one tap with nothing typed.',
          'There is no password for anybody to phish out of you.',
          'Somebody who stole the whole data folder would find nothing in it they could log in with.',
        ])}
        ${part('Two things to know first')}
        ${two([
          ['A passkey needs HTTPS', 'On a plain <code>http://</code> address the browser will not make one at all.'],
          ['It belongs to one address', 'Move FOSSCast to a different domain and every passkey made on the old one is dead.'],
        ])}
        ${note(`That is why the password stays rather than being replaced. Keep it somewhere you can get at it. Add or remove passkeys from the Account page; a passkey you remove stops working at once.`)}`)}

      ${section('backups', 'What do I need to back up?', `
        ${lead(`One folder: the data volume. Everything FOSSCast knows is in it, and there is no database.`)}
        ${bundle('One folder holds all of it - there is no database anywhere else', 'The data volume',
          ['Your podcast', 'Episodes', 'Settings', 'Counters', 'Uploaded audio', 'Artwork'])}
        ${points([
          'Copy it while FOSSCast is stopped, or accept that a file written during the copy may be a moment out of date.',
          'Do not write into it from outside while FOSSCast is running: it keeps its data in memory and its next save would put it all back the way it was.',
        ])}
        ${note('The Backup page takes the whole instance away as one file and puts it back again, which is the same folder by another road.')}`)}

      <p class="help-none" hidden>Nothing here matches that. Try a word
      you would expect to see in the answer - <b>artwork</b>,
      <b>robots</b>, <b>locked out</b>, <b>passkey</b>.</p>

      <script>${SEARCH_JS}</script>`,
    });
  }

  return { helpPage };
};

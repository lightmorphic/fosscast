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

const { adminPage } = require('../html');

// One question and its answer. The heading is the question.
function section(id, question, body) {
  return `<section class="help-section" id="${id}">
    <h2>${question}</h2>
    ${body}
  </section>`;
}

module.exports = function create() {
  function helpPage() {
    return adminPage({
      title: 'Help',
      active: 'help',
      body: `<h1 class="page-title">Help</h1>
      <p class="lede">This page is part of FOSSCast, not a website. It
      works with no internet connection and it describes the version you
      have installed rather than whatever is current somewhere else.</p>

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
        do not tell you which of the five it was.</p>`)}

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
        box is the only way in, and no upload box is drawn at all.</p>`)}

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
        after the first would happen without us ever knowing.</p>`)}

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
        server's.</p>`)}

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
        most of them will, and the directories follow that instead.</p>`)}

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
        <p><b>The first time.</b> An instance nobody has claimed prints
        a six-digit code in its own log and asks for it before letting
        anybody set a password. Being able to read that log is the proof
        that the machine is yours - otherwise the first stranger to find
        the address would own your podcast. On the server:</p>
        <p class="cmd"><code>docker compose logs app</code></p>
        <p>The code is held in memory only, never written to disk, and
        changes every time FOSSCast restarts. Lost it? Restart and read
        the new one.</p>
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
        way it was.</p>`)}`,
    });
  }

  return { helpPage };
};

# Changelog

All notable changes to FOSSCast are documented here.

## Unreleased

- **The login is set in FOSSCast, not in a compose file.** `ADMIN_EMAIL`
  and `ADMIN_PASSWORD` are gone from the install. The first run prints a
  six-digit setup code in the container's log and nowhere else, and the
  page asks for it before it will let anybody claim the instance: being
  able to run `docker compose logs app` is the proof that the machine is
  yours. The code lives in memory, changes on every restart, and is spent
  the moment an account exists.

  The password rule is enforced rather than advised: twelve characters or
  more, and the openers (`password123`, `letmein`, `qwerty…`) are refused
  by name with a sentence saying what would pass. There are deliberately
  no rules about capitals and symbols - they produce `Password1!` and
  teach nobody anything. A six-word passphrase is offered beside the box.
  The same rule now applies to changing a password later.

- **Passkeys, and two-factor codes.** A passkey is offered during setup,
  in the same minute the password is set, and on the Account page after
  that: the browser keeps the private key, this server keeps only a
  public key, and signing in is one tap with nothing typed. WebAuthn is
  verified here in `lib/passkeys.js` rather than by a dependency.
  Passkeys need HTTPS and only work on the address they were made on, so
  the password stays as the way back in and says so on the page.

  Two-factor is the ordinary TOTP kind from any authenticator app,
  offered at setup rather than buried. There is no QR code, on purpose: a
  picture that might not scan leaves somebody staring at a camera with no
  idea whose fault it is, so the secret is printed in groups of four and
  an `otpauth:` link is offered beside it.

  Nobody running an instance today is dragged through any of this. If
  `ADMIN_EMAIL` and `ADMIN_PASSWORD` are still in a compose file they go
  on deciding the login exactly as before, and the log says once, on
  every start, that they no longer have to.

- **A Settings page, because /admin/settings was nothing at all.** It
  answered with the page-not-found and nothing linked to it. It was not a
  screen that lost its link and not a leftover from splitting `admin.js`
  into `lib/admin/`: it has never existed in this repository, and the
  reason is that an instance's own decisions were environment variables
  in a compose file. They are settings now - the site's domain, whether
  audio may be uploaded here, whether a studio may publish here, a
  contact path, a mailing-list box, and the one origin allowed to frame
  the dashboard - on their own page with its own menu item, saving as you
  type and taking effect without a restart.

  An instance that still has those variables in its compose file keeps
  working: on the first start after this, each one is copied into the
  store and a line in the log says that it can come out of the file. The
  variable is read once and never again.

- **The podcast and the episode, and no third word.** There is a podcast
  and there are its episodes; "show" meant both, sometimes in the same
  sentence, and it is gone from everything a person reads. The worst of
  it was on the dashboard, which told a newcomer to add "as many shows
  (episodes) as you like".

  The admin addresses went the same way. They used to read
  `/admin/shows/<the-podcast-slug>/settings`: a tool for managing many
  podcasts, with a slug in the path that can only ever have one value.
  They are now `/admin/podcast/settings`, `/admin/podcast/import`,
  `/admin/podcast/aliases`, `/admin/podcast/create` and
  `/admin/episodes/new`. The old addresses still answer - they are
  rewritten, not redirected, because a redirect would arrive without the
  form body. Nothing outside the admin area changed: the public pages
  and the feed are where they were, because a feed address is printed in
  every directory and moving it is a different job.

  The store still calls the collection `shows`; renaming it is a data
  migration and does not belong in a commit about words.

## 0.1.0 - 2026-09-13

The first public release, and the number says what it is: a beta.

**This is a public beta. It is not ready to be relied on. Data loss and
breaking changes are possible. Please do not put a real podcast on it
yet.** The README says so above everything else, and releases are marked
as pre-release on GitHub.

What is here:

- **One podcast, its feed and its website.** An instance hosts a single
  podcast. Every published episode gets a page with a player, artwork
  and its chapters and transcript where it has them, and the feed those
  pages belong to is built to what Apple, Spotify and the Podcast Index
  ask for: the full iTunes namespace, and the Podcasting 2.0 tags for
  transcripts, chapters, people, funding, the podcast GUID and a locked
  feed.

- **Download counting to the IAB rules.** A listener is told apart by a
  salted hash of address and app that is never written down and changes
  on every restart; the same listener asking twice in a day counts once;
  known bots do not count at all. What is kept is counters - by day, by
  month, by app, by platform, by language, by country - and not a row
  about anybody. The statistics page draws them, and says plainly what
  it cannot know.

- **Media wherever you keep it.** Upload an episode to the machine this
  runs on, or paste the address of a file you host elsewhere. Either way
  the counting door is this server, so the numbers are the same. An
  analytics prefix such as OP3 can sit in front of it.

- **The people on it.** Every host gets a photo, a role and a write-up,
  a card on the site's Hosts page and a page of their own, and goes out
  in the feed as `podcast:person` so apps can put a face to a voice.

- **Where to find you, and how to pay for it.** Eighteen social networks
  with Matrix first, seven funding services, and the listening apps'
  addresses, all as buttons on the page. Funding links go out as
  `podcast:funding` too.

- **Arriving and leaving.** Paste your old feed and the episodes come
  across with their GUIDs intact, so the directories see the same
  podcast and nobody's app re-downloads the back catalogue. Old feed
  addresses keep working through aliases. Nothing holds you here.

- **A studio can publish straight in.** A token-authenticated API takes
  a finished recording and its details and files it as a draft for you
  to look over. FOSSStudio speaks it; so can anything else.

- **Your site, your colour.** A Look tab sets the accent colour, a
  tagline and a footer line, with the real front page beside it as a
  preview. Every other shade is worked out from the one colour, and link
  text is walked darker or lighter until it clears 4.5:1 against the
  page.

What it is built from:

- Plain Node with **zero runtime npm dependencies**, and nothing shelled
  out to: no ffmpeg, no image library, no database. The data is JSON
  files in one directory you can read and back up yourself. The web
  assets are plain CSS and inline SVG with one self-hosted variable
  font - no framework, no build step, no CDN, no trackers, nothing
  phoning home.

- The licence is the **GNU AGPL v3**: the GPL asks for changes to be
  shared when the software is handed to someone, and the AGPL asks for
  them when it is run for someone over a network as well. This project
  is the free edition of a hosted service, so that is the case that
  matters. Nothing changes for anyone who runs it for themselves.
  `TRADEMARKS.md` sits beside it: the code is free, the names are not.

- `NOTICE.md`, so the ownership claim can be checked rather than taken
  on trust. Every line of FOSSCast is Lightmorphic's own work; the only
  third-party material in the repository is the Manrope typeface. The
  file lists what the app runs inside and says plainly that the inline
  brand icons are drawings of other people's trademarks.

- `CONTRIBUTING.md` explains why code is not merged during the beta: one
  person owning all of it is what makes the hosted edition possible, and
  a patch from a stranger would end that for the patch. It says what
  happens afterwards, and that it has not been decided.

- The README says what FOSSCast does *not* do, and that the list is
  settled rather than a queue: no members, no advertising, no
  newsletter, no blog, no studio, no listener accounts, one podcast per
  instance.

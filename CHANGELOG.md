# Changelog

All notable changes to FOSSCast are documented here.

## Unreleased

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

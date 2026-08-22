# Changelog

All notable changes to FOSSCast are documented here.

## Unreleased

- The Look controls are chips, not slabs. Every radio was being stretched
  to the full width of its card by the global input rule, which pushed
  the labels into odd narrow columns and made the page enormous. Choices
  now sit side by side as small pills, with one note underneath for
  whichever is chosen rather than a note on every option at once; sliders
  carry their value in their own label; the type chips are drawn in the
  font they offer; the custom CSS box folds away until wanted; and Save
  sticks to the bottom of the column however far you scroll.

- Links stop looking like 1996: gone is the browser's blue with a hard
  underline through the descenders. A link now takes a shade of the
  show's own colour, with a hair-thin underline set away from the text
  that fills in on hover. Anything that is already a control -- buttons,
  cards, nav, subscribe chips -- carries no underline at all, since its
  shape already says it is clickable.
- The link shade is derived for readability rather than taken straight
  from the accent: a bright accent on white is often around 3:1 where
  body text wants 4.5:1, so the colour is walked darker (or lighter, in
  dark mode) until it clears the bar. Every preset and any custom hex
  clears 4.5:1 in both light and dark.

- Photos and artwork get their own controls on the Look tab: host photos
  can be circles, rounded squares or hard squares, in four sizes, and the
  cover on the front page has four sizes of its own. The corner slider is
  for cards -- a circle has no corners to round -- so wanting a bigger
  circle now has somewhere to go.
- Corners go up to 48px instead of 32px, so the roundest setting looks
  clearly different from the default rather than slightly different.
- A theme field left out of a submission keeps its default instead of
  falling to zero.

- A Look tab: the public site is the podcaster's, so its appearance is
  theirs to set. Fourteen preset colours or any hex code you like (with
  a colour picker), and every other shade -- hovers, tags, soft
  backgrounds, light and dark alike -- is derived from the one you pick.
  Backgrounds can be plain, a colour, a gradient at any angle, or an
  uploaded image with dimming, blur, tile-or-fill and fixed-or-scrolling.
  Cards can be solid, outlined or glass, with corners from square to very
  round. Five type choices, three page widths, three episode layouts, a
  full-bleed banner, a forced light or dark mode with the switch
  optional, a tagline, your own footer line, and a custom CSS box for
  anything else. A preview beside the controls is the real front page,
  re-rendered by the server as you go, so nothing has to be saved to see
  it -- and one button puts everything back.
- Surfaces follow the background: pick a pale background and the cards
  turn light with dark text even for a visitor whose device is set to
  dark mode, and the other way round. No unreadable combinations.
- Custom CSS can style anything but cannot reach off the box: imports
  and remote URLs are stripped, so a themed page still calls out to
  nobody.

- Removing a host is the same small trash icon as everywhere else,
  sitting in the bottom right corner of their page rather than a whole
  card shouting about it. First click arms it, second click removes.

- Memberships and tips: a panel under Funding on the podcast page holds
  Patreon, Buy Me a Coffee, Ko-fi, Liberapay, GitHub Sponsors, Open
  Collective and PayPal, each with a sign-up link straight to the
  service for anyone who has not got an account yet. Paste your page and
  its button joins a "Support the show" row under the listen-on buttons,
  and each one goes into the feed as its own `podcast:funding` tag, so
  apps can offer them too.
- Cards never touch. A form is not a layout container, so panels inside
  one sat edge to edge -- the podcast page was a single slab of eight.
  Stacked panels now keep the same 1.5rem gap the rest of the site uses,
  and host cards match it.

- Hosts are people, not a list of names. Each one is a record of their
  own -- name, role, photo and a write-up -- entered on a Hosts tab of
  its own, in any number, in an order you set. The site gains a Hosts
  page of cards and a page per host, and the header gains a menu now
  that the show is more than one page. Photos are shrunk to a fast web
  copy (640px) on upload, the full file kept for the feed, and a host
  with no photo shows their initials. The feed's `podcast:person` tags
  carry the role, the photo and a link to their page, so apps can put a
  face to a voice. Anyone entered as a "Name | role" line before is
  carried over automatically.

- Live streaming and chat are gone from FOSSCast: they move to
  FOSSStudio, where the show is made. Out with them: MediaMTX and RTMP
  ingest, the live pages and HLS player, the chat room and its
  moderation, live DVR recordings and their reminders, stream keys,
  the liveItem feed announcement and podping. What that layer did, as
  built and proven, is inventoried in docs/live-handover.md for
  FOSSStudio to take on. FOSSCast is now purely a podcast host, and
  its only public ports are 80 and 443.
- Owner details in the feed: a show now carries an owner name and email
  (`itunes:owner`, `managingEditor`, and the `podcast:locked` owner),
  which Spotify and Apple both require and reject a feed without. The
  address is separate from the login, since it is published in the
  feed.
- Feeds also declare `itunes:type` (episodic or serial), an optional
  copyright line, a build date and a generator, and no longer leave
  blank lines where an optional tag was skipped.
- Durations are read for externally hosted episodes too, not only
  uploads, so nothing reaches a directory without a length.
- A feed check on the show page lists what Apple, Spotify and the rest
  look for (title, description, artwork, owner email, category,
  language, author, a published episode, file sizes, durations) and
  says which are missing and what to do about each.
- Moving a podcast in keeps its identity: importing an old feed now
  carries over its `podcast:guid` as well as every episode GUID, and
  the field can be set by hand, so directories treat the move as the
  same show rather than a new one.
- Every episode has its own page (`/shows/<show>/<episode>`), with its
  artwork, player, chapters, transcript link and share card. The feed
  links each item to it, which is what podcast apps open from their
  "visit episode page" button, and titles on the show page link there
  too.
- Listen-on buttons: paste your show's address on Apple Podcasts,
  Spotify, YouTube Music, Amazon Music, Pocket Casts, Overcast or
  Podcast Index in the dashboard and a button appears on the show and
  episode pages. RSS and a copy-the-feed button are always there, so
  listeners are never waiting on a directory approval. Icons are drawn
  inline; nothing is fetched from any of those companies.
- Light and dark, chosen by the visitor: a toggle in the header on the
  public site and in the dashboard, remembered per browser, following
  the operating system until someone picks. No flash of the wrong
  theme on load.
- Artwork everywhere. A show can have a wide website banner (2560 x
  640) as well as its square artwork (3000 x 3000), and every episode
  can carry its own cover art, falling back to the show's when it does
  not. Episode pages, the embedded player and the RSS feed all show
  it, with per-episode `itunes:image` for apps that support it.
- Show pages redesigned around that artwork: banner across the top,
  cover beside the title, and episode cards led by their own artwork
  with episode number and running time. Share links now carry proper
  preview images too.
- Forgotten passwords: the login page can email a reset link (single
  use, expires in an hour, only its hash is stored, and the reply never
  reveals whether an address has an account). Where no email is
  configured, `docker compose exec -T app node reset-password.js` sets
  a fresh one from the server and prints it once. Both are off in demo
  mode.
- Demo mode (`DEMO_MODE=1`): makes an instance completely read-only so
  its login can be handed to strangers. Settings, episodes, uploads,
  moderation, the publish API and chat posting are all refused; looking
  around works normally. The login page shows the credentials and a
  banner explains the state. Six tests cover it, including that nothing
  reaches disk and that nobody can leave a message for the next
  visitor.
- One-command install: `scripts/install.sh <domain>` sets up an
  instance on a server in one go (data dir, generated secrets and admin
  login, firewall rule, the right compose stack, a site file for a
  Caddy already on the box, health check). Ports are options, so
  several instances can share a machine.
- A marketing site for the project lives in `site/`: what FOSSCast is,
  the live-with-chat difference, how to self-host, and a way to ask
  about managed hosting. Static files, same house style, no third-party
  anything.
- Front it with anything: a new `docker-compose.byo-proxy.yml` runs the
  stack without the bundled Caddy, `BIND_HOST` chooses the address the
  app and HLS ports are published on (a Tailscale IP, or 0.0.0.0 for a
  proxy elsewhere), and `INGEST_HOST` points studios at an address that
  can actually carry RTMP when the site sits behind a tunnel or proxied
  DNS. The README documents what a non-Caddy front must handle itself,
  with a working nginx example: forwarded client IPs (chat bans, rate
  limiting and download stats all read them), 4 GB upload bodies, no
  buffering on the chat event stream, and TLS. Cloudflare Tunnel and
  Tailscale setups are documented too, including the parts that cannot
  change: RTMP ingest is not HTTP and never rides a tunnel.
- Security hardening pass: the VPS deploy key is forced-command
  restricted server-side to exactly the deploy verbs (upload, activate,
  start, health-check, prune, rollback, status, logs) via
  scripts/deploy-wrapper.sh, with rsync locked to the releases dir by
  rrsync. Deploys now pull upstream images so security fixes land
  automatically. Admin pages refuse to render in iframes; the bundled
  Caddyfile adds nosniff and Referrer-Policy headers.

## 0.1.0 - 2026-08-15

- Publish API: PUT /api/v1/media then POST /api/v1/episodes with the
  publisher token pushes an episode from a studio; it arrives as a
  draft for review by default. This is the small, stable contract a
  studio "Publish to FOSSCast" button calls, documented in
  docs/studio-integration.md.
- Download stats without surveillance: episodes hosted on the instance
  count one download per listener per episode per day (salted daily
  hash, never stored raw, no cookies), shown on the dashboard Stats
  page as a 30-day chart and per-episode totals.
- Podcasting 2.0: feeds now carry transcript, chapters, person,
  funding, and locked tags, and while a show streams the feed
  announces a liveItem (HLS enclosure plus a contentLink to the live
  page) so supporting podcast apps can tune in natively; an optional
  podping token notifies the network the moment a stream starts or
  ends. Episodes gained an edit page with transcript upload (.vtt,
  .srt, .txt, .json) and a plain-text chapter editor (HH:MM:SS Title
  per line) served as namespace-format chapters JSON.
- Live DVR: every live stream is recorded automatically (fMP4 segments,
  no re-encoding). The dashboard's new Recordings page publishes a
  recording as an episode in one click (instant stream-copy concat with
  faststart) or discards it. Unpublished recordings are deleted after 7
  days with an email reminder to the admins on day 5 (via the new
  optional SMTP settings and a dependency-free SMTP client).
- Media uploads: episodes and show artwork upload straight from the
  dashboard (streamed to disk, up to 4 GB) and are served with proper
  byte-range support; external URLs (archive.org, anywhere) remain a
  first-class alternative per episode.
- Directory-grade feeds: full iTunes namespace (author, artwork, the
  official Apple category picker, explicit flag, language, episode and
  season numbers, episode types, durations via ffprobe, real enclosure
  sizes) plus podcast:guid. Show settings are editable in the
  dashboard.
- One-click import: paste an existing podcast's RSS URL and every
  episode comes in with metadata; missing show settings fill from the
  feed. De-duplicates by guid and media URL, so re-running is safe.
- Drafts and scheduling: episodes can be saved as drafts, and
  future-dated episodes stay hidden from the site and feed until their
  date arrives.
- Embeddable player: every episode has a compact player page at
  /embed/<id> for iframing into any website.
- This edition manages one podcast: show creation stops at one, and
  the dashboard says so instead of offering a form that would fail.
- Live is live: every show has a public live page (`/live/<slug>`)
  with an HLS player (self-hosted hls.js, Apache-2.0, the project's
  only vendored client library) that switches on and off automatically
  as the studio starts and stops streaming, a pulsing live badge on
  the show page, and playback URLs that never expose stream keys (the
  app proxies HLS per show).
- Live chat beside every stream: nickname-only, no accounts, viewer
  counts, recent-history replay on join. Server-Sent Events transport,
  still zero runtime npm dependencies. Moderation from the dashboard's
  new Chat page: ban a message's sender by IP (their messages vanish
  for everyone instantly, reversible), plus an editable filtered-word
  list whose matches are star-masked (first and last letter kept)
  rather than dropping the message. Viewer IPs never reach clients.
- Chat-only embed view (`/live/<slug>?embed=1`) for studio side panes
  and OBS browser sources, public JSON/SSE chat and live-status APIs,
  and docs/studio-integration.md describing how studios link up,
  including the API the planned on-stream comment overlay will use.
- Admin dashboard at `/admin`: password login (scrypt hashing,
  HMAC-signed HttpOnly cookies, per-IP rate limiting with lockout),
  shows and episodes management, per-show stream keys with reveal, copy
  and two-click regenerate, change-password. First admin account
  bootstraps from `ADMIN_EMAIL`/`ADMIN_PASSWORD` in `.env`. Accounts
  carry roles from day one (admin now, per-podcast owners next), so one
  instance can host many podcasts on the same code everyone downloads.
- Public site grew show pages: `/shows`, a page per show with episode
  players (video or audio picked from the media type), and an RSS feed
  per show (`/shows/<slug>/feed.xml`) any podcast app can subscribe to.
  Episode media is a URL: own storage, archive.org, anywhere reachable.
- Stream keys are now per show (created with the show, managed in the
  dashboard) instead of one instance-wide `STREAM_KEY`; the MediaMTX
  auth hook checks against live show keys. Flat JSON data files, no
  database. Tests cover auth, sessions, rate limiting and the full
  login/show/episode/feed/stream-auth flow.
- Deploy scripts drive any instance: FOSSCAST_BASE and FOSSCAST_HTTP_PORT
  select the install dir, compose project and health port.
- Instances can stack on one machine: RTMP and HLS host ports are
  configurable per instance (RTMP_PORT, HLS_PORT), so several podcasts
  can run side by side behind one reverse proxy, or each on its own
  machine.
- Project skeleton: Node app (zero runtime dependencies) serving the
  landing page, health check and version endpoints; MediaMTX ingest
  (RTMP in on 1935, HLS out on 8888) with publish authorisation
  delegated to the app via a stream key while playback stays public;
  docker-compose stack with bundled Caddy for one-command self-hosting;
  GHCR image build workflow with weekly rebuilds; release-based deploy
  and rollback scripts.

# Changelog

All notable changes to FOSSCast are documented here.

## Unreleased

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

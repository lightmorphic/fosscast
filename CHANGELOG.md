# Changelog

All notable changes to FOSSCast are documented here.

## Unreleased

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

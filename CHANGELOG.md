# Changelog

All notable changes to FOSSCast are documented here.

## Unreleased

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
- Project skeleton: Node app (zero runtime dependencies) serving the
  landing page, health check and version endpoints; MediaMTX ingest
  (RTMP in on 1935, HLS out on 8888) with publish authorisation
  delegated to the app via a stream key while playback stays public;
  docker-compose stack with bundled Caddy for one-command self-hosting;
  GHCR image build workflow with weekly rebuilds; release-based deploy
  and rollback scripts.

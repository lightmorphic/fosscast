# Changelog

All notable changes to FOSSCast are documented here.

## Unreleased

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

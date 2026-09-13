# FOSSCast architecture and decisions record

> **This project is in public beta.** It is not ready to be relied on;
> data loss and breaking changes are possible. Please do not put a real
> show on it yet. This document describes the beta as it stands and will
> change with it.

Decisions made at kickoff (August 2026), kept here so future work
doesn't have to rediscover them.

## What FOSSCast is

The public, audience-facing companion to FOSSStudio. FOSSStudio is the
private studio shows are made in; FOSSCast is where audiences find and
play them. Separate repo, separate stack, separate deploys, on
purpose. They integrate through one small, defined interface and must
never be merged.

Functionally FOSSCast is a podcast hosting platform: show website,
episode pages, players, RSS feeds. Live streaming and audience chat
were removed in August 2026 and belong to FOSSStudio now (see
docs/live-handover.md).

## Core decisions

- **Stack**: one plain Node app (server-rendered pages, publish API)
  with zero runtime npm dependencies. Plain CSS, Manrope, Lightmorphic
  style, deep orange accent. No framework, no build step, no CDN, no
  trackers.
- **Media can live anywhere.** An episode's media is a URL: either a
  file uploaded to FOSSCast's storage or an external URL (for example
  archive.org, which is free, permanent and supports the byte-range
  requests players need). The publish API accepts both.
- **Publishers** are studio hosts holding a FOSSCast token
  (`FOSSSTUDIO_TOKEN`). No shared auth beyond that one key.
- **Instances stack.** Several FOSSCast instances can share one
  machine: each is its own compose project with its own data dir,
  domain and port (`HTTP_PORT`), behind one shared reverse proxy. Or
  give an instance its own machine; nothing changes.
- **One instance, one podcast.** This edition manages a single show.
  The data model still carries roles on accounts and `ownerId` on
  shows, so the internals stay general and the single-show cap is one
  constant (`MAX_SHOWS` in `lib/admin.js`).
- **Admin auth**: scrypt, HMAC-signed HttpOnly cookies, per-IP login
  rate limiting, environment-bootstrapped first account. Flat JSON
  files in the data dir (users, shows, episodes, settings), no
  database, same as FOSSStudio.

## Integration contract with FOSSStudio

1. **Episodes**: FOSSCast exposes `POST /api/v1/episodes` (publisher
   token; title, show, date, description, media by upload or URL).
   Publishing can be manual day one. Eventually FOSSStudio's dashboard
   gets a one-click "Publish to FOSSCast" button per recording, and
   that button is the only episode-publishing code FOSSStudio will ever
   gain, so this API must stay stable and simple. FOSSStudio produces
   per recording: `combined.mp4` (H.264/AAC, mono, +faststart) plus
   lossless per-participant FLACs and optionally `soundboard.flac`.


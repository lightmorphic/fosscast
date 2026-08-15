# FOSSCast architecture and decisions record

Decisions made at kickoff (August 2026), kept here so future work
doesn't have to rediscover them.

## What FOSSCast is

The public, audience-facing companion to FOSSStudio. FOSSStudio is the
private studio hosts record and stream from; FOSSCast is where
audiences watch, chat and catch up. Separate repo, separate stack,
separate deploys, on purpose. They integrate through small, defined
interfaces only and must never be merged.

Functionally FOSSCast is a podcast hosting platform (show websites,
episode pages, players, RSS feeds) plus what such platforms lack: live
streaming with audience chat.

## Core decisions

- **Stack**: one plain Node app (server-rendered pages, publish API,
  WebSocket chat) with zero runtime npm dependencies, plus MediaMTX for
  RTMP in / HLS out. Plain CSS, Manrope, Lightmorphic style, deep
  orange accent. No framework, no build step, no CDN, no trackers.
- **No transcoding, ever.** FOSSStudio already outputs 720p H.264/AAC
  (mono) over RTMP, which browsers play natively once remuxed to HLS.
  MediaMTX remuxes without re-encoding, so live streaming costs almost
  no CPU and the VPS is never overwhelmed.
- **Media can live anywhere.** An episode's media is a URL: either a
  file uploaded to FOSSCast's storage or an external URL (for example
  archive.org, which is free, permanent and supports the byte-range
  requests players need). The publish API accepts both.
- **Viewer identity**: nickname-only chat in v1. No viewer accounts, no
  passwords, no auth cookies. Moderation via IP/session bans and a mod
  token. Accounts could come later without breaking anything.
- **Publishers** are studio hosts holding a FOSSCast token
  (`PUBLISHER_TOKEN`). No shared auth with FOSSStudio.
- **One instance, one podcast.** This edition manages a single show.
  The data model still carries roles on accounts and `ownerId` plus a
  per-show `streamKey` on shows, so the internals stay general and the
  single-show cap is one constant (`MAX_SHOWS` in `lib/admin.js`).
- **Admin auth**: scrypt, HMAC-signed HttpOnly cookies, per-IP login
  rate limiting, environment-bootstrapped first account. Flat JSON
  files in the data dir (users, shows, episodes, settings), no
  database, same as FOSSStudio.

## Integration contract with FOSSStudio

1. **Live**: FOSSStudio needs zero changes. Hosts paste FOSSCast's
   ingest URL (`rtmp://fosscast.org/live`) and their stream key into
   their existing FOSSStudio stream settings.
2. **Episodes**: FOSSCast exposes `POST /api/v1/episodes` (publisher
   token; title, show, date, description, media by upload or URL).
   Publishing can be manual day one. Eventually FOSSStudio's dashboard
   gets a one-click "Publish to FOSSCast" button per recording, and
   that button is the only episode-publishing code FOSSStudio will ever
   gain, so this API must stay stable and simple. FOSSStudio produces
   per recording: `combined.mp4` (H.264/AAC, mono, +faststart) plus
   lossless per-participant FLACs and optionally `soundboard.flac`.
3. **Chat**: lives entirely in FOSSCast, but must be visible from the
   studio. FOSSCast exposes the live room as both an API and a minimal
   embeddable read view; day one a host opens that view alongside their
   session (zero FOSSStudio code), later FOSSStudio may embed it.

## Streaming path

```
FOSSStudio --RTMP/1935--> MediaMTX --HLS/8888 (loopback)--> app/proxy --> viewer
```

- Every MediaMTX publish/read is authorised by the app
  (`POST /api/internal/mediamtx-auth`): publish requires the stream
  key, read is public, everything else is denied.
- v1 uses a single `STREAM_KEY`; per-show keys in the app's database
  come with the shows feature. The auth hook is already the seam where
  that lands.
- Public HLS playback must not expose the stream key in URLs (the
  MediaMTX path contains it). The app will map a public slug to the
  internal path when the player ships; until then HLS stays
  loopback-only.

## Our deployment (not part of the public repo's contract)

- Runs on FOSSStudio's VPS (77.74.199.121, lm002.lightmorphic.co.uk)
  as its own compose project under `/opt/fosscast` (releases/current
  symlink layout, same as FOSSStudio).
- Domain: fosscast.org (Porkbun, DNS at Fastmail).
- Ports on the box: app 127.0.0.1:3100, HLS 127.0.0.1:8888, RTMP 1935
  public. FOSSStudio holds 3000, 3478 and 80/443.
- HTTPS is served by FOSSStudio's Caddy, which imports
  `/opt/caddy/sites/*.caddy`; FOSSCast drops `fosscast.caddy` there.
  The bundled caddy service in this repo is for self-hosters and stays
  off on our box.
- Deploy keys: `lightmorphic-fosscast-deploy` (GitHub) and
  `lightmorphic-fosscast-vps-deploy` (VPS) in `/home/charlie/2-Data/SSH/`,
  aliases `github-lightmorphic-fosscast` and `fosscast-deploy`. The VPS
  key should get forced-command restriction once deploy verbs settle
  (mirror FOSSStudio's wrapper).
- Backups: FOSSCast's data directory joins the box's existing scheme
  (periodic archives under the project data dir, like FOSSStudio's
  `data/backups`).

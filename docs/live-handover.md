# Live streaming and chat: what moved out, for FOSSStudio to take on

FOSSCast (August 2026) removed its live layer so the studio can own
it. This is the complete inventory of what that layer did, as built
and proven here, so FOSSStudio can decide what to adopt. Where useful,
the removed implementation is in FOSSCast's git history before this
document was added.

## Streaming pipeline

- RTMP ingest on port 1935 via MediaMTX (one small container), with
  RTSP, WebRTC, SRT, MoQ, API and metrics all switched off.
- Publish authorisation by callback: MediaMTX asked the app on every
  publish attempt; a per-show secret stream key allowed it, anything
  else refused. Keys were revocable with one click (regenerate).
- No transcoding anywhere: the studio's H.264/AAC was remuxed to HLS
  (low-latency variant), so CPU cost was near zero.
- Public playback URLs never contained the stream key: the app proxied
  HLS under a clean per-show path.

## Live page (audience side)

- A page per show that switched itself on within seconds of the stream
  starting and back to a designed offline state when it stopped, with
  no refresh: the app polled the MediaMTX control API and pushed the
  state change to open pages over the chat's event stream.
- HLS playback: native on Safari, self-hosted hls.js (Apache-2.0)
  elsewhere. 16:9 frame, pulsing LIVE badge, viewer count.
- A LIVE banner appeared on the show's episode page while on air.

## Chat

- Nickname-only, no accounts, no cookies. Server-Sent Events out,
  plain POST in, so any buffering proxy caveat is documented rather
  than any websocket infrastructure needed. Zero dependencies.
- Recent-history replay on join, live viewer count, rate limiting of
  one message per IP per two seconds, 500-character cap.
- Moderation: ban a message's sender by IP (all their messages vanish
  for everyone instantly, reversible), plus a filtered-word list whose
  matches are star-masked (c**t style, first and last letter kept)
  rather than dropping the message. Shipped with a default English
  list, editable. Viewer IPs never reached any client.
- A chat-only embed view (`?embed=1`) that sat beside a studio session
  or in an OBS browser source, and public read-only JSON/SSE endpoints
  so the studio could render chat, with the planned feature of a host
  clicking a comment to show it on the stream as a lower-third.
- Read-only demo mode refused chat posting entirely.

## Live DVR

- Every live stream recorded automatically as fMP4 segments; segments
  close in time grouped into sessions.
- One click published a session as a draft episode: stream-copy
  ffmpeg concat with faststart, near-instant, no re-encode.
- Unpublished recordings deleted after 7 days, with an email reminder
  to the admins on day 5.

## Ecosystem

- The RSS feed announced a `podcast:liveItem` while streaming (HLS
  enclosure plus a contentLink to the live page), so Podcasting 2.0
  apps could tune in natively; an optional podping.cloud token pinged
  the network the moment a stream started or ended. Adoption of
  liveItem among hosts is near zero, so whoever ships this owns it.

## What FOSSCast still expects

FOSSCast remains the publishing destination: its token-authenticated
publish API (`PUT /api/v1/media`, then `POST /api/v1/episodes`,
arriving as a draft) is unchanged and is the contract for a studio's
"publish this recording" button.

# Linking a studio to FOSSCast

How a recording studio (FOSSStudio, OBS, or anything RTMP-capable)
connects to a FOSSCast instance. Everything here works today with zero
changes to the studio software.

## Going live

In the studio's stream settings:

- **Stream URL**: `rtmp://<fosscast-domain>/live`
- **Stream key**: the show's key, from FOSSCast's dashboard under
  Stream (each show has its own; regenerating it revokes the old one
  instantly).

The show's live page (`https://<domain>/live/<show-slug>`) switches to
the stream automatically within a few seconds of the studio going
live, and back to the offline state when it stops. Viewers on the page
never need to refresh.

## Seeing the chat from the studio

Every show has a chat-only view designed to sit beside a studio
session or inside OBS:

```
https://<fosscast-domain>/live/<show-slug>?embed=1
```

- Open it in a browser window next to the studio, or
- add it as an OBS Browser Source to monitor chat in the corner of a
  preview (it is chat only: no video player, no site chrome).

The host can also chat back from that view under their own nickname.

## Chat API (for deeper studio integration, planned overlay)

The eventual FOSSStudio feature (host clicks a viewer comment, it
appears as a lower-third on the live stream) builds on these
endpoints, which are stable now:

- `GET /api/v1/shows/<slug>/chat/messages` returns the recent
  messages: `{ "messages": [{ "id", "name", "text", "at" }] }`.
- `GET /api/v1/shows/<slug>/chat/stream` is a Server-Sent Events
  stream of the same message objects as they arrive, plus
  `{ "type": "count", "n": <viewers> }` and
  `{ "type": "status", "live": true|false }` events.
- `GET /api/v1/shows/<slug>/live` returns
  `{ "live": true|false, "since": <timestamp|null> }`.

All three are public read-only endpoints (chat is public anyway);
posting is rate-limited per IP and respects the instance's bans and
word filter. Viewer IPs are never exposed by any endpoint.

## Publishing episodes (the publish API)

Token-authenticated (the instance's `PUBLISHER_TOKEN`, sent as
`Authorization: Bearer <token>`). Two steps:

1. `PUT /api/v1/media?filename=<name>` with the raw file as the body.
   Returns `{ "urlPath": "/media/<show>/<name>", "size": <bytes> }`.
2. `POST /api/v1/episodes` with JSON:
   `{ "title", "date" (YYYY-MM-DD, optional), "description" (optional),
   "mediaUrl" (the urlPath from step 1, or any external URL),
   "episode", "season", "type" (optional) }`.
   Returns `{ "ok": true, "id", "draft": true, "editUrl" }`.

Published episodes arrive as **drafts** so the host reviews them in the
dashboard before they go public (pass `"draft": false` to skip that).
This is the API a studio's "Publish to FOSSCast" button calls; it is
deliberately small and will stay stable.

## Moderation

In FOSSCast's dashboard, the Chat page shows recent messages per show.
Banning a message's sender blocks their IP and removes their messages
for everyone instantly; bans are reversible from the same page. The
filtered-word list (star-masking) is editable there too.

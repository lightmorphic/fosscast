# Linking a studio to FOSSCast

How a recording studio publishes finished episodes to a FOSSCast
instance. Live streaming and chat are FOSSStudio's own territory (see
live-handover.md for what moved there); FOSSCast's side of the
relationship is this one API.

## Publishing episodes (the publish API)

Token-authenticated (the instance's `FOSSSTUDIO_TOKEN`, sent as
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


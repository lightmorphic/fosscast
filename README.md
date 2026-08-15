# FOSSCast

The public home of independent shows: live video streams with an open
chat room while the show happens, and an archive of every published
episode, playable in the browser and subscribable by RSS in any podcast
app.

FOSSCast is the audience-facing companion to
[FOSSStudio](https://github.com/lightmorphic/fossstudio), the
self-hosted studio hosts record and stream from. The two are separate
apps that talk through small, stable interfaces; neither needs the
other to run.

**Status: early development.** Working today: the public site with show
pages, episode players and RSS feeds; the admin dashboard (shows,
episodes, per-show stream keys, accounts); and authenticated live
streaming ingest. Still to come: the live player page, chat, media
uploads and the publish API.

## What it will do

- **Episode website**: each show gets clean pages for its episodes,
  video and audio players, and an RSS feed podcast apps can subscribe
  to. Media files can live on FOSSCast's own storage or anywhere else
  reachable by URL, including archive.org.
- **Live streaming**: a studio pushes RTMP to FOSSCast, which converts
  to HLS for playback in the browser. No transcoding, so a small server
  copes fine: the studio already sends browser-ready H.264/AAC.
- **Chat**: a live room beside every stream. Viewers pick a nickname
  and join in; no accounts. Hosts can watch the room from their studio.

## Self-hosting

Requirements: a Linux box with Docker, a domain pointing at it, and
ports 80, 443 and 1935 reachable.

```bash
git clone https://github.com/lightmorphic/fosscast.git
cd fosscast
cp .env.example .env   # then fill it in (each value is explained)
docker compose up -d --build
```

The bundled Caddy fetches HTTPS certificates automatically. If the
machine already runs its own reverse proxy on ports 80/443, start only
the app and the ingest instead, and point your proxy at
`127.0.0.1:3100`:

```bash
docker compose up -d --build app mediamtx
```

### Managing your instance

The dashboard lives at `/admin`. The first admin account comes from
`ADMIN_EMAIL` and `ADMIN_PASSWORD` in `.env` (created on first start;
change the password from the Account page after logging in). From the
dashboard you create shows, publish episodes (media by URL: your own
storage, archive.org, anywhere reachable) and manage stream keys. Every
show gets its own public page and RSS feed automatically.

The same code serves a single podcast or many: the instance admin can
create any number of shows, each with its own stream key, pages and
feed. Owner accounts scoped to their own podcasts are coming next, so
an instance can host podcasts for other people too.

### Going live from a studio

In FOSSStudio (or OBS, or anything that speaks RTMP), set:

- Stream URL: `rtmp://<your-domain>/live`
- Stream key: the show's key from the dashboard's Stream page

Publishing without a valid key is refused; playback is public.

### Data

Everything the app stores lives in one directory (`./data` by default,
`DATA_PATH` to move it): bind mounted, so it is plain files you can
inspect and back up directly.

## Deploying updates from a dev machine

`FOSSCAST_HOST=root@<ip> scripts/deploy.sh` uploads a timestamped
release folder, switches the `current` symlink and restarts the stack,
with instant rollback via `scripts/rollback.sh`.

## Development

```bash
cd server
npm start       # listens on http://localhost:3100
npm test
```

The app is plain Node with zero runtime npm dependencies. The web
assets are plain CSS and inline SVG, one self-hosted variable font, no
framework, no build step, no CDN, no trackers.

## License

Free software under the [GNU GPL v3](LICENSE).

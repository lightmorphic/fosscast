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

**Status: early development, moving fast.** Working today: the public
site with episode pages, players and directory-grade RSS; live pages
with an HLS player and nickname chat (IP bans, word masking); live DVR
with one-click publish-as-episode; media uploads with byte-range
serving; one-click import from an existing feed; drafts and
future-dated scheduling; an embeddable episode player; and the admin
dashboard tying it all together. Still to come: Podcasting 2.0 tags
(transcripts, chapters, liveItem), analytics, theming.

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

The bundled Caddy fetches HTTPS certificates automatically.

### Bring your own reverse proxy (nginx, Apache, a tunnel)

Already running nginx or another proxy? Use the byo-proxy stack, which
is the same thing minus Caddy:

```bash
docker compose -f docker-compose.byo-proxy.yml up -d --build
```

The app stays bound to `127.0.0.1:3100` (change with `BIND_HOST` and
`HTTP_PORT`), and your proxy points there. Four things Caddy does for
us that another front must handle itself:

1. **Forwarded client IPs.** FOSSCast reads `X-Forwarded-For` for chat
   rate limiting, chat bans and download counting. Without it every
   viewer looks like one person: one troll's ban would silence
   everybody, and your stats would read a single download per day.
2. **Upload size.** Episode uploads go up to 4 GB. nginx defaults to
   1 MB, so set `client_max_body_size` (and ideally turn request
   buffering off so big files stream straight through).
3. **No buffering on the chat stream.** Live chat is Server-Sent
   Events; a buffering proxy holds messages back until the buffer
   fills. The app already sends `X-Accel-Buffering: no`, which nginx
   honours, but any other proxy needs buffering disabled for
   `/api/v1/shows/*/chat/stream`.
4. **TLS.** Browsers need HTTPS for the clipboard and media features,
   and session cookies are `Secure`-only, so terminate TLS at your
   proxy.

```nginx
server {
    listen 443 ssl http2;
    server_name pod.example.com;

    ssl_certificate     /etc/letsencrypt/live/pod.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/pod.example.com/privkey.pem;

    add_header Strict-Transport-Security "max-age=31536000" always;

    client_max_body_size 4G;
    proxy_request_buffering off;

    location / {
        proxy_pass http://127.0.0.1:3100;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Live chat is SSE: never buffer it, never time it out early.
    location ~ ^/api/v1/shows/.+/chat/stream$ {
        proxy_pass http://127.0.0.1:3100;
        proxy_http_version 1.1;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 1h;
    }
}

server {
    listen 80;
    server_name pod.example.com;
    return 301 https://$host$request_uri;
}
```

### Cloudflare Tunnel

The website, players and HLS playback all work through a tunnel
(`cloudflared` pointing at `http://127.0.0.1:3100`). Two things cannot
change:

- **RTMP ingest is not HTTP**, so it can never ride the tunnel. Port
  1935 must reach the server directly. Set `INGEST_HOST` to an
  unproxied hostname or the raw IP so the dashboard shows studios the
  address that actually works.
- **Upload limits.** Cloudflare caps request bodies (100 MB on free
  plans), which stops large episode uploads through the tunnel. Either
  publish media by external URL (archive.org and anything else works
  as a first-class option), or upload over a direct route.

### Tailscale

Set `BIND_HOST` to the machine's tailnet address and the whole
instance is private to your tailnet: nothing is exposed publicly and
no TLS setup is needed if you use Tailscale Serve in front. Studios on
the tailnet can stream to it normally. Worth knowing: a podcast this
private cannot be reached by public podcast apps, so this suits
internal, member-only or staging instances rather than a public show.

### Managing your instance

The dashboard lives at `/admin`. The first admin account comes from
`ADMIN_EMAIL` and `ADMIN_PASSWORD` in `.env` (created on first start;
change the password from the Account page after logging in). From the
dashboard you create your show, publish episodes (media by URL: your
own storage, archive.org, anywhere reachable) and manage the stream
key. The show gets its public pages and RSS feed automatically.

One instance hosts one podcast: your show, your site, your feed, your
live stage, on your own hardware.

### Going live from a studio

In FOSSStudio (or OBS, or anything that speaks RTMP), set:

- Stream URL: `rtmp://<your-domain>/live`
- Stream key: the show's key from the dashboard's Stream page

Publishing without a valid key is refused; playback is public.

### Data

Everything the app stores lives in one directory (`./data` by default,
`DATA_PATH` to move it): bind mounted, so it is plain files you can
inspect and back up directly. The app container runs as UID 1000, so
the directory must be writable by that user:

```bash
sudo chown -R 1000:1000 ./data
```

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

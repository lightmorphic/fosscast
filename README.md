# FOSSCast

A self-hosted home for a podcast: every published episode on its own
page, playable in the browser and subscribable by RSS in any podcast
app.

FOSSCast is the audience-facing companion to
[FOSSStudio](https://github.com/lightmorphic/fossstudio), the
self-hosted studio shows are recorded in. The two are separate apps
that talk through one small, stable interface (the publish API);
neither needs the other to run. Live streaming and audience chat are
FOSSStudio's territory, not this app's.

**Status: early development, moving fast.** Working today: the public
site with episode pages, players and directory-grade RSS (Podcasting
2.0 tags included); media uploads with byte-range serving; one-click
import from an existing feed; drafts and future-dated scheduling; an
embeddable episode player; privacy-first download stats; and the
dashboard tying it all together.

## What it does

- **Episode website**: the show gets clean pages for its episodes,
  video and audio players, artwork and banners, and an RSS feed
  podcast apps can subscribe to. Media files can live on FOSSCast's
  own storage or anywhere else reachable by URL, including
  archive.org.
- **Their site, their look**: a Look tab sets the colour (presets or any
  hex), background (colour, gradient or image), card style, corners,
  type, width, episode layout, light/dark, tagline, footer and custom
  CSS, with a live preview of the real page.
- **Statistics without surveillance**: a page of charts -- months, days,
  apps, countries, platforms, languages, when people listen, how long an
  episode keeps earning -- all drawn on your own server from counters
  that cannot be joined back to a person.
- **Where to find you**: Matrix first, then Mastodon, PeerTube, Lemmy,
  Bluesky and the big platforms -- eighteen in all, as buttons on your
  page.
- **Getting paid**: Patreon, Buy Me a Coffee, Ko-fi, Liberapay, GitHub
  Sponsors, Open Collective and PayPal links become buttons on the show
  page and `podcast:funding` tags in the feed.
- **The people on it**: every host gets a photo, a role and a write-up,
  a card on the site's Hosts page and a page of their own -- and goes
  out in the feed so apps can put a face to a voice.
- **Directory-grade feeds**: full iTunes namespace plus Podcasting 2.0
  transcripts, chapters, people and funding tags.
- **Publish API**: a studio pushes finished recordings straight in as
  draft episodes.

## Self-hosting

One file, one command, no checkout. Everything you edit is in the block
at the top, so nothing has to be hunted for in the body and the domain
is typed once. Point your domain's DNS at the machine, paste this into
`docker-compose.yml`, edit those lines, and run `docker compose up -d`:

```yaml
x-config: &config
  DOMAIN: podcast.example.com          # your public address
  ADMIN_EMAIL: you@example.com         # the first admin account
  ADMIN_PASSWORD: change-me-to-something-long

services:
  app:
    image: ghcr.io/lightmorphic/fosscast:latest
    restart: unless-stopped
    environment: *config
    volumes:
      - fosscast_data:/data
    read_only: true
    tmpfs: [/tmp]
    cap_drop: [ALL]
    security_opt: [no-new-privileges:true]

  caddy:
    image: caddy:2-alpine
    restart: unless-stopped
    environment: *config
    command: sh -c 'caddy reverse-proxy --from "$$DOMAIN" --to app:3100'
    ports: ["80:80", "443:443"]
    volumes:
      - caddy_data:/data
      - caddy_config:/config
    cap_add: [NET_BIND_SERVICE]

volumes:
  fosscast_data:
  caddy_data:
  caddy_config:
```

That is the whole installation. The image carries the app and its web
assets, Caddy is configured by that one command line, and the HTTPS
certificate arrives on its own within a minute of the first request.
Log in at `https://your-domain/admin` with the email and password you
put in the file, and change the password from the Account page.

The same file lives in the repository as `docker-compose.pull.yml`, and
it runs the same image as the maintainer's own instances: every push to
`main` publishes it.

To update: `docker compose pull && docker compose up -d`. Your data
lives in the `fosscast_data` volume and is untouched by updates.

Working on FOSSCast itself, rather than running it? Clone the
repository and use `docker-compose.yml`, which builds from source and
mounts `web/` so edits show up on reload.

### Bring your own reverse proxy (nginx, Apache, a tunnel)

Already running nginx or another proxy? Use the byo-proxy stack, which
is the same thing minus Caddy:

```bash
docker compose -f docker-compose.byo-proxy.yml up -d --build
```

The app stays bound to `127.0.0.1:3100` (change with `BIND_HOST` and
`HTTP_PORT`), and your proxy points there. Three things Caddy does for
us that another front must handle itself:

1. **Forwarded client IPs.** FOSSCast reads `X-Forwarded-For` for
   login rate limiting and download counting. Without it every
   listener looks like one person, so your stats would read a single
   download per day.
2. **Upload size.** Episode uploads go up to 4 GB. nginx defaults to
   1 MB, so set `client_max_body_size` (and ideally turn request
   buffering off so big files stream straight through).
3. **TLS.** Browsers need HTTPS for the clipboard and media features,
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

}

server {
    listen 80;
    server_name pod.example.com;
    return 301 https://$host$request_uri;
}
```

### A proxy on another machine

The default binding is loopback, which a proxy on a different box
cannot reach. Publish the app on an address that machine *can* reach,
and make sure nothing else can:

```yaml
services:
  app:
    image: ghcr.io/lightmorphic/fosscast:latest
    environment: *config
    ports:
      - "10.0.0.5:3100:3100"   # this machine's private address, not 0.0.0.0
    volumes:
      - fosscast_data:/data
```

Delete the `caddy` service from the compose file; the other machine is
your front now.

- **Bind to one address, not all of them.** `10.0.0.5:3100` on a private
  network, or a Tailscale address (`100.x.y.z:3100`) if the two machines
  are on a tailnet. `0.0.0.0:3100` publishes the admin login to anything
  that can route to the box, so if you must use it, firewall port 3100
  to the proxy's IP alone.
- **Send both forwarded headers.** `X-Forwarded-For`, or every listener
  counts as one; and `X-Forwarded-Proto: https`, or the session cookie
  is issued without `Secure` and the login will not stick.
- **`DOMAIN` is the public address**, the one listeners type, not the
  private one the proxy dials. It is what the feed puts in front of
  every episode URL.
- The upload size and TLS notes above apply unchanged.

```nginx
location / {
    proxy_pass http://10.0.0.5:3100;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    client_max_body_size 4G;
    proxy_request_buffering off;
}
```

### Cloudflare Tunnel

The site, players and feed all work through a tunnel (`cloudflared`
pointing at `http://127.0.0.1:3100`). One thing to know: Cloudflare
caps request bodies (100 MB on free plans), which stops large episode
uploads through the tunnel. Publish media by external URL, or upload
over a direct route.

### Tailscale

Set `BIND_HOST` to the machine's tailnet address and the whole
instance is private to your tailnet. Worth knowing: a podcast this
private cannot be reached by public podcast apps, so this suits
internal, member-only or staging instances rather than a public show.

### Managing your instance

The dashboard lives at `/admin`. The first admin account comes from
`ADMIN_EMAIL` and `ADMIN_PASSWORD` in `.env` (created on first start;
change the password from the Account page after logging in). From the
dashboard you create your show and publish episodes (media by upload
or URL: your own storage, archive.org, anywhere reachable). The show
gets its public pages and RSS feed automatically.

One instance hosts one podcast: your show, your site, your feed, on
your own hardware.

### Moving a podcast here from another host

Podcast apps and directories follow a move when you do two things, and
you need the old feed's address to keep working while they catch up:

1. **Import the old feed** in the dashboard. Episode GUIDs and the
   show's `podcast:guid` come across, so directories see the same
   podcast rather than a new one, and nobody's app re-downloads the
   back catalogue.
2. **On the old host**, add `<itunes:new-feed-url>` to the old feed
   pointing at the new one, and 301-redirect the old feed URL to the
   new one. Leave both in place for at least a year: apps re-check on
   their own schedules, and a few only notice when someone opens them
   after months away.

Update the address by hand in Apple Podcasts Connect and Spotify for
Creators too, rather than waiting: both act on it immediately, and the
tags above only cover apps that subscribe to the feed directly.

### Artwork sizes

| What | Size | Notes |
|---|---|---|
| Podcast artwork | **3000 x 3000** square | JPG or PNG, RGB. Apple accepts 1400 x 1400 upwards; 3000 is the safe maximum every directory takes. Keep it under about 500 KB. |
| Episode cover art | **3000 x 3000** square | Optional per episode. Apps that support per-episode art show it; the rest fall back to the podcast artwork, and so does this site. |
| Banner video | **shape unchanged, at least 976 x 244** | Optional, alongside the still banner: with both uploaded you choose the video, the still, or either at random on each visit. Do not crop it: shrink it keeping its own shape until the smaller side just clears 976 x 244 - the size the banner is drawn at - then choose which part shows by dragging a box over the playing video in the dashboard. Aim for under 1 MB, 5-8 seconds, about 1 Mbps, no audio; refused past 1920 x 1080, 2 MB, 15 seconds or 1.5 Mbps. Nothing is re-encoded on the server, so a video is served exactly as uploaded. |
| Website banner | **976 x 244** (4:1) | JPG, PNG or WebP. That is the size it is drawn at; bigger is fine, since the server shrinks a copy to 976 for the site and keeps your original for the directories. Edges crop on narrow screens, so keep anything important central. |

The banner is drawn **976 x 244** points wide at the standard page width
(784 x 196 narrow, 1168 x 292 wide), and squares up to 3:1 on a phone,
cropping the sides. Twice the drawn size is what a sharp screen wants,
which is where 1920 x 480 comes from.
| Host photo | **800 x 800** square | Anything from 400 x 400 up. Shrunk to a 640px copy for the site; the file you upload is kept as it is. |

Every episode always displays artwork: its own if it has some, the
show's otherwise, on the site, in the embedded player and in the feed.

### Forgotten passwords

The login page offers a reset link, emailed to the account address, if
SMTP is configured in `.env`. The link works once and expires in an
hour, and the reply is the same whether or not the address has an
account here.

With no email configured, or nobody able to receive it, reset from the
server instead:

```bash
docker compose exec -T app node reset-password.js
```

It prints the account and a new password, once.

### Running a public demo

Set `DEMO_MODE=1` and the instance becomes completely read-only: no
settings changes, uploads or publishing, from the dashboard or the
API. The login page shows the credentials and a
banner explains the state, so the login can be handed to anyone
without them being able to break it or leave something unpleasant for
the next visitor. Everything else behaves normally, which is the point:
people see the real product.

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

> ## Public beta. Not ready to be relied on.
>
> **This is a public beta. It is not ready to be relied on. Data loss
> and breaking changes are possible. Please do not put a real podcast on
> it yet.**
>
> We want people to install it, break it and tell us what happened.
> That is what a beta is for. What we are not ready for is being the
> only copy of somebody's back catalog. Run it beside your existing
> host, not instead of it, and keep your own backups of anything you
> upload.
>
> Releases are marked as pre-release on GitHub. The current version is
> `0.1.0`.

# FOSSCast

A self-hosted home for a podcast: every published episode on its own
page, playable in the browser and subscribable by RSS in any podcast
app.

Lightmorphic also publishes
[FOSSStudio](https://github.com/lightmorphic/fossstudio), a self-hosted
studio for recording episodes: guests join by a link with no account and
no download, and each is recorded on their own track. It is a separate
app with its own repository, and neither it nor FOSSCast has anything to
do with the other.

## Free, and staying free

FOSSCast is free software under the AGPL, and it always will be. Copy
the compose file below onto a machine you control and it is yours: no
account, no key, no tier, nothing held back, nothing phoning home.
Everything in this repository is everything there is.

If you would rather not run a server, the people who write FOSSCast
also host it: **[Castmorphic](https://castmorphic.com)** runs this same
software for you, with more built on top of it, and paying for that is
what funds the work here. It is an alternative to self-hosting, not a
better version of it. You will not find an ad for it inside the
software, and you never will.

## What it does

<!-- Every claim below is something the current code does. If you find
     one that isn't, that is a bug report we want. -->


- **Episode website**: the podcast gets clean pages for its episodes,
  audio and video players, artwork and a banner, and an RSS feed any
  podcast app can subscribe to. Media files can live on FOSSCast's own
  storage or anywhere else that serves a file over HTTP.
- **Their site, their color**: a Look tab sets the accent color, a
  tagline and a footer line, with a live preview of the real page. Every
  other shade the site needs is worked out from the one color, and link
  text is walked darker or lighter until it clears 4.5:1.
- **Statistics without surveillance**: a page of charts -- months, days,
  apps, countries, platforms, languages, when people listen, how long an
  episode keeps earning -- all drawn on your own server from counters
  that cannot be joined back to a person.
- **Where to find you**: Matrix first, then Mastodon, PeerTube, Lemmy,
  Bluesky and the big platforms -- eighteen in all, as buttons on your
  page.
- **Where to listen**: Apple Podcasts, Spotify, YouTube Music, Amazon
  Music, Pocket Casts, Overcast and Podcast Index, as buttons on the
  page once you have pasted each address in.
- **Getting paid**: Patreon, Buy Me a Coffee, Ko-fi, Liberapay, GitHub
  Sponsors, Open Collective and PayPal links become buttons on the podcast
  page and `podcast:funding` tags in the feed.
- **The people on it**: every host gets a photo, a role and a write-up,
  a card on the site's Hosts page and a page of their own -- and goes
  out in the feed so apps can put a face to a voice.
- **Directory-grade feeds**: full iTunes namespace plus Podcasting 2.0
  transcripts, chapters, people and funding tags.
- **Help inside the app**: a page of answers at `/help`, behind the
  login, with no outside calls at all - so it works on a box with no
  internet and describes the version you installed. Every setting that
  needs explaining links straight to its own section.
- **A login you set yourself**: no password in a compose file. The first
  run asks for a code that only exists in the container's log, then
  makes you choose a password it will argue with you about, and offers a
  passkey and a second factor in the same minute.

## What it does not do

FOSSCast's scope is settled, not merely unfinished. One instance is one
podcast: its feed, its site, its download counting, its media on the
machine it runs on or on storage of your own, an import from whatever
host you are leaving, and the details the directories ask for when you
submit it.

These are not on the list and are not coming:

- **Members and paid subscriptions.** No login for listeners, no
  paywall, no private feeds.
- **Advertising.** No ad server, no dynamic insertion, no marketplace.
- **A newsletter or a blog.** FOSSCast publishes episodes; it is not a
  CMS and does not send email to your audience.
- **A recording studio.** That is
  [FOSSStudio](https://github.com/lightmorphic/fossstudio), a separate
  app. You add a finished file here; FOSSCast does not record one.
- **Listener accounts, or an app of our own.** People subscribe in
  whatever podcast app they already use.
- **More than one podcast per instance.** Run a second instance.

Some of those exist in the hosted service. They are not being withheld
from the free edition as a lever: they are a different product with a
different shape, and putting them here would make the self-hosted app
worse at the one job it has. If you want them and do not want to pay
for them, the AGPL lets you fork this and build them yourself.

## Self-hosting

One file, one command, no checkout, and nothing in the file to fill in.
Point your domain's DNS at the machine, paste this into
`docker-compose.yml`, and run `docker compose up -d`:

```yaml
# FOSSCast, the whole thing, from a single file.
#
# There is nothing in this file to fill in. Paste it into
# docker-compose.yml and run:
#
#   docker compose up -d
#
# Then open http://127.0.0.1:3100 in a browser on that machine and set
# your own email and password - and add a passkey and a second factor in
# the same minute if you want them. There is nothing to look up: being
# on the machine is the proof that the machine is yours.
#
# From another machine, or more than half an hour after it started, it
# asks for a code as well, which FOSSCast prints in its own log and
# keeps nowhere else:
#
#   docker compose logs app
#
# That is the only sign-up there is. Once somebody owns the instance the
# setup page is gone and no second account can be made from anywhere.
#
# Your domain, uploads and everything else are settings inside
# FOSSCast, on its Settings and Account pages. None of them belong
# in a compose file: this file says what Docker needs, and nothing more.
#
# The bundled Caddy at the foot is commented out. Take the hashes off and
# it gets you an HTTPS certificate on its own; leave them and point your
# existing proxy at 127.0.0.1:3100. Point your domain's DNS at the
# machine before either. Passkeys need HTTPS, so do one or the other.
#
# It runs the same image as the maintainer's own instances, built from
# the main branch of github.com/lightmorphic/fosscast.

services:
  app:
    image: ghcr.io/lightmorphic/fosscast:latest
    restart: unless-stopped
    # Your own proxy dials this. Behind the bundled Caddy below it is
    # simply unused, so it is right either way.
    ports:
      - "127.0.0.1:3100:3100"
    volumes:
      - fosscast_data:/data
    read_only: true
    tmpfs:
      - /tmp
    cap_drop: [ALL]
    security_opt:
      - no-new-privileges:true
    pids_limit: 256
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://127.0.0.1:3100/healthz"]
      interval: 30s
      timeout: 5s
      retries: 3
    logging: &log
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"

  # HTTPS, and the certificate, done for you. Already running nginx,
  # Apache, a tunnel or any other proxy on this machine? Leave this
  # commented out and point yours at 127.0.0.1:3100. Otherwise take the
  # "# " off every line from here to the bottom of the file and put your
  # domain in the one place it is named.
  #
  # That name is Caddy's, not FOSSCast's: a certificate has to be asked
  # for before anything is running, so the proxy cannot read it out of
  # FOSSCast's settings. It is the only thing in this file anybody edits.
#   caddy:
#     image: caddy:2-alpine
#     restart: unless-stopped
#     command: caddy reverse-proxy --from podcast.example.com --to app:3100
#     ports:
#       - "80:80"
#       - "443:443"
#     volumes:
#       - caddy_data:/data
#       - caddy_config:/config
#     cap_drop: [ALL]
#     cap_add: [NET_BIND_SERVICE]
#     security_opt:
#       - no-new-privileges:true
#     pids_limit: 256
#     logging: *log

volumes:
  fosscast_data:
#   caddy_data:
#   caddy_config:
```

That is the whole installation. The image carries the app and its web
assets, and nothing else is installed on the machine.

The bundled Caddy at the foot of that file is commented out, because a
machine that already runs nginx or Apache must not have ports 80 and
443 taken out from under it. Nothing is fronting this box yet? Take the
`# ` off every line from the Caddy note to the bottom of the file and
the HTTPS certificate arrives on its own within a minute of the first
request. Something already is? Leave the hashes where they are and
point it at `127.0.0.1:3100`, which the app publishes either way.

Then log in at `https://your-domain/admin` with the email and password
you put in the file, and change the password from the Account page.

The same file lives in the repository as `docker-compose.pull.yml`, and
it runs the same image as the maintainer's own instances: every push to
`main` publishes it.

To update: `docker compose pull && docker compose up -d`. Your data
lives in the `fosscast_data` volume and is untouched by updates.

Working on FOSSCast itself, rather than running it? Clone the
repository and use `docker-compose.yml`, which builds from source and
mounts `web/` so edits appear on reload.

### Bring your own reverse proxy (nginx, Apache, a tunnel)

Leave the Caddy service commented out and the app stays bound to
`127.0.0.1:3100` (change it with `BIND_HOST` and `HTTP_PORT`), with your
own proxy in front. Three things Caddy would have done that another
front must handle itself:

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

Leave the Caddy service commented out; the other machine is your front
now.

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
internal, member-only or staging instances rather than a public podcast.

### Managing your instance

The dashboard lives at `/admin`. The first time you open it, nobody
owns the instance yet, so it asks you to choose an email and a password
- and to add a passkey and a second factor in the same minute if you
want them.

Opened from the machine FOSSCast is running on, in the first half hour
after it starts, that is all it asks. Being there is the proof that the
machine is yours, and the address is taken from the connection itself,
never from a header that anybody could write. From another machine, or
later than that, it asks as well for a code that FOSSCast prints in its
own log (`docker compose logs app`), holds in memory only, and changes
on every restart. Either way, that is what stops a stranger claiming
your instance before you get to it.

It is also the only sign-up there is. Once the instance has an owner the
setup page is gone and the address refuses everybody, from the machine
itself as much as from anywhere else. Further accounts are not a thing
FOSSCast has: one instance, one podcast, one owner.

Everything else about the instance - its domain, whether audio may be
uploaded here - is on the Settings page rather than in a compose file,
and takes effect without a restart.

From the dashboard you create your podcast and publish episodes (media
by upload or by address: this machine, your own storage, anywhere that
serves a file). The podcast gets its public pages and RSS feed
automatically.

One instance hosts one podcast: your episodes, your site, your feed, on
your own hardware.

### Moving a podcast here from another host

Podcast apps and directories follow a move when you do two things, and
you need the old feed's address to keep working while they catch up:

1. **Import the old feed** in the dashboard. Episode GUIDs and the
   podcast's `podcast:guid` come across, so directories see the same
   podcast rather than a new one, and nobody's app re-downloads the
   back catalog.
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
| Episode cover art | **3000 x 3000** square | Optional per episode. Apps that support per-episode art use it; the rest fall back to the podcast artwork, and so does this site. |
| Website banner | **976 x 244** (4:1) | JPG, PNG or WebP. That is the size it is drawn at; bigger is fine, since your browser shrinks a copy to 976 for the site and the file you chose is kept as it is. Edges crop on narrow screens, so keep anything important central. |

The banner is drawn **976 x 244** points wide at the standard page width
(784 x 196 narrow, 1168 x 292 wide), and squares up to 3:1 on a phone,
cropping the sides. Twice the drawn size is what a sharp screen wants,
which is where 1920 x 480 comes from.
| Host photo | **800 x 800** square | Anything from 400 x 400 up. Your browser makes a 640px copy for the site; the file you choose is kept as it is. |

Every episode always displays artwork: its own if it has some, the
podcast's otherwise, on the site, in the embedded player and in the feed.

### Forgotten passwords

FOSSCast sends no email, so there is no reset link and nothing to
configure. A passkey is usually the quicker way back in - it is on a
device you still have - but if that is gone too, this is the road.

Anyone self-hosting this has a shell on the machine, and that is the way
back in:

```bash
docker compose exec -T app node reset-password.js
docker compose restart app
```

The first prints the account and a new password, once. The restart is
not optional: the app holds its data in memory and would otherwise
write the old password back over the new one.

To be signed in without choosing a password at all, mint a link that
works once and expires in ten minutes:

```bash
docker compose exec -T app node admin-login-link.js
```

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

## Reporting a problem

- **Something broken, something confusing, something missing:** open an
  issue on GitHub. During the beta this is the most useful thing you
  can do. Tell us what you did, what you expected and what happened;
  the version from the dashboard footer helps.
- **A security problem:** please report it privately first. `SECURITY.md`
  says how.
- **Code:** we are not merging pull requests during the beta.
  `CONTRIBUTING.md` explains why in full, and says what changes after
  the beta.

## License

Free software under the [GNU AGPL v3](LICENSE).

`NOTICE.md` records who wrote what: FOSSCast is Lightmorphic's own work
throughout, and the only third-party material in the repository is the
Manrope typeface (SIL Open Font License 1.1, text in
`web/fonts/OFL.txt`). There are no runtime npm dependencies at all.

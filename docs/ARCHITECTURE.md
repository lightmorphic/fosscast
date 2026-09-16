# FOSSCast architecture and decisions record

The decisions behind the shape of the code, written down so future work
does not have to rediscover them.

## What FOSSCast is

Podcast hosting you run yourself. Lightmorphic also publishes
FOSSStudio, a self-hosted studio for recording episodes: a separate
product with its own repository, stack and deploys, and no code, data
or interface in common with this one.

Functionally FOSSCast is: the podcast's website, its
episode pages, its players and its feed.

## Core decisions

- **Stack**: one plain Node app, server-rendered pages, zero runtime
  npm dependencies. Plain CSS, Manrope, Lightmorphic
  style, deep orange accent. No framework, no build step, no CDN, no
  trackers.
- **Media can live anywhere.** An episode's media is an address:
  either a file uploaded to FOSSCast's own storage or a file somewhere
  else that serves byte ranges, which is what players need. The counting
  door is this server either way.
- **Instances stack.** Several FOSSCast instances can share one
  machine: each is its own compose project with its own data dir,
  domain and port (`HTTP_PORT`), behind one shared reverse proxy. Or
  give an instance its own machine; nothing changes.
- **One instance, one podcast.** The data model still carries roles on
  accounts and `ownerId` on podcasts, so the internals stay general and
  the cap is one constant (`MAX_SHOWS` in `lib/admin/bits.js`).

- **Nothing shells out.** No ffmpeg, no image library, no database. An
  MP3's length is read from its own frames; the small copy of a picture
  is made in the browser that already has the picture open and uploaded
  beside the original. A feature that would need the box to do media
  work is answered with the browser doing it, or not at all.

- **The help page ships with the code.** `/help` fetches nothing: a
  self-hosted box may have no internet, and a website describes whatever
  is current rather than what somebody installed.
- **Nothing is emailed.** Getting back in after a lost password is a
  command on the machine (`reset-password.js`, or `admin-login-link.js`
  for a one-time link), so there is no SMTP to configure, nothing to be
  filed as spam, and no reset token sitting in a file.
- **Admin auth**: scrypt, HMAC-signed HttpOnly cookies, per-IP login
  rate limiting. The one and only account is claimed in the browser by
  whoever opens an unclaimed instance first; `REQUIRE_SETUP_CODE=1` puts
  a code in the startup log and demands it, for a box whose port is open
  before anybody has claimed it. A claimed instance has no second
  sign-up from anywhere. Where a claim came from is logged honestly
  (`lib/local.js`: the socket's address, never a header's).
  Passkeys (WebAuthn, verified in `lib/passkeys.js` with no dependency)
  and TOTP two-factor (`lib/totp.js`) sit beside the password. Flat
  JSON files in the data dir (users, shows, episodes, settings), no
  database.


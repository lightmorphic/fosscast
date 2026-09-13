# FOSSCast architecture and decisions record

> **This project is in public beta.** It is not ready to be relied on;
> data loss and breaking changes are possible. Please do not put a real
> podcast on it yet. This document describes the beta as it stands and
> will change with it.

The decisions behind the shape of the code, written down so future work
does not have to rediscover them.

## What FOSSCast is

The public, audience-facing companion to FOSSStudio. FOSSStudio is the
private studio shows are made in; FOSSCast is where audiences find and
play them. Separate repo, separate stack, separate deploys, on
purpose. They integrate through one small, defined interface and must
never be merged.

Functionally FOSSCast is podcast hosting: the podcast's website, its
episode pages, its players and its feed.

## Core decisions

- **Stack**: one plain Node app (server-rendered pages, publish API)
  with zero runtime npm dependencies. Plain CSS, Manrope, Lightmorphic
  style, deep orange accent. No framework, no build step, no CDN, no
  trackers.
- **Media can live anywhere.** An episode's media is an address:
  either a file uploaded to FOSSCast's own storage or a file somewhere
  else that serves byte ranges, which is what players need. The publish
  API accepts both, and the counting door is this server either way.
- **Publishers** are studio hosts holding a FOSSCast token
  (`FOSSSTUDIO_TOKEN`). No shared auth beyond that one key.
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

- **Nothing is emailed.** Getting back in after a lost password is a
  command on the machine (`reset-password.js`, or `admin-login-link.js`
  for a one-time link), so there is no SMTP to configure, nothing to be
  filed as spam, and no reset token sitting in a file.
- **Admin auth**: scrypt, HMAC-signed HttpOnly cookies, per-IP login
  rate limiting, environment-bootstrapped first account. Flat JSON
  files in the data dir (users, shows, episodes, settings), no
  database, same as FOSSStudio.

## Integration contract with FOSSStudio

1. **Episodes**: FOSSCast exposes `POST /api/v1/episodes` (studio
   token; title, date, description, media by upload or by address).
   A studio's "Publish to FOSSCast" button is the only
   episode-publishing code it ever needs, so this API stays stable and
   small. Episodes arrive as drafts.


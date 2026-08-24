# Keeping episodes at the Internet Archive

FOSSCast can hand an episode's audio to [archive.org](https://archive.org)
and then point at it. The audio gets a permanent home that outlives your
server; the feed does not change, and downloads are still counted here.

## Setting it up

1. Make a free account at archive.org.
2. Generate a key pair at
   [archive.org/account/s3.php](https://archive.org/account/s3.php).
3. Paste the two keys into **Account → Internet Archive** in the
   dashboard.

The keys are stored on your own server, in `settings.json`, and are never
shown again — the page only ever says which four characters a key ends
with. Leave a box empty when saving to keep the key already held.

## Sending an episode

Either tick **Also send the audio to archive.org** when publishing, or
open an episode and press **Send to archive.org**. Only media held on
this server can be sent; an episode already pointing somewhere else has
nothing to upload.

The upload runs in the background, because a large episode over a slow
uplink outlasts any sensible request timeout. The page shows how far it
has got and survives a reload.

## What arrives at the Archive

One item per episode, in the Archive's Community Audio collection, under
your own account. The identifier is built from the show slug, the date
and the episode slug — `fossnerds-20260705-the-first-one` — and gets a
short random suffix if that name is already taken by somebody.

The item carries what you already typed into FOSSCast: title, author,
description, date, language, and a link back to the episode page. Nothing
is asked for twice.

## What changes here

The episode's media address becomes
`https://archive.org/download/<identifier>/<file>`. The feed keeps
publishing `/d/<episode-id>.mp3` on your own domain, so:

- podcast apps see no change of host,
- every download is still counted by your instance,
- the audio itself is fetched from the Archive and never passes through
  your server again.

The local copy of the file is left where it is. Delete it yourself if you
want the disk space back.

## Things worth knowing

- **Uploads are public and meant to be permanent.** The Archive keeps
  what it is given; taking something down again means asking them. Send
  episodes you are happy to publish for good.
- **The account is yours.** FOSSCast never uploads under anybody else's
  name, and the keys never leave your server.
- **Rate limits.** The Archive rations busy accounts. FOSSCast asks
  before starting and says so plainly rather than failing halfway.
- **Errors come through in words.** Whatever the Archive says when it
  refuses is what the page shows.

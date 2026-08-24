# FOSSCast Community Edition roadmap

Where this is going: the best free podcast platform anywhere.
Everything below ships in the one open codebase; a self-hoster gets it
all.

## The gap FOSSCast fills

A genuinely self-hostable podcast host that treats the feed as a
craft: directory-grade from day one, Podcasting 2.0 throughout, no
database, no framework, no tracking, and no lock-in in either
direction. Live streaming moved to FOSSStudio in August 2026.

## Phase A: hosting parity (the must-haves)

What every serious host has and we still need:

- **Media uploads**, not just URLs. Direct upload to the instance's
  storage stays optional per episode: media by external URL (including
  archive.org) remains a first-class choice.
- **Artwork and full feed metadata**: show and episode artwork
  (3000x3000 for the directories), categories, language, explicit
  flag, author, episode and season numbers, episode types (full,
  trailer, bonus). Without these, Apple and Spotify listings look
  broken.
- **Bulletproof RSS**: complete iTunes namespace, `podcast:guid`,
  atom self links, correct enclosure lengths, validated output.
- **Directory onboarding**: guided submission to Apple, Spotify,
  Podcast Index and YouTube (RSS ingest), with ownership verification.
- **One-click migration in**: paste an existing feed URL, import every
  episode with metadata and artwork, then serve the new feed. Plus
  proper 301 support when moving feeds out (no lock-in, ever: that is
  a feature).
- **Scheduling and drafts**: publish at a set time, keep drafts,
  reorder.
- **Embeddable player**: one iframe snippet per episode or show,
  theme-aware, so episodes play on anyone's website.

## Phase B: Podcasting 2.0 leadership

Cheap to implement on top of our feed generation, and almost nobody
does them all: `transcript`, `chapters`, `person`, `funding`,
`locked`, `soundbite`, `podroll`, `license`, `location`.


## Phase D: analytics without surveillance

Self-hosted, privacy-respecting download stats computed to the IAB
guidelines (dedupe by IP + user agent within a day, filter bots), with
per-episode graphs, apps and geography at country level. Optional
integration with the open analytics prefix (OP3) for publicly
verifiable numbers. No listener tracking, no third parties: for a
European audience this is a selling point the big players cannot copy.

## Phase E: branding and identity

Make the one show feel fully owned: site theming (accent colour,
artwork-driven pages), the show's own domain via the bundled Caddy,
and polished share cards (Open Graph and oEmbed) so links look right
everywhere they land.

## Phase F: production assists (all optional, all local-first)

- **Transcription** with a local speech model on the server (queued,
  low priority, so the box is never overwhelmed), producing transcript
  tags plus .srt/.vtt downloads.
- **Chapters and show notes drafts** via an optional AI API key the
  operator supplies; never required, never on by default.
- **Clip and audiogram generator**: pick a time range, get a shareable
  captioned video clip rendered with ffmpeg for social posts.
- **Loudness check** on upload (aiming at -16 LUFS) with a gentle
  warning, matching what the studio already outputs.

## Phase G: community and reach

- **Email notifications**: follow a show by email, get new episodes
  by email. SMTP only, no third-party service.
- **Funding and memberships**: the `funding` tag everywhere; later,
  private feeds with per-subscriber tokenized URLs for member-only
  shows (early access, bonus feeds), revocable per subscriber.
- **Fediverse presence** (the long game): shows followable and
  episodes commentable from Mastodon and friends via ActivityPub.
  Substantial work; sequenced last deliberately.

## Explicitly out

- Transcoding pipelines (the studio already outputs browser-ready
  media; staying transcode-free keeps small servers viable).
- Dynamic ad insertion and programmatic ads.
- Listener accounts, listener tracking, engagement scores.
- Any third-party CDN, font, script or tracker on any page.

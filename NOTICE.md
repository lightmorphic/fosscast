# Notice

## Who wrote FOSSCast

FOSSCast is written by Lightmorphic Ltd (registered in England and
Wales, company number 17423646). Every line of the application, its web
pages, its stylesheet and its icons is Lightmorphic's own work, written
for this project. No code has been merged from anyone outside the
company, and `CONTRIBUTING.md` explains why that is deliberate.

The project is released to the public under the GNU General Public
Licence v3 (`LICENSE`). Because Lightmorphic owns the copyright in the
whole of it, Lightmorphic can also release the same code under other
terms, and does: the hosted service at
[castmorphic.com](https://castmorphic.com) runs it. That is the owner's
right over its own work. It takes nothing away from the AGPL grant you
have here, which is permanent and cannot be withdrawn.

This file exists so that anyone can check that claim rather than take
it on trust. Everything below is the complete list of material in this
repository that Lightmorphic did **not** write.

## Bundled third-party material

### Manrope

* **What:** the typeface the pages are set in.
* **Where:** `web/fonts/Manrope.woff2`
* **Whose:** Mikhail Sharanda.
* **Licence:** SIL Open Font Licence 1.1. The full text ships beside
  the font at `web/fonts/OFL.txt`.
* **From:** <https://github.com/sharanda/manrope>

The font is bundled rather than fetched from a font service, so that an
instance behind a firewall renders and no visitor's browser is made to
call a third party.

## Runtime dependencies

There are none. `server/package.json` declares no `dependencies` and
the application is plain Node with no npm packages at run time. There
is no build step, no bundler, no framework and no CDN.

## Things the software runs inside, but does not contain

These are separate programs under their own licences. FOSSCast is
distributed alongside them in the published container image, not
combined with them.

| What | Whose | Licence |
|---|---|---|
| Node.js (`node:22-alpine` base image) | OpenJS Foundation | MIT |
| Alpine Linux (base image) | Alpine Linux | mixed, mostly MIT/BSD |
| ffmpeg and ffprobe (episode durations, image copies) | FFmpeg project | LGPL-2.1-or-later as packaged by Alpine |
| Caddy (the reverse proxy in the example compose file) | Light Code Labs | Apache-2.0 |

## Icons and artwork

The subscribe, funding and social icons drawn inline by
`server/lib/public.js` were drawn for FOSSCast. They are simplified
marks, not copies of any icon set, and nothing is fetched from an icon
service at run time.

They stand for other companies' brands. The copyright in the drawings
is Lightmorphic's; the trademarks are their owners'. They are used to
label a link to that service, which is what trademark law calls
nominative use. If you fork FOSSCast and use it for something else,
that is your judgement to make, not a right the AGPL gives you.

The Lightmorphic logo files (`web/img/lightmorphic-mark.*`,
`web/img/lightmorphic-dark-tb-250x50-sq.webp`) are Lightmorphic's
trademark. The AGPL covers the code, not the brand: remove them if you
fork this and publish it as your own thing.

# Where this came from

Copied on 2026-09-16 by the `install-anti-slop` skill installed on Charlie's
machine at `~/.claude/skills/install-anti-slop`, from that skill's own
`assets/anti-slop` directory.

**Source revision: unknown.** The skill ships the rules as files rather
than as a package, and carries no commit of its own, so there is nothing
here to pin. If these rules are ever updated, the honest way to do it is
to copy the skill's assets again and read the diff, not to trust a
version number.

Installed at `tools/oxlint/anti-slop/`, registered in `.oxlintrc.json`
at the root of the repository as the `anti-slop` plugin.

## What we changed

Nothing in the rules themselves. Two decisions about how they are used
live in `.oxlintrc.json` rather than here:

- The Effect plugin under `effect/` is not registered. Neither product
  depends on Effect, and the skill says not to enable it on a lockfile
  match alone.
- `require-readable-spacing` is on, and it has a great deal to say. Its
  findings are blank lines rather than code, and nothing has been
  reformatted for it yet: that is a decision about house style, not a
  bug to fix quietly.

`vendor/eslint-stylistic/` carries its own licence and provenance. It is
the one rule with somebody else's code in it.

# Contributing

**Bug reports and discussion yes, code contributions no.** That is not
about how finished FOSSCast is - it is 1.0 and in use - it is about who
owns the copyright. The reason is written out in full below.

## What we want, and want badly

- **Bug reports.** Telling us what you did, what you expected and what
  happened is worth more to us than a patch would be.
- **Security reports.** See `SECURITY.md`. Please report privately.
- **Ideas and questions.** Open a discussion. Tell us what is missing,
  what is confusing, what you expected to find and did not. We may well
  build it.

## Why code contributions are not merged

FOSSCast is entirely Lightmorphic's own work (`NOTICE.md` sets out what
that means and lists the few third-party files). Because Lightmorphic
owns all of it, Lightmorphic can offer the same code under other terms,
which is how the hosted service that funds the work is possible. A
patch from someone else would belong to that person, so from the moment
it was merged that one sentence would stop being true for that patch.

That is the whole of it. It is not a judgment on anyone's code, and it
is not about quality. Please do not spend an evening on a pull request
for this project: pull requests will be closed with a link to this
file.

If you want to change FOSSCast for your own use, fork it. The AGPL gives
you that right and you do not need our permission.

## What would have to change first

The rule is not permanent. One of two things happens before pull
requests open, and this file will say which:

1. **A contributor agreement.** A short document you sign once, saying
   the code is yours to give and that Lightmorphic may use it under any
   license. Pull requests open after that, from anyone who has signed.
2. **Contributions under the AGPL alone, with no relicensing.** Pull
   requests open to everybody with nothing to sign, and Lightmorphic
   gives up the right to put merged code into anything but the AGPL
   edition.

The first keeps the hosted service possible. The second keeps the
project simpler. Which one it is has not been decided, and it will not
be decided quietly.

## If you send code anyway

Sometimes people paste a fix into a bug report, or send a patch by
email. We would rather that did not happen, but if you
do send us code, by sending it you agree to the following:

> You confirm the code is yours to give, that you wrote it, and that no
> employer or other party has a claim on it. You give Lightmorphic an
> unrestricted, permanent, worldwide, royalty-free right to use, modify
> and distribute that code, in any part of FOSSCast, under any license,
> including in proprietary and commercial versions. You keep your own
> copyright and may use your code however you like elsewhere. You are
> not entitled to payment for it.

If you are not willing to grant that, do not send code. Send a bug
report describing the problem instead, and it will be just as useful.

*This is a plain-language statement of intent, not legal advice. If a
contribution ever matters enough to argue about, get a lawyer to
look at it.*

## The linter

There is an Oxlint setup at the root of the repository, with a small
vendored plugin under `tools/oxlint/anti-slop/` that looks for the
habits of machine-written code. It is a check on us, not a dependency
of FOSSCast: the app itself still installs nothing and runs on plain
Node.

```bash
npm install     # only for the linter
npm run lint
```

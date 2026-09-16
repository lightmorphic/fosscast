# The three rules that are off, and why

The skill that brought these rules in enables all of them. Three do not
belong in this codebase, and turning them off with a reason written down
is better than leaving them on to fail forever - a check nobody can pass
is a check nobody runs.

**`no-runtime-typeof`** says a `typeof` check narrows a representation
without establishing a contract, and that input should be parsed at its
boundary instead. That is sound advice in TypeScript. FOSSCast is plain
JavaScript: `typeof token !== 'string'` in `lib/auth.js` *is* the parse
at the boundary, and there is nothing else to replace it with. Six
findings, every one of them a guard doing its job.

**`no-array-filter-map`** objects to `filter(...).map(...)` because it
walks the array twice. Ours walk `SOCIAL`, `SUPPORT` and `APPS` - hand
written tables of a few rows each, on a page that is about to build a
string. Rewriting them as `flatMap` with a conditional array inside
would trade a sentence anybody can read for a saving of nothing.

**`require-readable-spacing`** wants a blank line before most
statements. It had 1,411 opinions about this repository. They are blank
lines rather than code, and the style they ask for is not the one this
was written in: a short validator of six guard clauses reads better
tight than spread over twice the lines. This is somebody else's house
style, not a defect.

Everything else is on and the repository is clean. If a run is ever
noisy again, that is a finding rather than a thing to switch off.

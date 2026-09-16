'use strict';
// American spellings, everywhere a person reads (Charlie, 14 September
// 2026: FOSSCast caters for an American market now).
//
// This is a static sweep rather than a rendered one on purpose. The
// admin pages are template literals inside server/lib, so reading the
// source catches a word in a button that no test happens to click, and
// it also covers the README, the guides, the marketing site and the
// five legal pages, none of which a running server would show us.
//
// The lesson from words.test.js applies here twice over. A blunt rule
// catches innocent words: the first draft of the show/podcast sweep
// banned every plural "shows" and took an ordinary verb with it. So
// two narrowings are built in. BRITISH lists the word families one by
// one instead of reaching for a pattern like /\w+ise\b/, which would
// condemn "promise", "exercise" and "otherwise". And ALLOWED names
// every place a British string legitimately stays, one line each with
// the reason, so nobody can widen an exception by accident.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');

// The files a person reads: the screens and the words in them, the
// guides, the website, the legal pages, the installer and the sample
// environment file. Comments count - a stranger reads those too.
// server/test is not here: a test fixture is not prose.
const READ_BY_PEOPLE = [
  'README.md', 'CHANGELOG.md', 'CONTRIBUTING.md', 'NOTICE.md',
  'TRADEMARKS.md', 'SECURITY.md', '.env.example', 'Caddyfile',
  'docker-compose.yml', 'docker-compose.pull.yml',
  '.github/PULL_REQUEST_TEMPLATE.md',
  'scripts', 'docs', 'web/css', 'server/lib', 'server/server.js',
  'server/admin-login-link.js', 'server/reset-password.js',
];

// Not ours to edit. The AGPL calls itself a Licence in its own text and
// the SIL Open Font Licence likewise; changing either would be editing
// somebody else's legal instrument to suit our house style.
const NOT_OURS = new Set([
  'LICENSE',
  'docs/fonts/OFL.txt',
  'web/fonts/OFL.txt',
]);

// Word families, one by one. Each is a whole word; the -ing, -ed and
// plural forms are spelled out rather than left to a suffix pattern,
// because a suffix pattern is how you end up banning "shows".
const BRITISH = [
  // -our
  /\bcolour(s|ed|ing|ful|less)?\b/i,
  /\bbehaviour(s|al)?\b/i,
  /\bhonour(s|ed|ing|able)?\b/i,
  /\bfavour(s|ed|ing|able|ite|ites)?\b/i,
  /\blabour(s|ed|ing)?\b/i,
  /\bneighbour(s|ing|hood|hoods)?\b/i,
  /\brumour(s|ed)?\b/i,
  /\bsavour(s|ed|ing|y)?\b/i,
  /\bendeavour(s|ed|ing)?\b/i,
  /\bodour(s|less)?\b/i,
  /\bvapour(s)?\b/i,
  /\barmour(s|ed)?\b/i,
  /\bhumour(s|ed|less)?\b/i,
  /\bparlour(s)?\b/i,
  /\bharbour(s|ed|ing)?\b/i,
  /\barbour(s)?\b/i,
  /\bsplendour\b/i,
  /\bflavour(s|ed|ing)?\b/i,
  /\bvalour\b/i,
  // -re
  /\bcentre(s|d)?\b/i,
  /\bmetre(s)?\b/i,
  /\blitre(s)?\b/i,
  /\bfibre(s)?\b/i,
  /\btheatre(s)?\b/i,
  /\bcalibre\b/i,
  /\bsombre\b/i,
  /\blustre\b/i,
  /\bspectre(s)?\b/i,
  /\bmanoeuvre(s|d)?\b/i,
  // -ce nouns and the -ogue tail
  /\bdefence(s)?\b/i,
  /\boffence(s)?\b/i,
  /\bpretence(s)?\b/i,
  /\blicence(s)?\b/i,
  /\bpractise(s|d)?\b/i,
  /\bcatalogue(s|d)?\b/i,
  /\banalogue(s)?\b/i,
  // doubled consonant before a suffix
  /\blabelled\b/i,
  /\bcancelled\b/i,
  /\btravelling\b/i,
  /\bmodelling\b/i,
  /\bfuelled\b/i,
  /\bsignalling\b/i,
  /\bdialled\b/i,
  /\btotalled\b/i,
  /\bmarvellous\b/i,
  /\bjewellery\b/i,
  /\bcounsellor(s)?\b/i,
  /\bwoollen\b/i,
  // single l where American doubles it
  /\benrol\b/i,
  /\bfulfil(s|ment|ments)?\b/i,
  /\binstalment(s)?\b/i,
  /\bskilful\b/i,
  /\bwilful\b/i,
  /\bdistil\b/i,
  /\binstil\b/i,
  // -ise and -yse, named rather than patterned
  /\borganis(e|es|ed|ing|ation|ations)\b/i,
  /\brecognis(e|es|ed|ing|able)\b/i,
  /\breutilis(e|es|ed|ing)\b/i,
  /\brealis(e|es|ed|ing)\b/i,
  /\bapologis(e|es|ed|ing)\b/i,
  /\bsummaris(e|es|ed|ing)\b/i,
  /\bnormalis(e|es|ed|ing|ation)\b/i,
  /\bcustomis(e|es|ed|ing|ation)\b/i,
  /\boptimis(e|es|ed|ing|ation)\b/i,
  /\bminimis(e|es|ed|ing)\b/i,
  /\bmaximis(e|es|ed|ing)\b/i,
  /\butilis(e|es|ed|ing|ation)\b/i,
  /\bauthoris(e|es|ed|ing|ation)\b/i,
  /\bpersonalis(e|es|ed|ing)\b/i,
  /\bspecialis(e|es|ed|ing)\b/i,
  /\bprioritis(e|es|ed|ing)\b/i,
  /\bsynchronis(e|es|ed|ing)\b/i,
  /\bemphasis(e|es|ed|ing)\b/i,
  /\binitialis(e|es|ed|ing|ation)\b/i,
  /\bcategoris(e|es|ed|ing)\b/i,
  /\bcriticis(e|es|ed|ing)\b/i,
  /\bpublicis(e|es|ed|ing)\b/i,
  /\bmemoris(e|es|ed|ing)\b/i,
  /\bvisualis(e|es|ed|ing)\b/i,
  /\bfinalis(e|es|ed|ing)\b/i,
  /\bitemis(e|es|ed|ing)\b/i,
  /\bstabilis(e|es|ed|ing)\b/i,
  /\bcharacteris(e|es|ed|ing)\b/i,
  /\bsanitis(e|es|ed|ing)\b/i,
  /\banalys(e|es|ed|ing|is)?\b/i,
  /\bparalys(e|es|ed|ing)\b/i,
  // -isation on its own: there is no American word that ends this way,
  // so the general form is safe where a general -ise form would not be.
  /\b[a-z]+isation(s)?\b/i,
  // spellings that belong to no family
  /\bgrey(s|ed|ing|ish)?\b/i,
  /\bjudgement(s)?\b/i,
  /\bwhilst\b/i,
  /\bamongst\b/i,
  /\baluminium\b/i,
  /\bstorey(s)?\b/i,
  /\bkerb(s)?\b/i,
  /\bplough(s|ed|ing)?\b/i,
  /\bdraught(s|y)?\b/i,
  /\bmould(s|ed|ing|y)?\b/i,
  /\bgaol(s)?\b/i,
  /\btyre(s)?\b/i,
  /\bpyjamas\b/i,
  /\bfoetal\b/i,
  /\bencyclopaedia\b/i,
  /\bmediaeval\b/i,
  /\barchaeolog(y|ical)\b/i,
  /\bageing\b/i,
  /\bcheque(s)?\b/i,
  /\bspeciality\b/i,
  /\borientated\b/i,
  /\bverandah(s)?\b/i,
  /\byoghurt\b/i,
  // British words that are not spellings at all, but read as foreign
  /\bsolicitor(s)?\b/i,
  /\btick box(es)?\b/i,
  /\bstraight away\b/i,
];

// Every place a British string stays, named one at a time with why it
// stays. A line here is a promise that the string is not prose.
//
// aria-labelledby needs no entry: /\blabelled\b/ cannot match inside
// it, because a word boundary will not fall between "labelled" and the
// "by" that follows. That is deliberate, and it is why the pattern is
// anchored at both ends rather than written as /labelled/.
const ALLOWED = [
  {
    file: 'server/lib/charts.js',
    text: "const colour = accentLast",
    why: 'a local in the bar chart: a name in code, not a word on screen',
  },
  {
    file: 'server/lib/charts.js',
    text: 'fill="${colour}"',
    why: 'the same local, used',
  },
  {
    file: 'server/lib/charts.js',
    text: "label = 'Chart', colour = 'var(--c2)'",
    why: "barsAcross's option key: renaming it is a code change, not a wording one",
  },
  {
    file: 'server/lib/charts.js',
    text: "'var(--accent)' : colour}",
    why: 'the same option, used',
  },
  {
    file: 'server/lib/admin/stats-page.js',
    text: "colour: 'var(--c3)'",
    why: "barsAcross's option key, passed for the platform chart",
  },
  {
    file: 'server/lib/admin/stats-page.js',
    text: "colour: 'var(--c4)'",
    why: 'the same option, for the language chart',
  },
  {
    file: 'server/lib/admin/stats-page.js',
    text: "colour: 'var(--c5)'",
    why: 'the same option, for the weekday chart',
  },
  {
    file: 'server/lib/admin/stats-page.js',
    text: "colour: 'var(--c6)'",
    why: 'the same option, for the episode-age chart',
  },
  {
    file: 'server/lib/admin/look-page.js',
    text: 'id="sec-colour"',
    why: 'an anchor a redirect can carry: renaming it breaks a link somebody holds',
  },
  {
    file: 'server/lib/theme.js',
    text: 'function normalise(input = {})',
    why: 'an exported name; its callers are named in this list too',
  },
  {
    file: 'server/lib/theme.js',
    text: 'const t = normalise(theme)',
    why: 'the same function, called inside its own module',
  },
  {
    file: 'server/lib/theme.js',
    text: 'module.exports = { normalise, styleTag, DEFAULTS }',
    why: 'the same function, exported',
  },
  {
    file: 'server/lib/html.js',
    text: "require('./theme').normalise(theme)",
    why: 'themes.normalise, called',
  },
  {
    file: 'server/lib/admin.js',
    text: 'entry.theme = themes.normalise({',
    why: 'themes.normalise, called',
  },
  {
    file: 'server/lib/admin/look-page.js',
    text: 'const t = themes.normalise(show.theme)',
    why: 'themes.normalise, called',
  },
  {
    file: 'server/lib/public.js',
    text: 'function summarise(text, limit = 320)',
    why: 'a name in code; the comment above it says summarizes',
  },
  {
    file: 'server/lib/public.js',
    text: 'const s = summarise(host.bio)',
    why: 'the same function, called',
  },
];

function walk(p, out) {
  const full = path.join(ROOT, p);
  if (!fs.existsSync(full)) return;
  if (fs.statSync(full).isDirectory()) {
    for (const name of fs.readdirSync(full)) walk(path.join(p, name), out);
    return;
  }
  if (/\.(woff2|webp|gif|png|jpg|jpeg|ico|svg)$/i.test(p)) return;
  if (NOT_OURS.has(p)) return;
  out.push(p);
}

function files() {
  const out = [];
  for (const entry of READ_BY_PEOPLE) walk(entry, out);
  return out;
}

test('every file a person reads uses American spellings', () => {
  const complaints = [];
  for (const rel of files()) {
    const lines = fs.readFileSync(path.join(ROOT, rel), 'utf8').split('\n');
    lines.forEach((line, i) => {
      for (const rx of BRITISH) {
        const hit = line.match(rx);
        if (!hit) continue;
        const excused = ALLOWED.some((a) => a.file === rel && line.includes(a.text));
        if (excused) continue;
        complaints.push(`${rel}:${i + 1} "${hit[0]}" in: ${line.trim().slice(0, 90)}`);
      }
    });
  }
  assert.deepStrictEqual(complaints, [], `British spellings found:\n${complaints.join('\n')}`);
});

// An exception that no longer matches anything is an exception nobody
// checked. Left in place it would quietly excuse a line somebody adds
// later that happens to contain the same text.
test('no exception in the list has gone stale', () => {
  const dead = ALLOWED.flatMap((a) => {
    const full = path.join(ROOT, a.file);
    const gone = !fs.existsSync(full) || !fs.readFileSync(full, 'utf8').includes(a.text);
    return gone ? [`${a.file}: ${a.text}`] : [];
  });
  assert.deepStrictEqual(dead, [], `exceptions matching nothing:\n${dead.join('\n')}`);
});

// The files we chose not to edit are somebody else's legal text, so
// check they are still there rather than silently skipping a name that
// a rename turned into nothing.
test('the files left in British English are the licenses, and they still exist', () => {
  for (const rel of NOT_OURS) {
    assert.ok(fs.existsSync(path.join(ROOT, rel)), `${rel} is missing`);
  }
  const agpl = fs.readFileSync(path.join(ROOT, 'LICENSE'), 'utf8');
  assert.ok(agpl.includes('GNU AFFERO GENERAL PUBLIC LICENSE'), 'the AGPL text is intact');
});

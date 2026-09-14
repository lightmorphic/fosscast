'use strict';
// First run: claiming the instance, and the rule about passwords.
//
// There is no code, and that is the point. Charlie, 14 September 2026:
// "Why is there a setup code in the log? I asked for no codes in the
// log." The first person to open an unclaimed FOSSCast sets the email
// and the password, adds a passkey or a second factor if they want
// them, and the instance is theirs. Jellyfin, Immich and Home Assistant
// all work this way, so it is what a self-hoster expects.
//
// What it costs is said out loud rather than left to be discovered. In
// the minutes between the container starting and somebody opening the
// page, anybody who can reach the address could claim it first. On a
// home network that is a minute long and nobody else is looking. On a
// server with the port open to the internet it is a real window, and
// the answer is either to keep the port shut until the instance has
// been claimed or to set REQUIRE_SETUP_CODE=1.
//
// That setting puts back what used to be the only way: FOSSCast prints
// a six-digit code when it starts, keeps it in memory and nowhere else,
// and the page asks for it before it will let anybody claim the
// instance. Being able to run `docker compose logs app` is then the
// proof that the machine is yours. It is off by default because the
// person it protects is the exception and the log-reading was in
// everybody else's way.
//
// Either way it is the one and only sign-up. Once the instance has an
// owner the setup page is gone and the address refuses everybody.

const crypto = require('crypto');

// Read once, at load. It decides what the start-up log says, so it
// cannot be something that changes while the process runs.
const REQUIRED = /^(1|true|yes|on)$/i.test(String(process.env.REQUIRE_SETUP_CODE || '').trim());

function required() { return REQUIRED; }

let code = null;

// Printed on a start where nobody owns the instance yet. Said in whole
// sentences because the person reading it is looking at a wall of
// container output and has to be able to find it.
function announce() {
  if (!REQUIRED) {
    code = null;
    console.log([
      '',
      '  ----------------------------------------------------------',
      '  Nobody owns this FOSSCast yet.',
      '',
      '  Open it in a browser and set your own email and password.',
      '  There is nothing to look up and no code to find.',
      '',
      '  Do it now rather than later: until somebody claims it,',
      '  anybody who can reach the address could claim it instead.',
      '  On a home network that is a minute and nobody is looking.',
      '  With the port open to the internet it is a real window -',
      '  keep the port shut until you have claimed it, or start',
      '  FOSSCast with REQUIRE_SETUP_CODE=1 and it will ask for a',
      '  code from this log instead.',
      '  ----------------------------------------------------------',
      '',
    ].join('\n'));
    return null;
  }

  code = `${crypto.randomInt(0, 1000)}`.padStart(3, '0') + '-'
    + `${crypto.randomInt(0, 1000)}`.padStart(3, '0');
  console.log([
    '',
    '  ----------------------------------------------------------',
    '  Nobody owns this FOSSCast yet.',
    '',
    '  REQUIRE_SETUP_CODE is set, so the page will ask for this',
    '  code before it lets anybody claim the instance:',
    '',
    `      ${code}`,
    '',
    '  It is only in this log, so only somebody who can reach this',
    '  machine can claim the instance. It changes every restart and',
    '  is never written to disk.',
    '  ----------------------------------------------------------',
    '',
  ].join('\n'));
  return code;
}

function current() { return code; }
function clear() { code = null; }

function matches(given) {
  const want = code || '';
  const got = String(given || '').trim();
  if (!want || got.length !== want.length) return false;
  return crypto.timingSafeEqual(Buffer.from(got), Buffer.from(want));
}

// ---------------------------------------------------------------------
// The password rule
// ---------------------------------------------------------------------
// Enforced, not advised. Charlie: "I would rather people be upset with
// me for forcing a good password than complaining that we didn't force
// them to use a good password after they get hacked."
//
// The rule is length, because length is the thing that actually helps.
// There are no rules about capitals and symbols on purpose: they
// produce Password1!, which satisfies every such rule and is on every
// list, and they make a good passphrase harder to type. What is checked
// instead is whether the choice is one an attacker tries first - and
// that is checked by name, so the refusal can say what is wrong rather
// than muttering about complexity.

const MINIMUM = 12;

// The openers. Every password-guessing tool starts somewhere near here,
// and adding 1 or 123 to the end of one changes nothing, so the check
// strips trailing digits before comparing.
const FIRST_GUESSES = [
  'password', 'passwd', 'pass', 'letmein', 'welcome', 'admin', 'administrator',
  'root', 'login', 'user', 'guest', 'test', 'changeme', 'default', 'secret',
  'qwerty', 'qwertyuiop', 'asdfgh', 'zxcvbn', 'azerty', 'abc', 'abcd',
  'iloveyou', 'monkey', 'dragon', 'football', 'baseball', 'sunshine',
  'princess', 'shadow', 'master', 'superman', 'batman', 'trustno',
  'starwars', 'whatever', 'freedom', 'hello', 'charlie', 'michael', 'jordan',
  'podcast', 'fosscast', 'fossstudio', 'lightmorphic',
];

function problem(password, email = '') {
  const given = String(password || '');
  const plain = given.toLowerCase().replace(/[^a-z0-9]/g, '');
  const stem = plain.replace(/[0-9]+$/, '');

  // The named refusal comes first, so "password123" is told what is
  // actually wrong with it rather than that it is a character short.
  for (const guess of FIRST_GUESSES) {
    if (plain === guess || stem === guess || stem === guess + guess) {
      return `"${guess}" is one of the first things anybody tries, and putting numbers `
        + 'after it does not change that. Four or five unrelated words work far better: '
        + 'they are longer, they are easier to remember, and nobody has a list of them.';
    }
  }

  if (given.length < MINIMUM) {
    return `That is ${given.length} character${given.length === 1 ? '' : 's'}, and this needs at `
      + `least ${MINIMUM}. Length is what makes a password hard to guess, so four or five `
      + 'ordinary words in a row beat anything short and clever.';
  }

  // One character repeated, or a run along the keyboard. Long, and
  // guessed in a moment.
  if (/^(.)\1+$/.test(plain) || /^(1234567890|0123456789|abcdefghij|qwertyuiop)/.test(plain)) {
    return 'That is one character over and over, or one run along the keyboard. It is long '
      + 'but it is not hard to guess. Four or five unrelated words work far better.';
  }

  // Mostly the address it opens. The second thing anybody tries.
  const name = String(email).split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
  if (name.length > 2 && plain.includes(name) && plain.length < MINIMUM + 8) {
    return 'That is mostly the address it lets you in with, which is the second thing '
      + 'anybody tries. Four or five unrelated words work far better.';
  }

  return '';
}

// ---------------------------------------------------------------------
// A passphrase to offer beside the box
// ---------------------------------------------------------------------
// For the person who would rather not think of one. Words only: a
// password you can read aloud to yourself is a password you will still
// have next month. The strength is not in the words being unusual, it
// is in there being six of them chosen at random. The list is 370
// words long, so six of them is about fifty-one bits, which no amount
// of guessing at a rate-limited login will ever reach.

const WORDS = ('anchor apple arbor arrow autumn badger bakery ballad barley basket beacon beetle '
  + 'bellow birch biscuit blanket bramble breeze bridge bristle bronze bucket bugle burrow button '
  + 'cabin cactus canvas caramel cargo carrot castle cavern cedar cellar chapel cherry chimney cinder '
  + 'cistern clover cobble compass copper coral cotton cricket crimson crumpet crystal cupboard curtain '
  + 'cushion cutlery cymbal daisy damson dapple dawn decoy denim dimple domino donkey drawer drizzle '
  + 'dumpling dusk eagle ember engine fable falcon fathom feather fennel ferry fiddle filbert flagon '
  + 'flannel flask flint flutter forest fountain foxglove fragment frigate fritter frost furnace gables '
  + 'gallery gannet garden garnet gather gazebo ginger girder glacier glimmer granite gravel grotto '
  + 'gully gusset hamlet hammock harbor harvest hazel heather hedgerow heron hollow honey hornet '
  + 'hurdle iceberg icicle inkwell ironing island jackdaw jasmine jetty jigsaw juniper kestrel kettle '
  + 'kindling lantern lattice lavender ledger lemon lentil lichen lighthouse lilac linen lintel lobster '
  + 'locket lodger lupin lychee magnet mallard mallet mantle maple marble marigold marrow meadow medley '
  + 'mermaid mildew millet mitten morsel mortar mosaic mulberry mushroom mussel mustard nectar needle '
  + 'nettle nightjar noodle nutmeg oatcake orchard osprey ottoman outcrop oyster paddle pageant pantry '
  + 'paprika parcel parsley parsnip pasture pebble pelican pennant pepper pewter pheasant piccolo pigeon '
  + 'pilchard pillar pimento pinnacle pistachio plaice plantain platter plover plumage pocket pollen '
  + 'pomelo poplar poppy porridge portal potter poultry prairie pretzel primrose pudding puffin pumpkin '
  + 'quarry quaver quiver radish rafter rambler rapids rattle raven ravine redwood reindeer rhubarb '
  + 'ribbon rigging ripple rivet roebuck rosemary rowan rudder rummage russet saddle saffron sandal '
  + 'sapling sardine satchel saucer sawdust scallop scarlet scholar scissor scone scrimshaw seagull '
  + 'seaside sequin shallot shamrock shanty sherbet shingle shovel shutter sickle sideboard silver '
  + 'skillet skipper skylark slipper smelter snorkel snowdrop sorbet sorrel spanner sparrow spindle '
  + 'spinney splinter sprocket squirrel stable stanza starling steeple stirrup stoneware stubble sugar '
  + 'sultana summit sunbeam swallow sycamore syrup tabby tackle tadpole tallow tandem tankard tapestry '
  + 'tarragon teapot tempest tendril terrace thicket thimble thistle thorn threshold thunder tinder '
  + 'toadstool toboggan toffee topaz torrent tortoise trailer trellis trifle trinket trolley trumpet '
  + 'tulip tumbler turnip turret turtle tussock umbrella vanilla velvet veranda vinegar violet vulture '
  + 'waffle wagon walnut warbler warren wattle weasel weather whistle wicker widget willow window '
  + 'winnow wisteria wombat woodland wrapper wren yarrow yeoman yogurt zephyr').split(/\s+/);

function suggest(count = 6) {
  const picked = [];
  for (let i = 0; i < count; i += 1) picked.push(WORDS[crypto.randomInt(0, WORDS.length)]);
  return picked.join('-');
}

module.exports = {
  announce, current, clear, matches, required,
  problem, suggest, MINIMUM, WORDS,
};

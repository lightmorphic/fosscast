'use strict';
// First run: claiming the instance, and the rule about passwords.
//
// A setup page anybody can reach is an instance anybody can own -
// whoever finds the address first sets the password, and the person who
// pays for the server is locked out of their own machine. So the page
// asks for a code that FOSSCast prints in its log when it starts and
// keeps nowhere else. `docker compose logs app` is a command every
// self-hoster can run, and being able to run it is the proof that the
// box is theirs.
//
// From the box itself, in the first half hour, the code is not asked
// for at all. Reaching an unclaimed instance from the machine it runs
// on is the same proof, arrived at without anybody reading a log -
// Charlie, 14 September 2026: "I don't like that you have to go into
// the logs to find a code. There must be a simpler way." What counts as
// the machine itself is in lib/local.js.
//
// The half hour is there because of the one shape lib/local.js cannot
// see through. A reverse proxy on the same machine dials FOSSCast from
// exactly where a browser on that machine dials it from, and while
// almost every proxy gives itself away - a forwarding header, the site's
// own name in Host - one configured to send neither is word for word
// identical to somebody sitting at the keyboard. Measured against a
// bare nginx proxy_pass, not guessed at.
//
// So that door is only open while somebody is plainly standing at it.
// An install is claimed in the minute after it starts; what the window
// takes away is the FOSSCast that was started, forgotten, and left
// unclaimed behind such a proxy for a week. After it closes the code is
// asked for again, from the machine as much as from anywhere else, and
// a restart opens it once more with a new code.

// Thirty minutes. Long enough that nobody doing the install notices it,
// short enough that an instance left running is not still offering
// itself. Not a setting: there are no settings until somebody owns the
// instance, which is the thing being decided here.
const OPENING = 30 * 60 * 1000;
let startedAt = Date.now();

function withinOpeningTime() { return Date.now() - startedAt < OPENING; }

// Only for the tests, which cannot wait half an hour to find out what
// happens after half an hour.
function setStartedAtForTests(when) { startedAt = when; }
//
// The code lives in memory for the life of the process. It is never
// written to disk, so it is not in a backup, and it is a different code
// after every restart.

const crypto = require('crypto');

let code = null;

// Printed on a start where nobody owns the instance yet. Said in whole
// sentences because the person reading it is looking at a wall of
// container output and has to be able to find it.
function announce() {
  code = `${crypto.randomInt(0, 1000)}`.padStart(3, '0') + '-'
    + `${crypto.randomInt(0, 1000)}`.padStart(3, '0');
  console.log([
    '',
    '  ----------------------------------------------------------',
    '  Nobody owns this FOSSCast yet.',
    '',
    '  Open it in a browser on this machine in the next half hour and',
    '  it will simply ask you to set an email and a password. Being',
    '  here is proof enough.',
    '',
    '  From another machine, or later than that, it asks for this code',
    '  as well:',
    '',
    `      ${code}`,
    '',
    '  The code is only in this log, so only somebody who can reach',
    '  this machine can claim the instance from elsewhere. It changes',
    '  every restart and is never written to disk - and a restart also',
    '  opens the half hour again.',
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
  announce, current, clear, matches, withinOpeningTime, setStartedAtForTests, OPENING,
  problem, suggest, MINIMUM, WORDS,
};

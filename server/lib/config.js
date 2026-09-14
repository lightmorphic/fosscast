'use strict';
// Where an instance's own decisions live.
//
// They used to live in a compose file, which meant that changing the
// site's address, or turning uploads off, meant editing YAML on a server
// over SSH and restarting the container. Charlie: "Instead of putting
// anything into a Docker compose, which I think is very unprofessional,
// can we put it into the settings?" So they are settings now, kept in
// the store beside everything else and edited on the Settings page.
//
// An environment variable is still read, once, for an instance that
// already has one: on the first start after the upgrade its value is
// copied into the store and a line is printed saying where that setting
// now lives. After that the store is the only truth, and the variable
// can come out of the compose file. This is the whole of the upgrade
// path - nobody has to do anything for their instance to keep behaving
// as it did.
//
// The store caches in memory, so the value read here is the value the
// running process saved. That is why nothing outside this process may
// write the settings file.

const { siteDomain, setSiteDomain, cleanDomain } = require('./domain');

// name -> [environment variable, default, what it is]
//
// A switch is stored as a boolean and read from the environment the way
// it always was: anything in the off-list turns it off, anything else
// leaves it on.
const FIELDS = {
  domain: ['DOMAIN', '', 'text'],
  mediaUploads: ['MEDIA_UPLOADS', true, 'switch'],
  contactPath: ['CONTACT_PATH', '', 'text'],
  maillistEmbed: ['MAILLIST_EMBED', '', 'text'],
  frameAncestors: ['FRAME_ANCESTORS', '', 'text'],
};

const OFF = /^(0|off|false|no)$/i;

let store = null;

function fromEnvironment(name) {
  const [variable, fallback, kind] = FIELDS[name];
  const raw = process.env[variable];
  if (raw === undefined) return undefined;
  const value = String(raw).trim();
  if (kind === 'switch') return !OFF.test(value);
  // People paste a whole web address where a host name is wanted. It is
  // tidied on the way in rather than every time it is read, so what the
  // Settings page shows is what is stored.
  if (name === 'domain') return cleanDomain(value) || fallback;
  return value || fallback;
}

// Called once at boot, before anything reads a setting. Anything the
// environment still carries and the store has never held is adopted
// here, and said out loud exactly once so an operator can find the line
// in their log and go and delete the variable.
function adopt(theStore) {
  store = theStore;
  const settings = store.load('settings', () => ({}));
  const adopted = [];
  for (const name of Object.keys(FIELDS)) {
    if (name in settings) continue;
    const value = fromEnvironment(name);
    if (value === undefined) continue;
    settings[name] = value;
    adopted.push(FIELDS[name][0]);
  }
  if (adopted.length) {
    store.save('settings', settings);
    console.log(`Moved ${adopted.join(', ')} out of the environment and into the Settings page.`);
    console.log('They can come out of your compose file; this instance reads them from its own store now.');
  }
  setSiteDomain(settings.domain || '');
}

function get(name) {
  const [, fallback] = FIELDS[name];
  if (!store) {
    const fromEnv = fromEnvironment(name);
    return fromEnv === undefined ? fallback : fromEnv;
  }
  const settings = store.load('settings', () => ({}));
  return name in settings ? settings[name] : fallback;
}

function set(name, value) {
  const settings = store.load('settings', () => ({}));
  settings[name] = value;
  store.save('settings', settings);
  if (name === 'domain') setSiteDomain(value);
}

// Named readers, because a caller should not have to remember a string.
const mediaUploads = () => get('mediaUploads') !== false;
// Both of these name a path on this same site, never somewhere else:
// anything that does not start with a single slash is ignored rather
// than argued with, so a setting can never turn into an off-site fetch.
const samesite = (name) => {
  const raw = String(get(name) || '').trim();
  return raw.startsWith('/') && !raw.includes('//') ? raw : '';
};
const contactPath = () => samesite('contactPath');
const maillistEmbed = () => samesite('maillistEmbed');
const frameAncestors = () => String(get('frameAncestors') || '').trim();

module.exports = {
  FIELDS, adopt, get, set, siteDomain,
  mediaUploads, contactPath, maillistEmbed, frameAncestors,
};

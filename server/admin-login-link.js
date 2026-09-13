'use strict';
// Mint a one-time sign-in link for the dashboard, and print it. Only
// something that can run inside the app container (i.e. root on the box)
// can create one, so this is the auth boundary. Used by the fleet
// agent's login-link command to sign an operator straight in without
// ever knowing the customer's password.
//
//   docker compose exec -T app node admin-login-link.js [email]
//
// The link works once and expires in ten minutes.

const path = require('path');
const { Store } = require('./lib/store');
const { signLoginLink } = require('./lib/auth');
const crypto = require('crypto');

const store = new Store(process.env.DATA_DIR || path.join(__dirname, 'data'));
const users = store.load('users', []);
const DOMAIN = require('./lib/domain').siteDomain();

if (users.length === 0) {
  console.error('No accounts exist yet.');
  process.exit(1);
}

const wanted = (process.argv[2] || '').trim().toLowerCase();
let user;
if (wanted) {
  user = users.find((u) => u.email === wanted);
  if (!user) { console.error(`No account for ${wanted}.`); process.exit(1); }
} else if (users.length === 1) {
  [user] = users;
} else {
  console.error(`Several accounts exist, name one: ${users.map((u) => u.email).join(', ')}`);
  process.exit(1);
}

const settings = store.load('settings', () => ({}));
if (!settings.secret) {
  settings.secret = crypto.randomBytes(32).toString('hex');
  store.save('settings', settings);
}

const token = signLoginLink(user.id, settings.secret);
console.log(`https://${DOMAIN}/admin/session?token=${encodeURIComponent(token)}`);

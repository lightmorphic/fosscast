'use strict';
// Set a fresh dashboard password from the server, for when nobody can
// log in any more. Prints the new password once; nothing is emailed.
//
//   docker compose exec -T app node reset-password.js [email]
//
// With no email it resets the only account, or refuses if there are
// several. Used by hand, and by the fleet agent's reset-password verb.

const path = require('path');
const { Store } = require('./lib/store');
const { hashPassword } = require('./lib/auth');
const crypto = require('crypto');

const store = new Store(process.env.DATA_DIR || path.join(__dirname, 'data'));
const users = store.load('users', []);

if (users.length === 0) {
  console.error('No accounts exist yet: set ADMIN_EMAIL and ADMIN_PASSWORD and restart.');
  process.exit(1);
}

const wanted = (process.argv[2] || '').trim().toLowerCase();
let user;
if (wanted) {
  user = users.find((u) => u.email === wanted);
  if (!user) {
    console.error(`No account for ${wanted}. Accounts: ${users.map((u) => u.email).join(', ')}`);
    process.exit(1);
  }
} else if (users.length === 1) {
  [user] = users;
} else {
  console.error(`Several accounts exist, name one: ${users.map((u) => u.email).join(', ')}`);
  process.exit(1);
}

const password = crypto.randomBytes(18).toString('base64url').slice(0, 20);
user.hash = hashPassword(password);
store.save('users', users);

console.log(`${user.email} ${password}`);

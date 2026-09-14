'use strict';

// DOMAIN is a host name, but people paste addresses: "https://my.podcast/"
// works everywhere a browser is involved and then quietly breaks every
// feed URL, because the feed builds "https://" + DOMAIN and ends up
// with two schemes. So the value is read through here, with a scheme
// and any path stripped, and the rest of the code sees a host.
//
// The value itself is a setting now rather than an environment
// variable (see config.js). It is pushed in here at boot and again
// whenever somebody saves the Settings page, so that every caller can
// go on asking a plain function for it and none of them needs the
// store. The environment is still read when nothing has set it, which
// is what makes a command-line tool such as admin-login-link.js work
// on its own.
let current = null;

function clean(raw) {
  return String(raw || '').trim()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//i, '')
    .replace(/[/?#].*$/, '')
    .replace(/\.$/, '');
}

function setSiteDomain(value) {
  current = clean(value);
}

function siteDomain(fallback = 'localhost') {
  if (current) return current;
  return clean(process.env.DOMAIN) || fallback;
}

module.exports = { siteDomain, setSiteDomain, cleanDomain: clean };

'use strict';

// DOMAIN is a host name, but people paste addresses: "https://my.show/"
// works everywhere a browser is involved and then quietly breaks every
// feed URL, because the feed builds "https://" + DOMAIN and ends up
// with two schemes. So the value is read through here, with a scheme
// and any path stripped, and the rest of the code sees a host.
function siteDomain(fallback = 'localhost') {
  const raw = String(process.env.DOMAIN || '').trim();
  const host = raw.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '').replace(/[/?#].*$/, '').replace(/\.$/, '');
  return host || fallback;
}

module.exports = { siteDomain };

'use strict';
// Is this request coming from the machine FOSSCast is running on?
//
// It is asked once, on the first run, and the answer decides whether the
// setup code is needed. Reaching an instance nobody owns yet from the
// box itself already proves you own the box, which is the only thing the
// code was ever proving. From anywhere else the code still applies.
//
// The answer must be worth something, so every part of it comes from
// somewhere a stranger cannot write.
//
// 1. The address comes from the socket. X-Forwarded-For, X-Real-IP and
//    the rest are written by whoever is in front and anybody can put
//    them in a request by hand, so they are never read as an address -
//    only as evidence that something is in front, which is the opposite
//    use.
//
// 2. Inside Docker the socket does not see loopback even when the
//    request came from the machine itself. A port published on
//    127.0.0.1 is reached through Docker's own relay, which dials the
//    container from the bridge gateway, so a browser on the box arrives
//    as 172.17.0.1. Measured, not assumed. That address is therefore
//    taken as the machine itself - but only in a container, where the
//    gateway is the host. Running without one, the default gateway is
//    the building's router and would let half a network claim the
//    instance, so it is ignored.
//
//    Nothing else arrives that way. A request from another machine keeps
//    its own address through Docker's forwarding (a LAN client shows as
//    the LAN client), and a port published on 127.0.0.1 cannot be
//    reached from off the box at all.
//
// 3. A reverse proxy on the same machine dials FOSSCast from that same
//    place, so its address alone would make every request in the world
//    look local. That is the hole worth caring about, and it is closed
//    by two further conditions, both of which a proxy fails:
//
//    - no forwarding header of any kind is present. A proxy adds them;
//      a stranger can add them too, and adding one only ever makes the
//      answer stricter, never looser.
//    - the Host header names loopback. Somebody at a browser on the box
//      types localhost or 127.0.0.1; a proxy serving a site passes the
//      site's name through, and a request arriving at the proxy asking
//      for localhost does not match the site and never reaches us.
//
// Where those two cannot settle it - a proxy configured to forward
// nothing and rewrite the Host to its upstream - the answer is the
// strict one and the code is asked for. That is the deliberate
// direction of every doubt here: an install that wrongly asks for a
// code costs somebody one `docker compose logs app`, and an install
// that wrongly skips it can be taken by a stranger.

const fs = require('fs');

// Everything a proxy, a load balancer or a CDN is known to add. The list
// is long on purpose: it does not have to be right about which proxy is
// in front, only that something is.
const PROXY_HEADERS = [
  'x-forwarded-for',
  'x-forwarded-proto',
  'x-forwarded-host',
  'x-forwarded-port',
  'x-forwarded-server',
  'x-forwarded-ssl',
  'x-real-ip',
  'x-client-ip',
  'x-cluster-client-ip',
  'x-original-forwarded-for',
  'x-original-host',
  'x-original-url',
  'forwarded',
  'via',
  'proxy-connection',
  'true-client-ip',
  'cf-connecting-ip',
  'cf-ray',
  'fastly-client-ip',
  'fly-client-ip',
  'x-appengine-user-ip',
  'x-azure-clientip',
];

function unmap(address) {
  const given = String(address || '');
  // Node reports an IPv4 peer on a dual-stack listener as ::ffff:1.2.3.4.
  return given.startsWith('::ffff:') ? given.slice(7) : given;
}

function isLoopbackAddress(address) {
  const plain = unmap(address);
  if (plain === '::1') return true;
  return /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(plain);
}

// A private address, which is what a container's gateway always is. A
// public one there would mean the reading is wrong, and a wrong reading
// is not worth acting on.
function isPrivateAddress(address) {
  const plain = unmap(address);
  const parts = plain.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // carrier-grade NAT, which podman uses
  return false;
}

// Docker writes this file; podman writes the other one. Either says the
// default gateway is a host rather than a router.
function inContainer() {
  if (fs.existsSync('/.dockerenv') || fs.existsSync('/run/.containerenv')) return true;
  try {
    const cgroup = fs.readFileSync('/proc/1/cgroup', 'utf8');
    return /docker|containerd|kubepods|libpod/.test(cgroup);
  } catch {
    return false;
  }
}

// The default gateway, read from the kernel's own table. The address is
// little-endian hex, one word per line.
function readGateway() {
  let table;
  try { table = fs.readFileSync('/proc/net/route', 'utf8'); } catch { return null; }
  for (const line of table.split('\n').slice(1)) {
    const cols = line.trim().split(/\s+/);
    if (cols.length < 3 || cols[1] !== '00000000') continue;
    const word = parseInt(cols[2], 16);
    if (!Number.isFinite(word) || word === 0) continue;
    const found = [word & 0xff, (word >> 8) & 0xff, (word >> 16) & 0xff, (word >> 24) & 0xff].join('.');
    if (isPrivateAddress(found)) return found;
  }
  return null;
}

// Read once. It cannot change without the process being restarted, and
// reading a file on every request to answer a question asked on the
// first run only would be silly.
let gateway;
function hostAddress() {
  if (gateway === undefined) gateway = inContainer() ? readGateway() : null;
  return gateway;
}

// Only for the tests, which have to be able to stand where a container
// stands without being one.
function setHostAddressForTests(value) { gateway = value; }

function hostIsLoopback(hostHeader) {
  let name = String(hostHeader || '').trim().toLowerCase();
  if (!name) return false;
  if (name.startsWith('[')) {
    // [::1] or [::1]:3100
    const end = name.indexOf(']');
    if (end < 0) return false;
    name = name.slice(1, end);
  } else {
    const colon = name.lastIndexOf(':');
    if (colon > 0) name = name.slice(0, colon);
  }
  if (name === 'localhost' || name === '::1') return true;
  return /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(name);
}

// The whole decision, kept apart from the request object so it can be
// asked every awkward question in a test without a socket.
function decide({ address, headers = {} }) {
  for (const name of PROXY_HEADERS) {
    if (headers[name] !== undefined) return false;
  }
  if (!hostIsLoopback(headers.host)) return false;
  if (isLoopbackAddress(address)) return true;
  const host = hostAddress();
  return Boolean(host) && unmap(address) === host;
}

function isLocal(req) {
  if (!req || !req.socket) return false;
  return decide({ address: req.socket.remoteAddress, headers: req.headers || {} });
}

module.exports = {
  isLocal,
  decide,
  hostAddress,
  setHostAddressForTests,
  isLoopbackAddress,
  hostIsLoopback,
  PROXY_HEADERS,
};

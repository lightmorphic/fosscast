'use strict';
// Privacy-first download stats. A download = the first request per
// listener per episode per day (deduplicated by a salted hash of
// IP + user agent that is never stored raw and resets daily), in the
// spirit of the IAB guidelines. No cookies, no tracking, aggregate
// counts only.
//
// Everything below is a counter. There is no row per listener anywhere,
// nothing that could be joined back to a person, and no history beyond
// the buckets: "37 downloads on Tuesday at 8pm from Apple Podcasts" is
// the finest grain this file can produce, by design. That is enough to
// run a show and not enough to follow anybody.

const crypto = require('crypto');

const KEEP_DAYS = 90;
const KEEP_MONTHS = 24;

// Podcast apps say who they are in the user agent. This is a list of
// the ones worth naming; everything else is counted as a browser or as
// "other" rather than guessed at.
const APPS = [
  [/AppleCoreMedia|iTunes|Podcasts\/|Apple Podcasts/i, 'Apple Podcasts'],
  [/Spotify/i, 'Spotify'],
  [/Overcast/i, 'Overcast'],
  [/PocketCasts|Pocket Casts/i, 'Pocket Casts'],
  [/AntennaPod/i, 'AntennaPod'],
  [/Castro/i, 'Castro'],
  [/PodcastAddict/i, 'Podcast Addict'],
  [/Podverse/i, 'Podverse'],
  [/Fountain/i, 'Fountain'],
  [/TrueFans/i, 'TrueFans'],
  [/gPodder/i, 'gPodder'],
  [/Downcast/i, 'Downcast'],
  [/Player ?FM/i, 'Player FM'],
  [/Deezer/i, 'Deezer'],
  [/Amazon ?Music|Audible/i, 'Amazon Music'],
  [/YouTube/i, 'YouTube'],
  [/iHeartRadio/i, 'iHeartRadio'],
  [/Castbox/i, 'Castbox'],
  [/Podcasti?ndex|PodcastIndex/i, 'Podcast Index'],
  [/VLC|mpv|mplayer/i, 'A media player'],
  [/curl|wget|python|Go-http|axios|okhttp/i, 'A script'],
  [/bot|crawler|spider|facebookexternalhit/i, 'A crawler'],
  [/Firefox|Chrome|Safari|Edg\//i, 'A web browser'],
];

const PLATFORMS = [
  [/iPhone|iPad|iOS|AppleCoreMedia\/1\.0\.0\.\d+ \(i/i, 'iPhone or iPad'],
  [/Android/i, 'Android'],
  [/Macintosh|Mac OS X|AppleCoreMedia.*Macintosh/i, 'Mac'],
  [/Windows/i, 'Windows'],
  [/Linux|X11|CrOS/i, 'Linux'],
  [/Watch/i, 'Watch'],
];

function classify(list, value, fallback) {
  for (const [pattern, name] of list) if (pattern.test(value)) return name;
  return fallback;
}

function appFor(userAgent) {
  if (!userAgent) return 'Not saying';
  return classify(APPS, userAgent, 'Something else');
}

function platformFor(userAgent) {
  if (!userAgent) return 'Not saying';
  return classify(PLATFORMS, userAgent, 'Something else');
}

// The first language a listener's device asks for, as a bare tag: "en"
// rather than "en-GB,en;q=0.9". A hint at who is listening that costs
// nothing and identifies nobody.
function languageFor(header) {
  const first = String(header || '').split(',')[0].trim().split('-')[0].toLowerCase();
  return /^[a-z]{2,3}$/.test(first) ? first : '';
}

// Country comes from the proxy, when the proxy knows: Cloudflare sets
// CF-IPCountry, and nginx with the GeoIP module is usually configured to
// set X-Country-Code. FOSSCast never looks an address up itself - that
// would mean either shipping a database or asking someone else about
// our listeners, and neither belongs here.
function countryFor(headers) {
  const raw = String(headers['cf-ipcountry'] || headers['x-country-code'] || headers['x-geoip-country'] || '').trim().toUpperCase();
  return /^[A-Z]{2}$/.test(raw) && raw !== 'XX' ? raw : '';
}

// Machines that fetch a feed or a file without anybody listening:
// search crawlers, link unfurlers, uptime checks, and the scripted
// clients that come with them. They were labelled and then counted,
// which is how a show with four downloads reported two hundred and
// fifty subscribers.
const MACHINES = /bot\b|bot\/|crawler|spider|facebookexternalhit|slurp|bingpreview|headless|monitor|uptime|preview|scrapy|curl|wget|python-requests|libwww|Go-http|okhttp|axios|node-fetch|PostmanRuntime/i;

function isMachine(userAgent) {
  const ua = String(userAgent || '');
  // Nothing at all is a machine too: every real podcast app and browser
  // says who it is.
  if (!ua.trim()) return true;
  return MACHINES.test(ua);
}

function bump(bucket, key, by = 1) {
  if (!key) return;
  bucket[key] = (bucket[key] || 0) + by;
}

class Stats {
  constructor(store) {
    this.store = store;
    this.salt = crypto.randomBytes(16).toString('hex'); // rotates every restart
    this.seenDay = '';
    this.seen = new Set();
    this.seenFeed = new Set();
  }

  data() {
    const value = this.store.load('stats', () => ({ byDay: {}, totals: {} }));
    // Older instances have only the first two buckets.
    value.byDay = value.byDay || {};
    value.totals = value.totals || {};
    value.byMonth = value.byMonth || {};
    value.byHour = value.byHour || {};
    value.byWeekday = value.byWeekday || {};
    value.byApp = value.byApp || {};
    value.byPlatform = value.byPlatform || {};
    value.byCountry = value.byCountry || {};
    value.byLanguage = value.byLanguage || {};
    value.byAge = value.byAge || {};
    value.feedByDay = value.feedByDay || {};
    return value;
  }

  rollDay(day) {
    if (day === this.seenDay) return;
    this.seenDay = day;
    this.seen.clear();
    this.seenFeed.clear();
  }

  fingerprint(ip, userAgent, extra) {
    return crypto.createHash('sha256')
      .update(`${this.salt}|${ip}|${userAgent}|${extra}`)
      .digest('base64').slice(0, 16);
  }

  // One download. `context` carries what the request said about itself:
  // the user agent, the language asked for, the country the proxy
  // reported, and the episode's publication date for the age curve.
  record(episodeId, ip, userAgent, context = {}) {
    if (isMachine(userAgent)) return;
    const now = new Date();
    const day = now.toISOString().slice(0, 10);
    this.rollDay(day);
    const key = this.fingerprint(ip, userAgent, episodeId);
    if (this.seen.has(key)) return;
    this.seen.add(key);

    const data = this.data();
    data.byDay[day] = data.byDay[day] || {};
    data.byDay[day][episodeId] = (data.byDay[day][episodeId] || 0) + 1;
    bump(data.totals, episodeId);
    bump(data.byMonth, day.slice(0, 7));
    bump(data.byHour, String(now.getUTCHours()));
    bump(data.byWeekday, String(now.getUTCDay()));
    bump(data.byApp, appFor(userAgent));
    bump(data.byPlatform, platformFor(userAgent));
    bump(data.byCountry, countryFor(context.headers || {}));
    bump(data.byLanguage, languageFor((context.headers || {})['accept-language']));

    // How old the episode was when it was downloaded, bucketed: it shows
    // how long a back catalogue keeps earning.
    if (context.published) {
      const age = Math.floor((now - new Date(`${context.published}T00:00:00Z`)) / 86400000);
      if (age >= 0) {
        const bucket = age === 0 ? '0' : age <= 2 ? '1-2' : age <= 6 ? '3-6' : age <= 13 ? '7-13'
          : age <= 29 ? '14-29' : age <= 89 ? '30-89' : age <= 364 ? '90-364' : '365+';
        bump(data.byAge, bucket);
      }
    }

    const days = Object.keys(data.byDay).sort();
    while (days.length > KEEP_DAYS) delete data.byDay[days.shift()];
    const months = Object.keys(data.byMonth).sort();
    while (months.length > KEEP_MONTHS) delete data.byMonth[months.shift()];
    this.store.save('stats', data);
  }

  // A feed fetch, deduplicated the same way. Apps poll the feed roughly
  // daily, so the count of distinct pullers per day is the closest
  // honest thing to a subscriber number.
  recordFeed(ip, userAgent) {
    if (isMachine(userAgent)) return;
    const day = new Date().toISOString().slice(0, 10);
    this.rollDay(day);
    // The first day this instance ran a version that leaves machines
    // out. Days before it counted every crawler as a subscriber, so
    // anything reading these numbers can tell which of them mean
    // anything - rather than a number healing quietly over a week
    // while the page insists it was right all along.
    const data0 = this.data();
    if (!data0.machinesFrom) { data0.machinesFrom = day; this.store.save('stats', data0); }
    const key = this.fingerprint(ip, userAgent, 'feed');
    if (this.seenFeed.has(key)) return;
    this.seenFeed.add(key);
    const data = this.data();
    bump(data.feedByDay, day);
    const days = Object.keys(data.feedByDay).sort();
    while (days.length > KEEP_DAYS) delete data.feedByDay[days.shift()];
    this.store.save('stats', data);
  }

  total(episodeId) {
    return this.data().totals[episodeId] || 0;
  }

  // [{ day, count }] for the last n days, all episodes combined.
  lastDays(n = 30) {
    const data = this.data();
    const out = [];
    for (let i = n - 1; i >= 0; i--) {
      const day = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
      const counts = data.byDay[day] || {};
      out.push({ day, count: Object.values(counts).reduce((a, b) => a + b, 0) });
    }
    return out;
  }

  // [{ month, count }] for the last n months, oldest first.
  lastMonths(n = 12) {
    const data = this.data();
    const out = [];
    const now = new Date();
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
      const month = d.toISOString().slice(0, 7);
      out.push({ month, count: data.byMonth[month] || 0 });
    }
    return out;
  }

  feedLastDays(n = 30) {
    const data = this.data();
    const out = [];
    for (let i = n - 1; i >= 0; i--) {
      const day = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
      out.push({ day, count: data.feedByDay[day] || 0 });
    }
    return out;
  }

  // A named bucket as a sorted [{ label, count }], biggest first, with
  // a tail folded into "Other" so a chart stays readable.
  breakdown(bucket, limit = 8) {
    const entries = Object.entries(this.data()[bucket] || {})
      .filter(([, n]) => n > 0)
      .sort((a, b) => b[1] - a[1]);
    const head = entries.slice(0, limit).map(([label, count]) => ({ label, count }));
    const tail = entries.slice(limit).reduce((a, [, n]) => a + n, 0);
    if (tail) head.push({ label: 'Everything else', count: tail });
    return head;
  }

  hours() {
    const data = this.data();
    return Array.from({ length: 24 }, (_, h) => ({ hour: h, count: data.byHour[String(h)] || 0 }));
  }

  weekdays() {
    const data = this.data();
    const names = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return names.map((name, i) => ({ label: name, count: data.byWeekday[String(i)] || 0 }));
  }

  ages() {
    const order = ['0', '1-2', '3-6', '7-13', '14-29', '30-89', '90-364', '365+'];
    const labels = {
      '0': 'Day one', '1-2': 'Days 1-2', '3-6': 'Days 3-6', '7-13': 'Week two',
      '14-29': 'Weeks 3-4', '30-89': 'Months 2-3', '90-364': 'Months 4-12', '365+': 'A year on',
    };
    const data = this.data();
    return order.map((key) => ({ label: labels[key], count: data.byAge[key] || 0 }));
  }

  allTime() {
    return Object.values(this.data().totals).reduce((a, b) => a + b, 0);
  }
}

module.exports = { Stats, isMachine, appFor, platformFor, languageFor, countryFor };

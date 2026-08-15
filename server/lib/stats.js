'use strict';
// Privacy-first download stats. A download = the first request per
// listener per episode per day (deduplicated by a salted hash of
// IP + user agent that is never stored raw and resets daily), in the
// spirit of the IAB guidelines. No cookies, no tracking, aggregate
// counts only.

const crypto = require('crypto');

const KEEP_DAYS = 90;

class Stats {
  constructor(store) {
    this.store = store;
    this.salt = crypto.randomBytes(16).toString('hex'); // rotates every restart
    this.seenDay = '';
    this.seen = new Set();
  }

  data() {
    return this.store.load('stats', () => ({ byDay: {}, totals: {} }));
  }

  record(episodeId, ip, userAgent) {
    const day = new Date().toISOString().slice(0, 10);
    if (day !== this.seenDay) { this.seenDay = day; this.seen.clear(); }
    const key = crypto.createHash('sha256')
      .update(`${this.salt}|${ip}|${userAgent}|${episodeId}`)
      .digest('base64').slice(0, 16);
    if (this.seen.has(key)) return;
    this.seen.add(key);
    const data = this.data();
    data.byDay[day] = data.byDay[day] || {};
    data.byDay[day][episodeId] = (data.byDay[day][episodeId] || 0) + 1;
    data.totals[episodeId] = (data.totals[episodeId] || 0) + 1;
    const days = Object.keys(data.byDay).sort();
    while (days.length > KEEP_DAYS) delete data.byDay[days.shift()];
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
}

module.exports = { Stats };

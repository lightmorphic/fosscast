'use strict';
// The counters behind the stats page. Everything here is aggregate by
// construction: these tests are as much about what is not recorded as
// what is.
const { test } = require('node:test');
const assert = require('node:assert');
const { Stats, appFor, platformFor, languageFor, countryFor } = require('../lib/stats');

function fakeStore() {
  const data = {};
  return {
    load: (key, fallback) => (data[key] || (data[key] = typeof fallback === 'function' ? fallback() : fallback)),
    save: (key, value) => { data[key] = value; },
    raw: data,
  };
}

test('apps are recognised by the name they give', () => {
  assert.strictEqual(appFor('AppleCoreMedia/1.0.0.21G93 (iPhone; U; CPU OS 17_6)'), 'Apple Podcasts');
  assert.strictEqual(appFor('Overcast/3.0 (+http://overcast.fm/)'), 'Overcast');
  assert.strictEqual(appFor('AntennaPod/3.4.0'), 'AntennaPod');
  assert.strictEqual(appFor('Spotify/8.9 iOS'), 'Spotify');
  assert.strictEqual(appFor('curl/8.5.0'), 'A script');
  assert.strictEqual(appFor('Mozilla/5.0 Firefox/128.0'), 'A web browser');
  assert.strictEqual(appFor(''), 'Not saying');
  assert.strictEqual(appFor('Something nobody has heard of/1.0'), 'Something else');
});

test('platforms likewise, without guessing', () => {
  assert.strictEqual(platformFor('AppleCoreMedia/1.0 (iPhone)'), 'iPhone or iPad');
  assert.strictEqual(platformFor('AntennaPod/3.4.0 (Android 14)'), 'Android');
  assert.strictEqual(platformFor('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)'), 'Mac');
  assert.strictEqual(platformFor(''), 'Not saying');
});

test('language is the bare tag, and country comes only from the proxy', () => {
  assert.strictEqual(languageFor('en-GB,en;q=0.9,de;q=0.8'), 'en');
  assert.strictEqual(languageFor('nonsense'), '');
  assert.strictEqual(countryFor({ 'cf-ipcountry': 'gb' }), 'GB');
  assert.strictEqual(countryFor({ 'x-country-code': 'DE' }), 'DE');
  assert.strictEqual(countryFor({ 'cf-ipcountry': 'XX' }), '', "the unknown marker is not a country");
  assert.strictEqual(countryFor({}), '', 'no header, no country - nothing is looked up');
});

test('a download lands in every bucket, once per listener per day', () => {
  const store = fakeStore();
  const stats = new Stats(store);
  const context = { headers: { 'accept-language': 'en-GB', 'cf-ipcountry': 'GB' }, published: new Date().toISOString().slice(0, 10) };
  stats.record('ep-1', '10.0.0.1', 'Overcast/3.0', context);
  stats.record('ep-1', '10.0.0.1', 'Overcast/3.0', context);   // same listener, same day
  stats.record('ep-1', '10.0.0.2', 'AntennaPod/3.4.0 (Android 14)', context);

  const data = store.raw.stats;
  assert.strictEqual(stats.total('ep-1'), 2, 'the repeat did not count');
  assert.strictEqual(data.byApp.Overcast, 1);
  assert.strictEqual(data.byApp.AntennaPod, 1);
  assert.strictEqual(data.byPlatform.Android, 1);
  assert.strictEqual(data.byCountry.GB, 2);
  assert.strictEqual(data.byLanguage.en, 2);
  assert.strictEqual(data.byAge['0'], 2, 'both were same-day downloads');
  assert.strictEqual(Object.values(data.byHour).reduce((a, b) => a + b, 0), 2);
});

test('nothing about a listener is written down', () => {
  const store = fakeStore();
  const stats = new Stats(store);
  stats.record('ep-1', '198.51.100.7', 'Overcast/3.0', { headers: { 'accept-language': 'en' } });
  const dump = JSON.stringify(store.raw.stats);
  assert.ok(!dump.includes('198.51.100.7'), 'no address');
  assert.ok(!dump.includes('Overcast/3.0'), 'no raw user agent, only the app name');
});

test('breakdowns are sorted, capped, and keep a tail', () => {
  const store = fakeStore();
  const stats = new Stats(store);
  const data = stats.data();
  data.byApp = { A: 10, B: 8, C: 6, D: 5, E: 4, F: 3, G: 2, H: 1, I: 1, J: 1 };
  store.save('stats', data);
  const top = stats.breakdown('byApp', 4);
  assert.deepStrictEqual(top.slice(0, 4).map((x) => x.label), ['A', 'B', 'C', 'D']);
  assert.strictEqual(top[4].label, 'Everything else');
  assert.strictEqual(top[4].count, 4 + 3 + 2 + 1 + 1 + 1);
});

test('twelve months come back in order, including the empty ones', () => {
  const store = fakeStore();
  const stats = new Stats(store);
  const months = stats.lastMonths(12);
  assert.strictEqual(months.length, 12);
  assert.ok(months.every((m) => /^\d{4}-\d{2}$/.test(m.month)));
  assert.deepStrictEqual(months.map((m) => m.month), [...months.map((m) => m.month)].sort(), 'oldest first');
  assert.strictEqual(months[11].month, new Date().toISOString().slice(0, 7), 'this month is last');
});

test('feed pulls are counted once per app per day', () => {
  const store = fakeStore();
  const stats = new Stats(store);
  stats.recordFeed('10.0.0.1', 'Overcast/3.0');
  stats.recordFeed('10.0.0.1', 'Overcast/3.0');
  stats.recordFeed('10.0.0.2', 'Apple Podcasts');
  const today = new Date().toISOString().slice(0, 10);
  assert.strictEqual(store.raw.stats.feedByDay[today], 2);
});

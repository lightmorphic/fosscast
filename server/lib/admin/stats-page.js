'use strict';
// The Stats page: what the counting door saw, drawn as charts. The
// figures are counters that cannot be joined back to a person, which
// is why the page can say plainly what it does not know.

const { esc, adminPage, BRAND } = require('../html');
const charts = require('../charts');

module.exports = function create({ stats, shows, episodes }) {
  function statsPage() {
    const episodeList = episodes();
    const show = shows()[0];
    if (!stats) return adminPage({ title: 'Stats', active: 'stats', body: '<h1 class="page-title">Stats</h1><p class="hint">Statistics are not running on this instance.</p>' });

    const days = stats.lastDays(30);
    const days90 = stats.lastDays(90);
    const months = stats.lastMonths(12);
    const feed = stats.feedLastDays(30);
    const data = stats.data();

    // --- the numbers behind the tiles ---
    const allTime = stats.allTime();
    const last30 = days.reduce((a, d) => a + d.count, 0);
    const previous30 = days90.slice(30, 60).reduce((a, d) => a + d.count, 0);
    const change = previous30 ? Math.round(((last30 - previous30) / previous30) * 100) : null;
    const best = days90.reduce((b, d) => (d.count > b.count ? d : b), { day: '', count: 0 });
    const published = episodeList.filter((e) => !e.draft).length;
    const perEpisode = published ? Math.round(allTime / published) : 0;
    const thisMonth = months[months.length - 1] || { count: 0 };
    // Only days this instance can vouch for: before machines were
    // excluded, a crawler counted the same as a subscriber, and
    // averaging those in reports a readership that was never there.
    const trusted = data.machinesFrom
      // Strictly after: the day the filter arrived was already part
      // spent, and its count holds the machines recorded that morning.
      // The first day worth averaging is the one after it.
      ? feed.filter((d) => d.day > data.machinesFrom).slice(-7)
      : [];
    const subscribers = trusted.length
      ? Math.round(trusted.reduce((a, d) => a + d.count, 0) / trusted.length)
      : null;
    const countryCount = Object.keys(data.byCountry).filter((c) => c && data.byCountry[c] > 0).length;

    const monthPoints = months.map((m) => ({
      label: new Date(`${m.month}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }),
      short: new Date(`${m.month}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' }),
      count: m.count,
    }));
    const dayPoints = days.map((d) => ({
      label: new Date(`${d.day}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }),
      count: d.count,
    }));
    const feedPoints = feed.map((d) => ({
      label: new Date(`${d.day}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }),
      count: d.count,
    }));

    // --- the heatmap needs a day x hour grid; the counters hold the two
    // edges of it, so the grid is their product, scaled to the total ---
    const hours = stats.hours();
    const weekdays = stats.weekdays();
    const hourTotal = hours.reduce((a, h) => a + h.count, 0) || 1;
    const matrix = weekdays.map((d) => hours.map((h) => Math.round((d.count * h.count) / hourTotal)));

    const apps = stats.breakdown('byApp');
    const platforms = stats.breakdown('byPlatform', 6);
    const countries = stats.breakdown('byCountry', 8);
    const languages = stats.breakdown('byLanguage', 6);
    const ages = stats.ages();

    const topEpisodes = episodeList
      .map((e) => ({ label: e.title, count: stats.total(e.id), id: e.id, date: e.date }))
      .sort((a, b) => b.count - a.count);

    const rows = topEpisodes.map((e) => {
      const share = allTime ? Math.round((e.count / allTime) * 100) : 0;
      return `<tr>
        <td><a href="/admin/episodes/${esc(e.id)}">${esc(e.label)}</a></td>
        <td>${esc(e.date)}</td>
        <td class="num">${e.count}</td>
        <td class="num">${share}%</td>
      </tr>`;
    }).join('');

    const nothingYet = allTime === 0;

    return adminPage({
      title: 'Stats',
      active: 'stats',
      body: `<h1 class="page-title">Stats</h1>
      <p class="hint">One download per listener per episode per day, no
      cookies, nothing stored about any individual: every number here is
      a counter, and none of them can be joined back to a person.
      ${show ? `Episodes hosted elsewhere are not counted &mdash; only files served by this instance.` : ''}</p>

      ${nothingYet ? `<section class="panel"><p class="hint">Nothing to
      show yet. Numbers appear here as soon as somebody downloads an
      episode; the charts fill in over the following days.</p></section>` : ''}

      ${charts.tiles([
        { value: charts.short(allTime), label: 'Downloads all time' },
        { value: charts.short(last30), label: 'Last 30 days',
          note: change === null ? '' : `${change >= 0 ? '+' : ''}${change}% on the 30 before`,
          tone: change === null ? '' : change >= 0 ? 'up' : 'down' },
        { value: charts.short(thisMonth.count), label: 'This month so far' },
        ...(subscribers === null
          ? [{ value: '\u2013', label: 'Feed pulls a day', note: 'counting from tomorrow' }]
          : [{ value: charts.short(subscribers), label: 'Feed pulls a day', note: 'roughly, subscribers' }]),
        { value: charts.short(perEpisode), label: 'Average per episode' },
        { value: charts.short(best.count), label: 'Best day', note: best.day || '' },
        { value: String(published), label: 'Episodes published' },
        // Country comes from a header a geo-aware proxy sets. Plenty of
        // instances sit behind one that does not, and showing them a
        // hard 0 reads as "nobody, anywhere" rather than "we cannot
        // tell from here".
        ...(countryCount
          ? [{ value: String(countryCount), label: 'Countries' }]
          : [{ value: '\u2013', label: 'Countries', note: 'your proxy does not say' }]),
      ])}

      <section class="panel" id="sec-months">
        <h2>Month by month</h2>
        <p class="hint">The last twelve months. This month is still
        filling up, so it is short until it is over.</p>
        ${charts.barChart(monthPoints, { label: 'Downloads per month over the last twelve months' })}
      </section>

      <div class="cols-2">
        <section class="panel" id="sec-daily">
          <h2>Day by day</h2>
          <p class="hint">The last 30 days.</p>
          ${charts.areaChart(dayPoints, { label: 'Downloads per day over the last 30 days' })}
        </section>
        <section class="panel" id="sec-feed">
          <h2>Feed pulls</h2>
          <p class="hint">How many apps asked for the feed each day. It
          moves with your subscriber count.</p>
          ${charts.areaChart(feedPoints, { label: 'Feed pulls per day' })}
        </section>
      </div>

      <div class="cols-2">
        <section class="panel" id="sec-apps">
          <h2>Where they listen</h2>
          <p class="hint">Read from the app's own name in the request.</p>
          ${apps.length ? charts.donut(apps, { label: 'Downloads by app' }) : '<p class="hint">Nothing yet.</p>'}
        </section>
        <section class="panel" id="sec-countries">
          <h2>Where they are</h2>
          ${countries.length
            ? `<p class="hint">As reported by your proxy.</p>${charts.donut(countries, { label: 'Downloads by country' })}`
            : `<p class="hint">No country information. ${esc(BRAND)} never
               looks an address up itself &mdash; that would mean shipping a
               database or asking somebody else about your listeners. If
               your proxy knows, it can say so: Cloudflare sets
               <code>CF-IPCountry</code> for free, and nginx with the GeoIP
               module usually sets <code>X-Country-Code</code>. Either one
               fills this in.</p>`}
        </section>
      </div>

      <div class="cols-2">
        <section class="panel" id="sec-platforms">
          <h2>What they listen on</h2>
          ${platforms.length ? charts.barsAcross(platforms, { label: 'Downloads by platform', colour: 'var(--c3)' }) : '<p class="hint">Nothing yet.</p>'}
        </section>
        <section class="panel" id="sec-languages">
          <h2>What their device speaks</h2>
          <p class="hint">The language their app asked for.</p>
          ${languages.length ? charts.barsAcross(languages, { label: 'Downloads by language', colour: 'var(--c4)' }) : '<p class="hint">Nothing yet.</p>'}
        </section>
      </div>

      <section class="panel" id="sec-when">
        <h2>When they listen</h2>
        <p class="hint">Day of the week against hour of the day, in UTC.
        Darker is busier &mdash; useful for deciding when to publish.</p>
        ${charts.heatmap(matrix)}
      </section>

      <div class="cols-2">
        <section class="panel" id="sec-weekdays">
          <h2>Busiest days</h2>
          ${charts.barsAcross(weekdays.slice().sort((a, b) => b.count - a.count), { label: 'Downloads by day of the week', colour: 'var(--c5)' })}
        </section>
        <section class="panel" id="sec-age">
          <h2>How long an episode keeps earning</h2>
          <p class="hint">How old an episode was when it was downloaded.
          A long tail means your back catalogue is still working.</p>
          ${charts.barsAcross(ages, { label: 'Downloads by age of episode at the time', colour: 'var(--c6)' })}
        </section>
      </div>

      <section class="panel" id="sec-episodes">
        <h2>Every episode</h2>
        ${topEpisodes.length ? `<div class="table-scroll"><table>
          <thead><tr><th>Episode</th><th>Published</th><th class="num">Downloads</th><th class="num">Share</th></tr></thead>
          <tbody>${rows}</tbody>
        </table></div>` : '<p class="hint">No episodes yet.</p>'}
      </section>

      <section class="panel" id="sec-about-stats">
        <h2>What is and is not counted</h2>
        <ul class="ticks">
          <li>A download is one listener, one episode, one day &mdash; the same file fetched five times counts once</li>
          <li>Listeners are told apart by a salted hash of address and app that is never written down and changes every restart</li>
          <li>Day, month, app, platform, language and country are counters, not records: there is no row for anybody</li>
          <li>Daily figures are kept for 90 days, monthly ones for two years, and the rest are running totals</li>
          <li>Episodes whose media lives elsewhere cannot be counted here &mdash; their host counts them instead</li>
        </ul>
      </section>`,
    });
  }

  return { statsPage };
};

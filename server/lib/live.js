'use strict';
// Live status: polls the MediaMTX control API (reachable only inside
// the compose network) and keeps a map of which stream keys are on
// air. Degrades to "everything offline" when MediaMTX is unreachable,
// so development without a media server just works.

const POLL_MS = 5000;

class LiveStatus {
  constructor({ apiBase = process.env.MEDIAMTX_API || 'http://mediamtx:9997', onChange } = {}) {
    this.apiBase = apiBase;
    this.onChange = onChange || (() => {});
    this.liveKeys = new Map(); // stream key -> { since }
    this.timer = setInterval(() => this.poll().catch(() => {}), POLL_MS);
    this.timer.unref();
  }

  async poll() {
    let ready = [];
    try {
      const res = await fetch(`${this.apiBase}/v3/paths/list?itemsPerPage=500`, {
        signal: AbortSignal.timeout(3000),
      });
      if (!res.ok) throw new Error(String(res.status));
      const body = await res.json();
      ready = (body.items || [])
        .filter((item) => item.ready && String(item.name).startsWith('live/'))
        .map((item) => ({ key: item.name.slice('live/'.length), since: item.readyTime }));
    } catch {
      ready = [];
    }
    const next = new Map(ready.map((r) => [r.key, { since: r.since }]));
    for (const key of next.keys()) {
      if (!this.liveKeys.has(key)) this.onChange(key, true);
    }
    for (const key of this.liveKeys.keys()) {
      if (!next.has(key)) this.onChange(key, false);
    }
    this.liveKeys = next;
  }

  isLive(streamKey) {
    return this.liveKeys.has(streamKey);
  }

  since(streamKey) {
    return this.liveKeys.get(streamKey)?.since || null;
  }
}

module.exports = { LiveStatus };

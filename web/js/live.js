'use strict';
// Live page client: HLS playback plus the chat room. Plain JS.

(function () {
  const root = document.getElementById('live-root') || document.body;
  const slug = root.dataset.slug;
  let live = root.dataset.live === '1';

  const player = document.getElementById('player');
  const offline = document.getElementById('offline');
  const badge = document.getElementById('live-badge');
  const label = document.getElementById('live-label');
  const viewers = document.getElementById('viewers');
  const log = document.getElementById('chat-log');
  const nickForm = document.getElementById('nick-form');
  const nickInput = document.getElementById('nick');
  const msgForm = document.getElementById('msg-form');
  const msgInput = document.getElementById('msg');

  let hls = null;

  function startPlayer() {
    if (!player) return;
    const src = '/hls/' + slug + '/index.m3u8';
    player.hidden = false;
    if (offline) offline.hidden = true;
    if (player.canPlayType('application/vnd.apple.mpegurl')) {
      player.src = src;
      player.play().catch(() => {});
    } else if (window.Hls && window.Hls.isSupported()) {
      if (hls) hls.destroy();
      hls = new window.Hls({ lowLatencyMode: true });
      hls.loadSource(src);
      hls.attachMedia(player);
      player.play().catch(() => {});
    }
  }

  function stopPlayer() {
    if (!player) return;
    if (hls) { hls.destroy(); hls = null; }
    player.removeAttribute('src');
    player.hidden = true;
    if (offline) offline.hidden = false;
  }

  function setLive(next) {
    live = next;
    if (badge) badge.classList.toggle('on', live);
    if (label) label.textContent = live ? 'LIVE' : 'OFFLINE';
    if (live) startPlayer(); else stopPlayer();
  }

  function addMessage(m) {
    const item = document.createElement('div');
    item.className = 'chat-msg';
    item.dataset.sender = m.name;
    const who = document.createElement('span');
    who.className = 'chat-name';
    who.textContent = m.name;
    const what = document.createElement('span');
    what.className = 'chat-text';
    what.textContent = m.text;
    item.append(who, what);
    log.appendChild(item);
    while (log.children.length > 200) log.removeChild(log.firstChild);
    log.scrollTop = log.scrollHeight;
  }

  function connect() {
    const source = new EventSource('/api/v1/shows/' + slug + '/chat/stream');
    source.onmessage = (event) => {
      let m;
      try { m = JSON.parse(event.data); } catch { return; }
      if (m.type === 'message') addMessage(m);
      else if (m.type === 'count' && viewers) {
        viewers.textContent = m.n + (m.n === 1 ? ' viewer' : ' viewers');
      } else if (m.type === 'status') setLive(!!m.live);
      else if (m.type === 'purge') {
        for (const el of [...log.querySelectorAll('.chat-msg')]) {
          if (el.dataset.sender === m.name) el.remove();
        }
      }
    };
  }

  const savedNick = localStorage.getItem('fosscast-nick') || '';
  function showMsgForm() {
    nickForm.hidden = true;
    msgForm.hidden = false;
    msgInput.focus();
  }
  if (savedNick) { nickInput.value = savedNick; showMsgForm(); }

  nickForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const nick = nickInput.value.trim();
    if (!nick) return;
    localStorage.setItem('fosscast-nick', nick);
    showMsgForm();
  });

  msgForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = msgInput.value.trim();
    if (!text) return;
    msgInput.value = '';
    const res = await fetch('/api/v1/shows/' + slug + '/chat/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: localStorage.getItem('fosscast-nick') || 'anon', text }),
    }).catch(() => null);
    if (res && res.status === 429) {
      msgInput.placeholder = 'Easy: one message every couple of seconds';
      setTimeout(() => { msgInput.placeholder = 'Say something'; }, 2000);
    }
    if (res && res.status === 403) {
      msgForm.hidden = true;
    }
  });

  if (live) startPlayer();
  connect();
})();

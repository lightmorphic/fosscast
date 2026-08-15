'use strict';
// Live chat: one room per show, Server-Sent Events out, plain POST in.
// Nickname-only, no accounts. Moderation: per-IP bans and a banned-word
// list whose matches are star-masked (first and last letter kept)
// rather than dropped. IPs never reach clients.

const crypto = require('crypto');

// Default filtered words; instance operators edit the list in the
// dashboard (Chat page). Matches are masked, not dropped.
const DEFAULT_WORDS = [
  'fuck', 'fucking', 'fucker', 'motherfucker', 'shit', 'bullshit',
  'cunt', 'bitch', 'bitches', 'asshole', 'arsehole', 'bastard',
  'dick', 'dickhead', 'prick', 'twat', 'wanker', 'cock', 'pussy',
  'slut', 'whore', 'piss', 'nigger', 'nigga', 'faggot', 'fag',
  'retard', 'retarded',
];

const HISTORY = 200; // messages kept per room, in memory
const PUBLIC_HISTORY = 50; // messages replayed to a newly joined viewer
const POST_INTERVAL_MS = 2000; // one message per IP per this window
const MAX_NAME = 24;
const MAX_TEXT = 500;

// Mask every banned word: keep the first and last letter, star the
// middle ("word" becomes "w**d"). Two-letter words become stars.
function maskWord(word) {
  if (word.length <= 2) return '*'.repeat(word.length);
  return word[0] + '*'.repeat(word.length - 2) + word[word.length - 1];
}

function applyFilter(text, bannedWords) {
  let out = text;
  for (const word of bannedWords) {
    if (!word) continue;
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp(`\\b${escaped}\\b`, 'gi'), (m) => maskWord(m));
  }
  return out;
}

class ChatHub {
  constructor(store, { postIntervalMs = POST_INTERVAL_MS } = {}) {
    this.store = store;
    this.postIntervalMs = postIntervalMs;
    this.rooms = new Map(); // showId -> { clients:Set<res>, messages:[] }
    this.lastPost = new Map(); // ip -> timestamp
    this.heartbeat = setInterval(() => this.ping(), 25000);
    this.heartbeat.unref();
  }

  room(showId) {
    let room = this.rooms.get(showId);
    if (!room) {
      room = { clients: new Set(), messages: [] };
      this.rooms.set(showId, room);
    }
    return room;
  }

  bannedIps() { return this.store.load('banned-ips', []); }
  bannedWords() { return this.store.load('banned-words', DEFAULT_WORDS); }
  isBanned(ip) { return this.bannedIps().some((b) => b.ip === ip); }

  banIp(ip, note) {
    if (!ip || this.isBanned(ip)) return;
    const list = this.bannedIps();
    list.push({ ip, note: note || '', at: new Date().toISOString() });
    this.store.save('banned-ips', list);
  }

  unbanIp(ip) {
    this.store.save('banned-ips', this.bannedIps().filter((b) => b.ip !== ip));
  }

  saveBannedWords(words) {
    const clean = [...new Set(words.map((w) => String(w).trim().toLowerCase()).filter(Boolean))];
    this.store.save('banned-words', clean);
  }

  // A viewer joins: attach as an SSE client, replay recent history.
  join(showId, res) {
    const room = this.room(showId);
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-store',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write('retry: 3000\n\n');
    for (const message of room.messages.slice(-PUBLIC_HISTORY)) {
      res.write(`data: ${JSON.stringify(this.publicView(message))}\n\n`);
    }
    room.clients.add(res);
    this.broadcastCount(showId);
    res.on('close', () => {
      room.clients.delete(res);
      this.broadcastCount(showId);
    });
  }

  publicView(message) {
    return { type: 'message', id: message.id, name: message.name, text: message.text, at: message.at };
  }

  post(showId, { name, text, ip }) {
    if (this.isBanned(ip)) return { error: 'banned', status: 403 };
    const last = this.lastPost.get(ip) || 0;
    const now = Date.now();
    if (now - last < this.postIntervalMs) return { error: 'too fast', status: 429 };
    const cleanName = String(name || '').trim().slice(0, MAX_NAME);
    const cleanText = String(text || '').trim().slice(0, MAX_TEXT);
    if (!cleanName || !cleanText) return { error: 'name and text required', status: 400 };
    this.lastPost.set(ip, now);
    const message = {
      id: crypto.randomUUID(),
      name: cleanName,
      text: applyFilter(cleanText, this.bannedWords()),
      at: new Date().toISOString(),
      ip,
    };
    const room = this.room(showId);
    room.messages.push(message);
    if (room.messages.length > HISTORY) room.messages.shift();
    this.broadcast(showId, this.publicView(message));
    return { ok: true, id: message.id };
  }

  // Ban the sender of a message and scrub their messages from history.
  banBySender(showId, messageId, note) {
    const room = this.room(showId);
    const message = room.messages.find((m) => m.id === messageId);
    if (!message) return false;
    this.banIp(message.ip, note);
    room.messages = room.messages.filter((m) => m.ip !== message.ip);
    this.broadcast(showId, { type: 'purge', name: message.name });
    return true;
  }

  broadcast(showId, payload) {
    const data = `data: ${JSON.stringify(payload)}\n\n`;
    for (const client of this.room(showId).clients) client.write(data);
  }

  broadcastCount(showId) {
    this.broadcast(showId, { type: 'count', n: this.room(showId).clients.size });
  }

  recent(showId, limit = PUBLIC_HISTORY) {
    return this.room(showId).messages.slice(-limit).map((m) => this.publicView(m));
  }

  ping() {
    for (const room of this.rooms.values()) {
      for (const client of room.clients) client.write(': ping\n\n');
    }
  }
}

module.exports = { ChatHub, applyFilter, maskWord };

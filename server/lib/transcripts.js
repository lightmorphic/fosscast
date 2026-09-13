'use strict';
// Transcripts: one stored file, two ways of looking at it.
//
// An episode's transcript has always been a file in the media directory
// that the public page links to and the feed advertises with
// <podcast:transcript>. That does not change. What changes is that the
// dashboard can now edit it as text, because the thing a person wants
// to fix in a transcript is a misheard word, and downloading a .vtt,
// opening it in something, and uploading it again is not a way to fix a
// misheard word.
//
// The editable form is one cue per line with its start time in front:
//
//   [0:00] This is where the episode begins.
//   [0:13] And this is the next thing said.
//
// That is deliberately the simplest thing a person can edit without
// breaking it. The brackets are the timing; everything after them is
// words. Lines with no timestamp at all are still a transcript, just
// one without timings, and are stored as plain text instead - both are
// formats podcast apps accept.
//
// There is exactly one copy. The file on disk is the truth; the
// textarea is a rendering of it, parsed back on save. Nothing is
// duplicated into the episode record, so nothing can disagree.

const fs = require('fs');
const path = require('path');

// Where a finished transcript can be fetched from and edited in a
// browser tab. Unset - which is every instance until somebody sets it -
// there is no such tool and the dashboard says nothing about one.
//
// The contract is small on purpose, so that any tool can satisfy it:
// the page is opened in a frame with `episode`, `audio` and `title` in
// its query string, and when it has finished it posts
// {type:'transcript', episode, text} back to its opener. Nothing is
// uploaded here and nothing is fetched from there; the frame does the
// work in the same browser the dashboard is open in.
function transcriber() {
  const raw = (process.env.TRANSCRIBE_URL || '').trim();
  if (!raw) return null;
  let url;
  try { url = new URL(raw); } catch { return null; }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  return { url: url.toString(), origin: url.origin };
}

function clock(seconds) {
  // Floor, not round: a cue starting at 65.5s belongs at 1:05. Rounding
  // it up would move the label past the first word it labels.
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = String(Math.floor((s % 3600) / 60)).padStart(h ? 2 : 1, '0');
  return `${h ? `${h}:` : ''}${m}:${String(s % 60).padStart(2, '0')}`;
}

function vttClock(seconds) {
  const whole = Math.floor(seconds);
  const ms = Math.round((seconds - whole) * 1000);
  return `${String(Math.floor(whole / 3600)).padStart(2, '0')}:${
    String(Math.floor((whole % 3600) / 60)).padStart(2, '0')}:${
    String(whole % 60).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
}

const CUE = /^\s*(?:(\d+):)?(\d{1,2}):(\d{2})(?:[.,](\d{1,3}))?\s*-->\s*(?:(\d+):)?(\d{1,2}):(\d{2})(?:[.,](\d{1,3}))?/;

// WebVTT and SubRip differ in ways that do not matter here - a comma
// instead of a full stop, a number on its own above each cue - so one
// reader handles both rather than two readers handling one each.
function parseCues(text) {
  const cues = [];
  const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n');
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(CUE);
    if (!m) continue;
    const at = Number(m[1] || 0) * 3600 + Number(m[2]) * 60 + Number(m[3])
      + Number(`0.${m[4] || 0}`);
    const words = [];
    for (i += 1; i < lines.length && lines[i].trim() !== ''; i++) words.push(lines[i].trim());
    const said = words.join(' ').trim();
    if (said) cues.push({ at, text: said });
  }
  return cues;
}

// The editable text, from whatever is on disk.
function toLines(stored) {
  const cues = parseCues(stored);
  if (cues.length) return cues.map((c) => `[${clock(c.at)}] ${c.text}`).join('\n');
  // Not a cue file: plain text, kept as it was written.
  return String(stored || '')
    .replace(/^WEBVTT.*\n+/i, '')
    .replace(/\r\n?/g, '\n')
    .trim();
}

// ...and back again. A line with no timestamp belongs to the line above
// it, which is what happens when somebody splits a long sentence while
// editing and is the only sane reading of it.
function fromLines(value) {
  const cues = [];
  const loose = [];
  for (const raw of String(value || '').replace(/\r\n?/g, '\n').split('\n')) {
    const m = raw.match(/^\s*\[(?:(\d+):)?(\d{1,2}):(\d{2})\]\s*(.*)$/);
    if (m) {
      cues.push({
        at: Number(m[1] || 0) * 3600 + Number(m[2]) * 60 + Number(m[3]),
        text: m[4].trim(),
      });
    } else if (raw.trim()) {
      if (cues.length) cues[cues.length - 1].text += ` ${raw.trim()}`;
      else loose.push(raw.trim());
    }
  }
  return { cues: cues.filter((c) => c.text), loose };
}

function toVtt(cues, title) {
  const out = ['WEBVTT', ''];
  if (title) out.push(`NOTE ${String(title).replace(/\n/g, ' ')}`, '');
  cues.forEach((cue, i) => {
    // A cue runs until the next one starts; the last one gets a length
    // guessed from how much there is to read, which is what every
    // captioning tool does and is close enough for a podcast app.
    const next = cues[i + 1] ? cues[i + 1].at : cue.at + Math.max(2, cue.text.length / 14);
    out.push(`${vttClock(cue.at)} --> ${vttClock(Math.max(next, cue.at + 0.5))}`, cue.text, '');
  });
  return out.join('\n');
}

// What the editable text should be stored as. Timestamps mean WebVTT;
// no timestamps anywhere means it is prose, and prose is a .txt - both
// are types podcast apps understand, and inventing timings we do not
// have would be a lie in a machine-readable format.
function render(value, title) {
  const { cues, loose } = fromLines(value);
  if (cues.length) return { ext: '.vtt', body: toVtt(cues, title) };
  const body = loose.join('\n').trim();
  return body ? { ext: '.txt', body: `${body}\n` } : null;
}

const SAFE_MEDIA = /^\/media\/([a-zA-Z0-9._-]+)\/([a-zA-Z0-9._-]+)$/;

// Only ever a file this instance holds, and only ever one whose name
// could have come from our own uploader.
function localFile(mediaDir, urlPath) {
  const m = SAFE_MEDIA.exec(String(urlPath || ''));
  if (!m || m[1] === '..' || m[2] === '..') return null;
  return path.join(mediaDir, m[1], m[2]);
}

function read(mediaDir, urlPath) {
  const file = localFile(mediaDir, urlPath);
  if (!file) return null;
  try { return fs.readFileSync(file, 'utf8'); } catch { return null; }
}

// Write the transcript beside the episode's other media, under a name
// derived from the episode rather than from anything a caller sends.
// Returns the new /media path, or null when there was nothing to write.
function write(mediaDir, slug, base, value, title) {
  const rendered = render(value, title);
  const safeSlug = String(slug).replace(/[^a-zA-Z0-9._-]/g, '') || 'show';
  const safeBase = `${String(base).replace(/[^a-zA-Z0-9._-]/g, '').slice(0, 100) || 'episode'}-transcript`;
  const dir = path.join(mediaDir, safeSlug);
  if (!rendered) {
    // Emptying the box removes the transcript. Only ever our own file:
    // an uploaded one is the podcaster's, and is left where it is.
    for (const ext of ['.vtt', '.txt']) {
      try { fs.rmSync(path.join(dir, safeBase + ext)); } catch { /* was not there */ }
    }
    return null;
  }
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, safeBase + rendered.ext), rendered.body);
  // Prose replacing cues, or the other way round, changes the extension.
  // The one that is no longer the transcript goes.
  const gone = rendered.ext === '.vtt' ? '.txt' : '.vtt';
  try { fs.rmSync(path.join(dir, safeBase + gone)); } catch { /* was not there */ }
  return `/media/${safeSlug}/${safeBase}${rendered.ext}`;
}

module.exports = {
  transcriber, parseCues, toLines, fromLines, toVtt, render, read, write, localFile, clock,
};

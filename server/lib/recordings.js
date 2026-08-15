'use strict';
// Live DVR: MediaMTX records every live stream as fMP4 segments under
// DATA_DIR/recordings/live/<streamKey>/. Segments recorded close
// together form one session. Publishing a session concatenates the
// segments (stream copy, no re-encode) into the show's media folder.
// Unpublished sessions: reminder email on day 5, deleted on day 7.

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { sendMail } = require('./mailer');

const SESSION_GAP_MS = 5 * 60 * 1000;
const REMIND_AFTER_MS = 5 * 24 * 3600 * 1000;
const DELETE_AFTER_MS = 7 * 24 * 3600 * 1000;

class Recordings {
  constructor({ dataDir, store }) {
    this.dir = path.join(dataDir, 'recordings');
    this.store = store;
    this.sweepTimer = setInterval(() => this.sweep().catch(() => {}), 6 * 3600 * 1000);
    this.sweepTimer.unref();
  }

  // Sessions for one show: [{ id, start, end, files:[{path,size}], bytes }]
  sessions(streamKey) {
    const dir = path.join(this.dir, 'live', streamKey);
    let names;
    try { names = fs.readdirSync(dir).filter((n) => n.endsWith('.mp4')).sort(); }
    catch { return []; }
    const files = names.map((name) => {
      const full = path.join(dir, name);
      const stat = fs.statSync(full);
      return { path: full, name, size: stat.size, mtime: stat.mtimeMs };
    });
    const sessions = [];
    for (const file of files) {
      const current = sessions[sessions.length - 1];
      if (current && file.mtime - current.end < SESSION_GAP_MS + 3600 * 1000) {
        current.files.push(file);
        current.end = file.mtime;
        current.bytes += file.size;
      } else {
        sessions.push({
          id: path.basename(file.name, '.mp4'),
          start: file.mtime - 0,
          end: file.mtime,
          files: [file],
          bytes: file.size,
        });
      }
    }
    return sessions.reverse();
  }

  // Concatenate a session into the media dir; returns the file name.
  publish(streamKey, sessionId, mediaDir, showSlug) {
    const session = this.sessions(streamKey).find((s) => s.id === sessionId);
    if (!session) return Promise.resolve(null);
    const outDir = path.join(mediaDir, showSlug);
    fs.mkdirSync(outDir, { recursive: true });
    const outName = `live-${sessionId.replace(/[^0-9A-Za-z_-]/g, '')}.mp4`;
    const outFile = path.join(outDir, outName);
    const list = session.files.map((f) => `file '${f.path.replace(/'/g, "'\\''")}'`).join('\n');
    const listFile = path.join(this.dir, `concat-${Date.now()}.txt`);
    fs.writeFileSync(listFile, list);
    return new Promise((resolve) => {
      const p = spawn('ffmpeg', [
        '-y', '-f', 'concat', '-safe', '0', '-i', listFile,
        '-c', 'copy', '-movflags', '+faststart', outFile,
      ]);
      p.on('error', () => { fs.rmSync(listFile, { force: true }); resolve(null); });
      p.on('close', (code) => {
        fs.rmSync(listFile, { force: true });
        if (code !== 0) { fs.rmSync(outFile, { force: true }); return resolve(null); }
        for (const f of session.files) fs.rmSync(f.path, { force: true });
        resolve(outName);
      });
    });
  }

  discard(streamKey, sessionId) {
    const session = this.sessions(streamKey).find((s) => s.id === sessionId);
    if (!session) return false;
    for (const f of session.files) fs.rmSync(f.path, { force: true });
    return true;
  }

  // Daily-ish: remind at day 5, delete at day 7. adminEmails/showFor are
  // provided by the server so this module stays storage-only.
  async sweep({ adminEmails = [], showForKey = () => null, domain = 'localhost' } = {}) {
    let keys;
    try { keys = fs.readdirSync(path.join(this.dir, 'live')); } catch { return; }
    const reminded = this.store.load('recording-reminders', []);
    const now = Date.now();
    for (const key of keys) {
      for (const session of this.sessions(key)) {
        const age = now - session.end;
        if (age > DELETE_AFTER_MS) {
          for (const f of session.files) fs.rmSync(f.path, { force: true });
        } else if (age > REMIND_AFTER_MS && !reminded.includes(session.id) && adminEmails.length) {
          const show = showForKey(key);
          await sendMail({
            to: adminEmails,
            subject: `FOSSCast: live recording deleted in 2 days`,
            text: `A live recording${show ? ` of "${show.name}"` : ''} from ${new Date(session.end).toUTCString()} has not been published as an episode.\n\nIt will be deleted automatically in about 2 days.\n\nPublish or download it from the dashboard: https://${domain}/admin/recordings\n`,
          });
          reminded.push(session.id);
          this.store.save('recording-reminders', reminded);
        }
      }
    }
  }
}

module.exports = { Recordings, SESSION_GAP_MS };

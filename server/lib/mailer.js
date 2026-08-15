'use strict';
// Minimal SMTP client (STARTTLS or implicit TLS, AUTH PLAIN). Enough to
// send the instance's few operational emails without any dependency.
// Fails quietly when SMTP is not configured.

const net = require('net');
const tls = require('tls');

function configured() {
  return !!(process.env.SMTP_HOST && process.env.SMTP_FROM);
}

function sendMail({ to, subject, text }) {
  if (!configured()) return Promise.resolve(false);
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER || '';
  const pass = process.env.SMTP_PASS || '';
  const from = process.env.SMTP_FROM;
  const recipients = Array.isArray(to) ? to : [to];

  return new Promise((resolve) => {
    let socket = port === 465
      ? tls.connect(port, host, { servername: host })
      : net.connect(port, host);
    let buffer = '';
    let step = 0;
    let upgraded = port === 465;
    let rcptLeft = recipients.length;
    const fail = () => { try { socket.destroy(); } catch {} resolve(false); };
    const timer = setTimeout(fail, 20000);

    const write = (line) => socket.write(line + '\r\n');
    const steps = () => {
      // step machine driven by server replies
      if (step === 0) { write(`EHLO fosscast`); step = 1; return; }
      if (step === 1) {
        if (!upgraded) { write('STARTTLS'); step = 2; return; }
        step = 3; steps(); return;
      }
      if (step === 2) {
        socket.removeAllListeners('data');
        socket = tls.connect({ socket, servername: host }, () => {
          attach();
          upgraded = true;
          write('EHLO fosscast');
          step = 3;
        });
        return;
      }
      if (step === 3) {
        if (user) {
          const token = Buffer.from(`\0${user}\0${pass}`).toString('base64');
          write(`AUTH PLAIN ${token}`); step = 4; return;
        }
        step = 4; steps(); return;
      }
      if (step === 4) { write(`MAIL FROM:<${from}>`); step = 5; return; }
      if (step === 5) {
        write(`RCPT TO:<${recipients[recipients.length - rcptLeft]}>`);
        rcptLeft -= 1;
        if (rcptLeft > 0) return; // stay on step 5 for the next reply
        step = 6; return;
      }
      if (step === 6) { write('DATA'); step = 7; return; }
      if (step === 7) {
        const body = [
          `From: FOSSCast <${from}>`,
          `To: ${recipients.join(', ')}`,
          `Subject: ${subject}`,
          'MIME-Version: 1.0',
          'Content-Type: text/plain; charset=utf-8',
          '',
          text.replace(/^\./gm, '..'),
          '.',
        ].join('\r\n');
        socket.write(body + '\r\n');
        step = 8; return;
      }
      if (step === 8) { write('QUIT'); clearTimeout(timer); resolve(true); return; }
    };

    function onData(chunk) {
      buffer += chunk.toString();
      // process complete reply lines; act on final line of each reply
      if (!/\r\n$/.test(buffer)) return;
      const lines = buffer.trim().split('\r\n');
      buffer = '';
      const last = lines[lines.length - 1];
      const code = Number(last.slice(0, 3));
      if (code >= 400) return fail();
      steps();
    }
    function attach() {
      socket.on('data', onData);
      socket.on('error', fail);
    }
    attach();
    if (port === 465) socket.on('secureConnect', () => {});
  });
}

module.exports = { sendMail, configured };

'use strict';
// The first run, as three screens rather than three lines in a compose
// file: prove you can read this machine's log, choose a password FOSSCast
// will actually argue with you about, and then - in the same minute,
// while you are still here - add a passkey and a second factor.
//
// Charlie: "When you log in for the first time you create the password,
// and also give them the chance to do 2FA. People use weak passwords and
// then blame the product for being hackable."
//
// The first two steps need no JavaScript at all. Only the passkey does,
// because a passkey is a browser API and there is no other way to reach
// one.

const { esc, adminPage } = require('../html');
const setup = require('../setup');
const totp = require('../totp');

// The passkey dance, written out on the page that needs it. It is small
// enough to read: ask this server for a challenge, hand it to the
// browser, send back what the browser signs.
const PASSKEY_SCRIPT = `
function b64urlToBytes(value) {
  var raw = atob(value.replace(/-/g, '+').replace(/_/g, '/'));
  var out = new Uint8Array(raw.length);
  for (var i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}
function bytesToB64url(buffer) {
  var bytes = new Uint8Array(buffer);
  var raw = '';
  for (var i = 0; i < bytes.length; i++) raw += String.fromCharCode(bytes[i]);
  return btoa(raw).replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=+$/, '');
}
async function addPasskey(label, say) {
  if (!window.PublicKeyCredential) {
    say('This browser has no passkeys. Your password still works.');
    return false;
  }
  var start = await fetch('/admin/passkeys/challenge', { method: 'POST' });
  var options = await start.json();
  if (!start.ok) { say(options.error || 'Could not start.'); return false; }
  var made;
  try {
    made = await navigator.credentials.create({ publicKey: {
      challenge: b64urlToBytes(options.challenge),
      rp: { id: options.domain, name: options.brand },
      user: {
        id: b64urlToBytes(options.userHandle),
        name: options.email,
        displayName: options.email
      },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      authenticatorSelection: { residentKey: 'preferred', userVerification: 'preferred' },
      timeout: 90000,
      attestation: 'none'
    }});
  } catch (err) {
    say(err && err.name === 'NotAllowedError'
      ? 'Nothing was confirmed, so no passkey was made.'
      : 'This browser would not make a passkey here. Passkeys need HTTPS.');
    return false;
  }
  var res = await fetch('/admin/passkeys/add', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      label: label,
      response: {
        clientDataJSON: bytesToB64url(made.response.clientDataJSON),
        attestationObject: bytesToB64url(made.response.attestationObject)
      }
    })
  });
  var answer = await res.json();
  if (!res.ok) { say(answer.error || 'That passkey was not accepted.'); return false; }
  say('');
  return true;
}
`;

module.exports = function create({ brandName }) {
  // Step one and two on one screen: the code, then the account. Putting
  // the code on a screen of its own would make somebody read the log,
  // come back, and then be asked for everything else anyway.
  function claimPage({ error = '', email = '', suggestion = '' } = {}) {
    const passphrase = suggestion || setup.suggest();
    return adminPage({
      title: 'Set up',
      authed: false,
      body: `<section class="panel narrow">
        <h1 class="page-title">Set up ${esc(brandName)}</h1>
        <p class="lede">Nobody owns this yet. Two things and it is yours.</p>

        ${error ? `<p class="form-error">${esc(error)}</p>` : ''}

        <form method="post" action="/admin/setup">
          <h2>The code from the log</h2>
          <p class="hint">FOSSCast printed a six-digit code when it
          started, and that is the only place it exists. On the machine
          this runs on:</p>
          <p class="hint"><code>docker compose logs app</code></p>
          <p class="hint">Look for the lines saying nobody owns this yet.
          Only somebody who can reach the machine can read them, which is
          what stops a stranger claiming your instance before you do.</p>
          <label for="code">Setup code</label>
          <input id="code" name="code" inputmode="numeric" autocomplete="off"
            spellcheck="false" placeholder="000-000" required maxlength="7">

          <h2>Your login</h2>
          <label for="email">Email</label>
          <input id="email" name="email" type="email" autocomplete="username"
            value="${esc(email)}" required maxlength="200">
          <p class="hint">Only ever used to log in. This instance sends no
          email at all, to you or to anybody else.</p>

          <label for="password">Password (${setup.MINIMUM} characters or more)</label>
          <input id="password" name="password" type="password"
            autocomplete="new-password" required>
          <label for="again">Password again</label>
          <input id="again" name="again" type="password" autocomplete="new-password" required>
          <p class="hint">Length is what makes a password hard to guess, so
          four or five unrelated words beat anything short and clever.
          Nothing here is on any list of passwords people try first, and
          FOSSCast will say so if what you pick is.
          <a class="hint-link" href="/help#login">More about getting in</a></p>
          <p class="hint">Stuck for one? <code class="pick-me">${esc(passphrase)}</code>
          is six words picked at random just now, and it is a good one.</p>

          <button class="btn-primary" type="submit">Claim this instance</button>
        </form>
      </section>`,
    });
  }

  // Step three, once the account exists and they are signed in. Both
  // panels are optional and say so; the button at the foot goes to the
  // dashboard whether or not anything was added.
  function protectPage(user, { message = '', error = '' } = {}) {
    const secret = user.totpSecret || '';
    return adminPage({
      title: 'Make it hard to lose',
      body: `<section class="panel narrow">
        <h1 class="page-title">Make it hard to lose</h1>
        <p class="lede">The account is made and you are signed in. Two
        things worth doing now rather than later, because later is when
        people stop.</p>
        ${message ? `<p class="form-ok">${esc(message)}</p>` : ''}
        ${error ? `<p class="form-error">${esc(error)}</p>` : ''}
      </section>

      <section class="panel narrow">
        <h2>A passkey</h2>
        <p class="hint">Your phone or laptop keeps the key and this server
        keeps only the public half, so there is no password to type and
        nothing here worth stealing. It needs HTTPS, and it only works on
        the address you make it on - which is why the password stays as
        the way back in.
        <a class="hint-link" href="/help#passkeys">What a passkey is</a></p>
        <p class="hint" id="passkey-state" aria-live="polite"></p>
        <button class="btn-secondary" type="button" id="add-passkey">Add a passkey</button>
      </section>

      <section class="panel narrow">
        <h2>A code from an app</h2>
        <p class="hint">The ordinary six-digit kind, from any
        authenticator app. Type this secret into the app, then type back
        what it shows.</p>
        <p class="hint">There is no QR code here on purpose: a picture
        that might not scan leaves you staring at a camera with no idea
        whose fault it is. The letters below are the same thing.</p>
        <label for="totp-secret">Secret</label>
        <div class="key-field">
          <input id="totp-secret" type="text" value="${esc(totp.readable(secret))}" readonly spellcheck="false">
        </div>
        <p class="hint">An app that takes a link instead:
        <code>${esc(totp.otpauth(secret, user.email, brandName))}</code></p>
        <form method="post" action="/admin/setup/twofactor">
          <label for="totp-code">The six digits it shows now</label>
          <input id="totp-code" name="code" inputmode="numeric" autocomplete="one-time-code"
            maxlength="6" spellcheck="false" required>
          <button class="btn-secondary" type="submit">Turn it on</button>
        </form>
      </section>

      <section class="panel narrow">
        <form method="post" action="/admin/setup/done">
          <button class="btn-primary" type="submit">Done - take me in</button>
        </form>
        <p class="hint">Either of these can be added later from the
        Account page. Neither can be added by anybody but you.</p>
      </section>

      <script>${PASSKEY_SCRIPT}
      (function () {
        var button = document.getElementById('add-passkey');
        var state = document.getElementById('passkey-state');
        button.addEventListener('click', async function () {
          button.disabled = true;
          state.textContent = 'Waiting for your device...';
          var ok = await addPasskey('This device', function (m) { state.textContent = m; });
          if (ok) {
            state.textContent = 'Added. You can sign in with it from now on.';
            button.textContent = 'Add another';
          }
          button.disabled = false;
        });
      })();
      </script>`,
    });
  }

  return { claimPage, protectPage, PASSKEY_SCRIPT };
};

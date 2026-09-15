'use strict';
// The Backup page: take the whole instance away as one file, or put one
// back. It is the same file either way, so a backup and a move to
// another server are the same job done twice.

const { adminPage } = require('../html');

module.exports = function create() {
  function backupPage() {
    return adminPage({
      title: 'Backup',
      active: 'backup',
      body: `
<h1 class="page-title">Backup</h1>

<section class="panel">
  <h2>Take a copy</h2>
  <p class="hint">One file with everything in it: the podcast, its hosts
  and episodes, the settings, the download counts, and every picture and
  audio file uploaded to this server. It is an ordinary
  <code>.tar.gz</code>, so you can look inside it with the tools you
  already have.</p>
  <p class="hint">It also carries your login - the password, the second
  factor and any passkeys - because that is what makes it a move to
  another server rather than a copy of the words. Keep it where you
  would keep a password.</p>
  <p><a class="btn-primary" href="/admin/api/export">Download a copy</a></p>
</section>

<section class="panel">
  <h2>Put one back</h2>
  <p class="hint">This <b>replaces everything</b> on this server with
  what is in the file: the podcast, the episodes, the uploads and the
  login. Half of one instance and half of another would be a podcast
  whose episodes point at files that are not there, so nothing is
  merged.</p>
  <p class="hint">Restoring a copy of this instance, or moving one here
  from another server, are the same thing.</p>
  <label class="field">
    <span>The file</span>
    <input id="restore-file" type="file" accept=".gz,application/gzip">
  </label>
  <p><button class="btn-secondary" id="restore-go" type="button">Replace everything with this file</button></p>
  <p class="hint" id="restore-status" role="status"></p>
</section>

<script>
(function () {
  var picker = document.getElementById('restore-file');
  var go = document.getElementById('restore-go');
  var status = document.getElementById('restore-status');
  var armed = false;
  go.addEventListener('click', function () {
    var file = picker.files && picker.files[0];
    if (!file) { status.textContent = 'Choose a file first.'; return; }
    // Two presses, because the first one cannot be undone: the same
    // pattern as every other button here that throws something away.
    if (!armed) {
      armed = true;
      go.textContent = 'Press again to replace everything';
      status.textContent = 'This cannot be undone. ' + file.name + ' will become this server.';
      return;
    }
    go.disabled = true;
    status.textContent = 'Putting it back...';
    fetch('/admin/api/import', { method: 'PUT', body: file })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (out) {
        if (!out.ok) throw new Error(out.j.error || 'it was refused');
        status.textContent = out.j.written + ' files restored. Reloading.';
        setTimeout(function () { location.href = '/admin'; }, 900);
      })
      .catch(function (e) {
        go.disabled = false;
        armed = false;
        go.textContent = 'Replace everything with this file';
        status.textContent = 'It did not work: ' + e.message;
      });
  });
})();
</script>
`,
    });
  }
  return { backupPage };
};

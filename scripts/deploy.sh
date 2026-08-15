#!/usr/bin/env bash
# Deploy the current checkout to the VPS as a new timestamped release,
# switch the `current` symlink to it, and (re)start the stack. The
# previous release stays on disk, so rollback is just moving the
# symlink back (scripts/rollback.sh).
#
# Only `app` and `mediamtx` are started: on our VPS the box's shared
# Caddy serves HTTPS, so the bundled caddy service stays off there.
#
# Usage: scripts/deploy.sh   (uses $FOSSCAST_HOST, e.g. root@1.2.3.4)
set -euo pipefail

HOST="${FOSSCAST_HOST:?Set FOSSCAST_HOST, e.g. root@1.2.3.4}"
SSH_KEY="${FOSSCAST_SSH_KEY:-/home/charlie/2-Data/SSH/lightmorphic-fosscast-vps-deploy}"
BASE=/opt/fosscast
RELEASE="$(date +%Y%m%d-%H%M%S)"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

run() { ssh -i "$SSH_KEY" -o IdentitiesOnly=yes "$HOST" "$@"; }

echo "== Uploading release $RELEASE =="
# The app container runs as UID 1000, so the bind-mounted data dir must
# be writable by that user or every write fails with EACCES.
run "mkdir -p $BASE/releases/$RELEASE $BASE/data && chown -R 1000:1000 $BASE/data"
rsync -az --delete -e "ssh -i $SSH_KEY -o IdentitiesOnly=yes" \
  --exclude .git --exclude node_modules --exclude data --exclude .env \
  "$REPO_ROOT/" "$HOST:$BASE/releases/$RELEASE/"

echo "== Switching current -> $RELEASE =="
run "ln -sfn $BASE/.env $BASE/releases/$RELEASE/.env && ln -sfn $BASE/releases/$RELEASE $BASE/current"

echo "== Starting stack =="
run "cd $BASE/current && DATA_PATH=$BASE/data docker compose -p fosscast up -d --build app mediamtx"

echo "== Health check =="
sleep 3
# Explicit if: a plain `run ... && echo` would not abort on failure
# (set -e exempts non-final commands in && lists).
if ! run "curl -fsS http://127.0.0.1:3100/healthz"; then
  echo "Health check FAILED; roll back with scripts/rollback.sh"
  exit 1
fi
echo " OK"

echo "== Pruning old releases (keep 5) =="
run "cd $BASE/releases && ls -1t | tail -n +6 | xargs -r rm -rf --"

echo "Deployed $RELEASE"

#!/usr/bin/env bash
# Deploy the current checkout to the VPS as a new timestamped release,
# switch the `current` symlink to it, and (re)start the stack. The
# previous release stays on disk, so rollback is just moving the
# symlink back (scripts/rollback.sh).
#
# The deploy key is forced-command restricted on the server to exactly
# the verbs this script sends (see scripts/deploy-wrapper.sh) - upload,
# activate, start, health-check, prune, roll back - with no shell
# access. Only `app` is started; boxes with their own proxy on 80/443
# never start the bundled caddy this way.
#
# Usage: scripts/deploy.sh   (uses $FOSSCAST_HOST, e.g. root@1.2.3.4)
set -euo pipefail

HOST="${FOSSCAST_HOST:?Set FOSSCAST_HOST, e.g. root@1.2.3.4}"
SSH_KEY="${FOSSCAST_SSH_KEY:-/home/charlie/9-Claude/ssh/lightmorphic-fosscast-vps-deploy}"
RELEASE="$(date +%Y%m%d-%H%M%S)"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

run() { ssh -i "$SSH_KEY" -o IdentitiesOnly=yes "$HOST" "$@"; }

echo "== Uploading release $RELEASE =="
run "mkdir-release $RELEASE"
rsync -az --delete -e "ssh -i $SSH_KEY -o IdentitiesOnly=yes" \
  --exclude .git --exclude node_modules --exclude data --exclude .env \
  "$REPO_ROOT/" "$HOST:$RELEASE/"

echo "== Switching current -> $RELEASE =="
run "activate-release $RELEASE"

echo "== Starting stack =="
run "start-release $RELEASE"

echo "== Health check =="
sleep 3
# Explicit if: a plain `run ... && echo` would not abort on failure
# (set -e exempts non-final commands in && lists).
if ! run "healthcheck"; then
  echo "Health check FAILED; roll back with scripts/rollback.sh"
  exit 1
fi
echo " OK"

echo "== Pruning old releases (keep 5) =="
run "prune-releases"

echo "Deployed $RELEASE"

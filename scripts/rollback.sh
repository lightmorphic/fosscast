#!/usr/bin/env bash
# Roll back to the release before the current one and restart the stack.
# Usage: scripts/rollback.sh   (uses $FOSSCAST_HOST, e.g. root@1.2.3.4;
# FOSSCAST_BASE overrides the install dir for multi-instance hosts)
set -euo pipefail

HOST="${FOSSCAST_HOST:?Set FOSSCAST_HOST, e.g. root@1.2.3.4}"
SSH_KEY="${FOSSCAST_SSH_KEY:-/home/charlie/2-Data/SSH/lightmorphic-fosscast-vps-deploy}"
BASE="${FOSSCAST_BASE:-/opt/fosscast}"
PROJECT="$(basename "$BASE")"

ssh -i "$SSH_KEY" -o IdentitiesOnly=yes "$HOST" '
  set -e
  BASE='"$BASE"'
  PROJECT='"$PROJECT"'
  cur=$(basename "$(readlink -f $BASE/current)")
  prev=$(ls -1t $BASE/releases | grep -vx "$cur" | head -1)
  [ -n "$prev" ] || { echo "no previous release to roll back to"; exit 1; }
  ln -sfn "$BASE/releases/$prev" "$BASE/current"
  cd "$BASE/current"
  DATA_PATH=$BASE/data docker compose -p "$PROJECT" up -d --build app mediamtx
  echo "rolled back to $prev"
'

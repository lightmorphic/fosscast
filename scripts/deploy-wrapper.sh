#!/usr/bin/env bash
# Forced command for the FOSSCast deploy SSH key. sshd always runs this
# exact script for that key, no matter what the client asked for; the
# client's requested command arrives in $SSH_ORIGINAL_COMMAND. This is
# the entire, fixed set of things that key can do on the box - nothing
# outside this list is possible with it, even if the key leaks.
#
# Install on the server as $BASE/bin/deploy-wrapper.sh and restrict the
# deploy key in /root/.ssh/authorized_keys:
#   command="/opt/fosscast/bin/deploy-wrapper.sh",restrict ssh-ed25519 AAAA... key-name
# For a non-default instance dir:
#   command="FOSSCAST_BASE=/opt/myshow /opt/myshow/bin/deploy-wrapper.sh",restrict ...
set -euo pipefail

BASE="${FOSSCAST_BASE:-/opt/fosscast}"
PROJECT="$(basename "$BASE")"
RELEASE_RE='^[0-9]{8}-[0-9]{6}$'

# Falls back to $* so the script can be tested by direct invocation
# before the forced command is active.
CMD="${SSH_ORIGINAL_COMMAND:-$*}"

# rsync uploads a new release's files. Delegate to rrsync (rsync's own
# restriction tool), locked to the releases directory.
if [[ "$CMD" == rsync\ --server* ]]; then
  exec /usr/bin/rrsync "$BASE/releases/"
fi

read -r VERB ARG _ <<<"$CMD"

require_release() {
  [[ "$ARG" =~ $RELEASE_RE ]] || { echo "bad release id" >&2; exit 1; }
}

case "$VERB" in
  mkdir-release)
    require_release
    mkdir -p "$BASE/releases/$ARG" "$BASE/data"
    ;;
  activate-release)
    require_release
    [ -d "$BASE/releases/$ARG" ] || { echo "no such release" >&2; exit 1; }
    ln -sfn "$BASE/.env" "$BASE/releases/$ARG/.env"
    ln -sfn "$BASE/releases/$ARG" "$BASE/current"
    # The app and mediamtx containers run as uid 1000 and must own the
    # data directory (media, recordings, JSON files).
    chown -R 1000:1000 "$BASE/data"
    ;;
  start-release)
    require_release
    [ -d "$BASE/releases/$ARG" ] || { echo "no such release" >&2; exit 1; }
    cd "$BASE/releases/$ARG"
    # Refresh upstream images so security fixes land on every deploy.
    DATA_PATH="$BASE/data" docker compose -p "$PROJECT" pull -q mediamtx || true
    DATA_PATH="$BASE/data" docker compose -p "$PROJECT" up -d --build app mediamtx
    # MediaMTX reads its config once at start and never sees the
    # symlink flip, so recreate it when the config really changed.
    if ! cmp -s mediamtx.yml "$BASE/.mediamtx.last" 2>/dev/null; then
      echo "mediamtx config changed, recreating"
      DATA_PATH="$BASE/data" docker compose -p "$PROJECT" up -d --force-recreate mediamtx
    fi
    cp mediamtx.yml "$BASE/.mediamtx.last"
    ;;
  healthcheck)
    curl -fsS "http://127.0.0.1:${FOSSCAST_HTTP_PORT:-3100}/healthz"
    ;;
  prune-releases)
    cd "$BASE/releases"
    ls -1t | tail -n +6 | xargs -r rm -rf
    ;;
  rollback)
    current="$(basename "$(readlink "$BASE/current")")"
    previous="$(ls -1t "$BASE/releases" | grep -vx "$current" | head -1)"
    [ -n "$previous" ] || { echo "no previous release to roll back to" >&2; exit 1; }
    echo "Rolling back: $current -> $previous"
    ln -sfn "$BASE/releases/$previous" "$BASE/current"
    cd "$BASE/releases/$previous"
    DATA_PATH="$BASE/data" docker compose -p "$PROJECT" up -d --build app mediamtx
    cp mediamtx.yml "$BASE/.mediamtx.last" 2>/dev/null || true
    ;;
  status)
    docker ps --filter "name=$PROJECT" --format '{{.Names}} {{.Status}}'
    ;;
  logs)
    [[ "$ARG" == app || "$ARG" == mediamtx ]] || { echo "logs app|mediamtx" >&2; exit 1; }
    docker logs --tail 50 "$PROJECT-$ARG-1" 2>&1
    ;;
  *)
    echo "command not permitted" >&2
    exit 1
    ;;
esac

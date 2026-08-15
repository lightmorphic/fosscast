#!/usr/bin/env bash
# Roll back to the release before the current one and restart the stack.
# "rollback" is one of the fixed verbs the forced-command wrapper
# accepts (scripts/deploy-wrapper.sh); the logic lives server-side.
# Usage: scripts/rollback.sh   (uses $FOSSCAST_HOST, e.g. root@1.2.3.4)
set -euo pipefail

HOST="${FOSSCAST_HOST:?Set FOSSCAST_HOST, e.g. root@1.2.3.4}"
SSH_KEY="${FOSSCAST_SSH_KEY:-/home/charlie/2-Data/SSH/lightmorphic-fosscast-vps-deploy}"

ssh -i "$SSH_KEY" -o IdentitiesOnly=yes "$HOST" rollback

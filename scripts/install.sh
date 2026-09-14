#!/usr/bin/env bash
# Install or update FOSSCast on this machine. Idempotent: run it again
# to update, and anything already configured is left alone.
#
# Run ON the server, from the directory this repo was copied into:
#   bash scripts/install.sh <domain> [options]
#
# It sets up no login. FOSSCast prints a setup code when it starts and
# this script shows it to you at the end; the first person to open the
# site in a browser gives it that code and chooses their own password
# there. A password written into a file on the server is not a password.
#
# Options:
#   --port N          app port on the host      (default 3100)
#   --caddy-sites D   folder of .caddy site files served by an existing
#                     Caddy on this box (default /opt/caddy/sites when
#                     it exists). Given one, FOSSCast runs without its
#                     own proxy and drops a site file there instead.
#
# Several instances can share a machine: give each one its own copy of
# the repo, its own domain and its own port.
set -euo pipefail

DOMAIN="${1:?usage: install.sh <domain> [options]}"
shift || true

PORT=3100
CADDY_SITES=""
CADDY_SITES_SET=0

while [ $# -gt 0 ]; do
  case "$1" in
    --port) PORT="${2:?}"; shift 2 ;;
    --caddy-sites) CADDY_SITES="${2:?}"; CADDY_SITES_SET=1; shift 2 ;;
    *) echo "unknown option: $1" >&2; exit 1 ;;
  esac
done

BASE="$(cd "$(dirname "$0")/.." && pwd)"
PROJECT="$(basename "$BASE")"
[ "$CADDY_SITES_SET" = 1 ] || { [ -d /opt/caddy/sites ] && CADDY_SITES=/opt/caddy/sites; }

echo "== Data directory =="
# Create every directory the containers bind-mount before they start:
# Docker creates missing mount sources itself, as root, which leaves the
# app unable to write and crash-looping on EACCES.
mkdir -p "$BASE/data" "$BASE/data/media"
# The containers run as uid 1000 and must own what they write.
chown -R 1000:1000 "$BASE/data"

if [ ! -f "$BASE/.env" ]; then
  # Two lines, and both of them are Docker's business: which name the
  # proxy answers on and which host port the app is published at. There
  # is no login here: FOSSCast makes its own secrets on first start and
  # the login is set in the browser.
  echo "== First run: writing .env =="
  {
    echo "DOMAIN=$DOMAIN"
    echo "HTTP_PORT=$PORT"
  } > "$BASE/.env"
  chmod 600 "$BASE/.env"
  NEW_INSTALL=1
else
  echo "== Existing .env kept =="
  NEW_INSTALL=0
fi

echo "== Starting the stack =="
cd "$BASE"
if [ -n "$CADDY_SITES" ]; then
  echo "using the proxy already on this box ($CADDY_SITES)"
  DATA_PATH="$BASE/data" docker compose -p "$PROJECT" up -d --build
  mkdir -p "$CADDY_SITES"
  cat > "$CADDY_SITES/$PROJECT.caddy" << EOF
$DOMAIN {
	encode zstd gzip
	header {
		Strict-Transport-Security "max-age=31536000"
		X-Content-Type-Options "nosniff"
		Referrer-Policy "strict-origin-when-cross-origin"
	}
	reverse_proxy 127.0.0.1:$PORT
}

www.$DOMAIN {
	redir https://$DOMAIN{uri} permanent
}
EOF
  for c in $(docker ps --filter "ancestor=caddy:2-alpine" --format '{{.Names}}'); do
    docker exec "$c" caddy reload --config /etc/caddy/Caddyfile >/dev/null 2>&1 && echo "reloaded $c"
  done
else
  # Nothing is fronting this box yet, so the bundled Caddy is switched
  # on: the same compose file with the hashes taken off its last block.
  # Every other comment in that file is indented, so this only ever
  # uncomments the service it was written to uncomment.
  sed 's/^# //' docker-compose.yml > docker-compose.https.yml
  DATA_PATH="$BASE/data" docker compose -f docker-compose.https.yml -p "$PROJECT" up -d --build
fi

# Docker may still have created a mount source as root during startup.
chown -R 1000:1000 "$BASE/data"

echo "== Health check =="
sleep 4
for i in 1 2 3 4 5; do
  if curl -fsS "http://127.0.0.1:$PORT/healthz" >/dev/null 2>&1; then break; fi
  [ "$i" = 5 ] && { echo "Health check FAILED; try: docker compose -p $PROJECT logs app"; exit 1; }
  sleep 3
done
curl -fsS "http://127.0.0.1:$PORT/healthz" && echo " OK"

echo
echo "FOSSCast is up at https://$DOMAIN"
if [ "$NEW_INSTALL" = 1 ]; then
  # The code is in the container's log and nowhere else. Read it back
  # out rather than making one up here: this script does not get to
  # decide who owns the instance either.
  CODE="$(docker compose -p "$PROJECT" logs app 2>/dev/null | grep -oE '[0-9]{3}-[0-9]{3}' | tail -1 || true)"
  echo
  echo "Nobody owns it yet. Open https://$DOMAIN/admin and it will ask"
  echo "for a setup code, then let you choose your own login."
  if [ -n "$CODE" ]; then
    echo
    echo "Setup code: $CODE"
  else
    echo
    echo "Read the code with: docker compose -p $PROJECT logs app"
  fi
else
  echo "Existing login kept. Dashboard: https://$DOMAIN/admin"
fi

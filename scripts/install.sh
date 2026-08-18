#!/usr/bin/env bash
# Install or update FOSSCast on this machine. Idempotent: run it again
# to update, and anything already configured is left alone.
#
# Run ON the server, from the directory this repo was copied into:
#   bash scripts/install.sh <domain> [options]
#
# Options:
#   --port N          app port on the host      (default 3100)
#   --admin-email X   first admin login         (default admin@<domain>)
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
ADMIN_EMAIL=""
CADDY_SITES=""
CADDY_SITES_SET=0

while [ $# -gt 0 ]; do
  case "$1" in
    --port) PORT="${2:?}"; shift 2 ;;
    --admin-email) ADMIN_EMAIL="${2:?}"; shift 2 ;;
    --caddy-sites) CADDY_SITES="${2:?}"; CADDY_SITES_SET=1; shift 2 ;;
    *) echo "unknown option: $1" >&2; exit 1 ;;
  esac
done

BASE="$(cd "$(dirname "$0")/.." && pwd)"
PROJECT="$(basename "$BASE")"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@$DOMAIN}"
[ "$CADDY_SITES_SET" = 1 ] || { [ -d /opt/caddy/sites ] && CADDY_SITES=/opt/caddy/sites; }

echo "== Data directory =="
# Create every directory the containers bind-mount before they start:
# Docker creates missing mount sources itself, as root, which leaves the
# app unable to write and crash-looping on EACCES.
mkdir -p "$BASE/data" "$BASE/data/media"
# The containers run as uid 1000 and must own what they write.
chown -R 1000:1000 "$BASE/data"

if [ ! -f "$BASE/.env" ]; then
  echo "== First run: writing .env =="
  ADMIN_PASS="$(openssl rand -base64 18 | tr -d '+/=' | head -c 20)"
  {
    echo "DOMAIN=$DOMAIN"
    echo "HTTP_PORT=$PORT"
    echo "ADMIN_EMAIL=$ADMIN_EMAIL"
    echo "ADMIN_PASSWORD=$ADMIN_PASS"
    echo "PUBLISHER_TOKEN=$(openssl rand -hex 32)"
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
  DATA_PATH="$BASE/data" docker compose -f docker-compose.byo-proxy.yml -p "$PROJECT" up -d --build
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
  DATA_PATH="$BASE/data" docker compose -p "$PROJECT" up -d --build
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
  echo "Dashboard:  https://$DOMAIN/admin"
  echo "Login:      $ADMIN_EMAIL"
  echo "Password:   $ADMIN_PASS"
  echo "Change it from the Account page after logging in."
else
  echo "Existing login kept. Dashboard: https://$DOMAIN/admin"
fi

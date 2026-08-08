#!/bin/sh
set -eu

# Centrifugo, the app and Caddy in one container, because a deployment of this is
# one container with one volume and that is worth keeping.

secret_file=${REALTIME_SECRET_FILE:-/data/realtime-secret}
if [ -z "${REALTIME_SECRET:-}" ]; then
  if [ ! -s "$secret_file" ]; then
    umask 077
    head -c 48 /dev/urandom | base64 | tr -d '\n' > "$secret_file"
  fi
  REALTIME_SECRET=$(cat "$secret_file")
  export REALTIME_SECRET
fi

export CENTRIFUGO_CLIENT_TOKEN_HMAC_SECRET_KEY=$REALTIME_SECRET
export CENTRIFUGO_CLIENT_SUBSCRIPTION_TOKEN_ENABLED=true
export CENTRIFUGO_CLIENT_SUBSCRIPTION_TOKEN_HMAC_SECRET_KEY=$REALTIME_SECRET
export CENTRIFUGO_HTTP_API_KEY=${REALTIME_API_KEY:-$REALTIME_SECRET}
# Caddy is what rejects a foreign origin, before the request ever gets here — so
# Centrifugo, which only ever sees a proxied request, must not second-guess it.
export CENTRIFUGO_CLIENT_ALLOWED_ORIGINS='*'
export CENTRIFUGO_HTTP_SERVER_ADDRESS=127.0.0.1
export CENTRIFUGO_HEALTH_ENABLED=true
export XDG_CONFIG_HOME=/tmp/caddy-config
export XDG_DATA_HOME=/tmp/caddy-data

if [ "${PRAETORIUM_SEED_PREVIEW:-}" = true ]; then
  node .output/server/seed-preview.mjs
fi

centrifugo --config=/app/realtime.json &
realtime_pid=$!
PORT=3001 node .output/server/index.mjs &
app_pid=$!
caddy run --config /app/Caddyfile --adapter caddyfile &
caddy_pid=$!

cleanup() {
  kill "$realtime_pid" "$app_pid" "$caddy_pid" 2>/dev/null || true
}
trap cleanup INT TERM

# Any one of the three dying takes the container with it, so the orchestrator
# restarts the lot rather than leaving a half-served deployment up.
wait -n "$realtime_pid" "$app_pid" "$caddy_pid"
cleanup
exit 1

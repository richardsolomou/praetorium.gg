#!/bin/sh
set -eu

# Centrifugo for development and for the browser suite. In production it lives in
# the app's own container behind Caddy; here it is a container of its own that the
# browser talks to directly, which is why the app hands the client a URL rather
# than assuming one.

secret=${REALTIME_SECRET:-praetorium-development-realtime-secret}
name=${REALTIME_CONTAINER:-praetorium-realtime}
port=${REALTIME_PORT:-8000}

detach=
if [ "${1:-}" = "--detach" ]; then
  detach=-d
  docker rm -f "$name" >/dev/null 2>&1 || true
fi

exec docker run --rm $detach --name "$name" -p "127.0.0.1:${port}:8000" \
  -e CENTRIFUGO_CLIENT_TOKEN_HMAC_SECRET_KEY="$secret" \
  -e CENTRIFUGO_CLIENT_SUBSCRIPTION_TOKEN_ENABLED=true \
  -e CENTRIFUGO_CLIENT_SUBSCRIPTION_TOKEN_HMAC_SECRET_KEY="$secret" \
  -e CENTRIFUGO_HTTP_API_KEY="$secret" \
  -e CENTRIFUGO_CLIENT_ALLOWED_ORIGINS='*' \
  -v "$PWD/realtime.json:/centrifugo/realtime.json:ro" \
  centrifugo/centrifugo:v6.9.1 centrifugo --config=/centrifugo/realtime.json --health.enabled

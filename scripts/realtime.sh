#!/bin/sh
set -eu

secret=${REALTIME_SECRET:-praetorium-development-realtime-secret}
name=${REALTIME_CONTAINER:-praetorium-realtime}
port=${REALTIME_PORT:-8000}

exec pnpm exec ras-stack-realtime --config realtime.json --name "$name" --port "$port" \
  --origin http://localhost:3000 --secret "$secret" "$@"

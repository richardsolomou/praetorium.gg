#!/bin/sh
set -eu

if [ "${PRAETORIUM_SEED_PREVIEW:-}" = true ]; then
  node .output/server/seed-preview.mjs
fi

exec node .output/server/index.mjs

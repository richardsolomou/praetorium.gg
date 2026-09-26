#!/usr/bin/env bash
set -euo pipefail

test -n "${DOKPLOY_URL:?}"
test -n "${DOKPLOY_API_KEY:?}"
test -n "${DOKPLOY_APPLICATION_ID:?}"

details="$(curl --fail --silent --show-error --max-time 30 --get \
  --header "x-api-key: $DOKPLOY_API_KEY" \
  --data-urlencode "applicationId=$DOKPLOY_APPLICATION_ID" \
  "${DOKPLOY_URL%/}/api/application.one")"

if ! jq -e --arg id "$DOKPLOY_APPLICATION_ID" \
  '.applicationId == $id and .name == "app" and .applicationStatus == "idle"' \
  <<< "$details" > /dev/null; then
  echo 'The previous application is still able to accept writes; the data copy cannot be final' >&2
  exit 1
fi

echo 'Previous application writes are frozen'

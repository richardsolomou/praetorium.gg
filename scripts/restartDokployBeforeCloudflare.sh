#!/usr/bin/env bash
set -euo pipefail

test -n "${DOKPLOY_URL:?}"
test -n "${DOKPLOY_API_KEY:?}"
test -n "${DOKPLOY_APPLICATION_ID:?}"

headers="$(mktemp)"
trap 'rm -f "$headers"' EXIT
curl --silent --show-error --max-time 15 --dump-header "$headers" --output /dev/null \
  https://praetorium.gg/api/health || true
if tr -d '\r' < "$headers" | grep -Eiq '^x-praetorium-runtime: cloudflare$'; then
  echo 'Cloudflare already serves production; leaving the previous application stopped'
  exit 0
fi

details="$(curl --fail --silent --show-error --max-time 30 --get \
  --header "x-api-key: $DOKPLOY_API_KEY" \
  --data-urlencode "applicationId=$DOKPLOY_APPLICATION_ID" \
  "${DOKPLOY_URL%/}/api/application.one")"
jq -e --arg id "$DOKPLOY_APPLICATION_ID" \
  '.applicationId == $id and .name == "app" and (.applicationStatus == "idle" or .applicationStatus == "running" or .applicationStatus == "done")' \
  <<< "$details" > /dev/null
if [[ "$(jq -r '.applicationStatus' <<< "$details")" != idle ]]; then
  echo 'Previous application is already running'
  exit 0
fi
body="$(jq -nc --arg id "$DOKPLOY_APPLICATION_ID" '{applicationId: $id}')"
curl --fail --silent --show-error --max-time 60 --request POST \
  --header "x-api-key: $DOKPLOY_API_KEY" --header 'content-type: application/json' \
  --data-binary "$body" "${DOKPLOY_URL%/}/api/application.start" > /dev/null
echo 'Restarted previous application after incomplete cutover'

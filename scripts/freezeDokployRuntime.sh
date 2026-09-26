#!/usr/bin/env bash
set -euo pipefail

test -n "${DOKPLOY_URL:?}"
test -n "${DOKPLOY_API_KEY:?}"
test -n "${DOKPLOY_APPLICATION_ID:?}"

details="$(curl --fail --silent --show-error --max-time 30 --get \
  --header "x-api-key: $DOKPLOY_API_KEY" \
  --data-urlencode "applicationId=$DOKPLOY_APPLICATION_ID" \
  "${DOKPLOY_URL%/}/api/application.one")"
jq -e --arg id "$DOKPLOY_APPLICATION_ID" \
  '.applicationId == $id and .name == "app" and (.applicationStatus == "idle" or .applicationStatus == "running" or .applicationStatus == "done")' \
  <<< "$details" > /dev/null
if [[ "$(jq -r '.applicationStatus' <<< "$details")" != idle ]]; then
  body="$(jq -nc --arg id "$DOKPLOY_APPLICATION_ID" '{applicationId: $id}')"
  curl --fail --silent --show-error --max-time 60 --request POST \
    --header "x-api-key: $DOKPLOY_API_KEY" --header 'content-type: application/json' \
    --data-binary "$body" "${DOKPLOY_URL%/}/api/application.stop" > /dev/null
fi
for _ in {1..30}; do
  if bash "$(dirname "$0")/verifyCutoverFreeze.sh" > /dev/null 2>&1; then
    echo 'Previous application writes are frozen'
    exit 0
  fi
  sleep 2
done
echo 'Previous application did not stop' >&2
exit 1

#!/usr/bin/env bash
set -euo pipefail

test -n "${CLOUDFLARE_API_TOKEN:?}"
test -n "${CLOUDFLARE_ACCOUNT_ID:?}"
test -n "${CLOUDFLARE_ZONE_ID:?}"

pnpm exec wrangler deploy --config wrangler.objects.json

routes="$(curl --fail --silent --show-error --max-time 30 \
  --header "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  "https://api.cloudflare.com/client/v4/zones/$CLOUDFLARE_ZONE_ID/workers/routes")"
route_id="$(jq -er '[.result[] | select(.pattern == "s3.praetorium.gg/*" and .script == "praetorium-objects")] | if length == 1 then .[0].id else error("unexpected public object route") end' <<< "$routes")"

curl --fail --silent --show-error --max-time 30 \
  --header "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  --header 'Content-Type: application/json' \
  --request PUT \
  --data '{"pattern":"s3.praetorium.gg/*","script":"praetorium-objects"}' \
  "https://api.cloudflare.com/client/v4/zones/$CLOUDFLARE_ZONE_ID/workers/routes/$route_id" \
  | jq -e '.success and .result.pattern == "s3.praetorium.gg/*" and .result.script == "praetorium-objects"' > /dev/null

echo 'Public object route points to praetorium-objects'

#!/usr/bin/env bash
set -euo pipefail

test -n "${CLOUDFLARE_API_TOKEN:?}"

zones="$(curl --fail --silent --show-error --max-time 15 \
  --header "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  'https://api.cloudflare.com/client/v4/zones?name=praetorium.gg')"
zone_id="$(jq -er '.result | select(length == 1) | .[0].id | select(test("^[0-9a-f]{32}$"))' <<< "$zones")"
routes="$(curl --fail --silent --show-error --max-time 15 \
  --header "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  "https://api.cloudflare.com/client/v4/zones/$zone_id/workers/routes?per_page=100")"
jq -e '.success == true and (.result_info.total_pages | type == "number" and . <= 1)' <<< "$routes" > /dev/null
claimed="$(jq -r '[.result[] | select(.pattern == "praetorium.gg/*" or .pattern == "s3.praetorium.gg/*" or .pattern == "catalogue.praetorium.gg/*")] | length' <<< "$routes")"
assigned="$(jq -r '[.result[] | select(.script == "praetorium-production" and (.pattern == "praetorium.gg/*" or .pattern == "s3.praetorium.gg/*" or .pattern == "catalogue.praetorium.gg/*"))] | length' <<< "$routes")"

headers="$(mktemp)"
trap 'rm -f "$headers"' EXIT
curl --silent --show-error --max-time 15 --dump-header "$headers" --output /dev/null \
  https://praetorium.gg/api/health || true
if grep -Eiq '^x-praetorium-runtime: cloudflare\r?$' "$headers"; then
  test "$assigned" = 3
  test "$claimed" = 3
  echo 'needed=false'
else
  test "$claimed" = 0
  echo 'needed=true'
fi

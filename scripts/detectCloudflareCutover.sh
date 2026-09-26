#!/usr/bin/env bash
set -euo pipefail

test -n "${CLOUDFLARE_API_TOKEN:?}"

routes="$(curl --fail --silent --show-error --max-time 15 \
  --header "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  'https://api.cloudflare.com/client/v4/zones/f4a467cfd0e9f365239ba515ec32055d/workers/routes?per_page=100')"
jq -e '.success == true and (.result | type == "array") and ((.result_info.total_pages // 1) <= 1) and (.result_info.total_pages != null or (.result | length) < 100)' <<< "$routes" > /dev/null
claimed="$(jq -r '[.result[] | select(.pattern == "praetorium.gg/*" or .pattern == "s3.praetorium.gg/*" or .pattern == "catalogue.praetorium.gg/*")] | length' <<< "$routes")"
assigned="$(jq -r '[.result[] | select(.script == "praetorium-production" and (.pattern == "praetorium.gg/*" or .pattern == "s3.praetorium.gg/*" or .pattern == "catalogue.praetorium.gg/*"))] | length' <<< "$routes")"

headers="$(mktemp)"
trap 'rm -f "$headers"' EXIT
curl --silent --show-error --max-time 15 --dump-header "$headers" --output /dev/null \
  https://praetorium.gg/api/health || true
if grep -Eiq '^x-praetorium-runtime: cloudflare\r?$' "$headers"; then
  if [[ "$assigned" != 3 || "$claimed" != 3 ]]; then
    echo "Cloudflare serves production but only $assigned of 3 expected routes are assigned ($claimed claimed)" >&2
    exit 1
  fi
  echo 'needed=false'
else
  if [[ "$claimed" != 0 ]]; then
    echo "Production is not served by the cutover Worker, but $claimed routes are already claimed ($assigned by it)" >&2
    exit 1
  fi
  echo 'needed=true'
fi

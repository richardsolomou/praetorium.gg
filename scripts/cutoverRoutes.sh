#!/usr/bin/env bash
set -euo pipefail

operation="${1:?}"
zone="${CLOUDFLARE_ZONE_ID:?}"
account="${CLOUDFLARE_ACCOUNT_ID:?}"
workers_token="${CLOUDFLARE_API_TOKEN:?}"
dns_token="${CLOUDFLARE_DNS_API_TOKEN:?}"
vm_ip='5.75.151.151'
api='https://api.cloudflare.com/client/v4'

workers() {
  local method="$1" path="$2"
  local args=(--fail --silent --show-error --max-time 30 --header "Authorization: Bearer $workers_token" --header 'Content-Type: application/json' --request "$method")
  if [[ $# == 3 ]]; then args+=(--data "$3"); fi
  curl "${args[@]}" "$api$path"
}

dns() {
  local method="$1" path="$2"
  local args=(--fail --silent --show-error --max-time 30 --header "Authorization: Bearer $dns_token" --header 'Content-Type: application/json' --request "$method")
  if [[ $# == 3 ]]; then args+=(--data "$3"); fi
  curl "${args[@]}" "$api$path"
}

require_success() {
  jq -e '.success == true' > /dev/null
}

verify_health() {
  local hostname="$1" expected="$2" revision="${3:-}" headers status
  headers="$(mktemp)"
  for _ in {1..60}; do
    status="$(curl --silent --show-error --max-time 10 --dump-header "$headers" --output /dev/null --write-out '%{http_code}' "https://$hostname/api/health" || true)"
    if [[ "$status" == "$expected" ]]; then
      if [[ "$expected" == 503 ]] && grep -Eiq '^x-praetorium-maintenance: auth-cutover' "$headers"; then
        rm "$headers"
        return
      fi
      if [[ "$expected" == 200 ]] && grep -Eiq "^x-praetorium-revision: $revision" "$headers" \
        && ! grep -Eiq '^x-praetorium-runtime: cloudflare' "$headers"; then
        rm "$headers"
        return
      fi
    fi
    sleep 5
  done
  rm "$headers"
  echo "$hostname did not serve the expected runtime and revision" >&2
  return 1
}

if [[ "$operation" != activate-staging ]]; then
  route_json="$(workers GET "/zones/$zone/workers/routes")"
  route_id="$(jq -er '[.result[] | select(.pattern == "praetorium.gg/*" and (.script == "praetorium-production" or .script == "praetorium-auth-cutover-maintenance"))] | if length == 1 then .[0].id else error("unexpected production route") end' <<< "$route_json")"
  route_script="$(jq -er --arg id "$route_id" '.result[] | select(.id == $id) | .script' <<< "$route_json")"
fi

case "$operation" in
  freeze-production)
    if [[ "$route_script" == praetorium-production ]]; then
      pnpm exec wrangler deploy --config wrangler.maintenance.json
      workers PUT "/zones/$zone/workers/routes/$route_id" \
        '{"pattern":"praetorium.gg/*","script":"praetorium-auth-cutover-maintenance"}' | require_success
    fi
    verify_health praetorium.gg 503
    sleep 60
    verify_health praetorium.gg 503
    echo 'Production account writes are frozen at the edge'
    ;;
  unfreeze-production)
    if [[ "$route_script" == praetorium-auth-cutover-maintenance ]]; then
      workers PUT "/zones/$zone/workers/routes/$route_id" \
        '{"pattern":"praetorium.gg/*","script":"praetorium-production"}' | require_success
    fi
    headers="$(mktemp)"
    status="$(curl --silent --show-error --max-time 15 --dump-header "$headers" --output /dev/null --write-out '%{http_code}' https://praetorium.gg/api/health)"
    test "$status" = 200
    grep -Eiq '^x-praetorium-runtime: cloudflare' "$headers"
    rm "$headers"
    echo 'Cloudflare production Worker is serving again'
    ;;
  activate-production)
    [[ "${EXPECTED_REVISION:-}" =~ ^[0-9a-f]{40}$ ]]
    test "$route_script" = praetorium-auth-cutover-maintenance
    records="$(dns GET "/zones/$zone/dns_records?name=praetorium.gg&type=A")"
    record_id="$(jq -er '[.result[] | select(.name == "praetorium.gg" and .type == "A")] | if length == 1 and .[0].proxied == true and (.[0].content == "192.0.2.1" or .[0].content == "5.75.151.151") then .[0].id else error("unexpected apex DNS record") end' <<< "$records")"
    payload="$(jq -n --arg ip "$vm_ip" '{type:"A",name:"praetorium.gg",content:$ip,proxied:true,ttl:1}')"
    dns PATCH "/zones/$zone/dns_records/$record_id" "$payload" | require_success
    workers DELETE "/zones/$zone/workers/routes/$route_id" | require_success
    if ! verify_health praetorium.gg 200 "$EXPECTED_REVISION"; then
      workers POST "/zones/$zone/workers/routes" \
        '{"pattern":"praetorium.gg/*","script":"praetorium-auth-cutover-maintenance"}' | require_success
      echo 'Restored maintenance routing; keep the imported VM database as the authority' >&2
      exit 1
    fi
    echo 'Production serves the pinned Dokploy revision'
    ;;
  activate-staging)
    [[ "${EXPECTED_REVISION:-}" =~ ^[0-9a-f]{40}$ ]]
    domains="$(workers GET "/accounts/$account/workers/domains")"
    domain_id="$(jq -er '[.result[] | select(.hostname == "staging.praetorium.gg")] | if length == 0 then "absent" elif length == 1 and .[0].service == "praetorium-staging" then .[0].id else error("unexpected staging Worker domain") end' <<< "$domains")"
    if [[ "$domain_id" != absent ]]; then
      workers DELETE "/accounts/$account/workers/domains/$domain_id" | require_success
    fi
    for _ in {1..12}; do
      records="$(dns GET "/zones/$zone/dns_records?name=staging.praetorium.gg")"
      if jq -e '[.result[] | select(.name == "staging.praetorium.gg" and .type != "A")] | length == 0' <<< "$records" > /dev/null; then break; fi
      sleep 5
    done
    jq -e '[.result[] | select(.name == "staging.praetorium.gg" and .type != "A")] | length == 0' <<< "$records" > /dev/null
    record_count="$(jq -er '[.result[] | select(.name == "staging.praetorium.gg" and .type == "A")] | length' <<< "$records")"
    payload="$(jq -n --arg ip "$vm_ip" '{type:"A",name:"staging.praetorium.gg",content:$ip,proxied:true,ttl:1}')"
    if [[ "$record_count" == 0 ]]; then
      dns POST "/zones/$zone/dns_records" "$payload" | require_success
    else
      test "$record_count" = 1
      record_id="$(jq -er '.result[] | select(.name == "staging.praetorium.gg" and .type == "A") | .id' <<< "$records")"
      dns PATCH "/zones/$zone/dns_records/$record_id" "$payload" | require_success
    fi
    verify_health staging.praetorium.gg 200 "$EXPECTED_REVISION"
    echo 'Staging serves the pinned Dokploy revision'
    ;;
  *)
    echo 'Invalid cutover operation' >&2
    exit 1
    ;;
esac

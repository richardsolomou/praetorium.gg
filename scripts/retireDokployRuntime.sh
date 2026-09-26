#!/usr/bin/env bash
set -euo pipefail

test -n "${DOKPLOY_URL:?}"
test -n "${DOKPLOY_API_KEY:?}"
test -n "${DOKPLOY_APPLICATION_ID:?}"

base="${DOKPLOY_URL%/}"

service() {
  local kind="$1" id_field="$2" id="$3"
  curl --fail --silent --show-error --max-time 30 --get \
    --header "x-api-key: $DOKPLOY_API_KEY" \
    --data-urlencode "$id_field=$id" "$base/api/$kind.one"
}

retire() {
  local kind="$1" id_field="$2" id="$3" name="$4" status_field="$5"
  local details status body
  details="$(service "$kind" "$id_field" "$id")"
  jq -e --arg name "$name" '.name == $name' <<< "$details" > /dev/null
  status="$(jq -er --arg field "$status_field" '.[$field] | select(type == "string")' <<< "$details")"
  if [[ "$status" == idle ]]; then
    echo "$name is stopped"
    return
  fi
  if [[ "${DRY_RUN:-false}" == true ]]; then
    echo "$name is $status; would stop after the Cloudflare release verifies"
    return
  fi
  body="$(jq -nc --arg id "$id" --arg field "$id_field" '{($field): $id}')"
  curl --fail --silent --show-error --max-time 60 --request POST \
    --header "x-api-key: $DOKPLOY_API_KEY" --header 'content-type: application/json' \
    --data-binary "$body" "$base/api/$kind.stop" > /dev/null
  for _ in {1..30}; do
    details="$(service "$kind" "$id_field" "$id")"
    status="$(jq -er --arg field "$status_field" '.[$field] | select(type == "string")' <<< "$details")"
    [[ "$status" != idle ]] || break
    sleep 2
  done
  if [[ "$status" != idle ]]; then
    echo "$name did not stop (status: $status)" >&2
    exit 1
  fi
  echo "$name stopped"
}

retire application applicationId "$DOKPLOY_APPLICATION_ID" app applicationStatus
retire compose composeId Ky4kdKp2mpqXuixHNUZUF minio composeStatus
retire postgres postgresId Ww_-3KD0nTcVW4JZMYZ2V postgres applicationStatus
retire redis redisId O-TY_z-lveUSifVRauDd9 valkey applicationStatus
retire application applicationId 6wR9V0cvpq_V_gdnja3CL praetorium-pr-606 applicationStatus
retire application applicationId nLeRLmike4GlmS24JP4o- praetorium-pr-599 applicationStatus
retire application applicationId nbIPYP8N1nWNUeJq8d48M praetorium-pr-577 applicationStatus
retire postgres postgresId h7SBBRLkCexkFTW4GvrzU postgres applicationStatus

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
  details="$(service "$kind" "$id_field" "$id")"
  test "$(jq -er --arg field "$status_field" '.[$field]' <<< "$details")" = idle
  echo "$name stopped"
}

retire application applicationId "$DOKPLOY_APPLICATION_ID" app applicationStatus
retire compose composeId Ky4kdKp2mpqXuixHNUZUF minio composeStatus
retire postgres postgresId Ww_-3KD0nTcVW4JZMYZ2V postgres applicationStatus
retire redis redisId O-TY_z-lveUSifVRauDd9 valkey applicationStatus

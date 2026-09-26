#!/usr/bin/env bash
set -euo pipefail

test -n "${DOKPLOY_URL:?}"
test -n "${DOKPLOY_API_KEY:?}"
test -n "${SPACETIME_OWNER_TOKEN:?}"

api() {
  local procedure="$1" field="$2" value="$3"
  curl --fail --silent --show-error --max-time 30 --get \
    --header "x-api-key: $DOKPLOY_API_KEY" --data-urlencode "$field=$value" \
    "${DOKPLOY_URL%/}/api/$procedure"
}

postgres="$(api postgres.one postgresId Ww_-3KD0nTcVW4JZMYZ2V)"
destination_id="$(jq -er '[.backups[] | select(.enabled == true and .databaseType == "postgres" and .database == "postgres" and .prefix == "production/postgres")] | select(length == 1) | .[0].destinationId' <<< "$postgres")"
destination="$(api destination.one destinationId "$destination_id")"
test "$(jq -er '.bucket' <<< "$destination")" = praetorium-backups
endpoint="$(jq -er '.endpoint | select(test("^https://[0-9a-f]{32}[.]r2[.]cloudflarestorage[.]com/?$"))' <<< "$destination")"
AWS_ACCESS_KEY_ID="$(jq -er '.accessKey | select(length > 0)' <<< "$destination")"
AWS_SECRET_ACCESS_KEY="$(jq -er '.secretAccessKey | select(length > 0)' <<< "$destination")"
AWS_DEFAULT_REGION="$(jq -er '.region | select(length > 0)' <<< "$destination")"
export AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_DEFAULT_REGION

application="$(api application.one applicationId -Su13uDBf96psvGEiBula)"
app_name="$(jq -er '. | select(.applicationId == "-Su13uDBf96psvGEiBula" and .name == "spacetimedb-production") | .appName | select(test("^[a-z0-9-]+$"))' <<< "$application")"

latest_key() {
  local kind="$1" prefix="$app_name/praetorium/production/spacetimedb/$1/" listing
  listing="$(aws s3api list-objects-v2 --bucket praetorium-backups --prefix "$prefix" --endpoint-url "$endpoint" --output json)"
  jq -er --arg prefix "$prefix" --arg kind "$kind" \
    '. | select(.IsTruncated != true) | [.Contents[]?.Key | select(startswith($prefix)) | select((ltrimstr($prefix)) | test("^praetorium-spacetime-production-" + $kind + "-[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}-[0-9]{2}-[0-9]{2}-[0-9]{3}Z[.]tar$"))] | sort | last | select(type == "string")' \
    <<< "$listing"
}

work="$(mktemp -d)"
trap 'docker rm --force praetorium-backup-readback > /dev/null 2>&1 || true; rm -rf "${work:?}"' EXIT
umask 077
data_key="$(latest_key data)"
identity_key="$(latest_key identity)"
aws s3 cp "s3://praetorium-backups/$data_key" "$work/data.tar" --endpoint-url "$endpoint" --only-show-errors
aws s3 cp "s3://praetorium-backups/$identity_key" "$work/identity.tar" --endpoint-url "$endpoint" --only-show-errors
mkdir "$work/data" "$work/identity"
tar -xf "$work/data.tar" --strip-components=2 -C "$work/data"
tar -xf "$work/identity.tar" -C "$work/identity"
test -s "$work/data/metadata.toml"
test -s "$work/identity/id_ecdsa"
test -s "$work/identity/id_ecdsa.pub"
docker run --detach --name praetorium-backup-readback \
  --publish 127.0.0.1:3301:3000 \
  --volume "$work/data:/data" --volume "$work/identity:/identity" \
  clockworklabs/spacetime:v2.7.0-hotfix3 \
  start --data-dir /data --listen-addr 0.0.0.0:3000 \
  --jwt-priv-key-path /identity/id_ecdsa --jwt-pub-key-path /identity/id_ecdsa.pub > /dev/null

for _ in {1..30}; do
  status="$(curl --silent --max-time 10 --output "$work/rows.json" --write-out '%{http_code}' \
    --header "Authorization: Bearer $SPACETIME_OWNER_TOKEN" \
    --header 'Content-Type: text/plain' --request POST --data-binary 'SELECT COUNT(*) AS count FROM rosters' \
    http://127.0.0.1:3301/v1/database/praetorium-production/sql 2> /dev/null || true)"
  if [[ "$status" == 200 ]]; then
    count="$(jq -er '.[0].rows[0][0] | select(type == "number" and . > 0)' "$work/rows.json")"
    echo "Authenticated SpacetimeDB backup readback: $count rosters"
    exit 0
  fi
  [[ "$status" != 401 && "$status" != 403 ]] || break
  sleep 2
done
echo "Restored SpacetimeDB private SQL read failed with HTTP $status" >&2
docker inspect praetorium-backup-readback --format 'Container state: {{.State.Status}}, exit code: {{.State.ExitCode}}' >&2
if [[ "$status" == 000 ]]; then
  docker logs --tail 10 praetorium-backup-readback >&2
fi
exit 1

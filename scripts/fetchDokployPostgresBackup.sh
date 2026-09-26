#!/usr/bin/env bash
set -euo pipefail

test -n "${DOKPLOY_URL:?}"
test -n "${DOKPLOY_API_KEY:?}"
test -n "${DOKPLOY_POSTGRES_ID:?}"
test -n "${BACKUP_OUTPUT:?}"

api() {
  local procedure="$1" field="$2" value="$3"
  curl --fail --silent --show-error --max-time 30 --get \
    --header "x-api-key: $DOKPLOY_API_KEY" \
    --data-urlencode "$field=$value" \
    "${DOKPLOY_URL%/}/api/$procedure"
}

postgres="$(api postgres.one postgresId "$DOKPLOY_POSTGRES_ID")"
app_name="$(jq -er --arg id "$DOKPLOY_POSTGRES_ID" \
  '. | select(.postgresId == $id and .name == "postgres") | .appName | select(test("^[a-z0-9-]+$"))' <<< "$postgres")"
backup="$(jq -ec \
  '[.backups[] | select(.enabled == true and .databaseType == "postgres" and .database == "postgres" and .prefix == "production/postgres")] | select(length == 1) | .[0]' \
  <<< "$postgres")"
backup_id="$(jq -er '.backupId' <<< "$backup")"
destination_id="$(jq -er '.destinationId' <<< "$backup")"

destination="$(api destination.one destinationId "$destination_id")"
test "$(jq -er '.bucket' <<< "$destination")" = praetorium-backups
endpoint="$(jq -er '.endpoint | select(test("^https://[0-9a-f]{32}[.]r2[.]cloudflarestorage[.]com/?$"))' <<< "$destination")"
AWS_ACCESS_KEY_ID="$(jq -er '.accessKey | select(length > 0)' <<< "$destination")"
AWS_SECRET_ACCESS_KEY="$(jq -er '.secretAccessKey | select(length > 0)' <<< "$destination")"
AWS_DEFAULT_REGION="$(jq -er '.region | select(length > 0)' <<< "$destination")"
export AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_DEFAULT_REGION

prefix="$app_name/production/postgres/"
list_backups() {
  aws s3api list-objects-v2 --bucket praetorium-backups --prefix "$prefix" --endpoint-url "$endpoint" --output json
}
select_key() {
  jq -er --arg prefix "$prefix" --arg after "$1" \
  '. | select(.IsTruncated != true) | [.Contents[]?.Key | select(startswith($prefix)) | ltrimstr($prefix) | select(test("^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}-[0-9]{2}-[0-9]{2}-[0-9]{3}Z[.]sql[.]gz$") and . > $after)] | sort | last | select(type == "string") | $prefix + .' \
  <<< "$2"
}

listing="$(list_backups)"
after="${BACKUP_AFTER:-}"
if [[ "${RUN_MANUAL_BACKUP:-false}" == true ]]; then
  latest="$(select_key '' "$listing" || true)"
  if [[ -n "$latest" ]]; then
    latest="${latest#"$prefix"}"
    [[ "$latest" > "$after" ]] && after="$latest"
  fi
  body="$(jq -nc --arg id "$backup_id" '{backupId: $id}')"
  curl --fail --silent --show-error --max-time 300 --request POST \
    --header "x-api-key: $DOKPLOY_API_KEY" --header 'content-type: application/json' \
    --data-binary "$body" "${DOKPLOY_URL%/}/api/backup.manualBackupPostgres" > /dev/null
  listing="$(list_backups)"
fi
key="$(select_key "$after" "$listing")"

umask 077
aws s3 cp "s3://praetorium-backups/$key" "$BACKUP_OUTPUT" --endpoint-url "$endpoint" --only-show-errors
gzip -t "$BACKUP_OUTPUT"
gzip -cd "$BACKUP_OUTPUT" | docker run --rm -i postgres:18-alpine pg_restore --list > /dev/null
echo "Verified Dokploy Postgres backup: $key"

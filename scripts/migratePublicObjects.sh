#!/usr/bin/env bash
set -euo pipefail

test -n "${SOURCE_S3_ENDPOINT:?}"
test -n "${SOURCE_S3_ACCESS_KEY_ID:?}"
test -n "${SOURCE_S3_SECRET_ACCESS_KEY:?}"
test -n "${R2_ENDPOINT:?}"
test -n "${R2_ACCESS_KEY_ID:?}"
test -n "${R2_SECRET_ACCESS_KEY:?}"

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

source_s3api() {
  AWS_ACCESS_KEY_ID="$SOURCE_S3_ACCESS_KEY_ID" AWS_SECRET_ACCESS_KEY="$SOURCE_S3_SECRET_ACCESS_KEY" \
    AWS_DEFAULT_REGION=us-east-1 aws --endpoint-url "$SOURCE_S3_ENDPOINT" s3api "$@"
}

r2() {
  AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY" \
    AWS_DEFAULT_REGION=us-east-1 aws --endpoint-url "$R2_ENDPOINT" s3 "$@"
}

copy_object() {
  local key="$1"
  local content_type
  case "$key" in
    avatars/*.jpg) content_type=image/jpeg ;;
    avatars/*.png) content_type=image/png ;;
    avatars/*.webp) content_type=image/webp ;;
    snapshots/*.zip) content_type=application/zip ;;
    current.json|revocations.json|changes/seed.json) content_type=application/json ;;
    *) echo "Unexpected public object key" >&2; exit 1 ;;
  esac
  curl --fail --location --silent --show-error --retry 3 --max-time 120 \
    "${SOURCE_S3_ENDPOINT%/}/praetorium/$key" --output "$work/object"
  r2 cp "$work/object" "s3://praetorium-catalogue/praetorium/$key" --only-show-errors \
    --content-type "$content_type"
  r2 cp "s3://praetorium-catalogue/praetorium/$key" "$work/readback" --only-show-errors
  cmp "$work/object" "$work/readback"
}

verified=0
for prefix in avatars/ snapshots/ changes/; do
  source_s3api list-objects-v2 --bucket praetorium --prefix "$prefix" --output json > "$work/list.json"
  jq -e '.IsTruncated != true and ((.Contents // []) | type == "array")' "$work/list.json" > /dev/null
  while IFS= read -r key; do
    [[ "$key" =~ ^avatars/[0-9a-f]{64}\.(jpg|png|webp)$|^snapshots/[0-9a-f]{64}\.zip$|^changes/seed\.json$ ]] || {
      echo 'Unexpected listed public object key' >&2
      exit 1
    }
    copy_object "$key"
    verified=$((verified + 1))
  done < <(jq -r '.Contents[]?.Key' "$work/list.json")
done

for key in revocations.json current.json; do
  copy_object "$key"
  verified=$((verified + 1))
done

echo "Verified $verified public-store objects in R2"

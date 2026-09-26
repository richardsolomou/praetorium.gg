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

source_s3() {
  AWS_ACCESS_KEY_ID="$SOURCE_S3_ACCESS_KEY_ID" AWS_SECRET_ACCESS_KEY="$SOURCE_S3_SECRET_ACCESS_KEY" \
    AWS_DEFAULT_REGION=us-east-1 aws --endpoint-url "$SOURCE_S3_ENDPOINT" s3 "$@"
}

r2() {
  AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY" \
    AWS_DEFAULT_REGION=us-east-1 aws --endpoint-url "$R2_ENDPOINT" s3 "$@"
}

for prefix in avatars snapshots changes combat-rule-judgments; do
  mkdir -p "$work/$prefix"
  source_s3 sync "s3://praetorium/$prefix/" "$work/$prefix/" --only-show-errors
  r2 sync "$work/$prefix/" "s3://praetorium-catalogue/praetorium/$prefix/" --only-show-errors
done

for name in current.json revocations.json; do
  source_s3 cp "s3://praetorium/$name" "$work/$name" --only-show-errors
  r2 cp "$work/$name" "s3://praetorium-catalogue/praetorium/$name" --only-show-errors \
    --content-type application/json --cache-control no-store
done

verified=0
while IFS= read -r -d '' file; do
  key="${file#"$work/"}"
  r2 cp "s3://praetorium-catalogue/praetorium/$key" "$work/readback" --only-show-errors
  cmp "$file" "$work/readback"
  verified=$((verified + 1))
done < <(find "$work" -type f ! -name readback -print0)
echo "Verified $verified public-store objects in R2"

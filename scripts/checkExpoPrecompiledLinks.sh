#!/usr/bin/env bash
# EAS links each Expo module's precompiled release framework, built against the ExpoModulesCore of its own
# release; a module newer than the installed core imports symbols core lacks, and dyld aborts at launch.
set -euo pipefail

work=$(mktemp -d)
trap 'rm -rf "${work:?}"' EXIT

binary() { find "$1" -path '*/ios-arm64/*.framework/*' -type f -perm -u+x ! -name '*.*' | head -1; }

for tarball in node_modules/.pnpm/*/node_modules/expo*/prebuilds/output/release/xcframeworks/*.tar.gz; do
  product=$(basename "$tarball" .tar.gz)
  mkdir -p "$work/$product"
  tar xzf "$tarball" -C "$work/$product"
done

nm -gU "$(binary "$work/ExpoModulesCore")" | awk '{print $3}' | sort -u > "$work/core-exports"

status=0
for dir in "$work"/*/; do
  product=$(basename "$dir")
  [ "$product" = ExpoModulesCore ] && continue
  missing=$(nm -u "$(binary "$dir")" | awk '{print $NF}' | grep '^_\$s15ExpoModulesCore' | sort -u | comm -23 - "$work/core-exports" || true)
  if [ -n "$missing" ]; then
    echo "$product imports ExpoModulesCore symbols the installed core does not export:"
    echo "$missing"
    status=1
  fi
done

if [ $status -ne 0 ]; then
  echo "Move every expo-* package in mobile/package.json to the versions the installed expo release bundles."
fi
exit $status

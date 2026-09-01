#!/bin/sh

set -eu

delivery_sha=${1:?Delivery SHA is required}
output_file=${2:?Output file is required}

skip_requested() {
  printf '%s\n' "$1" | grep -Eiq '\[(skip ci|ci skip|no ci|skip actions|actions skip|eas skip|skip eas|no eas)\]|^skip-checks:[[:space:]]*true[[:space:]]*$'
}

delivery_message=$(git show --no-patch --format=%B "$delivery_sha")
if skip_requested "$delivery_message"; then
  echo "Skipping EAS delivery requested by $delivery_sha."
  echo "current=false" >> "$output_file"
  exit 0
fi

git fetch --no-tags origin main
latest_sha=$(git rev-parse FETCH_HEAD)

if ! git merge-base --is-ancestor "$delivery_sha" "$latest_sha"; then
  echo "$delivery_sha is no longer an ancestor of main." >&2
  exit 1
fi

for candidate_sha in $(git rev-list --first-parent "$delivery_sha..$latest_sha"); do
  parent_sha=$(git rev-parse "$candidate_sha^")
  if git diff --quiet "$parent_sha" "$candidate_sha" -- .github/workflows/mobile-canary.yml .github/workflows/mobile-stable.yml mobile package.json pnpm-lock.yaml pnpm-workspace.yaml scripts/check-mobile-delivery-revision.sh scripts/finish-mobile-deliveries.sh scripts/wait-for-commit-status.sh; then
    continue
  fi

  candidate_message=$(git show --no-patch --format=%B "$candidate_sha")
  if ! skip_requested "$candidate_message"; then
    echo "Skipping superseded revision $delivery_sha."
    echo "current=false" >> "$output_file"
    exit 0
  fi
done

echo "current=true" >> "$output_file"

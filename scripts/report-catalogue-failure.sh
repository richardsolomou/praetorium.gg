#!/usr/bin/env sh
# Opens one issue when the catalogue publisher fails, and comments on it while it keeps
# failing. A scheduled job that stops publishing is otherwise found by noticing that the
# data stopped moving, which took twelve hours twice.
set -eu

run_url="${1:?run URL required}"
title='Catalogue snapshot publishing is failing'

number="$(gh issue list --state open --limit 100 --json number,title | jq -r --arg title "$title" 'first(.[] | select(.title == $title) | .number) // empty')"

if [ -n "$number" ]; then
  echo "commenting on existing issue #$number"
  gh issue comment "$number" --body "Still failing: $run_url"
  exit 0
fi

echo "opening a new issue"
gh issue create --title "$title" --label bug --body "$(
  cat <<EOF
The scheduled catalogue publisher failed, so no new snapshot was published and every
instance is still serving the last good one.

Run: $run_url

Agreement between sources no longer fails this job, so the cause is integrity or
infrastructure: an upstream that would not resolve, an incomplete snapshot, or an
archive that did not verify after upload. The failing step names which.

This issue stays open and collects a comment per failure until publishing succeeds.
EOF
)"

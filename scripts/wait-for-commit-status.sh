#!/bin/sh

set -eu

repository=${1:?Repository is required}
commit_sha=${2:?Commit SHA is required}
status_prefix=${3:?Status prefix is required}
max_attempts=${4:-1200}
attempt=1

while test "$attempt" -le "$max_attempts"; do
  if ! state=$(gh api "repos/$repository/commits/$commit_sha/status" | jq -r --arg prefix "$status_prefix" '[.statuses[] | select(.context | startswith($prefix))] | sort_by(.created_at) | last | .state // empty'); then
    echo "Could not read $status_prefix." >&2
    exit 2
  fi
  case "$state" in
    success)
      echo "$status_prefix succeeded."
      exit 0
      ;;
    error | failure)
      echo "$status_prefix finished with $state." >&2
      exit 1
      ;;
  esac
  attempt=$((attempt + 1))
  sleep 10
done

echo "Timed out waiting for $status_prefix." >&2
exit 2

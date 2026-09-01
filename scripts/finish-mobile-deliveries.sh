#!/bin/sh

set -eu

repository=${1:?Repository is required}
tag_prefix=${2:?Tag prefix is required}
workflow_name=${3:?Workflow name is required}

gh api --paginate "repos/$repository/git/matching-refs/tags/$tag_prefix" --jq '.[] | [.ref, .object.sha] | @tsv' |
  while IFS="$(printf '\t')" read -r ref commit_sha; do
    tag=${ref#refs/tags/}
    echo "Waiting for interrupted delivery $tag."
    if sh scripts/wait-for-commit-status.sh "$repository" "$commit_sha" "$workflow_name / Delivery complete $tag"; then
      :
    else
      status=$?
      if test "$status" -eq 2; then
        echo "Delivery $tag is not terminal; preserving its lock." >&2
        exit 2
      fi
    fi
    gh api --method DELETE "repos/$repository/git/refs/tags/$tag"
  done

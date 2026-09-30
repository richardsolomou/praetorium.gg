#!/usr/bin/env bash
# Says whether a release pull request still needs CI's slow jobs. It does not when the
# release commit only bumps release metadata on top of a main whose exact tree a passing
# CI run already recorded through `ci.yml`'s `validated` job. Any doubt runs everything.
set -uo pipefail

test -n "${REPO:?}"
test -n "${BASE_SHA:?}"

output="${GITHUB_OUTPUT:-/dev/stdout}"

not_proven() {
  echo "::notice::Running every job: $1"
  echo "proven=false" >> "$output"
  exit 0
}

[ "$(git rev-parse HEAD^1 2>/dev/null)" = "$BASE_SHA" ] || not_proven "the release commit does not sit directly on main"
changed="$(git diff --name-only HEAD^1 HEAD)" || not_proven "the release commit could not be compared with main"
extra="$(grep -vxE 'CHANGELOG\.md|package\.json|\.changeset/[^/]+\.md' <<< "$changed" || true)"
[ -z "$extra" ] || not_proven "the release commit changes $(tr '\n' ' ' <<< "$extra")"
cmp -s <(git show HEAD^1:package.json | jq -S 'del(.version)') <(git show HEAD:package.json | jq -S 'del(.version)') ||
  not_proven "package.json changes more than its version"

number="$(gh api "repos/$REPO/commits/$BASE_SHA/pulls" \
  --jq "map(select(.merge_commit_sha == \"$BASE_SHA\" and .head.repo.full_name == \"$REPO\"))[0].number // empty")" ||
  not_proven "the pull request behind main could not be read"
[ -n "$number" ] || not_proven "main's head is not the merge of a pull request from this repository"
head_sha="$(gh api "repos/$REPO/pulls/$number" --jq .head.sha)" || not_proven "pull request #$number could not be read"
run="$(gh api "repos/$REPO/actions/workflows/ci.yml/runs?event=pull_request&status=success&head_sha=$head_sha" \
  --jq "[.workflow_runs[] | select(.head_repository.full_name == \"$REPO\")][0].id // empty")" ||
  not_proven "the CI runs for pull request #$number could not be read"
[ -n "$run" ] || not_proven "pull request #$number has no passing CI run for its last commit"

proof="$(mktemp -d)"
gh run download "$run" --repo "$REPO" --name validated-tree --dir "$proof" > /dev/null 2>&1 ||
  not_proven "CI run $run recorded no validated tree"
[ "$(cat "$proof/tree")" = "$(git rev-parse "$BASE_SHA^{tree}")" ] ||
  not_proven "pull request #$number was tested against a different main"

echo "::notice::Main is the exact tree CI run $run validated for pull request #$number."
echo "proven=true" >> "$output"

#!/bin/sh
set -eu

destination=${1:?usage: scripts/backupRepository.sh /absolute/backup/directory}
case "$destination" in
    /*) ;;
    *) echo "backup destination must be an absolute path" >&2; exit 1 ;;
esac

repository=$(git rev-parse --show-toplevel)
mkdir -p "$destination"
destination=$(cd "$destination" && pwd -P)
case "$destination" in
    "$repository"|"$repository"/*) echo "backup destination must be outside the repository" >&2; exit 1 ;;
esac

stamp=$(date -u +%Y%m%dT%H%M%SZ)
target="$destination/praetorium-$stamp.bundle"
test ! -e "$target" || { echo "$target already exists" >&2; exit 1; }
temporary=$(mktemp "$destination/.praetorium-bundle.XXXXXX")
trap 'rm -f "$temporary"' EXIT HUP INT TERM

git -C "$repository" bundle create "$temporary" --all
git bundle verify "$temporary" >/dev/null
mv "$temporary" "$target"
trap - EXIT HUP INT TERM
echo "$target"

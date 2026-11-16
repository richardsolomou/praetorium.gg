#!/usr/bin/env bash
# Installs the SpacetimeDB backup script and timer from this checkout on HOST, or with `check` compares them read-only.
set -euo pipefail

usage='Usage: installSpacetimeBackup.sh HOST check | HOST install [CONFIG_JSON]'
host="${1:?$usage}"
mode="${2:?$usage}"
config="${3:-}"
cd "$(dirname "$0")"

files=(backupSpacetime.py spacetime-backup.service spacetime-backup.timer)
remote_config=/etc/praetorium-spacetime-backup/production.json

case "$mode" in
  check)
    expected="$(sha256sum "${files[@]}" | awk '{ print $1 }')"
    # shellcheck disable=SC2029 # The paths expand locally on purpose.
    actual="$(ssh "$host" "sha256sum /usr/local/libexec/praetorium/${files[0]} /etc/systemd/system/${files[1]} /etc/systemd/system/${files[2]} | awk '{ print \$1 }'; systemctl is-enabled spacetime-backup.timer; test -s $remote_config")"
    if [[ "$actual" != "$expected"$'\nenabled' ]]; then
      echo "$host differs from this checkout" >&2
      exit 1
    fi
    echo "$host matches this checkout"
    ;;
  install)
    [[ -z "$config" || -f "$config" ]] || { echo "$config is not a file" >&2; exit 1; }
    bundle="$(mktemp -d)"
    trap 'rm -rf "$bundle"' EXIT
    cp "${files[@]}" "$bundle/"
    # The config holds R2 credentials, so it travels only in this ssh stream and lands readable by root alone.
    [[ -z "$config" ]] || install -m 0600 "$config" "$bundle/production.json"
    cat > "$bundle/install.sh" <<'REMOTE'
set -euo pipefail
work="$(dirname "$0")"
install -d -m 0700 /usr/local/libexec/praetorium /etc/praetorium-spacetime-backup
install -m 0755 "$work/backupSpacetime.py" /usr/local/libexec/praetorium/backupSpacetime.py
install -m 0644 "$work/spacetime-backup.service" "$work/spacetime-backup.timer" /etc/systemd/system/
[[ ! -f "$work/production.json" ]] || install -m 0600 "$work/production.json" /etc/praetorium-spacetime-backup/production.json
python3 -B -c 'import json, sys; sys.path.insert(0, "/usr/local/libexec/praetorium"); import backupSpacetime; backupSpacetime.BackupConfig(**json.load(open("/etc/praetorium-spacetime-backup/production.json")))'
systemctl daemon-reload
systemctl enable --now spacetime-backup.timer
systemctl list-timers spacetime-backup.timer --no-pager
REMOTE
    COPYFILE_DISABLE=1 tar -c -C "$bundle" . | ssh "$host" 'set -e; umask 077; work="$(mktemp -d)"; trap "rm -rf \"$work\"" EXIT; tar -x -C "$work"; bash "$work/install.sh"'
    ;;
  *)
    echo "$usage" >&2
    exit 1
    ;;
esac

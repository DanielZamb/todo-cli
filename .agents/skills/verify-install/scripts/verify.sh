#!/bin/sh
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")/../../../.." && pwd)
evidence=${1:?Pass a new absolute evidence directory}
case "$evidence" in /*) ;; *) echo 'Evidence path must be absolute' >&2; exit 2 ;; esac
[ ! -e "$evidence" ] || { echo 'Choose a new evidence directory' >&2; exit 2; }
mkdir -p "$evidence"
scratch=$(mktemp -d "${TMPDIR:-/tmp}/todo-r01-verify-XXXXXX")
trap 'rm -rf "$scratch"' EXIT HUP INT TERM
python3 "$root/.agents/skills/verify-install/scripts/drive.py" "$scratch" "$evidence"
rm -rf "$scratch"
test ! -e "$scratch"
for file in commands.log result.json golden-move.json cli/goldens.json server/result.json; do
  test -s "$evidence/$file"
done
printf 'PASS; evidence survived cleanup: %s\n' "$evidence"

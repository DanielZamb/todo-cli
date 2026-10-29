#!/bin/sh
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")/../../../.." && pwd)
evidence=${1:?Pass a new absolute evidence directory}
case "$evidence" in /*) ;; *) echo 'Evidence path must be absolute' >&2; exit 1 ;; esac
[ ! -e "$evidence" ] || { echo 'Choose a new evidence directory' >&2; exit 1; }
mkdir -p "$evidence"
scratch=$(mktemp -d "${TMPDIR:-/tmp}/todo-s04-parser-XXXXXX")
trap 'rm -rf "$scratch"' EXIT HUP INT TERM
{
  printf 'bun build --compile packages/domain/scripts/verify-quick-add.ts --outfile %s/parser\n' "$scratch"
  (cd "$scratch" && bun build --compile "$root/packages/domain/scripts/verify-quick-add.ts" --outfile "$scratch/parser")
  printf '%s/parser %s\n' "$scratch" "$evidence"
  "$scratch/parser" "$evidence"
} > "$evidence/commands.log" 2>&1
rm -rf "$scratch"
[ ! -e "$scratch" ]
test -s "$evidence/actions.json"
test -s "$evidence/result.json"
echo 'PASS; evidence survived cleanup'

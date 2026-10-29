#!/bin/sh
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")/../../../.." && pwd)
evidence=${1:?Pass a new absolute evidence directory}
cli=${2:?Pass the absolute path to the compiled Effect Todo CLI}
case "$evidence" in /*) ;; *) echo 'Evidence path must be absolute' >&2; exit 1 ;; esac
case "$cli" in /*) ;; *) echo 'CLI path must be absolute' >&2; exit 1 ;; esac
[ -x "$cli" ] || { echo 'Compiled CLI is missing' >&2; exit 1; }
[ ! -e "$evidence" ] || { echo 'Choose a new evidence directory' >&2; exit 1; }
mkdir -p "$evidence"
scratch=$(mktemp -d "${TMPDIR:-/tmp}/todo-s01-verify-XXXXXX")
trap 'rm -rf "$scratch"' EXIT HUP INT TERM
cd "$root"
{
  printf 'bun build --compile apps/server/src/main.ts --outfile %s/server\n' "$scratch"
  (cd "$scratch" && bun build --compile "$root/apps/server/src/main.ts" --outfile "$scratch/server")
  printf 'bun build --compile apps/server/scripts/seed-verification.ts --outfile %s/seed\n' "$scratch"
  (cd "$scratch" && bun build --compile "$root/apps/server/scripts/seed-verification.ts" --outfile "$scratch/seed")
  printf 'Copy development CLI %s to %s/todo\n' "$cli" "$scratch"
  cp "$cli" "$scratch/todo"
  python3 .agents/skills/verify-sse/scripts/provenance.py "$cli" "$scratch" "$evidence"
  printf '%s/seed %s\n' "$scratch" "$scratch"
  "$scratch/seed" "$scratch"
  printf 'TODO_DB=%s/scratch.db TODO_PORT=0 %s/server\n' "$scratch" "$scratch"
  python3 .agents/skills/verify-sse/scripts/drive.py "$scratch" "$evidence"
  sqlite3 "$scratch/scratch.db" .dump > "$evidence/database.sql"
} > "$evidence/commands.log" 2>&1
rm -rf "$scratch"
[ ! -e "$scratch" ]
for file in actions.json result.json database.sql provenance.json initial.sse resumed.sse durable-history.json cleanup.json; do
  test -s "$evidence/$file"
done
printf 'PASS; evidence survived cleanup\n'

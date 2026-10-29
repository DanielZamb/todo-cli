#!/bin/sh
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")/../../../.." && pwd)
evidence=${1:?Pass a new absolute evidence directory}
case "$evidence" in /*) ;; *) echo 'Evidence path must be absolute' >&2; exit 1 ;; esac
[ ! -e "$evidence" ] || { echo 'Choose a new evidence directory' >&2; exit 1; }
mkdir -p "$evidence"
scratch=$(mktemp -d "${TMPDIR:-/tmp}/todo-s01-verify-XXXXXX")
trap 'rm -rf "$scratch"' EXIT HUP INT TERM
mkdir -p "$scratch/home"
export HOME="$scratch/home"
server=${TODO_SERVER_BINARY:-$scratch/server}
case "$server" in /*) ;; *) echo 'TODO_SERVER_BINARY must be absolute' >&2; exit 2 ;; esac
cd "$root"
{
  if [ -z "${TODO_SERVER_BINARY:-}" ]; then
    printf 'bun build --compile apps/server/src/main.ts --outfile %s\n' "$server"
    (cd "$scratch" && bun build --compile "$root/apps/server/src/main.ts" --outfile "$server")
  fi
  test -x "$server"
  printf 'bun build --compile apps/server/scripts/seed-verification.ts --outfile %s/seed\n' "$scratch"
  (cd "$scratch" && bun build --compile "$root/apps/server/scripts/seed-verification.ts" --outfile "$scratch/seed")
  printf '%s/seed %s\n' "$scratch" "$scratch"
  "$scratch/seed" "$scratch"
  printf 'HOME=%s TODO_DB=%s/scratch.db TODO_PORT=0 %s\n' "$HOME" "$scratch" "$server"
  TODO_SERVER_BINARY="$server" python3 .agents/skills/verify-server-api/scripts/drive.py "$scratch" "$evidence"
  sqlite3 "$scratch/scratch.db" .dump > "$evidence/database.sql"
} > "$evidence/commands.log" 2>&1
rm -rf "$scratch"
[ ! -e "$scratch" ]
test -s "$evidence/actions.json"
test -s "$evidence/database.sql"
test -s "$evidence/durable-state.json"
test -s "$evidence/result.json"
echo 'PASS; evidence survived cleanup'

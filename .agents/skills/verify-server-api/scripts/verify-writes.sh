#!/bin/sh
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")/../../../.." && pwd)
evidence=${1:?Pass a new absolute evidence directory}
case "$evidence" in /*) ;; *) echo 'Evidence path must be absolute' >&2; exit 1 ;; esac
[ ! -e "$evidence" ] || { echo 'Choose a new evidence directory' >&2; exit 1; }
mkdir -p "$evidence"
scratch=$(mktemp -d "${TMPDIR:-/tmp}/todo-s01-verify-XXXXXX")
trap 'rm -rf "$scratch"' EXIT HUP INT TERM
cd "$root"
{
  if [ -n "${TODO_SERVER_BINARY:-}" ]; then
    printf 'reuse compiled server %s\n' "$TODO_SERVER_BINARY"
    ln -s "$TODO_SERVER_BINARY" "$scratch/server"
  else
    printf 'bun build --compile apps/server/src/main.ts --outfile %s/server\n' "$scratch"
    (cd "$scratch" && bun build --compile "$root/apps/server/src/main.ts" --outfile "$scratch/server")
  fi
  if [ -n "${TODO_SEED_BINARY:-}" ]; then
    printf 'reuse compiled seed %s\n' "$TODO_SEED_BINARY"
    ln -s "$TODO_SEED_BINARY" "$scratch/seed"
  else
    printf 'bun build --compile apps/server/scripts/seed-verification.ts --outfile %s/seed\n' "$scratch"
    (cd "$scratch" && bun build --compile "$root/apps/server/scripts/seed-verification.ts" --outfile "$scratch/seed")
  fi
  printf '%s/seed %s client-reads\n' "$scratch" "$scratch"
  "$scratch/seed" "$scratch" client-reads
  printf 'TODO_DB=%s/scratch.db TODO_PORT=0 %s/server\n' "$scratch" "$scratch"
  python3 .agents/skills/verify-server-api/scripts/drive-writes.py "$scratch" "$evidence"
  printf '%s/seed %s replay\n' "$scratch" "$scratch"
  "$scratch/seed" "$scratch" replay > "$evidence/replay.json"
  sqlite3 "$scratch/scratch.db" .dump > "$evidence/database.sql"
  python3 .agents/skills/verify-server-api/scripts/drive-writes-regressions.py "$scratch" "$evidence/regressions"
} > "$evidence/commands.log" 2>&1
rm -rf "$scratch"
[ ! -e "$scratch" ]
test -s "$evidence/actions.json"
test -s "$evidence/database.sql"
test -s "$evidence/durable-state.json"
test -s "$evidence/result.json"
test -s "$evidence/replay.json"
test -s "$evidence/work.sse"
test -s "$evidence/personal.sse"
test -s "$evidence/regressions/result.json"
echo 'PASS; evidence survived cleanup'

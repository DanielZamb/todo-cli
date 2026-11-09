#!/bin/sh
set -u
root=$(CDPATH= cd -- "$(dirname -- "$0")/../../.." && pwd)
cd "$root" || exit 1
before=${1:?before manifest}
after=${2:?after manifest}
evidence=${3:?fresh evidence directory}
mkdir -p "$evidence" || exit 1
CACHE_ORACLE_CLI=$(bun -e 'process.stdout.write((await Bun.file(process.argv[1]).json()).cli)' "$before")
export CACHE_ORACLE_CLI
for run in 1 2 3 4 5; do
  uptime > "$evidence/before-$run.load"
  bun .agents/skills/verify-task-search-cache/measure.mjs "$before" "$evidence/before-$run" before
  rc=$?
  printf '%s\n' "$rc" > "$evidence/before-$run.exit"
  [ "$rc" -eq 0 ] || exit "$rc"
  uptime > "$evidence/after-$run.load"
  bun .agents/skills/verify-task-search-cache/measure.mjs "$after" "$evidence/after-$run" after
  rc=$?
  printf '%s\n' "$rc" > "$evidence/after-$run.exit"
  [ "$rc" -eq 0 ] || exit "$rc"
done

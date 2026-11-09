#!/bin/sh
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")/../../../.." && pwd)
evidence=${1:?Pass a fresh absolute evidence directory}
case "$evidence" in /*) ;; *) exit 2 ;; esac
[ ! -e "$evidence" ] || { echo 'Choose a fresh evidence directory' >&2; exit 2; }
mkdir -p "$evidence"
cd "$root"
pnpm --filter @todo/domain test discovery.test.ts > "$evidence/domain.log" 2>&1
bun .agents/skills/verify-discovery/scripts/properties.ts "$evidence/properties" > "$evidence/properties.log" 2>&1
sh /Users/zambamon/Work/todo-cli/scripts/disk-guard.sh > "$evidence/disk.log"
bun .agents/skills/verify-cli/scripts/cache-binaries.ts > "$evidence/build.log" 2>&1
bun .agents/skills/verify-discovery/scripts/drive.ts "$evidence/compiled" > "$evidence/drive.log" 2>&1
test -s "$evidence/compiled/cleanup.json"
test -s "$evidence/compiled/result.json"
printf 'PASS; evidence survived cleanup: %s\n' "$evidence"

#!/bin/sh
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")/../../../.." && pwd)
evidence=${1:?Pass a fresh absolute evidence directory}
case "$evidence" in /*) ;; *) exit 2 ;; esac
[ ! -e "$evidence" ] || { echo 'Choose a fresh evidence directory' >&2; exit 2; }
free_kib=$(df -k /System/Volumes/Data | awk 'NR == 2 { print $4 }')
[ "$free_kib" -ge 31457280 ] || { echo "SOFT DISK STOP: $free_kib KiB free; retire owned superseded binaries, report and wait" >&2; exit 3; }
mkdir -p "$evidence"
cd "$root"
pnpm --filter @todo/domain test discovery.test.ts profile-resolution.test.ts > "$evidence/domain.log" 2>&1
bun .agents/skills/verify-discovery/scripts/properties.ts "$evidence/properties" > "$evidence/properties.log" 2>&1
sh "$root/scripts/disk-guard.sh" > "$evidence/disk.log"
bun .agents/skills/verify-cli/scripts/cache-binaries.ts > "$evidence/build.log" 2>&1
bun .agents/skills/verify-discovery/scripts/drive.ts "$evidence/compiled" > "$evidence/drive.log" 2>&1
bun .agents/skills/verify-discovery/scripts/run-review-boundaries.ts "$evidence/boundaries" > "$evidence/boundaries.log" 2>&1
bun .agents/skills/verify-discovery/scripts/run-review-boundaries.ts "$evidence/enrichment-history" enrichment-history > "$evidence/enrichment-history.log" 2>&1
test -s "$evidence/compiled/cleanup.json"
test -s "$evidence/compiled/result.json"
test -s "$evidence/enrichment-history/result.json"
printf 'PASS; evidence survived cleanup: %s\n' "$evidence"

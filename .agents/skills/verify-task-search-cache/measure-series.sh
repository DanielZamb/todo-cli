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
check_disk() {
  df -k /System/Volumes/Data > "$evidence/$1.df" || return 1
  disk_free_kib=$(awk 'NR==2 {print $4}' "$evidence/$1.df")
  case "$disk_free_kib" in ''|*[!0-9]*) return 1 ;; esac
  if [ "$disk_free_kib" -lt 29296875 ]; then
    printf 'ORDER29 HOLD: %s KiB available\n' "$disk_free_kib" > "$evidence/disk-hold.txt"
    return 75
  fi
}
check_disk preflight
rc=$?
[ "$rc" -eq 0 ] || exit "$rc"
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
  printf '%s\n' "$run" > "$evidence/last-complete-pair"
  check_disk "pair-$run"
  rc=$?
  [ "$rc" -eq 0 ] || exit "$rc"
done

#!/bin/sh
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")/../../../.." && pwd)
evidence=${1:?Pass a new absolute evidence directory}
case "$evidence" in /*) ;; *) echo 'Evidence must be absolute' >&2; exit 1 ;; esac
[ ! -e "$evidence" ] || { echo 'Choose a fresh evidence directory' >&2; exit 1; }
command -v bun >/dev/null
command -v python3 >/dev/null
command -v curl >/dev/null
[ "$(uname -s)" = Darwin ] || { echo 'Real launchd proof requires macOS' >&2; exit 1; }
mkdir -p "$evidence"
scratch=$(mktemp -d "${TMPDIR:-/tmp}/todo-s03-verify-XXXXXX")
trap 'if [ ! -e "$scratch/launchd-active" ]; then rm -rf "$scratch"; else echo "LaunchAgent cleanup failed; retained $scratch" >&2; fi' EXIT HUP INT TERM
cd "$root"
{
  printf 'bun build --compile apps/server/src/main.ts --outfile %s/todo-server\n' "$scratch"
  (cd "$scratch" && bun build --compile "$root/apps/server/src/main.ts" --outfile "$scratch/todo-server")
  printf 'bun build --compile apps/server/scripts/scheduler-fixture.ts --outfile %s/fixture\n' "$scratch"
  (cd "$scratch" && bun build --compile "$root/apps/server/scripts/scheduler-fixture.ts" --outfile "$scratch/fixture")
  printf 'python3 .agents/skills/verify-scheduler/scripts/drive.py %s %s\n' "$scratch" "$evidence"
  python3 .agents/skills/verify-scheduler/scripts/drive.py "$scratch" "$evidence"
} > "$evidence/commands.log" 2>&1
rm -rf "$scratch"
[ ! -e "$scratch" ]
for file in actions.json database.sql restart-and-competition.json credential-cleanup.json changed-due.json authenticated-sse.json shared-contract.json openapi.json resumed.sse replay.json agent.plist result.json; do
  test -s "$evidence/$file"
done
echo 'PASS; evidence survived cleanup'

#!/bin/sh
set -eu
repo=$(CDPATH= cd -- "$(dirname -- "$0")/../../../.." && pwd)
evidence=${1:?Pass an absolute evidence directory outside scratch}
case "$evidence" in /*) ;; *) echo 'Evidence path must be absolute' >&2; exit 2;; esac
mkdir -p "$evidence"
scratch=$(mktemp -d "${TMPDIR:-/tmp/}todo-c03-verify-XXXXXX")
cleanup() { rm -rf -- "$scratch"; }
trap cleanup EXIT HUP INT TERM
cd "$repo"
exec 3>&1 4>&2
exec >"$evidence/commands.log" 2>&1
set -x
command -v bun
bun --version
command -v sqlite3
(cd "$scratch" && bun build --compile "$repo/packages/domain/scripts/verify-recurrence.ts" --outfile "$scratch/verify-recurrence")
bun build --target=browser "$repo/packages/domain/test/fixtures/browser-task.ts" --outfile "$scratch/browser-task.js"
"$scratch/verify-recurrence" "$scratch" "$evidence"
cleanup
test -s "$evidence/01-dst.json"
test -s "$evidence/03-replay.json"
test -s "$evidence/04-review-fixes.json"
test -s "$evidence/result.json"
set +x
echo "PASS; evidence survived cleanup: $evidence" >&3

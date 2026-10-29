#!/bin/sh
set -eu
repo=$(CDPATH= cd -- "$(dirname -- "$0")/../../../.." && pwd)
evidence=${1:?Pass an absolute evidence directory outside scratch}
case "$evidence" in /*) ;; *) echo 'Evidence path must be absolute' >&2; exit 2;; esac
mkdir -p "$evidence"
scratch=$(mktemp -d "${TMPDIR:-/tmp/}todo-c02-verify-XXXXXX")
cleanup() { rm -rf -- "$scratch"; }
trap cleanup EXIT HUP INT TERM
cd "$repo"
exec 3>&1 4>&2
exec >"$evidence/commands.log" 2>&1
set -x
command -v bun
bun --version
command -v sqlite3
bun build --target=browser "$repo/packages/domain/test/fixtures/browser-task.ts" --outfile "$scratch/browser-task.js"
(cd "$scratch" && bun build --compile "$repo/packages/domain/scripts/verify-op-log.ts" --outfile "$scratch/verify-op-log")
"$scratch/verify-op-log" "$scratch" "$evidence"
cleanup
test -s "$evidence/00-legacy.sql"
test -s "$evidence/05-revert.sql"
test -s "$evidence/result.json"
test -s "$evidence/purge.json"
test -s "$evidence/shared-purge.json"
set +x
echo "PASS; evidence survived cleanup: $evidence" >&3

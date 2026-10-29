#!/bin/sh
set -eu
repo=$(CDPATH= cd -- "$(dirname -- "$0")/../../../.." && pwd)
evidence=${1:?Pass an absolute evidence directory outside scratch}
case "$evidence" in /*) ;; *) echo 'Evidence path must be absolute' >&2; exit 2;; esac
mkdir -p "$evidence"
scratch=$(mktemp -d "${TMPDIR:-/tmp/}todo-c04-verify-XXXXXX")
cleanup() { rm -rf -- "$scratch"; }
trap cleanup EXIT HUP INT TERM
cd "$repo"
exec 3>&1 4>&2
exec >"$evidence/commands.log" 2>&1
set -x
command -v bun
bun --version
command -v sqlite3
(cd "$scratch" && bun build --compile "$repo/packages/domain/scripts/verify-auth.ts" --outfile "$scratch/verify-auth")
"$scratch/verify-auth" "$scratch" "$evidence"
cleanup
test ! -e "$scratch"
test -s "$evidence/01-issued.sql"
test -s "$evidence/02-recurrence.sql"
test -s "$evidence/02-recurrence.json"
test -s "$evidence/05-reopened.sql"
test -s "$evidence/06-symlink.json"
test -s "$evidence/06-symlink.sql"
test -s "$evidence/actions.json"
test -s "$evidence/result.json"
set +x
echo "PASS; evidence survived cleanup: $evidence" >&3

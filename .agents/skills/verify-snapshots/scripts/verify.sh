#!/bin/sh
set -eu
repo=$(CDPATH= cd -- "$(dirname -- "$0")/../../../.." && pwd)
evidence=${1:?Pass an absolute evidence directory}
case "$evidence" in /*) ;; *) exit 2;; esac
mkdir -p "$evidence"
scratch=$(mktemp -d "${TMPDIR:-/tmp/}todo-f13-verify-XXXXXX")
trap 'rm -rf -- "$scratch"' EXIT HUP INT TERM
cd "$repo"
exec 3>&1
exec >"$evidence/commands.log" 2>&1
set -x
bun --version
if [ -n "${TODO_CLI_BINARY:-}" ]; then
  ln -s "$TODO_CLI_BINARY" "$scratch/todo"
else
  (cd "$scratch" && bun build --compile "$repo/apps/cli/src/main.ts" --outfile "$scratch/todo")
fi
(cd "$scratch" && bun build --compile "$repo/packages/domain/scripts/verify-snapshots.ts" --outfile "$scratch/drive")
HOME="$scratch" "$scratch/todo" --version
HOME="$scratch" "$scratch/drive" "$scratch" "$evidence"
if [ -n "${TODO_SERVER_BINARY:-}" ]; then
  ln -s "$TODO_SERVER_BINARY" "$scratch/server"
else
  (cd "$scratch" && bun build --compile "$repo/apps/server/src/main.ts" --outfile "$scratch/server")
fi
(cd "$scratch" && bun build --compile "$repo/apps/server/scripts/verify-snapshots.ts" --outfile "$scratch/http-drive")
HOME="$scratch" "$scratch/http-drive" "$scratch" "$evidence"
(cd "$scratch" && bun build --compile "$repo/packages/domain/scripts/snapshot-restore-proof.ts" --outfile "$scratch/restore-proof")
HOME="$scratch" "$scratch/restore-proof" "$scratch" "$evidence" privacy
HOME="$scratch" "$scratch/restore-proof" "$scratch" "$evidence" manifest
HOME="$scratch" "$scratch/restore-proof" "$scratch" "$evidence" schema
HOME="$scratch" "$scratch/restore-proof" "$scratch" "$evidence" attachments
rm -rf -- "$scratch"
test -s "$evidence/result.json"
set +x
echo "PASS; evidence survived cleanup: $evidence" >&3

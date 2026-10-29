#!/bin/sh
set -eu
root=$(git rev-parse --show-toplevel)
evidence=$1
case "$evidence" in /*) ;; *) exit 2 ;; esac
test ! -e "$evidence"
mkdir -p "$evidence"
scratch=$(mktemp -d -t todo-f10-verify-)
cleanup() { node -e 'require("fs").rmSync(process.argv[1],{recursive:true,force:true})' "$scratch"; }
trap cleanup EXIT INT TERM
cd "$root"
{
 if [ -n "${TODO_CLI_BINARY:-}" ]; then cp "$TODO_CLI_BINARY" "$scratch/todo"; else bun build --compile apps/cli/src/main.ts --outfile "$scratch/todo"; fi
 if [ -n "${TODO_SERVER_BINARY:-}" ]; then cp "$TODO_SERVER_BINARY" "$scratch/server"; else bun build --compile apps/server/src/main.ts --outfile "$scratch/server"; fi
 bun build --compile packages/domain/scripts/verify-profiles.ts --outfile "$scratch/drive"
 "$scratch/drive" "$scratch" "$evidence"
} >"$evidence/commands.log" 2>&1
cleanup
trap - EXIT INT TERM
test -s "$evidence/result.json"
echo 'PASS; evidence survived cleanup'

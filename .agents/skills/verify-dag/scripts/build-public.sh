#!/bin/sh
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")/../../../.." && pwd)
evidence=${1:?Pass an absolute evidence directory}
case "$evidence" in /*) ;; *) exit 2 ;; esac
mkdir -p "$evidence" "$root/.scratch/bin"
cd "$root"
sh "$root/scripts/disk-guard.sh" > "$evidence/disk.log"
hash=$(rg --files apps/cli/src apps/server/src packages/domain/src packages/api/src pnpm-lock.yaml | LC_ALL=C sort | xargs shasum -a 256 | shasum -a 256 | cut -d ' ' -f 1)
cli="$root/.scratch/bin/todo-$hash"
server="$root/.scratch/bin/todo-server-$hash"
if [ ! -x "$cli" ]; then bun scripts/compile.ts apps/cli/src/main.ts "$cli" > "$evidence/cli-build.log" 2>&1; fi
if [ ! -x "$server" ]; then bun scripts/compile.ts apps/server/src/main.ts "$server" > "$evidence/server-build.log" 2>&1; fi
git rev-parse HEAD > "$evidence/commit.txt"
git status --short > "$evidence/worktree.txt"
printf '%s\n' "$hash" > "$evidence/source-hash.txt"
shasum -a 256 "$cli" "$server" > "$evidence/binary-hashes.txt"
printf '%s\n%s\n' "$cli" "$server" > "$evidence/binaries.txt"
cat "$evidence/binaries.txt"

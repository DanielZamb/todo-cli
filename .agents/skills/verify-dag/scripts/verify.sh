#!/bin/sh
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")/../../../.." && pwd)
evidence=${1:?Pass an absolute evidence directory}
case "$evidence" in /*) ;; *) exit 2 ;; esac
mkdir -p "$evidence" "$root/.scratch/bin"
scratch=$(mktemp -d -t todo-dag-verify)
trap 'rm -rf "$scratch"' EXIT HUP INT TERM
cd "$root"
hash=$(find packages/domain/src packages/domain/scripts -name '*.ts' -type f -exec shasum -a 256 {} + | shasum -a 256 | cut -d ' ' -f 1)
binary="$root/.scratch/bin/verify-dag-$hash"
if [ ! -x "$binary" ]; then
  bun build --compile packages/domain/scripts/verify-dag.ts --outfile "$binary" > "$evidence/build.log" 2>&1
fi
printf '%s\n' "$binary drive $scratch $evidence" > "$evidence/commands.log"
git rev-parse HEAD > "$evidence/commit.txt"
set +e
"$binary" drive "$scratch" "$evidence" >> "$evidence/commands.log" 2>&1
rc=$?
set -e
printf '%s\n' "$rc" > "$evidence/exit-code.txt"
if [ "$rc" -ne 0 ]; then cat "$evidence/commands.log"; exit "$rc"; fi
rm -rf "$scratch"
trap - EXIT HUP INT TERM
test -s "$evidence/result.json"
test -s "$evidence/race.json"
echo 'PASS; evidence survived cleanup'

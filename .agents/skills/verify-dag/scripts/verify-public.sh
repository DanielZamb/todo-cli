#!/bin/sh
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")/../../../.." && pwd)
evidence=${1:?Pass a new absolute evidence directory}
case "$evidence" in /*) ;; *) exit 2 ;; esac
[ ! -e "$evidence" ] || { echo 'Choose fresh evidence' >&2; exit 2; }
mkdir -p "$evidence"
cd "$root"
if [ -z "${TODO_CLI_BINARY:-}" ] || [ -z "${TODO_SERVER_BINARY:-}" ]; then
  .agents/skills/verify-dag/scripts/build-public.sh "$evidence/build" > "$evidence/binaries.txt"
  cli=$(sed -n '1p' "$evidence/binaries.txt")
  server=$(sed -n '2p' "$evidence/binaries.txt")
else
  cli=$TODO_CLI_BINARY
  server=$TODO_SERVER_BINARY
fi
hash=$(rg --files packages/domain/src packages/domain/scripts packages/api/src | LC_ALL=C sort | xargs shasum -a 256 | shasum -a 256 | cut -d ' ' -f 1)
driver="$root/.scratch/bin/verify-dag-public-$hash"
if [ ! -x "$driver" ]; then
  sh scripts/disk-guard.sh > "$evidence/disk.log"
  bun build --compile packages/domain/scripts/verify-dag-public.ts --outfile "$driver" > "$evidence/driver-build.log" 2>&1
fi
git rev-parse HEAD > "$evidence/commit.txt"
set +e
"$driver" "$cli" "$server" "$evidence" > "$evidence/commands.log" 2>&1
rc=$?
set -e
printf '%s\n' "$rc" > "$evidence/exit-code.txt"
if [ "$rc" -ne 0 ]; then cat "$evidence/commands.log"; exit "$rc"; fi
test -s "$evidence/result.json"
test -s "$evidence/cleanup.json"
echo 'PASS; public CLI and HTTP proof survived cleanup'

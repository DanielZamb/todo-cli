#!/bin/sh
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")/../../../.." && pwd)
evidence=${1:?Pass a fresh absolute evidence directory}
case "$evidence" in /*) ;; *) exit 2 ;; esac
[ ! -e "$evidence" ] || { echo 'Choose fresh evidence' >&2; exit 2; }
mkdir -p "$evidence" "$root/.scratch/bin"
cd "$root"
if [ -z "${TODO_CLI_BINARY:-}" ]; then
  .agents/skills/verify-dag/scripts/build-public.sh "$evidence/build" > "$evidence/binaries.txt"
  cli=$(sed -n '1p' "$evidence/binaries.txt")
else
  cli=$TODO_CLI_BINARY
fi
hash=$(rg --files packages/domain/src packages/domain/scripts packages/domain/test/fixtures/dag | LC_ALL=C sort | xargs shasum -a 256 | shasum -a 256 | cut -d ' ' -f 1)
for name in graph-response dag-cli-input; do
  driver="$root/.scratch/bin/$name-$hash"
  if [ ! -x "$driver" ]; then
    sh scripts/disk-guard.sh > "$evidence/$name-disk.log"
    bun build --compile "packages/domain/scripts/$name-proof.ts" --outfile "$driver" > "$evidence/$name-build.log" 2>&1
  fi
  set +e
  if [ "$name" = graph-response ]; then
    "$driver" "${TODO_GRAPH_RESPONSE_MODE:-after}" "$cli" "$evidence/$name" > "$evidence/$name.log" 2>&1
  else
    "$driver" "$cli" "$evidence/$name" > "$evidence/$name.log" 2>&1
  fi
  rc=$?
  set -e
  printf '%s\n' "$rc" > "$evidence/$name-exit.txt"
  if [ "$rc" -ne 0 ]; then cat "$evidence/$name.log"; exit "$rc"; fi
done
git rev-parse HEAD > "$evidence/commit.txt"
echo 'PASS; graph response and CLI usage closure proofs'

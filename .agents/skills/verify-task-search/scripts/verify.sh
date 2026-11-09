#!/bin/sh
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")/../../../.." && pwd)
evidence=${1:?Pass a fresh absolute evidence directory}
case "$evidence" in /*) ;; *) echo 'Evidence must be absolute' >&2; exit 2 ;; esac
[ ! -e "$evidence" ] || { echo 'Choose a fresh evidence directory' >&2; exit 2; }
mkdir -p "$evidence"
cd "$root"
pnpm --filter @todo/domain test task-search.test.ts task-search-yield.test.ts task-search-equivalence.test.ts task-search-preparation.test.ts > "$evidence/domain.log" 2>&1
bun .agents/skills/verify-cli/scripts/cache-binaries.ts > "$evidence/build.log" 2>&1
cp .scratch/bin/build.json "$evidence/binary-provenance.json"
TODO_CLI_BINARY=$(bun -e 'process.stdout.write(JSON.parse(require("node:fs").readFileSync(".scratch/bin/build.json","utf8")).cli)')
TODO_SERVER_BINARY=$(bun -e 'process.stdout.write(JSON.parse(require("node:fs").readFileSync(".scratch/bin/build.json","utf8")).server)')
export TODO_CLI_BINARY TODO_SERVER_BINARY
TODO_BINARY_PROVENANCE="$root/.scratch/bin/build.json"
export TODO_BINARY_PROVENANCE
HOME="$evidence/doctor-home" TODO_DB="$evidence/unused.db" "$TODO_CLI_BINARY" --version > "$evidence/doctor.log" 2>&1
.agents/skills/verify-filters/scripts/verify.sh "$evidence/compiled" > "$evidence/drive.log" 2>&1
test -s "$evidence/compiled/task-search.json"
test -s "$evidence/compiled/result.json"
printf 'PASS; evidence survived cleanup: %s\n' "$evidence"

#!/bin/sh
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")/../../../.." && pwd)
evidence=${1:?Pass a new absolute evidence directory}
case "$evidence" in /*) ;; *) echo 'Evidence directory must be absolute' >&2; exit 2 ;; esac
[ ! -e "$evidence" ] || { echo 'Choose a new evidence directory' >&2; exit 2; }
cd "$root"
bun .agents/skills/verify-cli/scripts/cache-binaries.ts
TODO_CLI_BINARY=$(bun -p 'JSON.parse(require("fs").readFileSync(".scratch/bin/build.json")).cli')
TODO_SERVER_BINARY=$(bun -p 'JSON.parse(require("fs").readFileSync(".scratch/bin/build.json")).server')
export TODO_CLI_BINARY TODO_SERVER_BINARY
.agents/skills/verify-cli/scripts/verify.sh "$evidence"
cp .scratch/bin/build.json "$evidence/build.json"

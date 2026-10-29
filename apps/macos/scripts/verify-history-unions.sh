#!/bin/sh
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")/../../.." && pwd)
evidence=${1:?Pass a new absolute evidence directory}
case "$evidence" in /*) ;; *) echo 'Evidence must be absolute' >&2; exit 1 ;; esac
[ ! -e "$evidence" ] || { echo 'Choose fresh evidence' >&2; exit 1; }
: "${TODO_CLI_BINARY:?Set a compiled scratch CLI binary}"
: "${TODO_SERVER_BINARY:?Set a compiled scratch server binary}"
cd "$root"
python3 apps/macos/scripts/test_normalize_openapi.py
bun apps/server/scripts/verify-swift-union.ts "$evidence"
swift run --package-path apps/macos/API --disable-automatic-resolution UnionContractProof "$evidence/history.json" "$evidence/global-operations.json" "$evidence/all-event-kinds.json" > "$evidence/swift-result.json" 2> "$evidence/swift-build.log"
echo 'PASS; real scratch History and generated Swift unions'

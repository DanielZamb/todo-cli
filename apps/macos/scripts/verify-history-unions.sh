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
# Built, then checked for Keychain calls (apps/macos/scripts/state_package.py), then run.
swift build --jobs 2 --package-path apps/macos/API --disable-automatic-resolution --product UnionContractProof > "$evidence/swift-build.log" 2>&1
python3 apps/macos/scripts/state_package.py guard apps/macos/API/.build/debug/UnionContractProof "$evidence/keychain-guard.json" > /dev/null
swift run --skip-build --package-path apps/macos/API --disable-automatic-resolution UnionContractProof "$evidence/history.json" "$evidence/global-operations.json" "$evidence/all-event-kinds.json" > "$evidence/proof.json" 2>> "$evidence/swift-build.log"
python3 -c 'import json,sys; r=json.load(open(sys.argv[1])); r["keychain_accessed"]=json.load(open(sys.argv[2]))["keychainLinked"]; r["keychain_guard"]="keychain-guard.json"; print(json.dumps(r, sort_keys=True))' "$evidence/proof.json" "$evidence/keychain-guard.json" > "$evidence/swift-result.json"
echo 'PASS; real scratch History and generated Swift unions'

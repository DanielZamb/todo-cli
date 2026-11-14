#!/bin/sh
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")/../../.." && pwd)
evidence=${1:?Pass a new absolute evidence directory}
fixture=${2:?Pass an absolute redacted scratch HTTP History receipt}
case "$evidence" in /*) ;; *) echo 'Evidence must be absolute' >&2; exit 1 ;; esac
case "$fixture" in /*) ;; *) echo 'Fixture must be absolute' >&2; exit 1 ;; esac
[ ! -e "$evidence" ] || { echo 'Choose fresh evidence' >&2; exit 1; }
"$root/scripts/disk-guard.sh"
mkdir -p "$evidence"
cp "$fixture" "$evidence/history.json"
printf 'swift run --package-path apps/macos/API --disable-automatic-resolution -c release PurgeContractProof <scratch-http-history>\n' > "$evidence/commands.log"
# Built, then checked for Keychain calls (apps/macos/scripts/state_package.py), then run.
swift build --package-path "$root/apps/macos/API" --disable-automatic-resolution -c release --product PurgeContractProof 2>> "$evidence/commands.log"
python3 "$root/apps/macos/scripts/state_package.py" guard "$root/apps/macos/API/.build/release/PurgeContractProof" "$evidence/keychain-guard.json" > /dev/null
swift run --skip-build --package-path "$root/apps/macos/API" --disable-automatic-resolution -c release PurgeContractProof "$evidence/history.json" > "$evidence/proof.json" 2>> "$evidence/commands.log"
python3 -c 'import json,sys; r=json.load(open(sys.argv[1])); r["keychain_accessed"]=json.load(open(sys.argv[2]))["keychainLinked"]; r["keychain_guard"]="keychain-guard.json"; print(json.dumps(r, sort_keys=True))' "$evidence/proof.json" "$evidence/keychain-guard.json" > "$evidence/result.json"
printf 'exit 0\n' >> "$evidence/commands.log"
test -s "$evidence/result.json"
echo 'PASS; headless generated contract only'

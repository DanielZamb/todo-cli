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
printf 'swift run --package-path apps/macos/API -c release PurgeContractProof <scratch-http-history>\n' > "$evidence/commands.log"
swift run --package-path "$root/apps/macos/API" -c release PurgeContractProof "$evidence/history.json" > "$evidence/result.json" 2>> "$evidence/commands.log"
printf 'exit 0\n' >> "$evidence/commands.log"
test -s "$evidence/result.json"
echo 'PASS; headless generated contract only'

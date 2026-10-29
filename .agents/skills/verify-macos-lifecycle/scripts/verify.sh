#!/bin/sh
set -eu
export PYTHONDONTWRITEBYTECODE=1
root=$(CDPATH= cd -- "$(dirname -- "$0")/../../../.." && pwd)
mode=${2:-full}
case "$mode" in full|regressions) ;; *) echo 'Use full or regressions' >&2; exit 1 ;; esac
evidence=${1:?Pass a new absolute evidence directory}
case "$evidence" in /*) ;; *) echo 'Evidence must be absolute' >&2; exit 1 ;; esac
[ ! -e "$evidence" ] || { echo 'Choose fresh evidence' >&2; exit 1; }
[ "$(uname -s)" = Darwin ]
command -v bun >/dev/null
command -v swiftc >/dev/null
command -v python3 >/dev/null
"$root/scripts/disk-guard.sh"
mkdir -p "$evidence"
scratch=$(mktemp -d "${TMPDIR:-/tmp}/todo-w02-verify-XXXXXX")
trap 'if [ ! -e "$scratch/launchd-active" ] && [ ! -e "$scratch/command-unsafe" ]; then rm -rf "$scratch"; else echo "Cleanup failed; retain $scratch" >&2; fi' EXIT HUP INT TERM
{
    printf 'bundle-server.sh %s/bundle\n' "$scratch"
    CODE_SIGNING_ALLOWED=NO EXPANDED_CODE_SIGN_IDENTITY= "$root/apps/macos/scripts/bundle-server.sh" "$scratch/bundle"
    test -s "$scratch/bundle/THIRD_PARTY_NOTICES.txt"
    cp "$scratch/bundle/THIRD_PARTY_NOTICES.txt" "$evidence/THIRD_PARTY_NOTICES.txt"
    "$root/scripts/disk-guard.sh"
    printf 'swiftc -swift-version 6 -strict-concurrency=complete ServerLifecycle.swift Driver.swift -o %s/driver\n' "$scratch"
    swiftc -swift-version 6 -strict-concurrency=complete "$root/apps/macos/Sources/ServerLifecycle.swift" "$root/.agents/skills/verify-macos-lifecycle/scripts/Driver.swift" -o "$scratch/driver"
    "$root/scripts/disk-guard.sh"
    swiftc -swift-version 6 -strict-concurrency=complete "$root/apps/macos/Sources/AttachmentSnapshot.swift" "$root/apps/macos/Sources/ClientReads.swift" "$root/apps/macos/Sources/Recurrence.swift" "$root/apps/macos/Sources/TaskSnapshot.swift" "$root/.agents/skills/verify-macos-lifecycle/scripts/ConfigurationDriver.swift" -o "$scratch/configuration-driver"
    python3 "$root/.agents/skills/verify-macos-lifecycle/scripts/regressions.py" "$scratch" "$evidence"
    [ "$mode" != regressions ] || exit 0
    "$root/scripts/disk-guard.sh"
    python3 "$root/.agents/skills/verify-macos-lifecycle/scripts/legacy-source.py" "$root" "$scratch" "$evidence"
    (cd "$scratch" && bun build --compile "$scratch/legacy-main.ts" --outfile "$scratch/legacy-server")
    python3 "$root/.agents/skills/verify-macos-lifecycle/scripts/test_headless_safety.py" -v
    python3 "$root/.agents/skills/verify-macos-lifecycle/scripts/drive.py" "$scratch" "$evidence"
} > "$evidence/commands.log" 2>&1
rm -rf "$scratch"
[ ! -e "$scratch" ]
[ -s "$evidence/result.json" ]
printf 'PASS; headless lifecycle only; evidence survived cleanup\n'

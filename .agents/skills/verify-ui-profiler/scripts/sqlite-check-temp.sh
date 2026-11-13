#!/bin/sh
set -eu
cd "$(dirname "$0")/../../../.."
checkout="${1:-$PWD}"
evidence="${2:-$PWD/docs/evidence/ui-speed/recordings-check-temp}"
root="$PWD/.scratch/recordings-check-temp-volume"
[ ! -e "$root" ] || { echo 'Owned scratch volume already exists; inspect it first' >&2; exit 1; }
mkdir -p "$root/volume" "$evidence"
mounted=0
cleanup() {
 if [ "$mounted" = 1 ]; then hdiutil detach "$root/volume" >>"$evidence/volume.log" 2>&1 || true; fi
 if ! mount | grep -F " on $root/volume " >/dev/null; then rm -rf "$root"; fi
}
trap cleanup EXIT HUP INT TERM
hdiutil create -size 8m -fs HFS+ -volname TodoCheckTemp "$root/temp.dmg" >"$evidence/volume.log" 2>&1
hdiutil attach -nobrowse -mountpoint "$root/volume" "$root/temp.dmg" >>"$evidence/volume.log" 2>&1
mounted=1
bun .agents/skills/verify-ui-profiler/scripts/sqlite-check-temp.ts "$checkout" "$evidence" "$root/volume"

#!/bin/sh
set -eu
cd "$(dirname "$0")/../../../.."
root="$PWD/.scratch/recordings-sqlite-disk-full"
evidence="${1:-$PWD/docs/evidence/ui-speed/recordings-sqlite/full-volume}"
[ ! -e "$root" ] || { echo 'Owned full-volume scratch already exists; inspect it first' >&2; exit 1; }
mkdir -p "$root/volume" "$evidence" .scratch/bin
mounted=0
cleanup() {
 if [ "$mounted" = 1 ]; then hdiutil detach "$root/volume" >>"$evidence/volume.log" 2>&1 || true; fi
 if ! mount | rg -F " on $root/volume " >/dev/null; then rm -rf "$root"; fi
}
trap cleanup EXIT HUP INT TERM
bun build --compile .agents/skills/verify-ui-profiler/scripts/sqlite-full-server.ts --outfile .scratch/bin/sqlite-full-server >"$evidence/build.log" 2>&1
hdiutil create -size 10m -fs HFS+ -volname TodoRecordingScratch "$root/recordings.dmg" >"$evidence/volume.log" 2>&1
hdiutil attach -nobrowse -mountpoint "$root/volume" "$root/recordings.dmg" >>"$evidence/volume.log" 2>&1
mounted=1
bun .agents/skills/verify-ui-profiler/scripts/sqlite-full.ts "$evidence"

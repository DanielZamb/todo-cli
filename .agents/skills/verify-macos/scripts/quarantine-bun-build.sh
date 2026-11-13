#!/bin/sh
# Move this checkout's own Bun compile leftovers (.*.bun-build) out of the tree, into the ignored
# .scratch/quarantined-bun-build, once lsof shows no process holds them. Exit 3 if one is held.
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")/../../../.." && pwd)
cd "$root"
q="$root/.scratch/quarantined-bun-build"
mkdir -p "$q"
find . -path ./.scratch -prune -o -name '.*.bun-build' -type f -print | while read -r f; do
  if lsof "$f" >/dev/null 2>&1; then echo "held: $f"; exit 3; fi
  echo "$(date -u +%FT%TZ) $f" >> "$q/manifest.txt"; mkdir -p "$q/$(dirname "$f")"; mv "$f" "$q/$(dirname "$f")/"
done
find . -path ./.scratch -prune -o -name '.*.bun-build' -type f -print | wc -l

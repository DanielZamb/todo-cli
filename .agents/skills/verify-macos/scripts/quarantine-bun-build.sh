#!/bin/sh
# Move this checkout's own Bun compile leftovers (.*.bun-build), wherever they are in the tree
# (.scratch/bin included), out of the checkout once lsof shows no process holds them. Exit 3 if one
# is held. They go to a quarantine outside the checkout, because check-swift and the clean-tree
# checks scan the whole tree; the manifest there lists every move.
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")/../../../.." && pwd)
cd "$root"
q="${TMPDIR:-/tmp}/todo-bun-quarantine/$(basename "$root")"
mkdir -p "$q"
find . -name '.*.bun-build' -type f -print | while read -r f; do
  if lsof "$f" >/dev/null 2>&1; then echo "held: $f"; exit 3; fi
  echo "$(date -u +%FT%TZ) $f" >> "$q/manifest.txt"; mkdir -p "$q/$(dirname "$f")"; mv "$f" "$q/$(dirname "$f")/"
done
find . -name '.*.bun-build' -type f -print | wc -l

#!/bin/sh
# Regenerate todo.excalidraw from generate.mjs, then export one PNG per frame.
set -eu
root=$(git rev-parse --show-toplevel)
cd "$root/docs/diagrams"
bun generate.mjs
for frame in runtime write model live; do
  excalidraw render todo.excalidraw --frame-id "$frame" \
    --out "$frame.png" --scale 2 --max-width 3800 --max-height 4000
done

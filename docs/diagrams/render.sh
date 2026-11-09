#!/bin/sh
# Regenerate todo.excalidraw from generate.mjs, then export one PNG per frame.
set -eu
root=$(git rev-parse --show-toplevel)
cd "$root/docs/diagrams"
bun generate.mjs
for frame in runtime write model live search-cli search-http search-electron search-swift search-copy search-electron-filters search-swift-filters dag-cli-edges dag-cli-delete dag-lifecycle dag-electron-picker dag-electron-drag dag-electron-delete dag-electron-graph dag-swift-picker dag-swift-drag dag-swift-delete dag-swift-graph; do
  excalidraw render todo.excalidraw --frame-id "$frame" \
    --out "$frame.png" --scale 2 --max-width 3800 --max-height 4000
done

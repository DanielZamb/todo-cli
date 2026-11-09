#!/bin/sh
# Regenerate todo.excalidraw from generate.mjs, then export one PNG per frame.
set -eu
root=$(git rev-parse --show-toplevel)
cd "$root/docs/diagrams"
bun generate.mjs
if [ "$#" -eq 0 ]; then
  set -- runtime write model live search-cli search-http search-electron search-swift search-copy search-electron-filters search-swift-filters perf-tags perf-cache perf-refresh agent-errors agent-lookup-errors agent-directory agent-prefix agent-list
fi
for frame do
  excalidraw render todo.excalidraw --frame-id "$frame" \
    --out "$frame.png" --scale 2 --max-width 3800 --max-height 4000
done

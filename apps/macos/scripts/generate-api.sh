#!/bin/zsh
set -euo pipefail
root=${0:A:h:h:h:h}
api="$root/apps/macos/API"
"$root/scripts/disk-guard.sh"
python3 "$root/apps/macos/scripts/normalize-openapi.py" "$root/packages/api/openapi.json" "$api/Sources/TodoAPI/openapi.json"
(cd "$root" && pnpm exec biome format --write "$api/Sources/TodoAPI/openapi.json")
swift build --package-path "$api" -c release --product swift-openapi-generator
"$api/.build/release/swift-openapi-generator" generate "$api/Sources/TodoAPI/openapi.json" --config "$api/Sources/TodoAPI/openapi-generator-config.yaml" --output-directory "$api/Sources/TodoAPI/GeneratedSources"

python3 "$root/apps/macos/scripts/preserve-null.py" "$api/Sources/TodoAPI/GeneratedSources"

#!/bin/sh
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")/../../.." && pwd)
output=${1:?Pass the absolute Server resource directory}
case "$output" in /*) ;; *) echo 'Output must be absolute' >&2; exit 1 ;; esac
"$root/scripts/disk-guard.sh"
mkdir -p "$output"
staging=$(mktemp -d "${TMPDIR:-/tmp}/todo-server-bundle-XXXXXX")
trap 'rm -rf "$staging"' EXIT HUP INT TERM
if [ "${CODE_SIGNING_ALLOWED:-YES}" = NO ] && [ -n "${TODO_SERVER_BINARY:-}" ]; then
    test -x "$TODO_SERVER_BINARY"
    cp "$TODO_SERVER_BINARY" "$staging/todo-server"
else
    bun "$root/scripts/compile.ts" "$root/apps/server/src/main.ts" "$staging/todo-server"
fi
if [ "${CODE_SIGNING_ALLOWED:-YES}" != NO ] && [ -n "${EXPANDED_CODE_SIGN_IDENTITY:-}" ]; then
    /usr/bin/codesign --force --identifier local.todo.server --entitlements "$root/apps/macos/BunServer.entitlements" --options runtime --timestamp=none --sign "$EXPANDED_CODE_SIGN_IDENTITY" "$staging/todo-server"
fi
cp "$staging/todo-server" "$output/todo-server"
chmod 755 "$output/todo-server"
"$output/todo-server" --version > "$output/identity.txt"
(cd "$root" && bun scripts/third-party-notices.ts "$output/THIRD_PARTY_NOTICES.txt")

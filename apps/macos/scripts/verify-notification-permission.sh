#!/bin/sh
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")/../../.." && pwd)
scratch=$(mktemp -d "${TMPDIR:-/tmp}/todo-notification-proof-XXXXXX")
trap 'rm -rf "$scratch"' EXIT HUP INT TERM
swiftc -swift-version 6 -strict-concurrency=complete -parse-as-library \
    "$root/apps/macos/Sources/NotificationPermission.swift" \
    "$root/apps/macos/scripts/NotificationPermissionProof.swift" \
    -o "$scratch/notification-proof"
"$scratch/notification-proof"

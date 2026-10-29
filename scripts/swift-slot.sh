#!/bin/sh
# Serialize Swift builds that share compiler caches.
set -eu
[ "$#" -gt 0 ] || { echo "usage: swift-slot.sh <command> [args...]" >&2; exit 2; }
exec /usr/bin/lockf -k "/tmp/todo-swift-build-$(id -u).lock" "$@"

#!/bin/sh
# Serialize Swift builds that share compiler caches.
set -eu
[ "$#" -gt 0 ] || { echo "usage: swift-slot.sh <command> [args...]" >&2; exit 2; }
# SWIFT_SLOT_LOCK: a private lock for a proof that must not hold the shared slot.
lock="${SWIFT_SLOT_LOCK:-/tmp/todo-swift-build-$(id -u).lock}"
if [ "${SWIFT_SLOT_ANNOUNCE:-}" = 1 ]; then
  # A runner that times a step from when the slot is held, not from when it started waiting
  # (follow-up 68), watches stderr for this line.
  exec /usr/bin/lockf -k "$lock" /bin/sh -c 'echo SWIFT-SLOT-ACQUIRED >&2; exec "$@"' sh "$@"
fi
exec /usr/bin/lockf -k "$lock" "$@"

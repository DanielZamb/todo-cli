#!/bin/sh
set -eu
proof_root=$(git -C "$(dirname -- "$0")" rev-parse --show-toplevel)
if [ -f "$proof_root/docs/evidence/discovery-formal/SOFT-DISK-HOLD" ]; then
  echo "DISK STOP: explicit coordinator hold; no Swift command started" >&2
  exit 3
fi
df -k /System/Volumes/Data
available=$(df -k /System/Volumes/Data | awk 'NR==2 {print $4}')
soft_floor=31457280
if [ "$available" -lt "$soft_floor" ]; then
  echo "DISK STOP: below ${soft_floor}KiB; no Swift command started" >&2
  exit 3
fi
sh "$proof_root/scripts/disk-guard.sh"
exec "$@"

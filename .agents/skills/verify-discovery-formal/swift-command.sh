#!/bin/sh
set -eu
proof_root=$(CDPATH= cd -- "$(dirname -- "$0")/../../.." && pwd)
if [ -f "$proof_root/docs/evidence/discovery-formal/SOFT-DISK-HOLD" ]; then
  echo "DISK STOP: explicit coordinator hold; no Swift command started" >&2
  exit 3
fi
df -k /System/Volumes/Data
available=$(df -k /System/Volumes/Data | awk 'NR==2 {print $4}')
soft_floor=31457280
if [ "${TODO_E_FINAL_ORDER29_EXCEPTION:-}" = "f85aef6faf7d93be80feef930554206e09d61be3" ] &&
   [ "$proof_root" = "/Users/zambamon/.t3/worktrees/todo-cli/feat-agent-discovery-e-final" ]; then
  soft_floor=26214400
  echo "E-final-only coordinator order-29 exception: 25GiB for remaining f85 controls/frozen proof steps"
fi
if [ "$available" -lt "$soft_floor" ]; then
  echo "DISK STOP: below ${soft_floor}KiB; no Swift command started" >&2
  exit 3
fi
sh /Users/zambamon/Work/todo-cli/scripts/disk-guard.sh
exec "$@"

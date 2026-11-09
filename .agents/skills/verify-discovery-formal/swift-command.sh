#!/bin/sh
set -eu
df -k /System/Volumes/Data
available=$(df -k /System/Volumes/Data | awk 'NR==2 {print $4}')
if [ "$available" -lt 31457280 ]; then
  echo "DISK STOP: below 30GiB; no Swift command started" >&2
  exit 3
fi
sh /Users/zambamon/Work/todo-cli/scripts/disk-guard.sh
exec "$@"

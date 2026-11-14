#!/bin/sh
set -eu
[ "$#" -eq 2 ] || { echo "usage: verify.sh <fresh-evidence> <baseline-commit>" >&2; exit 2; }
root=$(git rev-parse --show-toplevel)
cd "$root"
exec python3 apps/macos/PerfMeasurement/run.py "$1" --climb --owner-fixture --root-window --ref "$2" --working-tree --runs 5 --history-operations 925 --max-start-load 0

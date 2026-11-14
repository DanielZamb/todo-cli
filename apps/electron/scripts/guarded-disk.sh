#!/bin/sh
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")/../../.." && pwd)
if guard_output=$(sh "$root/scripts/disk-guard.sh" 2>&1); then
  if [ -n "${TODO_DAG_GUARD_TRACE:-}" ]; then
    printf '%s\n' "$guard_output" >> "$TODO_DAG_GUARD_TRACE"
  fi
else
  guard_exit=$?
  [ -z "$guard_output" ] || printf '%s\n' "$guard_output" >&2
  exit "$guard_exit"
fi

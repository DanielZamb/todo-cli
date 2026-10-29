#!/bin/sh
set -eu
root=$(git -C "$(dirname "$0")" rev-parse --show-toplevel)
evidence=${1:?absolute evidence directory required}
case "$evidence" in /*) ;; *) exit 2 ;; esac
mkdir -p "$evidence"
scratch=$(mktemp -d "${TMPDIR:-/tmp}/todo-s01-verify-XXXXXX")
trap 'rm -rf "$scratch"' EXIT HUP INT TERM
mkdir -p "$scratch/home"
cd "$root"
exec 3>&1
{
  bun apps/server/scripts/scratch-diagnostics.ts build
  cp "${TODO_SERVER_BINARY:-$root/.scratch/bin/todo-server}" "$scratch/server"
  cp "${TODO_CLI_BINARY:-$root/.scratch/bin/todo}" "$scratch/todo"
  cp "$root/.scratch/bin/seed" "$scratch/seed"
  HOME="$scratch/home" "$scratch/seed" "$scratch" diagnostics
  HOME="$scratch/home" bun apps/server/scripts/verify-diagnostics.ts "$scratch" "$evidence"
} > "$evidence/commands.log" 2>&1
cat "$evidence/result.json" >&3

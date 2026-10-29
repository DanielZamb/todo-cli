#!/bin/sh
set -eu
root=$(git -C "$(dirname "$0")" rev-parse --show-toplevel)
evidence=${1:?absolute new evidence directory required}
case "$evidence" in /*) ;; *) exit 2 ;; esac
[ ! -e "$evidence" ] || exit 2
mkdir -p "$evidence"
scratch=$(mktemp -d "${TMPDIR:-/tmp}/todo-s01-verify-XXXXXX")
trap 'rm -rf "$scratch"' EXIT HUP INT TERM
cd "$root"
{
  sh scripts/disk-guard.sh
  /usr/bin/lockf -k /tmp/todo-fixes-electron.lock env TODO_ELECTRON_VERIFY_HOST=1 pnpm --filter @todo/electron build
  bun apps/server/scripts/scratch-diagnostics.ts build
  if [ "${TODO_DIAGNOSTICS_DEV:-0}" = 1 ]; then
    url=$(bun apps/server/scripts/scratch-diagnostics.ts)
    TODO_DIAGNOSTICS_URL="$url" TODO_DIAGNOSTICS_HOME="$root/.scratch/home" TODO_DIAGNOSTICS_DB="$root/.scratch/dev.db" TODO_CLI_BINARY="$root/.scratch/bin/todo" TODO_ELECTRON_VERIFY_HOST=1 pnpm --filter @todo/electron exec bun scripts/verify-diagnostics.ts "$scratch" "$evidence"
  else
    cp "${TODO_SERVER_BINARY:-$root/.scratch/bin/todo-server}" "$scratch/server"
    cp "${TODO_CLI_BINARY:-$root/.scratch/bin/todo}" "$scratch/todo"
    cp "$root/.scratch/bin/seed" "$scratch/seed"
    HOME="$scratch/home" "$scratch/seed" "$scratch" diagnostics
    TODO_ELECTRON_VERIFY_HOST=1 pnpm --filter @todo/electron exec bun scripts/verify-diagnostics.ts "$scratch" "$evidence"
  fi
} > "$evidence/commands.log" 2>&1
cat "$evidence/result.json"

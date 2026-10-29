#!/bin/sh
set -eu
if [ "${TODO_ELECTRON_VERIFY_HOST:-0}" != 1 ] && [ "${TODO_VERIFY_NATIVE_UI:-0}" != 1 ]; then
  printf '%s\n' 'HOLD: native verification needs current user consent and TODO_VERIFY_NATIVE_UI=1.' >&2
  exit 78
fi
root=$(CDPATH= cd -- "$(dirname -- "$0")/../../../.." && pwd)
evidence=${1:?absolute new evidence directory required}
case "$evidence" in /*) ;; *) exit 2;; esac
[ ! -e "$evidence" ] || { echo "Choose a new evidence directory"; exit 2; }
mkdir -p "$evidence"
scratch=$(mktemp -d "${TMPDIR:-/tmp}/todo-s01-verify-XXXXXX")
trap 'rm -rf "$scratch"' EXIT HUP INT TERM
cd "$root"
{
  if [ "${TODO_ELECTRON_VERIFY_HOST:-0}" = 1 ]; then
    sh scripts/disk-guard.sh
    /usr/bin/lockf -k /tmp/todo-fixes-electron.lock pnpm --filter @todo/electron build
  else
    codesign --verify --deep --strict "$root/dist/signed.noindex/electron/Todo.app"
  fi
  (
    cd "$scratch"
    if [ -n "${TODO_SERVER_BINARY:-}" ]; then
      printf 'reuse compiled server %s\n' "$TODO_SERVER_BINARY"
      ln -s "$TODO_SERVER_BINARY" "$scratch/server"
    else
      bun build "$root/apps/server/src/main.ts" --compile --outfile "$scratch/server"
    fi
    if [ -n "${TODO_SEED_BINARY:-}" ]; then
      printf 'reuse compiled seed %s\n' "$TODO_SEED_BINARY"
      ln -s "$TODO_SEED_BINARY" "$scratch/seed"
    else
      bun build "$root/apps/server/scripts/seed-verification.ts" --compile --outfile "$scratch/seed"
    fi
    if [ -n "${TODO_CLI_BINARY:-}" ]; then
      printf 'reuse compiled CLI %s\n' "$TODO_CLI_BINARY"
      ln -s "$TODO_CLI_BINARY" "$scratch/todo"
    else
      bun build "$root/apps/cli/src/main.ts" --compile --outfile "$scratch/todo"
    fi
  )
  if [ "${TODO_VERIFY_SNAPSHOTS:-0}" = 1 ]; then
    "$scratch/seed" "$scratch"
  elif [ "${TODO_ELECTRON_VERIFY_HOST:-0}" = 1 ]; then
    "$scratch/seed" "$scratch" client-writes-legacy
  else
    "$scratch/seed" "$scratch"
  fi
  if [ "${TODO_VERIFY_SNAPSHOTS:-0}" = 1 ]; then
    pnpm --filter @todo/electron exec bun scripts/verify-snapshots.ts "$scratch" "$evidence"
  elif [ "${TODO_ELECTRON_VERIFY_HOST:-0}" = 1 ]; then
    if [ "${TODO_ELECTRON_VERIFY_METADATA_ONLY:-0}" = 1 ]; then
      pnpm --filter @todo/electron exec bun scripts/verify-metadata-host.ts "$scratch" "$evidence"
    else
      pnpm --filter @todo/electron exec bun scripts/verify-writes.ts "$scratch" "$evidence"
    fi
  else
    pnpm --filter @todo/electron verify:compiled "$scratch" "$evidence"
  fi
} > "$evidence/commands.log" 2>&1
rm -rf "$scratch"
[ -f "$evidence/result.json" ] && [ -f "$evidence/tasks.png" ]
if rg -q THIN_PASS_NATIVE_BLOCKED "$evidence/result.json"; then
  echo "THIN PASS; native delivery blocked; evidence survived cleanup: $evidence"
else
  echo "PASS; evidence survived cleanup: $evidence"
fi

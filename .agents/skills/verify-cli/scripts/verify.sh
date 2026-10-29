#!/bin/sh
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")/../../../.." && pwd)
evidence=${1:?Pass a new absolute evidence directory}
case "$evidence" in /*) ;; *) echo 'Evidence directory must be absolute' >&2; exit 2 ;; esac
if [ -e "$evidence" ]; then echo 'Choose a new evidence directory' >&2; exit 2; fi
mkdir -p "$evidence"
scratch=$(mktemp -d "${TMPDIR:-/tmp}/todo-c05-verify-XXXXXX")
cleanup() { rm -rf -- "$scratch"; }
trap cleanup EXIT HUP INT TERM
mkdir -p "$scratch/home"
binary=${TODO_CLI_BINARY:-$scratch/todo}
case "$binary" in /*) ;; *) echo 'TODO_CLI_BINARY must be absolute' >&2; exit 2 ;; esac
cd "$root"
{
  printf 'bun --version\n'
  bun --version
  printf 'pnpm --filter @todo/cli typecheck\n'
  pnpm --filter @todo/cli typecheck
  if [ -z "${TODO_CLI_BINARY:-}" ]; then
    printf 'bun build --compile %s/apps/cli/src/main.ts --outfile %s\n' "$root" "$binary"
    (cd "$scratch" && bun build --compile "$root/apps/cli/src/main.ts" --outfile "$binary")
  fi
  test -x "$binary"
  printf 'HOME=%s/home %s --version\n' "$scratch" "$binary"
  HOME="$scratch/home" "$binary" --version
  printf 'HOME=%s/home TODO_CLI_BINARY=%s TODO_CLI_EVIDENCE=%s pnpm --filter @todo/cli test\n' "$scratch" "$binary" "$evidence"
  HOME="$scratch/home" TODO_CLI_BINARY="$binary" TODO_CLI_EVIDENCE="$evidence" pnpm --filter @todo/cli test
} > "$evidence/commands.log" 2>&1
cleanup
trap - EXIT HUP INT TERM
test ! -e "$scratch"
for file in commands.log actions.json goldens.json crud-history.json obsidian.md export.md c05-review.json contract-actions.json contract.json; do test -s "$evidence/$file"; done
printf 'PASS; evidence survived cleanup: %s\n' "$evidence"

#!/bin/sh
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")/../../../.." && pwd)
evidence=${1:?Pass a fresh absolute evidence directory}
case "$evidence" in /*) ;; *) exit 2 ;; esac
test ! -e "$evidence"
mkdir -p "$evidence"
scratch=$(mktemp -d "${TMPDIR:-/tmp/}todo-denial-verify-XXXXXX")
trap 'rm -rf -- "$scratch"' EXIT HUP INT TERM
cd "$root"
compile() {
  sh scripts/disk-guard.sh
  (cd "$scratch" && bun build --compile "$root/$1" --outfile "$2")
}
cli=${TODO_CLI_BINARY:-$scratch/todo}
server=${TODO_SERVER_BINARY:-$scratch/server}
driver=${TODO_AUTH_DENIAL_BINARY:-$scratch/driver}
{
  if [ -z "${TODO_CLI_BINARY:-}" ]; then compile apps/cli/src/main.ts "$cli"; fi
  if [ -z "${TODO_SERVER_BINARY:-}" ]; then compile apps/server/src/main.ts "$server"; fi
  if [ -z "${TODO_AUTH_DENIAL_BINARY:-}" ]; then compile packages/domain/scripts/verify-durable-denial.ts "$driver"; fi
  "$cli" --version
  "$server" --version
  "$driver" proof "$scratch/domain" "$evidence/domain"
  bun .agents/skills/verify-auth/scripts/check-cross-process.mjs "$cli" "$server" "$evidence/processes"
} > "$evidence/commands.log" 2>&1
rm -rf -- "$scratch"
test -s "$evidence/domain/proof.json"
test -s "$evidence/processes/parity.json"
printf 'PASS; evidence survived cleanup: %s\n' "$evidence"

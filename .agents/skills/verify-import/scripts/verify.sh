#!/bin/sh
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")/../../../.." && pwd)
evidence=${1:?Pass a new absolute evidence directory}
case "$evidence" in /*) ;; *) exit 2 ;; esac
if [ -e "$evidence" ]; then echo 'Choose a new evidence directory' >&2; exit 2; fi
mkdir -p "$evidence"
cd "$root"
{
  bun --version
  pnpm --filter @todo/cli typecheck
  cd "$evidence"
  cli=${TODO_CLI_BINARY:-$evidence/todo}
  server=${TODO_SERVER_BINARY:-$evidence/server}
  if [ -z "${TODO_CLI_BINARY:-}" ]; then bun build --compile "$root/apps/cli/src/main.ts" --outfile "$cli"; fi
  bun build --compile "$root/packages/domain/scripts/verify-import.ts" --outfile "$evidence/drive"
  if [ -z "${TODO_SERVER_BINARY:-}" ]; then bun build --compile "$root/apps/server/src/main.ts" --outfile "$server"; fi
  "$evidence/drive" "$cli" "$evidence" "$root/packages/domain/test/fixtures/import/repository-sync.json" "$server"
  bun build --compile "$root/packages/domain/scripts/verify-import-migrations.ts" --outfile "$evidence/migration-drive"
  "$evidence/migration-drive" "$evidence/migrations" "$root/packages/domain/test/fixtures/v2-recurrence.sql"
  bun build --compile "$root/packages/domain/scripts/verify-transfer-identities.ts" --outfile "$evidence/transfer-drive"
  "$evidence/transfer-drive" "$cli" "$server" "$evidence/transfer-identities"
} > "$evidence/commands.log" 2>&1
printf 'PASS; evidence survived cleanup: %s\n' "$evidence"

---
name: verify-op-log
description: Verify the Todo operation store through a compiled Bun library driver on a scratch SQLite database. Use after changes to migration 0002, append, conflict recording, snapshots, replay, revert, or projection guards.
---

# Verify the operation log

Generated with `create-verification-skill`.
The domain library is C02's public entry point. The CLI and server are later units.
Read the [feature map](features/README.md) before choosing coverage.

## Launch

Resolve the checkout with `git rev-parse --show-toplevel`. From that checkout:

```sh
.agents/skills/verify-op-log/scripts/verify.sh "$PWD/docs/evidence/c02/compiled-drive"
```

This executable helper builds `packages/domain/scripts/verify-op-log.ts` with
`bun build --compile`, creates a new `todo-c02-verify-*` directory under the OS
temporary directory, and drives only its `scratch.db`. It requires Bun 1.4.4 or
newer, pnpm-installed dependencies, and `sqlite3`. It runs to completion without
a server. A zero exit plus `PASS; evidence survived cleanup` means it finished.
It also builds a browser Task import from `@todo/domain`; Bun storage callers
use the separate `@todo/domain/store` entry point.
For a new proof, choose a new absolute evidence directory to retain older runs.
There is no shared database, process, port, profile, or session to drive.

## Doctor

Run `bun --version` and `command -v sqlite3` from the checkout. Then run
`pnpm --filter @todo/domain typecheck`. When a drive fails, inspect its
`commands.log` and confirm the database path is under `todo-c02-verify-*`.
The driver's first store check requires WAL, a 5000ms busy timeout, and schema
version 6. A path outside the temporary scratch directory is rejected.

## Drive

The helper is the complete recipe. Its compiled driver invokes the migration-only
script twice against its scratch fixture, then calls the public
`openStore`, `append`, `history`, `takeSnapshot`, `rebuild`, and `revert` methods.
It imports two legacy profiles and tasks from the frozen migration fixture,
edits a task at version 7, repeats that edit to produce a conflict, records an
invalid-title rejection, drops and
rebuilds the projection, and reverts the accepted edit at version 8.
It checks literal titles, versions, sequence numbers, reasons, and settings.
It also attempts a direct SQL Delete and requires rejection. The compiled
[Purge drive](features/purge.md) proves atomic redaction, replay, Revert refusal
and absence of private strings in raw database bytes after checkpoint and VACUUM.

Run the broader scratch behavior suite for validation, transaction failure,
multiple connections, profile isolation, Purge refusal, and failed migration:

```sh
pnpm --filter @todo/domain test
```

The suite rejects missing or foreign Project and Tag IDs in Series defaults on
create and edit. It verifies valid Occurrence metadata after replay and builds
the browser fixture without importing `bun:sqlite`.

## Evidence

The supplied evidence directory contains `commands.log`, `actions.json`,
`result.json`, SQL dumps `00-legacy.sql` through `05-revert.sql`, and `purge.json`.
The commands record both the compiled build and the actual binary invocation.
The SQL dumps show the attempted actions and their durable results, including
the rejected conflict. `result.json` contains the final task rows and history.
Inspect the dumps and literal assertions in the driver before claiming proof.
The driver uses the production library with real SQLite and no mocks.

## Cleanup

The helper's exit trap removes only the scratch directory it created, including
the binary and database. It checks evidence files after cleanup. Keep every
evidence directory. A failed run also triggers scratch cleanup; its transcript
and completed stage dumps remain available.

The checkout owns `.claude/skills/verify-op-log`, a relative symlink to this
directory. Keep the link with the skill. Resolve it with
`realpath .claude/skills/verify-op-log` after moving the checkout.

## Helpers

`scripts/verify.sh <absolute-evidence-directory>` is executable. It can run from
any working directory and resolves its own checkout. The compiled driver is
`packages/domain/scripts/verify-op-log.ts`; it accepts a fresh temporary scratch
directory and an absolute evidence directory outside it. The fixtures under
`packages/domain/test/fixtures/` must remain reachable from the checkout root.
Use `/maintain-verification-skill` when store behavior changes.

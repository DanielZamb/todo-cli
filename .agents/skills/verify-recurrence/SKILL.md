---
name: verify-recurrence
description: Verify the Todo domain library's RFC 5545 Series and Occurrences through a compiled Bun driver and scratch SQLite database. Use after changing recurrence expansion, dates, instants, completion, cancellation, or resolved-event replay.
---

# Verify recurrence

Created with `create-verification-skill`.
Read the [feature map](features/README.md) before choosing coverage. The domain
library is the public entry point for C03. CLI and HTTP adapters come later.

## Launch

Resolve the checkout with `git rev-parse --show-toplevel`. From that checkout:

```sh
.agents/skills/verify-recurrence/scripts/verify.sh "$PWD/docs/evidence/c03/compiled-drive-new"
```

Choose a new absolute evidence directory for each proof. The helper compiles
`packages/domain/scripts/verify-recurrence.ts` with `bun build --compile`, then
runs the resulting binary against its own `todo-c03-verify-*` temporary directory
and `scratch.db`. It also builds a browser Task import from `@todo/domain`. Bun-only callers use
`@todo/domain/store`. No server, credential, port or shared database is required.
It exits zero and prints `PASS; evidence survived cleanup` when complete.
Its exit trap removes only the scratch directory it created.

## Doctor

Run `bun --version`, `command -v sqlite3`, and
`pnpm --filter @todo/domain typecheck` from the checkout. Bun 1.4.4 or newer and
pnpm-installed dependencies are required. Inspect `commands.log` after any
failure and confirm every database path belongs to `todo-c03-verify-*`.
The driver rejects paths without that temporary-directory prefix.

## Drive

The helper is the complete recipe. Its compiled driver calls production
`openStore`, `putProfile`, `startSeries`, `finishTask`, `nextOccurrenceTime`,
`history`, `takeSnapshot`, and `rebuild`. It creates a weekday Series at 09:00
America/New_York, completes Friday across spring DST, rejects a stale completion,
and cancels Monday. Tuesday is an EXDATE. Wednesday exhausts COUNT.
It creates and advances a date-only monthly Series using BYSETPOS=-1.
It checks the inclusive UNTIL instant.

A SQLite trigger forces successor insertion to fail. The driver checks that
neither the completion nor its event committed, then drops its trigger and
retries. For replay, the driver temporarily makes the recurrence library's
`next` method throw. Full and snapshot replay must still restore exact tasks.
The driver restores that method in its finalizer. No successful recurrence
result comes from a mock.

Run the broader behavior suite for fall DST, nonexistent local times, invalid
rules, standalone tasks, conflicting IDs, and shifted due metadata:

```sh
pnpm --filter @todo/domain test
```

## Evidence

`commands.log` retains the compiled build and binary invocation.
`actions.json` retains command inputs and accepted or rejected events.
`01-dst.json` records UTC instants and the retained IANA zone on either side of
DST. `02-bysetpos.json` records January 30, February 27 and March 31 as dates.
`03-replay.json` retains tasks and History after both replay modes with expansion
disabled. `result.json` records the final tasks and History count.
The helper checks these files after cleanup. Inspect the inputs and literal
assertions alongside the durable rows before claiming proof.

The library comparison is separately rerunnable with
`TZ=UTC bun packages/domain/scripts/spike-recurrence.ts` and
`TZ=Asia/Tokyo bun packages/domain/scripts/spike-recurrence.ts`. Its original
results and choice are in `docs/evidence/c03/spike/` and
`docs/decisions/c03-recurrence.md`.

## Cleanup

The helper removes its binary, database and WAL files on success or failure.
Evidence stays outside scratch and survives cleanup. No process remains.
Never use the real database or its backup for this recipe.

## Helpers

`scripts/verify.sh <absolute-evidence-directory>` is executable and resolves its
checkout from its own location. The driver accepts the helper-created scratch
directory and evidence directory as positional arguments. The checkout owns
`.claude/skills/verify-recurrence`, a relative symlink to this skill. Preserve it.
Use `/maintain-verification-skill` when the recurrence API or feature map changes.

The same helper also runs the [review regression proof](features/review-regressions.md).
`04-review-fixes.json` records all seven reproduced findings through production
commands, including a frozen pre-C03 v2 database and full plus snapshot replay.
The helper requires this evidence file to survive cleanup. Its SQL fixture at
`packages/domain/test/fixtures/v2-recurrence.sql` must remain in the checkout.
The helper resolves and enters the checkout before invoking its compiled driver.

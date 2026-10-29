# Task lifecycle and Version conflicts

## Sub-features

Require exit 4 with the latest task in all three formats. Delete hides the task. Purge erases its content while History retains metadata for accepted operations and four conflicts.

## How to get to it (user POV)

Run todo add, show, list, edit, done, reopen, cancel and rm.

## Driving it with the compiled CLI harness

Run the parent skill helper. The CRUD integration case adds Project, Tags, due date and energy. It edits only the title, checks Version 2 and retained metadata, rejects three stale writes, completes, reopens, cancels, Deletes and Purges.

## Gotchas

The structured Series case creates Project and Tag definitions with its first Occurrence, completes it, checks inherited metadata, edits and clears recurrence, and converts a standalone Task to a Series.

Every mutation requires --expected-version. Delete precedes --force Purge. Date-only inputs retain dates under ADR-0006.

The shared command behavior also has a scratch library test in
`packages/domain/test/commands.test.ts`, run by `pnpm --filter @todo/domain test`.
It alternates CLI flag preparation and typed `TaskCommands` calls, then checks
recurrence, instant zones, conflicts, Purge and Profile-isolated rejected History.

The C05 review case in the same compiled driver proves findings 1, 2, 3, 6, 7
and 9. `c05-review.json` retains the literal January 3 due date, recurrence and
Series identity, rejected invalid edit and cleared migrated Series result.

The X01 rejected-History case runs `add Task --energy 6` and edits
`missing-task`. It requires exits 2 and 3, two literal rejected operations
with their attempted kinds and Versions, and an empty Task projection.

Reopen also accepts legacy snoozed Tasks through the shared domain command.
The import verification driver proves the compiled legacy transition at Versions
8 and 9, no-write preview, and unchanged Task payloads in other Profiles.

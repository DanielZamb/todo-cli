---
name: verify-snapshots
description: Verify owner Snapshots with the compiled Todo CLI on scratch HOME and SQLite after Snapshot, restore, retention or Purge changes.
---

# Verify owner Snapshots

Created with `create-verification-skill`.
Read [the feature map](features/README.md) before selecting coverage.

## Launch

From the checkout root, run `.agents/skills/verify-snapshots/scripts/verify.sh "$PWD/docs/evidence/f13/compiled-new"`.
The helper compiles the production CLI and the drive with Bun, then gives each
process a unique `todo-f13-verify-*` scratch HOME and explicit TODO_DB. It never
opens the owner's database or starts a native app. Exit zero and
`PASS; evidence survived cleanup` prove completion.

## Doctor

Run `bun --version` and `pnpm --filter @todo/domain typecheck`. The helper checks
the actual compiled CLI's `--version` before provisioning its scratch owner.
Inspect commands.log and actions.json after a failure.

## Drive

The compiled drive signs in through stdin, creates a Task and Snapshot, writes
another Task, previews restore with literal counts 2 and 1, restores, and reads
one Task through CLI list. It Deletes and Purges that Task, checks its title is
absent from Snapshot bytes, restores again and requires zero Tasks. It corrupts
a copy and makes another copy use schema 999; both must fail with exit 2.
It reads all five published command schemas and proves prune --dry-run leaves
the Snapshot list unchanged. Run `pnpm --filter @todo/domain test` for a second
open connection, untouched Profile preservation and repeated Purge-journal replay.

## Evidence

The supplied absolute directory retains commands.log, actions.json and result.json.
Actions record the actual compiled command, stdout, stderr and process exit.
Passphrases are scratch fixtures and never appear in action receipts. File
checks inspect real SQLite bytes. No mocked commands or test-only endpoints exist.

## Cleanup

The shell trap deletes only its own scratch directory, binary, HOME and database.
Evidence remains outside scratch and is checked after cleanup. No server remains.
The `.claude/skills/verify-snapshots` relative symlink points here.

## Helpers

Executable `scripts/verify.sh <absolute-new-evidence-directory>` resolves its
checkout. `packages/domain/scripts/verify-snapshots.ts` compiles into scratch and accepts scratch and evidence
paths. Use `/maintain-verification-skill` when Snapshot commands change.

The same helper also compiles the production server and HTTP drive. It proves
owner Session authorization, Token refusal, a client connected before two
restores receiving reload events, reused sequence delivery and exactly one
reminder that returned only in the restored Snapshot. http-result.json,
http-actions.json, restore-sse.json and http-cleanup.json preserve that proof.
It also checks delivery of the restored reminder through the pre-existing stream.
The compiled snapshot-restore-proof driver verifies that the durable Purge union
rejects an old Task creation and redacts its rejected History after restore,
including through a second connection. It compares the returned safety manifest
with both the stored manifest and the SQLite file's checksum.

For iterative UI work, `TODO_F13_SERVER_RECEIPT` selects the worktree's owned
`.scratch/server.json` in the Electron and headless Swift Snapshot drives.
Keep that server alive while iterating and stop only its recorded PID afterward.
Final proofs use fresh databases and source-matching compiled binaries.

Set TODO_CLI_BINARY to the worktree cache for the current source hash to reuse
its compiled CLI. The helper copies it into the owned scratch directory and
keeps a fresh HOME and database.

The compiled schema proof restores version-3, version-4 and version-5 Snapshots through migrations 0004, 0005 and 0006,
requires user_version 7, refuses currentSchemaVersion + 1 with newer_schema, and compares Profile
tombstone IDs and timestamps exactly with the saved SQLite file. schema.json
records the literal versions and result. Purge IDs remain authoritative separately.

The compiled attachments proof restores a pre-attachment Snapshot with no references, restores a missing image reference without recreating its bytes, and checks Purge erases copied bytes after commit while redacting every saved Snapshot path and label. `attachments.json` records those literal results.

## Purge references and repair

Read [the Task reference inventory](features/task-references.md). The compiled
CLI drive now checks tagged Tasks, a Task that both depends on and blocks other
Tasks, and a recurring Task with Project, description, External id and due time.
Each restores twice after Delete and Purge. It checks exact surviving titles,
foreign keys, absent private bytes and consistent manifest checksums, sizes and
counts. `purge-cli-actions.json`, `purge-cli-result.json` and
`task-reference-schema.json` retain the observations.

By default the repair case injects an orphan into a redacted scratch copy and
updates its checksum to reproduce the old row shape. For an independent
compatibility proof, first compile the unchanged pre-fix CLI, retain its source
commit and SHA-256, then select that binary when running the same recipe:

```sh
TODO_SNAPSHOT_BASE_CLI="$PWD/.scratch/bin/todo-base-6b167266" \
  .agents/skills/verify-snapshots/scripts/verify.sh "$PWD/docs/evidence/f13/compiled-repair-new"
```

This must be an explicitly built scratch binary, never the installed CLI.
The repair case then creates and Purges through that old CLI, requires its
restore to exit 2, switches to the current compiled CLI, and requires restore
to exit 0 twice. The result names whether it used the compiled base or the
injected fixture. No binary is checked into Git.

Run `pnpm --filter @todo/domain test test/snapshot-purge.test.ts` for the declared
reference coverage guard, future-table control, already-absent Task repair,
unexplained-orphan refusal, reminder/checkpoint replay and checksum-mismatch
Purge refusal. `task_versions` and History retain content-free ids by design.

## Interrupted Purge cleanup and validation

The recipe also compiles `snapshot-cleanup-proof.ts`. Its two-connection probe
comes from the correctness seat's post-commit crash reproduction. A separate
Purge writer exits exactly 73 at its own cleanup boundary, after committing the
Purge and before erasing a real managed PNG. The original store stays open and
takes a Snapshot of that pending state. Eight cases cover warm/fresh restore,
older/newer Snapshot and pending/already-drained cleanup. Existing cleanup on
store open must erase the Purged PNG in every case, including after a repeated
restore. A Deleted Task returns alive with its PNG intact; a synthetic pending
job for its non-Purged id must not survive restore. No production source or
covered store function is instrumented. Only the crash child's runtime method
is replaced, and all children exit before the helper returns.

`cleanup-recovery.json` retains the eight literal Task, queue and byte results.
`redaction-stability.json` compares four actual file checksums with manifests,
sizes and counts, requiring one stable checksum after the first redaction.
`test/snapshot-cleanup.test.ts` runs the same cases as behavior tests.

The CLI drive also supplies checksum-matching `not a SQLite file` bytes.
Restore must report `invalid_snapshot`, exit 2 and leave live Tasks unchanged.
This differs from checksum mismatch, which remains a separate refusal.

## Raw History and immediate cleanup

The raw-History drive injects older unknown keys that decoding drops, plus SQL
entity_version 2, into an already redacted row. Six cases cover live startup,
stored-copy redaction and restore staging, with and without private keys.
They require the actual stored text to lose those keys and the SQL column to
become 1. Raw checkpoint payloads receive an unknown-key control too. The drive
then requires canonical copies to remain byte-stable over repeated redaction.
`raw-history.json` retains the observations.

The eight cleanup cases now require the Purged PNG and job to be gone when
restore returns, before reopening or another Purge. `cleanup-guards.json` adds
literal option-root and environment-root controls, preserving a PNG under the
default root. It also covers failed erasure with a successful restore and
retained job, dry run, refused/rolled-back restore, guarded queue deletion,
durable-Purge membership rechecking and applied in-memory preview isolation.
The preview fixture forks before the crash, simulates a Purge and supplies
scratch Snapshot publication for the in-memory restore. It uses the real
Attachment root without disabling cleanup. A second fixture forks with a
pending live job, requires both PNGs to remain, then opens a persistent store
and requires that store to drain its own job while preserving the other PNG.

The post-commit pass runs only on an applied persistent restore after the
transaction has committed. Every job is checked against the durable Purge
union again, erased with eraseTaskAttachments, and deleted through the supplied
guarded transaction. Failed erasure retains the job and the successful restore
report, with no added response field. Diagnostics exposes the attachment_cleanup
table count through CLI JSON/terminal Storage and HTTP GET /diagnostics. There
is no dedicated job id, reason, attempt or warning view. Individual rows remain
available through SQLite inspection; startup/Purge retries still apply. A job
can remain after a crash following erasure, so its presence alone does not prove
bytes remain. A fresh CLI can fail at startup if that erasure still fails.

## Dry-run Attachment isolation

The CLI drive imports preview-preservation-proof.ts and compares all logical
SQLite rows, including raw History and sqlite_sequence, and the whole Attachment
tree before and after every preview. The tree hash includes file bytes, paths,
empty directories, symlink targets, modes, modification and change times.
Seventeen cases cover parse, Delete, Dependency Delete preview, Purge, Move,
Copy, batch-edit, attach-many, batch depend/undepend, import creation/adoption/
close-missing, Profile deletion, Snapshot restore/prune and detach. Each must
leave rows and tree exactly equal. Purge specifically keeps the Deleted Task at
Version 2, its PNG, empty live queue and empty durable Purge union; a subsequent
real Purge must erase that PNG. previews/preview-actions.json and
previews/preview-observations.json retain process exits and comparisons.

For the regression control, compile the standalone driver and run it with an
explicit scratch directory and the unchanged 5a85de1a or 6b167266 CLI in purge
mode. Both old binaries must fail the tree equality assertion while leaving
the live rows unchanged. The fixed CLI must pass matrix mode. No installed CLI
or real HOME is used.

## Checked-read integration

`bun .agents/skills/verify-snapshots/scripts/checked-read-integration.ts` creates
its own checkout-local scratch database. It holds a live checked read while a
forked preview opens a separate lease, requires each cross-origin authority to
fail with StoreError before SQL, and checks that closing the preview leaves the
live authority usable. It also requires owner admission to have returned outside
a transaction before restore starts. Use a fresh .scratch/integ-server/interactions
path or retire the completed prior fixture before repeating it.

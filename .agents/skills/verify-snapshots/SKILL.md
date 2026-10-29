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
requires user_version 6, refuses currentSchemaVersion + 1 with newer_schema, and compares Profile
tombstone IDs and timestamps exactly with the saved SQLite file. schema.json
records the literal versions and result. Purge IDs remain authoritative separately.

The compiled attachments proof restores a pre-attachment Snapshot with no references, restores a missing image reference without recreating its bytes, and checks Purge erases copied bytes after commit while redacting every saved Snapshot path and label. `attachments.json` records those literal results.

---
name: verify-dag
description: Verify Task Dependency storage, authoritative graph rules and replay through a compiled domain library on scratch SQLite. Use after Dependency schemas, migration 0007, lifecycle cleanup, Purge or Revert changes.
---

# Verify Dependencies

Created with create-verification-skill. Read the [feature map](features/README.md).
Unit A's entry point is the OperationStore library. CLI and HTTP graph commands
belong to Unit B and are not claimed by this drive.

## Launch

From the checkout root, run:

```sh
.agents/skills/verify-dag/scripts/verify.sh "$PWD/docs/evidence/task-dag/compiled-new"
```

Requires pnpm-installed dependencies and Bun 1.4.4 or newer. The helper compiles
packages/domain/scripts/verify-dag.ts once per source hash into .scratch/bin.
It runs a short-lived library executable with independent per-case databases
under one private todo-dag-verify temporary directory. No server is required.

## Doctor

Run `pnpm --filter @todo/domain typecheck` and `bun --version`.
Inspect commands.log, exit-code.txt and commit.txt in the chosen evidence directory.
The driver refuses a scratch path whose basename does not start with todo-dag-.
Each database has a separate parent directory because owner Snapshots and the
Purge journal belong to that directory, not to a database basename.

## Drive

The one command runs every mapped feature. It imports the production library,
asserts literal Tasks, Versions, edges and refusals, and compares exact edges
and Tasks after full and checkpoint replay. It drives guarded SQL refusals on
scratch SQLite. Two compiled child processes observe Versions before a barrier,
then attempt opposite edges; exactly one commits and one refuses the cycle.
`pnpm --filter @todo/domain test test/dag.test.ts` repeats the deterministic
library cases with @effect/vitest. No unimplemented CLI or HTTP command appears.

## Evidence

The selected directory retains commands.log, build.log when compilation was
needed, commit.txt, exit-code.txt, result.json, per-case JSON and race.json.
The race receipt includes both real process exit codes, History, Tasks and edges.
Only exit 0 and `PASS; evidence survived cleanup` establish a completed drive.
This is compiled library proof, not CLI/HTTP or client parity proof.

## Cleanup

The helper removes only its temporary directory. The driver closes each store
and waits for its own race children, terminating only those children on failure.
No server or native app starts. Evidence and the source-hash binary cache remain.

## Helpers

scripts/verify.sh is executable and takes an absolute evidence path.
The .claude/skills/verify-dag link is relative to this checkout. Check it with
`realpath .claude/skills/verify-dag`. Runtime Claude discovery requires a fresh
Claude session and is not established by the symlink alone.
Use /maintain-verification-skill when B adds public graph commands.

The compiled drive also invokes graph-proof.ts, which imports the production
query/order/energy/format exports. See queries.md for its literal fixtures.
It remains compiled library proof until the public command drive is added.

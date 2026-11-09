---
name: verify-dag
description: Verify Task Dependency storage, authoritative graph rules and replay through a compiled domain library on scratch SQLite. Use after Dependency schemas, migration 0007, lifecycle cleanup, Purge or Revert changes.
---

# Verify Dependencies

Created with create-verification-skill. Read the [feature map](features/README.md).
The library drive checks OperationStore and shared algorithms. The separate
public drive checks compiled CLI commands and authenticated HTTP routes.

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
Use /maintain-verification-skill when graph behavior changes.

The compiled drive also invokes graph-proof.ts, which imports the production
query/order/energy/format exports. See queries.md for its literal fixtures.
The public drive below separately exercises the production command boundaries.

## Public commands and routes

Run `scripts/verify-public.sh <fresh-absolute-evidence-directory>` for compiled
CLI/HTTP commands on a fresh scratch database. It reuses source-hash CLI/server
binaries from .scratch/bin, compiles the driver once per source hash, and checks
actual exits/statuses. Optional TODO_CLI_BINARY and TODO_SERVER_BINARY select
already-provenanced binaries. actions.json retains commands and HTTP bodies
without credentials; cleanup.json records the owned server PID and real exit.
The current corpus covers edge no-ops/Conflicts, cycles, redundant warnings,
9/13/14, Ready/Blocked, atomic creation, public edge Revert, blocked completion,
Delete previews/refusals/fingerprint changes, batch previews, Series inheritance,
and move/copy. Real PTYs check No, EOF, default No, Yes and a competing-edge
confirmation race. State comparisons include History, replay checkpoints and
owner Snapshot file bytes. Import uses dependencies-forward.json to check later
file references, Version-1 initial edges, report order, atomic refusal and failed
adoption. CLI/HTTP encoding must retain the complete nested DependencyError.
Export checks nonempty-only depends_on and absent response metadata; Obsidian
checks one managed note, preserved surrounding text, stable block links and
Mermaid. The public graph corpus also checks a 105-Task cycle with its full
shortest witness, terminal-pruned energy, terminal-node ordering and changed-to-
empty preview fingerprints. graph-public.json and import-export.json retain
literal observations. Client feature UI and both-client proof remain separate.

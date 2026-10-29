---
name: verify-import
description: Verify Todo bulk import, external ids, no-write previews, OCC and close-missing through compiled CLI and HTTP on scratch SQLite. Use after import or external id changes.
---

# Verify Task import

Created with `create-verification-skill`.
Read [the feature map](features/README.md).

## Launch

From the checkout, run:

```sh
.agents/skills/verify-import/scripts/verify.sh "$PWD/docs/evidence/c11/import-new"
```

Use a fresh absolute evidence directory. The helper compiles the production CLI,
server and `packages/domain/scripts/verify-import.ts` with Bun. Its driver creates
its own `todo-c11-import-*` scratch HOME and SQLite database. It never uses the
owner's database, credentials, installed binaries or launchd server.
The server binds loopback port 0. Readiness waits up to 60 seconds for its listen log.

## Doctor

Run `bun --version`, `command -v curl` and `pnpm --filter @todo/cli typecheck`.
Inspect `commands.log` after any failure. Every CLI invocation must use the
helper-created scratch HOME and an explicit scratch `TODO_DB`.
The driver requires the compiled CLI's `--version` to exit 0.

## Drive

The helper drives [repository sync](features/repository-sync.md) and
[preview and Conflicts](features/preview.md). It initializes a scratch owner,
signs in, previews the repository fixture, applies it, then repeats the file and
its NDJSON equivalent. It checks the published import schemas and external ids
in create, show and list JSON. It requires stale Version exit 4 and malformed
JSON exit 2. `--close-missing` cancels open Tasks with an external id.
The HTTP section uses curl against the compiled server for preview, Apply,
idempotency and a per-Task Conflict.

Run `pnpm --filter @todo/domain test import.test.ts` for literal domain checks,
including null clearing, duplicate identities, replay and migration 0005.
Run the existing verify-cli and verify-server-api helpers for their broader suites.
Client recipes are in [verify-electron](../verify-electron/SKILL.md) and
[verify-macos](../verify-macos/SKILL.md).

## Evidence

`commands.log` records compilation and the actual process exit.
`actions.json` records command arguments, exit codes, stdout and stderr, plus HTTP
statuses and response bodies. Passphrases and bearer credentials stay out of it.
`result.json` and `http-result.json` contain literal assertions' results.
Dry run compares source Tasks, Project and Tag definitions, History and replay
checkpoints before and after. It uses production commands against an in-memory
copy and must leave all source values equal. No mock supplies a successful write.
Screenshots alone do not prove Apply. Client proofs check the durable Task through
CLI or HTTP and preserve the competing write that produced each Conflict.

## Cleanup

The driver stops only its child server, waits for its exit and removes only its
own scratch directory. A two-second SIGTERM deadline escalates to SIGKILL.
It preserves evidence, including on failure. The helper checks `result.json`
after cleanup. The compiled artifacts remain inside the chosen evidence directory.

## Helpers

`scripts/verify.sh <absolute-new-evidence-directory>` is executable.
The compiled driver takes absolute CLI, evidence, fixture and server paths.
The fixture is `packages/domain/test/fixtures/import/repository-sync.json`.
`.claude/skills/verify-import` links relatively to this skill.
Use `/maintain-verification-skill` when import commands or client flows change.

## Reuse the worktree scratch server

Run `scripts/scratch.sh start` for iterative work. It hashes CLI, server and
package sources plus the lockfile, compiles once into `.scratch/bin`, and records
the owned PID, loopback URL, database, HOME and binaries in `.scratch/server.json`.
The server uses `.scratch/home`, `.scratch/dev.db` and port 0. Run
`scripts/scratch.sh stop` before reporting done. It checks that the recorded PID
still belongs to the recorded binary before sending a signal.
`scripts/scratch.sh build` returns cached binary paths without starting a server.
Pass those paths as `TODO_CLI_BINARY` and `TODO_SERVER_BINARY` to the launch helper.
Every final proof still creates a fresh database and HOME. The cache hash must
match the report commit's source state. Keep Swift and Electron builds behind
the run's shared slot and lock wrappers.

The compiled driver also proves that Purge redacts rejected imports attributed through a deleted external id, combined Tag ids and names remain unchanged on repeat, and rejected History records the supplied expected Version.

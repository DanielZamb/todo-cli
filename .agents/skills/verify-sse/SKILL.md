---
name: verify-sse
description: Verify ordered, resumable Todo SSE over real HTTP, including concurrent compiled CLI writes and Profile authorization. Use after changing the SSE route, event contract, or operation tailing.
---

# Verify SSE

Created with `create-verification-skill`.
Read the [feature map](features/README.md) before selecting coverage.

## Launch

Resolve the checkout with `git rev-parse --show-toplevel`. From its root, run:

```sh
pnpm --filter @todo/cli build
.agents/skills/verify-sse/scripts/verify.sh "$PWD/docs/evidence/s02/compiled-sse-new" "$PWD/apps/cli/dist/todo"
```

Use a fresh absolute evidence directory and an absolute path to a compiled
Effect Todo CLI. Build the integrated CLI in this checkout with the command
above. The helper copies it into scratch before use and records its hash,
source checkout HEAD and worktree status. These observations identify the
artifact without claiming its source tree matches the binary. The earlier development-artifact proof used
`apps/cli/dist/todo` from the checkout root.
Never edit that checkout or use the retired Go binary.

The helper compiles `apps/server/src/main.ts` and the existing S01 provisioning
driver with `bun build --compile`. It creates a `todo-s01-verify-*` temporary
directory because the shared provisioning driver validates that prefix.
The database and HOME both live there. Each run owns its server, CLI copy,
credentials, port and database, so independent runs can coexist.

The compiled server starts with `TODO_DB=<scratch>/scratch.db TODO_PORT=0`.
`Listening on http://127.0.0.1:<port>` means ready. A zero helper exit and
`PASS; evidence survived cleanup` mean the full drive passed and cleaned up.

## Doctor

Run `bun --version`, `command -v curl`, `command -v python3`,
`command -v sqlite3`, and `command -v lsof`. Bun 1.4.4 or newer and
pnpm-installed dependencies are required. Run `pnpm typecheck` before driving
a changed build. The helper requires literal `GET /health` output
`{"service":"todo-server"}` and a loopback-only listener owned by its child.
Inspect `commands.log` and `server.log` first after a failure.

## Drive

The launch command drives every mapped feature. It provisions an owner and
work and personal Profiles through the domain library, then uses HTTP for all
server actions and the actual compiled CLI for external writes. It signs in,
issues a work read-only Access Token, and logs the CLI into its scratch HOME
through `login --password-stdin`.

The driver opens `GET /profiles/work/events` with bearer authorization. It
requires `ready` followed by committed operations with their global sequence
as the SSE `id`. It kills the live curl connection with SIGKILL after receiving
a Task creation. While disconnected, HTTP edits the Task, a stale edit fails,
and the CLI creates another Task. A fresh connection sends `Last-Event-ID`
and must receive each subsequent committed work operation exactly once.

After reconnect catches up, the driver leaves the same connection idle for
12 seconds without writes. The curl process must remain alive, and a new HTTP
Task must arrive on that original connection. This exceeds Bun's default
10-second connection idle timeout. The server explicitly disables that timeout
with `idleTimeout: 0`; authorization polling and scoped cancellation remain active.

Three live CLI writes must each reach the stream within 1000ms of starting
the CLI process. A further CLI write runs concurrently with an HTTP write.
The helper compares all received IDs with the durable committed work History,
requires increasing IDs without duplicates, and excludes every rejected and
foreign-Profile operation. It also checks committed `AuthChanged` operations,
so the contract does not assume that every operation changes a Task.

Missing and invalid credentials return 401. A work Token cannot subscribe to
personal. Invalid cursors return 400. Revoking the connected Token must end
its stream with a typed failure event and deny reconnect. Signing out a
Session must deny reconnect too. The response has `Cache-Control: no-store`.

Run additional literal HTTP behavior checks with:

```sh
pnpm --filter @todo/server test
```

## Evidence

The selected directory retains `commands.log`, `provenance.json`, `server.log`,
`listener.txt`, redacted `actions.json`, `initial.sse`, `resumed.sse`, response
headers, `durable-history.json`, `database.sql`, `cleanup.json` and `result.json`.
Actions record commands, HTTP inputs and outputs, connection PID, SIGKILL and
exit status. Result records the cursor, complete received and expected IDs,
and the three delivery intervals measured from CLI process start through
receipt of the complete SSE frame. It also records the actual idle wait,
original stream liveness and post-idle delivery. `cleanup.json` records the
exit status of every child curl process and the server after finalization.
The delivery intervals include CLI startup and commit time.
It proves the one-second acceptance threshold on this run, not a throughput
benchmark. SQLite History independently checks stream filtering and ordering.
No mock, direct projection write or test-only HTTP endpoint supplies the proof.
Failed runs retain the transcript and actions completed before failure.

## Cleanup

The Python finalizer stops only its child curl processes and server by PID,
waits for exit, and closes their files on failure too. The shell trap removes
only its own temporary directory, including HOME, binaries, database and WAL
siblings. Evidence remains outside scratch. The helper verifies that scratch
is gone and required evidence files still exist. Never kill by process name.

The checkout owns `.claude/skills/verify-sse`, a relative symlink to this skill.
Check it with `realpath .claude/skills/verify-sse`. Preserve existing entries.
Fresh Claude discovery is separate from the executable proof; do not claim
registration without checking a fresh Claude session.

## Helpers

Executable `scripts/verify.sh <absolute-evidence-directory> <absolute-cli-path>`
resolves its own checkout and runs the full recipe. Executable
`scripts/provenance.py <source-cli> <scratch> <evidence>` records the copied
binary. Executable `scripts/drive.py <scratch> <evidence>` starts the compiled
server and drives curl and the CLI. Invoke the shell helper for cleanup.
Use `/maintain-verification-skill` when stream behavior changes.

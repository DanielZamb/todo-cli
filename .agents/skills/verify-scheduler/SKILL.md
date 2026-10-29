---
name: verify-scheduler
description: Verify Todo scheduler restart recovery, competing reminder receipts, snooze wake-ups, credential cleanup and launchd install/status/uninstall through a compiled server, HTTP and scratch SQLite. Use after scheduler, ReminderFired, cleanup or LaunchAgent changes.
---

# Verify scheduled work and launchd

Created with `create-verification-skill`.
Read the [feature map](features/README.md) before selecting coverage.

## Launch

From the checkout returned by `git rev-parse --show-toplevel`:

```sh
.agents/skills/verify-scheduler/scripts/verify.sh "$PWD/docs/evidence/s03/compiled-scheduler-new"
```

Choose a new absolute evidence directory. The executable helper compiles the
production server and `apps/server/scripts/scheduler-fixture.ts` using
`bun build --compile` in its new `todo-s03-verify-*` temporary directory.
It requires macOS with a GUI login domain, Bun 1.4.4 or newer, Python 3, curl and
pnpm-installed dependencies. No installation or network access is needed.
Each server uses TODO_DB pointing to scratch.db and TODO_PORT=0. A log line
`Listening on http://127.0.0.1:<port>` signals readiness. Each lifecycle command
gets a scratch HOME and a unique com.todo-cli.server.verify-<pid> label.
It never manages the default LaunchAgent or the owner's database.
Exit zero and `PASS; evidence survived cleanup` mean the recipe completed.

## Doctor

Run `bun --version`, `command -v python3`, and `pnpm typecheck`.
The helper checks every child PID is alive while waiting for its listen log,
then requires GET /health to return exactly `{"service":"todo-server"}`.
The initial lifecycle status must report installed=false and loaded=false for
its unique label. A missing GUI launchd domain is a prerequisite failure.
Inspect commands.log and the named server log after any failure.

## Drive

The helper drives every mapped feature through compiled binaries and HTTP.
Provisioning alone uses the public domain API to create the scratch owner,
Profile and Tasks, including one snoozed Task. It stops the first compiled
server before the pending instant, waits past that instant while offline,
then starts two compiled servers against the same scratch database.
Authenticated SSE reconnects after restart using Last-Event-ID.
Exactly two ReminderFired operations must exist, one per eligible Task and
due instant. The snoozed Task must become open at Version 2.

HTTP signs in, issues a short-lived Access Token, and checks cleanup removes
its credential row while keeping the Session usable and recording History.
A PATCH changes a due instant and earns one new reminder. A title-only PATCH
earns none. A compiled driver decodes the received frames through the shared
@todo/api ChangeEvent schema and compares their IDs and events with the durable
receipts. The live OpenAPI must equal the regenerated document and include
ReminderFired. Date-only planning values, deleted Tasks and done Tasks create
no reminder. A compiled domain drive proves full and snapshot replay preserve
Tasks and receipts and another scheduler pass appends nothing.

The actual compiled server runs install, reinstall, status, uninstall and a
second uninstall using real /bin/launchctl. The helper checks the launched
agent serves /health, saves its plist and verifies the final job is unloaded
and the plist is gone. No launchctl mock is used in this proof.

Additional rollback and exact-boundary behavior tests:

```sh
pnpm --filter @todo/domain test
pnpm --filter @todo/server test
```

## Evidence

The selected directory retains commands.log, actions.json, fixture.json,
before-restart.log, competitor-a.log, competitor-b.log,
restart-and-competition.json, credential-cleanup.json, changed-due.json,
replay.json, initial.sse, resumed.sse, authenticated-sse.json, shared-contract.json,
openapi.json, agent.plist, launchd-stdout.log, launchd-stderr.log, database.sql
and result.json. Actions pair process starts/stops and HTTP inputs with
observed responses and lifecycle exit codes. Bearer secrets and the sign-in
passphrase are omitted. SQLite queries are read-only observations; all writes
use the domain package or production HTTP. Literal assertions check Task
status, Version, counts and receipt keys. SQL and replay evidence preserve
the actual durable rows. No test-only server endpoint or scheduler flag exists.

## Cleanup

The Python finalizer terminates only server PIDs it started. It uninstalls only
its unique app-owned label and confirms the agent is unloaded before scratch
cleanup. The shell trap removes only its new scratch directory, binary,
database, WAL and scratch HOME. Evidence stays outside scratch and survives.
If launchd teardown fails, launchd-active prevents scratch deletion. Inspect
commands.log and actions.json, then retry the recorded binary's uninstall with
the recorded scratch HOME and TODO_SERVICE_LABEL. Never kill by process name.

The checkout owns `.claude/skills/verify-scheduler`, a relative symlink to this
directory. Confirm `realpath .claude/skills/verify-scheduler` resolves here.
Fresh Claude discovery is recorded separately in docs/evidence/s03.

## Helpers

`scripts/verify.sh <absolute-new-evidence-directory>` is executable and resolves
its checkout. It calls executable `scripts/drive.py <scratch> <evidence>`.
The compiled fixture accepts `<scratch> seed|replay|decode-sse` and refuses paths outside
its own temporary-directory prefix. decode-sse also takes the retained SSE path. Use `/maintain-verification-skill` when
these APIs or feature behaviors change.

S03 status now also reports the installed executable, database and port as
`configuration`, or null when absent. The macOS lifecycle client consumes it
without inferring an owner database path. Its separate headless proof is
[verify-macos-lifecycle](../verify-macos-lifecycle/SKILL.md); native UI is held.

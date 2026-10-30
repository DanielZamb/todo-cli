---
name: verify-server-api
description: Verify the Todo local authenticated HttpApi through curl against a compiled Bun server on a scratch SQLite database. Use after task HTTP, authorization mapping, OpenAPI, or server startup changes.
---

# Verify the server API

Created with `create-verification-skill`.
Read the [feature map](features/README.md) before choosing coverage.

## Launch

From the checkout root, run this exact compiled-server scratch-DB HTTP command:

```sh
.agents/skills/verify-server-api/scripts/verify.sh "$PWD/docs/evidence/s01/compiled-http-new"
```

Use a fresh absolute evidence directory on each run. The helper compiles
`apps/server/src/main.ts` and a scratch provisioning driver with `bun build --compile`.
It provisions one owner and the work and personal Profiles through the domain
library. The real API intentionally has no unauthenticated provisioning endpoint.
The helper launches its compiled server as
`TODO_DB=<scratch>/scratch.db TODO_PORT=0 <scratch>/server` and discovers its
assigned port from the listen log. It uses only its new `todo-s01-verify-*`
temporary directory. A `Listening on http://127.0.0.1:<port>` log line means ready.
A zero exit and `PASS; evidence survived cleanup` prove completion.

To drive an installed server, set `TODO_SERVER_BINARY` to its absolute executable
path before invoking `scripts/verify.sh`. This skips server compilation, retains
the installed binary, and still compiles the scratch provisioning driver.
The helper gives provisioning and HTTP processes its own scratch HOME.

For normal operation, `pnpm --filter @todo/server build` creates
`apps/server/dist/todo-server`. Run it with an explicit `TODO_DB` path to a
provisioned database and optional `TODO_PORT`, which defaults to 4310. The
hostname is always `127.0.0.1`; there is no hostname setting. Never point a
verification run at the owner's real database.

## Doctor

Run `bun --version`, `command -v curl`, `command -v sqlite3`,
`command -v python3`, and `command -v lsof`. Bun 1.4.4 or newer and pnpm-installed
dependencies are required. Run `pnpm typecheck` before driving a changed build.
The helper checks `GET /health` returns `{service:"todo-server",contract,build}` with the generated contract identity.
It retains `lsof` output for its own process and requires a loopback-only listener.
When anything fails, inspect the selected `commands.log` and `server.log`.

## Drive

The launch command drives the original Task and credential features with curl.
For client reads, run the second compiled-server scratch recipe:

```sh
.agents/skills/verify-server-api/scripts/verify-reads.sh "$PWD/docs/evidence/s04/reads-new"
```

This compiles the same production server and provisioning driver, requests the
client-reads fixture, and drives counts, all planning views, Profile-scoped
History and deterministic quick-add through curl. It also proves redacted
History after a compiled domain Purge and HTTP Revert refusal with `task_purged`. It checks S01's isolation
fix through literal rejected definitions and absence of foreign names. Read
[the client feature map](features/client-reads.md) for membership and grammar.

For client writes, run:

```sh
.agents/skills/verify-server-api/scripts/verify-writes.sh "$PWD/docs/evidence/s05/writes-new"
```

Read [the client writes feature map](features/client-writes.md) for routes,
move metadata rules, Revert, Series edits, skip and scoped move SSE events.
The helper uses the existing client-reads fixture, then checks scratch HTTP,
durable state and full plus snapshot replay. It retains both Profile SSE
streams and replay.json in addition to the original evidence files.
It also drives nine recurrence review regressions on independently provisioned
scratch databases and retains each case's HTTP actions, replay and cleanup.
`canonical-validation-history.json` proves authenticated invalid title and
source requests append rejected operations before returning HTTP 400.

The original drive signs in through
`POST /auth/sessions`, creates and shows a Task, patches its title, repeats a
stale patch, and requires HTTP 409 with the exact latest Task. It issues scoped
read-only and read-write Access Tokens, proves denied writes and out-of-Profile
reads, completes and reopens the Task, cancels it, then deletes it using its
Version. Visible list/show responses must hide the deleted Task. It revokes a
Token and signs out the Session; both credentials must then fail authentication.
Finally it reads `/openapi.json` and compares the emitted contract.

Run the broader HTTP contract tests with:

```sh
pnpm --filter @todo/server test
pnpm --filter @todo/api openapi
```

Tests start the actual Effect/Bun HTTP server on port 0 and fresh databases.
They cover required Versions, invalid payloads, domain validation, Profile
isolation, rejected History, recurrence completion and OpenAPI equality.
The domain's verification skills cover replay, recurrence edge cases and expiry.

## Evidence

The selected directory retains `commands.log`, `server.log`, `listener.txt`,
`actions.json`, `database.sql` and `result.json`. The transcript records the
actual compiled build and server invocation. Actions pair curl inputs with
response statuses and bodies. Passphrases and bearer secrets are redacted.
The helper checks literal Task titles, Versions, statuses and conflict bodies.
It also checks the durable SQLite Task and History, then keeps a SQL dump after
the server exits. Provisioning uses the public domain API; every subsequent
action uses HTTP. No mocks or test-only endpoints are involved.

## Cleanup

The Python driver's finalizer terminates only the child server it started and
waits for it to exit, including on failure. The shell exit trap removes only its
new scratch directory, binaries, database and WAL siblings. Evidence stays
outside scratch and survives cleanup. The helper checks that scratch is gone
and the evidence files still exist. Never kill by process name.

The checkout owns `.claude/skills/verify-server-api`, a relative symlink to
this directory. Preserve it and verify `realpath .claude/skills/verify-server-api`
after moving the checkout. Claude session discovery must be checked in a fresh
Claude session before claiming registration.

## Helpers

`scripts/verify-reads.sh <absolute-evidence-directory>` is executable and invokes
`scripts/drive-reads.py <scratch> <evidence>`. Its evidence has the same layout
and cleanup contract as the original helper.

`scripts/verify.sh <absolute-evidence-directory>` is executable and resolves its
own checkout. It calls the executable `scripts/drive.py <scratch> <evidence>`
with Python 3. The driver starts and stops the compiled server and drives curl.
`apps/server/scripts/seed-verification.ts` compiles as the scratch provisioning
driver and refuses directories outside the temporary `todo-s01-verify-*` prefix.
Use `/maintain-verification-skill` when routes or task behavior change.

`scripts/verify-writes.sh <absolute-evidence-directory>` invokes executable
`scripts/drive-writes.py <scratch> <evidence>` and the compiled provisioning
driver's replay mode after server shutdown. Scratch and credentials remain
isolated exactly as in the original helper.

## Version guardrails

The compiled HTTP recipes compare health with CONTRACT_ID and reject unknown query names with HTTP 400. See [the feature recipe](features/contract.md) for commands and expected evidence.

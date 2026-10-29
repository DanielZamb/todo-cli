# Local task HTTP API

S01 serves the shared `@todo/api` HttpApi on `127.0.0.1` through Effect and Bun.
`@todo/domain/store` owns authentication, task commands and every database write.

```sh
pnpm install --frozen-lockfile
pnpm --filter @todo/api openapi
pnpm --filter @todo/server build
TODO_DB=/absolute/path/to/provisioned.db TODO_PORT=4310 apps/server/dist/todo-server
```

`TODO_DB` is required. `TODO_PORT` defaults to 4310; zero selects a free port.
The server prints its address when listening. Stop it with SIGTERM or SIGINT.
Provision the owner and Profiles through the domain API before signing in.
The verification helper provisions only its new scratch database.

Sign in with `POST /auth/sessions` and `{"passphrase":"..."}`. Send the returned
credential in `Authorization: Bearer <credential>` on task and credential routes.
Sessions and Access Tokens are checked by the domain on every request. Tokens
respect their Profile and read-only/read-write scope. Sessions alone can issue,
list and revoke Tokens or sign out.

| Method     | Path                                              | Request                                                      |
| ---------- | ------------------------------------------------- | ------------------------------------------------------------ |
| GET        | `/health`                                         | No auth; returns the service identity                        |
| GET        | `/openapi.json`                                   | No auth; generated from the same HttpApi                     |
| POST       | `/auth/sessions`                                  | Passphrase; returns a fixed-lifetime Session                 |
| DELETE     | `/auth/session`                                   | Revokes the current Session                                  |
| GET / POST | `/auth/tokens`                                    | List metadata / issue a named scoped Token                   |
| DELETE     | `/auth/tokens/{name}`                             | Revoke a Token by name                                       |
| GET / POST | `/profiles/{profile}/tasks`                       | List visible Tasks / create a Task                           |
| GET        | `/profiles/{profile}/tasks/{task}`                | Show a visible Task                                          |
| PATCH      | `/profiles/{profile}/tasks/{task}`                | `{"from_version":1,"changes":{"title":"New title"}}`         |
| POST       | `/profiles/{profile}/tasks/{task}/transition`     | `{"from_version":2,"action":"complete"}`; also cancel/reopen |
| DELETE     | `/profiles/{profile}/tasks/{task}?from_version=3` | Record Delete and return its tombstone                       |

Create requires `title`; optional details share the domain schemas. Omitted
details use domain defaults. Patch changes only supplied detail fields.
Identity, Version, status and timestamps are server-owned. Project and Tag IDs
must already exist in the Profile. Completion and cancellation resolve any next
Occurrence atomically in the domain. Delete is recoverable and hides the Task
from list/show. Purge, Revert, Series creation and History routes are outside S01.

Malformed HTTP inputs return 400. Missing, invalid, revoked or expired
credentials return 401. Credential scope and owner restrictions return 403.
Missing visible Tasks return 404. Stale Versions return 409 with
`{"_tag":"Conflict","latest":{...}}`. Domain validation returns 422. Storage
failures return a generic 500 response. Auth and domain mutation rejections
remain in the operation log.

The browser-safe contract lives in `packages/api/src/index.ts`. Generate
`packages/api/openapi.json` with `pnpm --filter @todo/api openapi`; the runtime
`/openapi.json` must match it. Effect 4 provides HttpApi in `effect/http-api`,
as described in the [Effect HttpApiBuilder reference](https://effect.website/docs/v4/api/effect/http-api/HttpApiBuilder).

Run `pnpm check` for typecheck, lint and behavior tests. Contract tests use real
HTTP and scratch SQLite files. For the compiled artifact proof, use
[verify-server-api](../../.agents/skills/verify-server-api/SKILL.md):

```sh
.agents/skills/verify-server-api/scripts/verify.sh "$PWD/docs/evidence/s01/compiled-http-new"
```

The helper retains curl actions, response bodies, its loopback listener,
durable database state and logs after terminating the server and cleaning scratch.

Subscribe to `GET /profiles/:profile/events` with a bearer Session or Access
Token. The response is `text/event-stream` with `Cache-Control: no-store`.
A `ready` event has JSON `null` data and no ID. Each `operation` event carries
a complete committed `OpLogEntry` as JSON, with its global `seq` as the SSE ID.
Only operations belonging to the requested Profile appear. Rejected operations
never appear; sequence gaps from filtered History are normal.

Without `Last-Event-ID`, the stream replays all committed operations for that
Profile and follows new commits. Reconnect with `Last-Event-ID: <seq>` to resume
strictly after that ID. Save cursors separately per Profile. Cursors must be
canonical nonnegative safe integers. The server polls durable History every
250ms, including CLI writes, and rechecks credentials before each read.
Bun's connection idle timeout is disabled so quiet SSE subscriptions stay
open. Client disconnects and credential failures still close the stream.
Revoked or expired credentials end an active stream with the typed
`effect/http-api/stream/failure` event; authenticate again before reconnecting.
The payload derives from the domain's committed operation schema and accepts
all its event kinds, including future committed scheduler events.

Run `.agents/skills/verify-sse/scripts/verify.sh <absolute-new-evidence-dir>
<absolute-compiled-cli>` for a compiled-server proof with a killed connection,
real CLI writes, authorization and durable History comparison. The
[verification skill](../../.agents/skills/verify-sse/SKILL.md) documents the
scratch environment, evidence and cleanup.

The server runs scheduled work in a scoped Effect fiber. It wakes snoozed
Tasks at scheduled_at instants and commits ReminderFired operations for open
Tasks at due_at instants. The operation log is the durable reminder receipt,
unique per Task and due instant. Reminder operations do not advance the Task's
Version. Date-only planning values do not trigger reminders or wake-ups.
The domain also deletes expired Sessions and Access Tokens while preserving
History. Each pass recomputes deadlines from SQLite; waits are capped at one
second to notice CLI writes. Restarting after a deadline catches up.
SSE consumers use ReminderFired operations for client native notifications.

On macOS, install the compiled binary as a user LaunchAgent:

```sh
TODO_DB=/absolute/path/to/provisioned.db apps/server/dist/todo-server install
apps/server/dist/todo-server status
apps/server/dist/todo-server uninstall
```

The default label is com.todo-cli.server and its plist lives under
~/Library/LaunchAgents. Install captures absolute executable and database paths,
port and HOME, and configures RunAtLoad and KeepAlive. Logs go under
~/Library/Logs/com.todo-cli.server. Uninstall retains logs and the database.
Status reports installed and loaded separately and requires no TODO_DB.
TODO_SERVICE_LABEL accepts one app-owned suffix for isolated installations.

Run [verify-scheduler](../../.agents/skills/verify-scheduler/SKILL.md) for the
compiled restart, competing-process, replay, cleanup and real launchd proof.
The helper uses a scratch HOME, a unique label and only its scratch database.

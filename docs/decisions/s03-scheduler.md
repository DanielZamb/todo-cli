# S03 scheduler and launchd

## Time-work gate

At base 48baee1, Tasks have scheduled_at and due_at but no reminder receipt or
snooze deadline, and the domain has no wake-up or credential cleanup API.
ADR-0006 requires time-driven work to recompute from the database. ADR-0007
requires the domain package to own database rules and projection writes.
The apps/server ticket scope cannot implement this by writing SQLite directly.

The server coordinator escalated the product and scope ruling to coordinator
thread 9d380606-e4f0-466d-b9dc-e5be42699e95. Time-work semantics and schema remain
on hold pending that ruling. Date-only values remain planning dates.

## Lifecycle choices

The default label is com.todo-cli.server. TODO_SERVICE_LABEL accepts one
app-owned suffix for isolated installations and scratch verification.
The executable and database paths in an installed plist are absolute.
TODO_DB and TODO_PORT are explicit plist environment variables, so launchd
needs no interactive shell. Credentials are never persisted in the plist.
Installation atomically replaces the owned plist, stops an existing loaded
job, then bootstraps the replacement. Uninstall is idempotent and preserves
logs and the database. A foreign file at the owned path is an error.

## Coordinator ruling

The coordinator opened the gate on 2026-10-27. Snoozed Tasks wake at
scheduled_at instants. Open Tasks with elapsed due_at instants append a
committed ReminderFired operation. The receipt is unique per Task and due
instant; changing due_at earns another receipt. Dates have no implicit zone
and create no reminder. SSE clients consume these operations for native
notifications. The server does not deliver reminders through logging.

Standing order 14 was checked with git grep across effect-port, track/core,
track/server and track/clients. No reminder, wake-up or cleanup module existed.
New domain files are packages/domain/src/store/scheduled-work.ts and
packages/domain/test/scheduled-work.test.ts. Existing S01 TaskCommands serve
normal command mutations. Scheduled wake-ups reuse the resolved TaskReopened
event. ReminderFired belongs to the committed operation union but does not
change the Task projection or its Version. Existing replay ignores such
non-projection events. Receipt lookup stays in op_log across snapshots,
projection rebuilds and restarts. No migration is needed.

The scheduled-work transaction starts with BEGIN IMMEDIATE, reads current
Tasks, wakes due snoozed Tasks and records missing reminders atomically.
A second process waits for that transaction, then sees its receipt. Receipts
canonicalize due instants to UTC, including equivalent fractional-second representations.
Auth owns expiry selection and cleanup. Cleanup records AuthChanged only
when credentials were deleted; existing History stays append-only.

Effect Schedule repeats the server loop. Each pass recomputes both database
deadlines, sleeps to the earlier deadline and caps the wait at one second to
notice CLI writes. Typed failures are logged and retried after one second.
The scoped fiber stops before the store connection closes.

## Merged-base proof

The worker preserved its edits, fast-forward merged effect-port c83df75 and
restored the S03 changes without conflict. The new verify-cli skill was read,
and the lockfile was installed with pnpm after a passing disk guard.
The affected compiled op-log, auth, recurrence, HTTP and CLI proofs pass on
this merged base. The S03 compiled proof also drives real launchd using an
isolated label and scratch HOME. No real database was opened.

## SSE integration

The worker fast-forward merged track/server 1b7e378, preserving tracked edits
with exact stash object 0b347983ad5cdd5571a7c49463c0b342b6e526c5. Untracked
S03 files stayed in place. Conflict resolution keeps S02's shared errors.ts,
changesLayer and SSE docs, then adds the scoped scheduler fiber and S03 docs.
The pre-integration review was interrupted before a verdict. A fresh final
single-seat review covers the combined artifact.

Effect's JSON-string schema emits contentMediaType without its decoded payload
schema. OperationEvent now attaches contentSchema to the encoded side, derived
directly from the committed domain schema. Regenerating OpenAPI publishes
ReminderFired and cleanupExpired without a second event definition.
The combined proof reconnects authenticated SSE after server restart using its
saved cursor, then compares streamed reminders with durable receipts while two
schedulers share a future deadline. A compiled driver decodes retained frames
through @todo/api ChangeEvent. Date-only Tasks never produce a reminder.

The final required base is track/server 3d13c75, which includes the S01
Profile-filtered definition lookup fix. That fast-forward touched no S03
source, so it needed no stash or conflict resolution. The updated Task feature
map was read. S03 preserves the upstream task-command fix unchanged. Delivery
checks and compiled scheduler, contract, SSE and HTTP proofs run on this base.

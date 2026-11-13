---
name: verify-sse
description: Verify ordered, resumable Todo SSE over real HTTP, including concurrent compiled CLI writes and Profile authorization. Use after changing the SSE route, event contract, or operation tailing.
---

# Verify SSE

Created with `create-verification-skill`.
Read the [feature map](features/README.md) before selecting coverage.

After DAG contract generation, also run the shared history-unions scratch drive
with TODO_DAG_CONTRACT_TESTS=1 through swift-slot.sh. It exercises old and DAG
event kinds through the production Electron decoder and GeneratedContractTests,
including live HTTP. A skipped live test does not establish compatibility.
TODO_SERVER_BINARY reuses the final provenanced compiled server in this skill.

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
Set TODO_SERVER_BINARY and TODO_SEED_BINARY to matching source-hash cache
executables to reuse them. The helper links those provided binaries into its
owned scratch directory instead of compiling them again.
The database and HOME both live there. Each run owns its server, CLI copy,
credentials, port and database, so independent runs can coexist.

The compiled server starts with `TODO_DB=<scratch>/scratch.db TODO_PORT=0`.
`Listening on http://127.0.0.1:<port>` means ready. The helper waits up to
60 seconds for scratch startup and fails early if its child exits. A zero helper exit and
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

After recorder changes also run the compiled
[Diagnostics fault controls](../verify-diagnostics/features/faults.md).
They throw during receipt, delivery, transport and teardown and require one
ready frame and the three exact durable operation IDs, in order, without
duplicates. The teardown assertion waits for the actual release call.

Executable `scripts/verify.sh <absolute-evidence-directory> <absolute-cli-path>`
resolves its own checkout and runs the full recipe. Executable
`scripts/provenance.py <source-cli> <scratch> <evidence>` records the copied
binary. Executable `scripts/drive.py <scratch> <evidence>` starts the compiled
server and drives curl and the CLI. Invoke the shell helper for cleanup.
Use `/maintain-verification-skill` when stream behavior changes.

The server also starts Task-search cache hygiene before serving HTTP. Its independent
250 ms poll uses a domain narrow committed-event query and Snapshot generation.
Purge, external Profile deletion and restore clear the entire memo and fence old
reads; this does not change SSE delivery or scheduler writes. The cache skill's
check-hygiene.mjs and compiled erase-lifecycle.mjs cover these paths, including
restore then external Purge before the next poll and literal 1000 ms eviction.
The generation metadata query filters canonical NULL Profile/snapshot-restore
headers using the existing Profile/seq index before JSON extraction. No historical
Task payloads are decoded per tick. No launchd or installed server is needed for
this cache proof; use only recorded scratch processes.

## Checked read scopes and restore interactions

`apps/server/scripts/read-scope-stream-control.ts` compares the immutable e69230f9
base with the current checked-scope server and CLI on a scratch fixture produced
by `apps/server/scripts/read-presence-fixture.ts`. Reuse source-hash compiled
artifacts; the SSE servers use build-read-control.ts with
READ_CONTROL_DETERMINISTIC_IDS=1 and the CLIs use build-read-cli.ts. Run:

```sh
bun apps/server/scripts/read-scope-stream-control.ts <base-server> <current-server> <base-cli> <current-cli> <scratch-fixture.json> <evidence-directory>
```

The 37 scenarios include the original fourteen, an explicit unscoped read-write
Token deletion, 21 restored-Profile/credential combinations and direct removal of
a live scoped Token by restore without prior deletion. Every credential passing
its validity/read-scope check retains every base frame. Missing credential rows
and other failed credential checks end authority; an unobserved check is a
different state and fails the control. Ended authority does not imply that a
frame is omitted: standalone revoke/expire cases retain full wire equality.
Literal final credential states and
reload/refusal frames supplement whole-frame comparison. The verification-only
build modes READ_TERMINAL_MUTANT=session-only and READ_STREAM_MUTANT=drop-reload
must each fail the relevant literal comparison. READ_STREAM_SCENARIOS selects
named cases; READ_STREAM_CAPTURE_ONLY=1 captures the unchanged base first.

## Authorized discovery

[verify-discovery](../verify-discovery/SKILL.md) owns the compiled Profile directory
and cross-Profile id-prefix lookup matrix, credential no-leak properties, WAL
snapshot tests and auth-failure rollback proof. Run its single command after
changing these reads or their CLI/HTTP contracts. Existing Profile-scoped SSE
and Task search behavior retain their current recipes.

Expiry scenarios retain only their selected credential row with a scratch-only
DELETE guard, installed after any restore and before advancing the injected
Clock. This keeps expiry assertions independent of scheduler row cleanup. The
direct restore-removal scenario still removes the row and asserts missing,
which remains distinct from not-observed. No production query is replaced.

For the integration with Snapshot/Purge, run
`bun .agents/skills/verify-sse/scripts/restore-purge-integration.mjs <base-server> <current-server> <base-cli> <current-cli> <fixture.json> <evidence>`.
It adds a pre-Purge Snapshot to the existing restore scenario, Purges through
the compiled CLI, restores over HTTP, and requires redacted saved History, no
resurrected Task and identical reload/following-operation frames on both builds.

## In-process commit wake

The server decorates its store in `stream-wake-store.ts`. The exhaustive policies
cover the store, Authentication, Snapshots and ScheduledWork. A new public member
requires a policy choice at typecheck. Write-capable Effects signal after completion,
including failure or cancellation after a partial commit. A pending bit belongs
to the connection's adapter. Every decorated member exit, including reads and
synchronous methods, checks Bun SQLite's native `inTransaction` flag and flushes
the pending signal only outside a transaction. The connection is obtained once
from the existing store, without changing pinned domain code. A fiber's inherited
context does not decide transaction lifetime. Read-only calls do not create
notifications. Empty scheduler passes, credential cleanup and daily Snapshot checks do not
signal. SSE and cache hygiene retain the raw store to prevent self-waking polls.
The domain transaction and projection implementations remain unchanged.

`stream-wake.ts` broadcasts a revision to open waits. Each stream retains the
revision from before its database pass. A newer revision makes its next wait return
at once, including a commit after History was read. Several signals between passes
collapse into one pass. The 250 ms timer still finds CLI commits and expired
credentials. Its losing waiter is cancelled on timeout, wake or stream closure.

The helper now also runs `test/sse.test.ts`, `test/stream-wake.test.ts`, `test/stream-wake-store.test.ts`, `test/stream-wake-observers.test.ts` and `test/stream-wake-compositions.test.ts` with its
compiled CLI. These freeze the Effect clock to prove server delivery without a
timer advance and compiled CLI delivery only after 250 ms, remembered signals,
burst collapsing, five-waiter broadcast and cancellation/reopening counts. Without
TODO_CLI_BINARY the compiled-CLI case returns early; the helper always supplies it.
The original real-HTTP assertions remain in force.

For paired measurements, compile `scripts/meter-server.mjs` against both source
states, then run `bun scripts/measure.mjs <before> <after> <fresh-evidence>` from
this skill directory, using absolute binary paths. The meter wraps Bun transaction
completion and counts the unchanged History query. It adds no production route.
The driver provisions synthetic scratch data, alternates five pairs with 40 writes
per arm and pair, varies interarrival times, checks exact operation ids, records
one/two/five-stream idle CPU and passes, and drives 300 HTTP edits with Task reads.
Timestamps use `host-clock.mjs`, calling macOS
`clock_gettime_nsec_np(CLOCK_MONOTONIC_RAW)` in both processes. The driver brackets
meter samples and rejects negative commit-to-receipt intervals. Neither Bun hrtime
nor its performance epoch is safe for comparisons across processes. Keep raw samples and load observations local.

The client order proofs use the unsigned Electron host with
`TODO_ELECTRON_VERIFY_HOST=1 TODO_VERIFY_STREAM_WAKE=1` and verify-electron's helper,
and `StreamWriteOrderTests.ownWriteReplyAndStreamOrdersKeepTheSavedTask` through
`scripts/swift-slot.sh` and the Mac state helper. They hold actual reply, stream and
read responses while driving production refresh behavior against a compiled scratch
server. No signed app or Keychain is involved.

The observer regressions inject a throwing signal and preserve committed results,
original failure causes and the fallback timer. They also compose all three
conditional operations inside a failed enclosing write. The helper's compiled
`scripts/verify-nested-wire.mjs` drive holds the scheduler and adds an internal stdin
trigger without changing the production stream. It requires literal seq 5 and 6
TaskCreated events, full equality with durable History, and no provisional reminder
after the outer transaction rolls back. Its optional second argument is a store
source file for an explicit red control; default verification uses current source.
Its third argument selects `mutate`, `readSnapshot`, `sync-snapshot` or `matrix`.
The helper runs all four. The matrix generates all six one/two-boundary paths
over `auth.mutate` and `auth.readSnapshot`, plus, for each strict read lease
(`withRead`, `withMetadata`, `withState`, `recheckRead`, `withOwnerRead`,
`withStreamRead`), the lease alone, the lease around `mutate` and `mutate` around
the lease: 24 paths, each with commit and rollback, over all 77 callable member
fixtures, 3,696 compositions. The six original paths alone are 924 of them. The
fixture catalog is exhaustive at typecheck. `terminalChangesRead` uses a refusal
fixture: a terminal authority exists only for a deleted Profile's last batch. Properties and connection close are excluded; closing the connection
does not compose with continuing its transaction. Password changes use synchronous
validation failures because their successful hashing is asynchronous and cannot
run inside these synchronous callbacks. Destructive operations use refusal or
preview fixtures. Every case first creates a provisional reminder, checks that
the revision stays fixed at every inner exit, and requires literal event kinds,
full operation equality with durable committed Profile History, and literal reused
sequence numbers after rollback. The detached-child test advances only 100 ms and
requires a fresh waiter to resume before the fallback can run.

To measure the connection guard's idle cost separately, compile the reviewed
decorator and current decorator with `scripts/build-idle-meter.mjs <binary>
[reviewed-store-source]`, then run `scripts/measure-idle.mjs <before> <after>
<fresh-evidence>`. It alternates five pairs on copied synthetic 178-Task databases,
with one/two/five idle streams. The meter counts native state checks and SQL query
calls, passes and process CPU; counters exist only in the compiled meter. Report
the actual intervals and load, and do not interpret noisy CPU ranges as zero cost.
The dedicated Mac order transport owns an ephemeral URLSession per order. It
closes and awaits its forwarding Task, invalidates its session and requires zero
remaining native requests. Cancelling the Swift body reader alone can leave an
idle native SSE request in URLSession.shared and exhaust later fixtures' per-host
connections. The original SearchTransport and its reconnect assertion stay unchanged.

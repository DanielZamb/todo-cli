# Request and stream joins

## Sub-features

Validated recording headers, owner Session Server-Timing, bounded server spans,
CLI command roots, scheduler job roots and per-client encoded stream handoff.
The existing owner Diagnostics snapshot adds one optional version 1 profiler
object. Newly built servers always send it. Existing keys retain their meaning.

## How to get to it (user POV)

Use `todo diagnostics --format json` or owner-authenticated GET /diagnostics.
Clients send fresh UUID v4 X-Todo-Trace, X-Todo-Request and X-Todo-Action headers.
X-Todo-Request echoes the accepted value. Missing or malformed ids are replaced.
Owner Session responses expose numeric todo-handler and available todo-auth,
todo-queue, todo-domain and todo-db Server-Timing metrics. Headers convey no
authority. Access Tokens and authentication refusals receive no timing.

## Driving it with compiled CLI and HTTP

After the main recipe builds matching cached binaries, run:

```sh
bun apps/server/scripts/verify-diagnostic-joins.ts "$PWD/docs/evidence/ui-speed/joins-new"
pnpm --filter @todo/domain test diagnostic-context.test.ts diagnostic-event-types.test.ts
pnpm --filter @todo/server test diagnostics.test.ts
```

The compiled drive creates its own temporary HOME/database and one literal Task,
starts the cached server on port 0, compares exact sent ids against exported
spans, compares rounded Server-Timing with the entry span, checks malformed ids,
unauthenticated concealment and compiled CLI schema decoding. The helper stops
its own server and deletes its scratch directory, preserving result.json,
snapshot.json and server.log. The behavior suite additionally checks real HTTP
abort accounting, two stream clients sharing a recording-local commit receipt,
encoded-byte handoff, bounded losses and yielding concurrent context isolation.

The approved busy-host cost variant leaves the quiet benchmark untouched:

```sh
TODO_DIAGNOSTICS_BUSY_BENCHMARK=1 bun apps/server/scripts/benchmark-diagnostic-recording.ts "$PWD/docs/evidence/ui-speed/busy-recording-new"
```

It compares the same cached binary with detailed recording off/on, ten alternating
pairs, 100 exact Tasks per response, at least 200 requests and two seconds per
run, load at each boundary, generator CPU, server CPU/RSS, paired differences,
ranges, ring occupancy and losses. It has no quiet-host acceptance claim.
A quiet-machine confirmation under the unchanged ceiling is owed at integration.

## Gotchas

The earliest local boundary is middleware entry after Bun request dispatch.
Socket acceptance, pre-dispatch queueing, wire flush and body completion are
unobserved. Stream handoff measures encoded bytes yielded to the HTTP adapter,
not client receipt. The bounded frame-prefix observer reads no operation body.
Commit receipts are recording-local and generation-scoped, with no cross-process
write provenance. Full SQL, graph computation, matcher preparation/meter and
CLI launch/stdout attribution belong to later units. The profiler lists each
gap explicitly. JSON byte size is not heap allocation size. Detailed ring
eviction is counted separately from lost starts and aggregate counters.

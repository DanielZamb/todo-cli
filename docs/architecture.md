# Architecture

Todo is a local-first Task tracker for one person. Agents and several clients
read and write the same database. Domain terms are defined in
[CONTEXT.md](../CONTEXT.md). Binding choices live in [the decision log](adr/README.md).

## Runtime

The CLI talks to `@todo/domain` and opens SQLite itself, so it works with the
server stopped. Electron and macOS never open the database. They call the local
HttpApi and subscribe to SSE. The server is a loopback gateway that runs the
same domain package.

![Runtime: the todo and todo-server processes, desktop clients, launchd, and the SQLite file](diagrams/runtime.png)

`@todo/domain` is the only writer. Guard triggers reject direct edits to
projection tables. That is [ADR-0001](adr/0001-port-to-effect-with-shared-domain.md)
and [ADR-0007](adr/0007-operation-log-is-the-source-of-truth.md). Desktop clients
stay on HTTP because a Swift copy of the rules would drift, which is
[ADR-0002](adr/0002-server-is-the-gateway-for-ui-and-remote-clients.md).

## Packages

```mermaid
flowchart TB
  subgraph apps["Apps"]
    cli["apps/cli<br/>todo"]
    server["apps/server<br/>todo-server"]
    electron["apps/electron"]
    macos["apps/macos"]
  end
  subgraph packages["Packages"]
    domain["@todo/domain<br/>rules, store, presentation"]
    api["@todo/api<br/>HttpApi + OpenAPI"]
  end
  db[("~/.todo-cli/todo.db")]
  cli --> domain
  server --> domain
  server --> api
  api --> domain
  electron --> api
  macos -->|"generated Swift client"| api
  domain --> db
```

| Path | Role |
| --- | --- |
| `packages/domain` | Schemas, commands, recurrence, operation store, rendering |
| `packages/api` | Effect HttpApi. Electron imports it. `/openapi.json` feeds the Swift client |
| `apps/cli` | `@effect/cli`. Compiles to `todo` |
| `apps/server` | Loopback HttpApi, SSE, scheduler, launchd lifecycle. Compiles to `todo-server` |
| `apps/electron` | Desktop UI. Session stays in the main process |
| `apps/macos` | SwiftUI UI. Session stays in Keychain |

The monorepo uses pnpm workspaces. Bun runs TypeScript and compiles the two binaries.
The contract for HTTP is one HttpApi definition
([ADR-0003](adr/0003-httpapi-openapi-as-the-single-contract.md)). Electron uses
that TypeScript API. macOS uses a Swift client generated from the OpenAPI
document. There is no second protocol.

Every capability ships an agent command and a human UI
([ADR-0009](adr/0009-every-capability-is-native-to-agents-and-humans.md)). A
feature that exists in only one of those is unfinished.

## Writes

A command from the CLI or HttpApi first authenticates its credential. It then
runs in one `BEGIN IMMEDIATE` transaction that validates against the
projection, including the Version check, appends a resolved event to `op_log`,
and updates the projection tables. SSE publishes the committed `seq`. Clients
resume with `Last-Event-ID`.

A Conflict or validation failure rolls back that transaction, then records a
rejected attempt in its own short transaction. Rejected rows stay in History.
Replay never applies them. A rejected input over 32,768 characters of JSON is
stored only as its size, and a repeated auth denial is stored once per
minute (ADR-0007 amendment).

![Write path: authenticate, validate, append to op_log, apply, commit; rejected attempts roll back and are recorded](diagrams/write.png)

Events store resolved facts, not raw commands. Replay does not read the clock
or expand an RRULE. `rebuild()` can start from the newest row in the internal
`snapshots` table and replay only the tail. Owner-facing
Snapshots are separate copies of the whole database, described in
[ADR-0012](adr/0012-owner-snapshots.md).

## Data

The database belongs to one owner. Tasks live in a Profile such as work or
personal. A Project groups Tasks inside a Profile. A Tag cuts across Projects.

![Data model: access tables, projection tables, op_log and snapshots, with keys and relations](diagrams/model.png)

A Session is a fixed seven-day sign-in. An Access Token is named, optional
Profile-scoped, and revocable. Both travel as `Authorization: Bearer`. Prefixes
`ses_` and `tok_` tell them apart. See
[ADR-0005](adr/0005-single-owner-profiles-and-two-credential-kinds.md).

A Task carries a Version. Writes send the Version they read. A mismatch is a
Conflict, exit 4 on the CLI and HTTP 409 on the server. Delete hides a Task.
Purge erases it and redacts History content
([ADR-0008](adr/0008-purge-redacts-history-content.md)). Revert appends the
opposite change. The original entry stays.

A Series holds an RFC 5545 rule. An Occurrence is a real Task. Completing or
cancelling one creates the next Occurrence in the same transaction, which is
why recurrence works from the CLI with the server down
([ADR-0006](adr/0006-time-model-and-rfc5545-recurrence.md)).

## Task search

`packages/domain/src/task-search.ts` parses and evaluates title and description
queries once per Task. `filterTaskRecords` combines search and literal id-prefix
filtering with the existing filters without changing their order. The matcher
uses a pinned Unicode default full-fold table and returns original UTF-16 word
spans together with acceptance. `TaskRead` and `TaskViewSchema` carry optional
`search_matches` in read responses only. Stored Tasks and events have no search
metadata. CLI JSON and HTTP list results carry the same matched strings and
spans; clients highlight those spans without repeating matching. No migration
or FTS index is needed. See [ADR-0014](adr/0014-task-search.md).

Query changes read the filtered Task list and the current planning view concurrently.
Full refreshes also load the unfiltered catalog, discovery and all view counts.
Both clients guard all publication after every required read finishes.
Full requests mark the catalog owed before reads. A query promotes to full while
that obligation remains, including after a failed or superseded full refresh.
Only a guarded full publication clears it. Startup, accepted writes, current-Profile
SSE/reconnect, selection resets and Snapshot reload keep full catalog coverage.

Normalized duplicate clauses execute once. Word clauses memoize acceptance for
each distinct folded word within one field evaluation and retain every original
occurrence for spans. Typo prefixes use a reusable banded unrestricted Damerau
buffer. The CLI and the server share one generator core. Both drain it through
`filterTaskRecordsEffect`, yielding between Tasks and after
512 evaluated word occurrences. `TaskCommands.list` starts that drain after
`auth.read` has returned its authorized in-memory view, with no SQLite read
transaction open. Field preparation uses the same generator, yielding after
512 graphemes or segmented parts while preserving normalization across chunks.
Client disconnect interrupts the HTTP fiber at a checkpoint through the Bun
HTTP adapter's request abort listener.

Each OperationStore owns a bounded TaskSearchCache keyed by Profile and exact
field text. It retains complete PreparedFields across requests; a hit returns
the words and preparation count without refolding or preparation yields. Query
results and empty-clause work are not cached. The LRU retains at most 4,096
entries. Retained entries and up to 4,096 current pending slots share a 16 MiB
charged budget; a completed entry over 4 MiB computes without retention. Charges
include exact keys, Profile strings, containers and Words. These accounting
bounds exclude transient preparation buffers, superseded invocation-local tokens,
allocator overhead and separately reported per-Profile generation metadata;
they are not RSS limits. V3's expanding 100,000-character field is not retained.

A read captures the cache-wide epoch and its Profile's cache-local purge
generation before authorization and the SQLite Task read. A miss registers a
fresh ownership token, yields during preparation and admits only while its token,
epoch and generation remain current. Later misses supersede earlier tokens;
interruption or failure removes only the invocation's own current token.

Every Purge clears the whole memo and advances its epoch inside the transaction.
This erases moved Tasks' earlier Profile keys and fences in-flight reads even
before they register a pending slot. Snapshot restore also clears and fences the
memo before returning. Local Profile deletion advances that Profile's generation
and evicts its entries and pending slots. Rollback can lose retention only.
Close empties all cache state and permanently fences admission.

Before serving HTTP, the server captures the current operation sequence. Its
250 ms hygiene observer reads only new committed seq/kind/original_kind fields.
The domain owns that SQL query. Restore metadata uses the existing Profile/seq
index with canonical NULL Profile and snapshot-restore actor headers before JSON
extraction. Task payloads are not decoded by the observer. A committed
TaskHistoryRedacted row with original_kind TaskPurged, a TaskPurged row or a
ProfileDeleted row clears the whole memo. A Snapshot generation change clears it
and resets the cursor to the current maximum, including a Purge at a reused
sequence before the next poll. Compiled CLI/server proofs require eviction within
1000 ms, including CLI startup. The observer can clear again after this server's
own Purge; that harmless extra refill is deliberate. A Purge is rare owner work,
and the next search pays one uncached refill. External Profile deletion also
clears all Profiles. This is memory hygiene, not database coherence for matching.
Exact current text keys preserve search results after other writers and restore.

`PreparedField` carries words and the exact folded UTF-16 field length.
Search charges that length after each field is ready, including supplied stored
PreparedFields, and charges evaluated Damerau cells plus walked word occurrences
and tested phrase start positions with one shared rational
weight. The request meter spans Tasks that pass the other TaskFilters and checks
at checkpoints and before publication. A refusal returns `search_too_broad`,
CLI exit 2 or HTTP 422, with no partial rows. The limits and owner decision are
in the [ADR-0014 budget amendment](adr/0014-task-search.md#search-work-budget-owner-2026-11-09).
The Effect driver closes a suspended generator on interruption or failure.

Each client retains one applied response snapshot while requesting a newer
identity. Search text survives Profile and view switches. Failed reads offer
Retry and recover on current-Profile SSE reconnection or operations, without
a search retry timer. See [ADR-0015](adr/0015-search-text-retention-and-recovery.md).

## Agent discovery contract

HTTP Task reads load Profile-filtered projection rows. Task lists authenticate
and materialize metadata, Tasks and Dependencies in one checked SQLite callback.
Search CPU work and response encoding run afterward on owned rows and selectors.
Planning views use a Profile catalog without History or Series.
Project and Tag counts use grouped projection queries. Profile counts use one
grouped query for the credential's authorized, active Profiles inside the existing
immediate authorization transaction. Directory counts share its existing deferred
read snapshot. Projection guards, generated Task columns, Version validation and
atomic event/projection writes remain authoritative. Reads do not replay the log.

Credential checks create read authorities inside the authentication module.
Profile, scope, parsed fields and database identity live in ECMAScript private
fields. Query ports validate the genuine instance, exact prototype, authority
kind, database, live transaction lease, failed-scope ancestry, expiry and the
credential check's write serial before SQL or image access. The outer checked
callback's finally closes the lease before native COMMIT and transaction-exit
cleanup. A final fallback handles failed admission. Rollback, interruption and
failure also close it. Failed nested scopes invalidate their
values without ending Discovery's outer snapshot. A later checked scope verifies
credentials again and requires the original restore generation. Copies,
subclasses, mutation and retained values cannot grant access; refusal uses the
existing generic storage error. The authority, its payload and its
class/prototype are frozen. Ordinary readers return data and plain selectors.

One classifier runs in the credential-check snapshot after credential and scope
validation. It distinguishes active, tombstoned and never-created identifiers.
Only an active Profile receives a query authority. Never-created results contain
no Profile id or authority and use literals for empty replies; Quick-add parses
its supplied text without looking up Tags or Projects. Their credential lookup
and classification are the only statements. CLI name resolution selects the
active id after name reuse; a deleted HTTP id remains unavailable.

Diagnostics materializes generation, Snapshot manifests, pending reminders and
metrics inside a checked owner callback under the existing IMMEDIATE transaction.
This holds the writer lock longer while total read time remains unchanged.
Paired owner-shaped measurements give continuous hold medians of 3.59 ms before
and 25.34 ms after; the retained-Snapshot fixture gives 3.67 ms and 31.39 ms.
The coordinator accepted this cost for this unit. A separate writer waits until
the read returns, then commits. A deferred owner read scope and cheaper metrics
queries remain proposals for a later unit. Snapshot write helpers continue to
use requireOwner under the write path's rules.

Task History selects relevant event rows in SQL before decoding OpLogEntry.
SSE catch-up selects only committed rows for its Profile and cursor. Full History
reads remain available to commands that need them, Revert, replay and recovery.
The ordinary HTTP authorization transaction remains immediate. No transaction
mode changes accompany these projection queries.

The approved [agent discovery contract](decisions/agent-discovery-phase-0.md)
adds a Profile-to-Project directory and explicit read-only Task prefix lookup.
`Discovery.directory` and `Discovery.lookup` call the existing authentication
queries inside `Authentication.readSnapshot`, one synchronous deferred SQLite
transaction. The Profile visibility predicate remains in Authentication. Each
Profile read rechecks the credential; any failure discards the aggregate before
rejected-auth History is recorded in its separate transaction. A concurrent WAL
writer cannot mix database states in a response. Deletions or revocations
committed after that snapshot are observed on the next request. No discovery
cache, migration, event, or persistent write is added.
[ADR-0019](adr/0019-authorized-read-only-discovery.md) records the boundary.
Normal Task lookup and mutations remain Profile-scoped. The workflow
frames are `agent-errors`, `agent-lookup-errors`, `agent-directory`, `agent-prefix`,
and `agent-list` in the shared Excalidraw scene.

`exit-status.ts` owns the process exit pair and its constrained schema. HTTP
errors keep their tags and statuses and add the equivalent pair. Request decoding
uses the API-wide RequestDecoding middleware, while ValidationHistory keeps
authenticated rejection recording for Task mutations. `task-lookup-error.ts`
reads the selected Profile through Authentication before formatting recovery.
The CLI enriches missing Task errors while its store is open. Normal History
reads, exact-id selection and mutation authorization retain their existing rules.
ListResponse requires tasks, including an empty array. Export and Review retain
TasksResponse and their original output.

## Live updates

![Live updates: a desktop client, the SSE route, op_log, and a CLI writer](diagrams/live.png)

`GET /profiles/:profile/events` is `text/event-stream`. A `ready` event has no
id. Each later `operation` event is a committed `OpLogEntry`, with `seq` as the
SSE id. Only that Profile's committed operations appear, so gaps in ids are
normal: rejected attempts and other Profiles are skipped.

The route rereads `op_log` every 250 ms and checks the credential on each pass.
Each poll checks and materializes in one transaction and retains plain
subscription selectors between polls. A never-created identifier is classified
again on every poll, so a later CLI creation starts normal ordered delivery.
An already connected, still-valid unscoped credential (a Session or Access Token)
has a private one-shot terminal permission through the committed `ProfileDeleted`
sequence, followed by the existing failure and close sequence. Revoked or expired
credentials receive no terminal batch. A deletion-revoked scoped Token closes as
revoked. The base's
terminal batch for revoked or expired credentials is intentionally removed under
the owner's ruling.
The compiled frame comparison covers ordering, gaps, reconnect, restore,
revocation, expiry and deletion. A valid Session or unscoped Token keeps the same
final TaskCreated, two TaskDeleted and ProfileDeleted frames, then the same
not_found failure and close. A deletion-revoked scoped Token, an already revoked
Session or Token, and an expired Session or Token receive only ready followed by
their unchanged Unauthorized revoked or expired failure
and close. The base also sent the terminal operation batch to these credentials.
The exact raw frames and sequence ids are recorded in the server-reads report.
That is how a `todo edit` from the CLI process reaches an open desktop app.
There is no file watcher and no IPC between the two processes. Reconnect with
`Last-Event-ID: <seq>` to resume after that id, and save cursors per Profile.
After a Snapshot restore the generation changes, and the stream sends `reload`
with the generation and `restore_seq`.

The scheduler lives in the server process. It fires reminders for due instants,
wakes snoozed Tasks, and deletes expired credentials. Each pass rereads SQLite,
so a restart does not lose work. ReminderFired operations do not advance Task
Version. Date-only planning values do not fire reminders.

Creation and import accept Attachment reference arrays. Creation validates every
reference before committing the Task. Import can adopt an existing Task by id
and expected Version. Batch Attachment commands commit one Task group at a time,
with attached, unchanged and rejected results. URI storage and these atomicity
rules are defined by [ADR-0013](adr/0013-attachment-uri-and-atomic-inputs.md).

Batch edit accepts explicit Task ids, each Task's expected Version and exactly
one shared field change. The CLI and `POST /profiles/:profile/batch-edit` call
`batchEditTasks`, which composes the existing Task edit command. Each Task
commits independently. A stale Version returns a Conflict row without changing
that Task. Dry run executes against an in-memory store copy, preserving the
source database, History, metadata definitions and Versions. Both desktop
clients keep the loaded selection for preview and apply, then reload the
current Versions explicitly after a Conflict.

## Diagrams

The architecture and proposed Task search workflows are frames in one Excalidraw scene,
`diagrams/todo.excalidraw`. The scene is generated by
[diagrams/generate.mjs](diagrams/generate.mjs) and is not tracked in Git: run
`bun docs/diagrams/generate.mjs` to write it locally, then open it at
excalidraw.com to explore. Its labels name real
tables, columns, routes and pragmas. When one of those changes in code, change
the label in the generator and render again:

```sh
docs/diagrams/render.sh
```

The script rewrites the scene and exports each frame (`runtime`, `write`,
`model`, `live`, `search-cli`, `search-http`, `search-electron`, `search-swift`,
`search-copy`, `search-electron-filters`, `search-swift-filters`) to a PNG with `excalidraw render --frame-id`. The search design
gate is [Task search Phase 0](decisions/task-search-phase-0.md). It needs a local
Chrome, Chromium, Edge, or Firefox. It does not need an Excalidraw account.
Colors follow `design/electron/TOKENS.md`.

The proposed Task dependency workflows are also frames in the scene, with
`dag-` prefixes for CLI edge edits, Delete, status refusals, and each client's
picker, list drag, Delete dialog, and graph view. The coordinator approved [Task DAG Phase 0](decisions/task-dag-phase-0.md)
with corrections G1 through G10. ADRs 0016 through 0018 are accepted; their
runtime implementation and verification follow in units A, F, B, E and S.

## Task Dependencies

Tasks and direct Dependency edges are independent facts. Migration 0007 creates
task_dependencies with composite same-Profile endpoint foreign keys, a primary
key by Profile/dependent/blocker and a reverse covering index. Projection schema
recreation creates DDL without changing user_version. Only migrate advances it.
Compact edge events and grouped lifecycle v2 deltas replay through the operation
store; existing v1 events and checkpoints without edges remain readable.

The authoritative dependency-rules and store/dependency-validation modules own
endpoint, cycle, degree and lifecycle guards inside BEGIN IMMEDIATE. Public
commands authenticate and validate visible endpoints before no-op detection.
A no-op writes no History or Version even when its valid expected Version is
stale. A real change CASes only the dependent. Captured full DependencyError
responses survive rollback; History retains the bounded copy.

OperationStore.graph(Profile) reads Tasks and edges in one SQLite read
transaction. graph-model builds temporary adjacency; graph-order uses a Kahn
min-heap over the whole Profile before filters; graph-energy uses temporary
ancestor bitsets and weight masks for distinct pruned sums. graph-queries owns
components, Ready/Blocked, strict ancestry, depth and shape/orientation.
graph-mermaid formats typed identities and escaped labels without a renderer.
TaskRead/TaskView carry optional response metadata, and TaskWrite names additive
write reports. None changes stored Task content. Optional graph metadata stays
omitted on default reads of Profiles with no edges, preserving legacy payloads;
explicit graph filters and ordering still compute the complete result.

The CLI and HttpApi share Dependency commands, initial creation, public Revert,
and Delete fingerprint checks. Batch edge edits commit per item; previews use
an authenticated in-memory fork without source History or Snapshot changes.
TTY md Delete prompts show both directions, default No, and submit the reviewed
fingerprint. JSON and non-TTY requests use explicit confirmation. Client feature
UI and renderer integration remain later units under ADR-0009.

import-dependencies plans external-id references over the proposed Profile graph,
including later file rows. Import applies in dependency order and reports in
file order. Each Task resolves successful mappings again under its writer lock;
failure rolls back that Task's payload, edges and History. Import errors preserve
current_version and an optional complete nested dependency_error.
Export reads one consistent graph snapshot and emits depends_on only when
nonempty. Obsidian keeps one managed note with stable Task blocks, same-note
wiki links and pure Mermaid formatting. GraphNode.mermaid_id maps diagram nodes
to full Task identity without relying on labels or diagram parsing.

Under approved G11, GraphNode carries only mermaid_id, task, in_degree,
out_degree, ready, blocked, depth and remaining_energy. GraphReport carries
strict ancestors, strict descendants and lightest_next for its requested Task
only. Ancestors and descendants use whole-Profile topological order. lightest_next
contains Ready members of the remaining set, including a Ready root, sorted by
own energy ascending, unknown energy last, then whole-Profile topological
position. Query another Task for its sets.
Reachability and Ready-set membership are computed outside node assembly, so
the serialized report has O(n+m) content plus the requested root's sets.
Shared ranking energy and unknown-energy tie behavior are unchanged.

Read authorization owns and validates the request fields before the credential
callback, then returns a frozen nominal read value containing its Profile,
credential scope and parsed fields. Query continuations use that value. Task
lists, Show, graph, History, planning views, Discovery, image reads, owner Snapshot
reads and SSE keep their ids and filters through later callbacks and yields.
Credential secrets are private fields rather than enumerable result properties.
Profile counts consume the checked Profile rows and their ids once; they do not
rediscover a visible set from the credential after checking it.

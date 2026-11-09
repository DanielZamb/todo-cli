# Task dependency graph design gate

Status: approved with coordinator corrections G1 through G10 on 2026-11-09.
The corrections are incorporated below. A and F may start without another gate.
Integration branch: `feat/task-dag`, based on `feat/task-search` at
`228e3485004eb9ccef670467fcbd4e88e48f806f`.
Timebox starts conservatively at 2026-11-09 03:14 UTC and ends at 19:14 UTC.
The canonical checkout stays on its current branch. This run never pushes.

The contract comes from the DAG-L1 brief and decisions through Batch 11 in
`.orchestrator/runs/2026-11-07-task-search-dag`. Later decisions replace the
superseded research recommendations about DFS, Version-first no-ops, and force.
Research artifacts remain in the coordinator's canonical checkout. No owner
Task or real database is read or changed by this run.

## Meaning and algorithms

A Dependency has a dependent and a blocker. B depends on A draws A -> B.
Nodes and edges are separate facts. There is one edge kind and no group entity.
Both endpoints must be visible Tasks in the same active Profile. Single
Occurrences can link to ordinary Tasks or other Occurrences. Successors inherit
no edges. No Series-level edge controls appear.

A Task is Ready when its status is open or snoozed and all direct blockers are
done or cancelled. A Task is Blocked when its status is open or snoozed and
it has at least one open or snoozed direct blocker. Done and cancelled Tasks
are neither Ready nor Blocked. Both true filters compose by AND. Filters are
true-only: CLI switches or HTTP ready=true and blocked=true. Supplying false
is a usage error, exit 2 or HTTP 400, with a message pointing to --blocked or
--status. All predicates run before the read adapter returns.
Cancelled blockers display explicit Cancelled text.

`addDependency` runs under `OperationStore.transaction`, which acquires
BEGIN IMMEDIATE before rereading endpoints and edges. Authorization, input
shape and endpoint visibility precede the no-op decision. An existing edge or
absent removal succeeds unchanged before any current-Version comparison.
This exemption applies to a stale valid Version, not a malformed input.
A real change checks the dependent's Version. The blocker Version stays fixed.

Cycle checks follow all statuses. Reject a self-edge with dependency_cycle and
`[id,id]`. First test whether the blocker has no Dependencies or the dependent
blocks nothing, using covering indexes. Otherwise BFS upstream from the new
blocker, recording one predecessor per discovered node. Stop on the dependent
and reverse that discovered path into arrow order, then append the closing edge.
Rotate the closed loop to its lexicographically smallest id for deterministic
output. Equal-length witnesses use sorted adjacent ids. This produces
A -> B -> C -> A in the literal fixture where A < B < C. The search has no depth
limit. Time is O(a log m), and space O(a), under the direct in-degree limit.
A separate reachability query reports the shortest existing implying path for
an allowed redundant edge. The stored edge remains in every graph/export.

At most 13 direct Dependencies are allowed. Adds resulting in 9 through 13
return many_dependencies with this exact text, replacing N with the count:
"This Task depends on N Tasks. That's a lot for one Task. It might be a whole
Project, or it might be clearer split under a few more parent Tasks."
The 14th returns too_many_dependencies with the same advice and count 14. Out-degree is
unlimited. A create input over 13 is refused before writing anything.

A single consistent read transaction loads a Profile's Tasks and edges.
`topologicalOrder` uses Kahn plus a min-heap. Ties use P1 before P2 before P3
before P4, earliest due first with missing due last, created time, then id.
Reuse the existing date/instant comparator. `lightest` prepends remaining
energy to that key. Run on the whole visible Profile graph before view
membership and filters, keeping relative order. Terminal statuses never remove
edges from this ordering. A cancelled Task with an open blocker stays behind it.

Remaining energy of an unresolved Task includes its own weight and all open or
snoozed ancestors reachable through open or snoozed Tasks, each once. Done and
cancelled nodes stop this weighted walk. A resolved root has zero remaining
energy and zero unweighted. An unresolved node without energy contributes one
to unweighted and still permits upstream traversal. A 1,2,3,4 diamond totals 10.
Profile-wide ranking uses temporary ancestor bitsets and weight masks, never
stored sums. `lightest_next` contains the Ready Tasks in T's remaining set,
including T itself, sorted by their own energy, unknown last, then whole-Profile
topological position. A Ready unresolved T gives [T]. A done or cancelled T
gives []. No estimates or critical path are exposed.

The connected group is the weakly connected visible component. Sources have
in-degree zero; sinks have out-degree zero. Ancestors and descendants are
strict sets in topological order. Depth is longest edge-count from a source.
`single` means one node; `chain` means every in-degree and out-degree is at most
one; `tree` means a non-chain connected graph with n-1 edges; otherwise `dag`.
Tree results also carry orientation: converging when every Task blocks at most
one other Task, diverging when every Task has at most one blocker, or mixed.
The single and chain cases take precedence, so those two tree orientations
cannot overlap. Redundant stored edges affect the shape.

## Wire and CLI contract

The exact proposed schemas are in [contract.schema.json](task-dag/contract.schema.json).
Regenerate with `bun docs/decisions/task-dag/build-contract.mjs`. The generator
copies the existing Task and Attachment contract, so no partial Task type or
hand-maintained duplicate is introduced. The Extension definitions describe
additive fields, not replacements for existing request or event schemas.
Effect Schema remains authoritative after implementation; unit B compares its
emitted JSON Schemas to this approved contract and records deliberate changes.

Every new CLI response is one object with generated_at. `todo schema` publishes
depend, undepend, graph and batch-depend. Existing mutation envelopes retain
their fields and add the graph report fields where relevant. HTTP Task writes
retain their current top-level Task shape. Create with initial Dependencies
adds optional dependency_warnings to its response only. Move adds optional
removed_dependencies and affected_versions. DELETE adds the same optional
report fields, dependency_fingerprint and dry_run to its Task response. These are response types,
never stored Task fields. The schema's DeleteReport describes the CLI report.

| CLI | HttpApi operation and route | Request and result |
| --- | --- | --- |
| `depend <task> --on <blocker> --expected-version N` | tasks.depend, POST `/profiles/:profile/tasks/:task/dependencies` | DependRequest -> EdgeReport |
| `undepend <task> --from <blocker> --expected-version N` | tasks.undepend, POST `/profiles/:profile/tasks/:task/dependencies/remove` | UndependRequest -> EdgeReport |
| `graph <id>` | tasks.graph, GET `/profiles/:profile/tasks/:task/graph` | GraphReport, whole connected group |
| `batch-depend --file <path> [--dry-run]` | tasks.batchDepend, POST `/profiles/:profile/dependencies/batch` | BatchEdgeRequest -> BatchEdgeReport |
| `add <title> --depends-on <id>` repeated | existing tasks.create | CreateTask plus CreateExtension |
| `list --ready --blocked --order topo\|lightest` | existing tasks.list and planning reads | TaskFilters plus ListExtension |
| `rm <task> --with-dependencies [--dry-run]` | existing tasks.delete | DeleteQuery, additive Task response |

Batch edge edits process input order, one independent transaction per item.
A later item sees earlier committed changes. Each item supplies its own expected
Version, including when the same dependent occurs twice. Dry run executes the
same sequence against the existing in-memory preview store and writes nothing
to the source, History or Snapshot files. Each result includes its original
index. The CLI exits with the highest failing item's exit code, or zero if all
succeed. Both clients offer selection-based preview and apply through this
endpoint, with per-dependent Versions and per-item refusal rows.

`graph` accepts json, md, and mermaid. Table is refused for graph. Every other
command keeps its current accepted formats and refuses mermaid with exit 2.
The graph JSON always includes deterministic Mermaid text. Safe node names map
to full Task ids through typed nodes. Quoted labels escape entities and wrapping.
CLI formatting never imports Pele. HTTP also returns that exact text.

A Dependency read response adds optional depends_on, blocks, ready, blocked,
and remaining_energy to TaskRead/TaskView only. Task lists used by pickers are
Profile-wide rather than constrained by the current view's filters. Existing
linked Tasks remain checked while picker search narrows candidates. Each
candidate's current Version is retained for the Blocks direction.

New DAG refusals use DependencyError unchanged in HTTP 422 and the CLI exit-2
error object. Every message says how to recover. Existing auth, not_found and
Conflict mapping stays, including latest Task on HTTP 409 and current Version
in CLI Conflict details. A cross-Profile id never exposes the foreign Task's
content. Invalid shapes remain usage/HTTP 400. The new error messages are:

| Code | Recovery in message and structured evidence |
| --- | --- |
| dependency_cycle | Show closed loop path. "Remove a Dependency in this loop, then try again." |
| too_many_dependencies | Count and limit 13, plus the many_dependencies advice above. |
| blocked | List unresolved direct blockers. "Finish or cancel these Dependencies first." Adding one to a done Task says to choose a resolved Dependency. |
| blocks_done_task | List done dependents. Point to `todo add "<title>" --depends-on <done-id>` and Create follow-up in apps. |
| has_dependencies | Enumerate both directions. "Use --with-dependencies to delete this Task and remove these Dependencies." |
| dependency_profile_mismatch | "Choose two Tasks in the same Profile. Move drops Dependencies; copy creates none." |

`done`, generic status edits, add/import, reopen and Revert share the same
invariant checker in the authoritative append validation path. A command
cannot bypass graph rules by forging a resolved event. Completing a Blocked
Task has no force option. Reopening a done or cancelled blocker of a done Task
fails blocks_done_task. Create follow-up preserves the source Task and opens
Quick add with depends_on set to the chosen done dependent, using current data.

On rm, --force still means Purge of an already deleted Task. A visible Task
with incident Dependencies requires --with-dependencies. In md mode with stdin
and stdout both TTYs, list both directions and ask [y/N]. No or EOF returns a
quiet cancelled report, exit 0, without writes. JSON and other modes never
prompt and return has_dependencies, exit 2. --dry-run reports the locked preview
without confirmation, writes or Snapshot. Apply rechecks after acquiring the
writer lock. The preview returns dependency_fingerprint, the SHA-256 of sorted incident Edge JSON. A confirmed request includes that optional fingerprint. If its edge set changed, return has_dependencies
with the current set and require renewed confirmation. Never silently authorize
newly discovered edge removals. Every app Delete has a dialog even with no edges.

Export adds depends_on only when non-empty; old goldens stay byte-identical.
Import resolves depends_on external ids across the complete proposed Profile
state, including references later in the file. Invalid/missing references,
cycles and stale Versions refuse that Task group through the same domain rules.
Initial Task plus its edges is one event, one transaction, Version 1. No half
created Task survives a refused initial edge. Existing import preview/apply and
close-missing behavior remains subject to lifecycle graph rules.

Obsidian uses stable `^task-<full-id>` block ids inside its managed block.
Depends on links target `[[#^task-<id>|<escaped title>]]` within the one existing
projection note, followed by the group's Mermaid block. If a referenced Task
is outside the exported selection, its link uses the id as the label and the
report identifies it as outside the projection. It does not invent a separate
note. Writes preserve all content outside the managed block. Files without
Dependencies retain their old projection output exactly.

## Storage and resolved events

[Migration 0007 SQL](task-dag/migration-0007.sql) is an executable draft. Run it
after the automatic pre-migration owner Snapshot, inside the existing migration
transaction. Its BEGIN/COMMIT document that boundary; do not nest them when
embedding statements in the migrator. Repeating the migration is a no-op. No
existing payload or op_log row is rewritten. The reverse index is a covering
index, not another semantic edge. The domain gate protects all three writes.

New DependencyAdded and DependencyRemoved events use entity_version 1,
occurred_at, dependent_id, blocker_id, from_version and to_version. The Profile
is the existing op_log envelope. from_version/to_version match the dependent's
transition and top-level envelope. Applying the delta sets row_version and
updated_at from resolved facts. No replay clock or revalidation is involved.
No-op operations append no committed or rejected row.

DependencyChanges contains added, removed and versions arrays. Each Edge has
profile_id, dependent_id and blocker_id. Each VersionChange has id,
from_version, to_version and resolved updated_at. Within one grouped operation,
a surviving dependent appears once even if it loses many edges. The primary
Task's existing before/after transition is authoritative and is not duplicated
in versions. A deleted primary advances once, through its existing transition.

TaskDeleted with edges uses entity_version 2 plus dependencies. Its single
committed op records every incident removal and affected surviving dependent's
Version. Legacy v1 TaskDeleted remains readable. TaskMovedOut v2, TaskCreated v2
with initial edges, TaskReverted v2 and their Series-create counterparts use the
same required dependencies shape alongside their existing fields. No-edge
operations may continue v1. Move drops every incident edge under the same outer
transaction as TaskMovedOut/TaskMovedIn; copy carries none. Profile deletion
rereads Tasks after each cleanup or resolves the batch before writing, so graph
Version changes cannot invalidate a preloaded later delete silently.

TaskPurged needs no current edge removals after Delete. It still redacts every
historical reference to either endpoint, including rejection details. Structural
ids and surviving Versions remain replayable. TaskHistoryRedacted.replay gains
an optional dependencies field; old entries mean empty. Unrelated Task content
is preserved. Purge redaction includes live History, internal replay checkpoints
and all stored owner Snapshots, using the existing durable Purge journal.

`changes()` returns Task, Series and edge changes. `applyChanges()` removes
edges before removing or moving endpoints and inserts endpoints before new
edges. Delta Version updates use existing Task content without rewriting
unchanged Tag links. `rebuild()` drops task_dependencies before tasks, recreates
schema and guards, and applies committed facts in seq order. The internal
Snapshot gains optional edges, old missing fields decode as [], and
snapshots.entity_version stays 1. No group, closure, Ready, sum or rank is stored.

Revert inverts recorded edge deltas against the current graph. Remove first,
then validate all proposed additions together for visibility, Profile, cycles,
in-degree and done/reopen invariants. Every affected current Version must match;
no stale full adjacency replacement. It either commits the whole inverse in one
TaskReverted event or refuses it. A Revert of Delete restores every removed edge
after a fresh cycle check. Purged endpoints make recovery impossible and reuse
the existing task_purged refusal. Current rejection evidence is captured while
the writer lock is held, then recorded after rollback in a rejected op_log row.

Full error responses return the whole witness. History stores a bounded copy
under optional details with truncated and total fields if needed, subject to
ADR-0007's existing 32,768-character rejected-input budget. It never disguises a
large witness as input or recomputes it after rollback. Purge understands the
new structured references. SSE decodes the new event variants and reloads the
current Profile graph, because touched ids alone miss transitive energy changes.

## Client workflow and design gate

The diagrams use real existing entry names and explicitly proposed Dependency
symbols. Frames are generated by docs/diagrams/generate.mjs and render.sh.
Each transition says `event [guard] / action`, arrows bind both endpoints,
and numbered notes explain lock boundaries, direction or request identity.
Separate picker, drag, delete and graph frames keep their sub-machines legible.

Compact is the first review target. Depends on and Blocks open one searchable
native picker with linked rows checked, explicit relation labels, and current
Versions. Checking a Depends on candidate means selected depends on candidate;
checking a Blocks candidate means candidate depends on selected. Toggle writes
are immediate and serialize per dependent. Failure retains selection and shows
the recovery, Conflict requires Reload rather than a blind retry. A cancelled
blocker is labelled Cancelled. No-op feedback is quiet Already linked or
Already removed. Batch selection offers preview before apply.

Dropping a source Task onto a target makes the target depend on the source.
The source blocks the target, matching the parent model. The hover label says
"<target> will depend on <source>" before release. An already linked target says Already depends on
and drops without a write. Self and foreign-Profile targets cannot commit.
The menu action Add dependency and a keyboard shortcut open the same picker.
No drag-to-connect inside the diagram ships in v1.

Every Delete opens a dialog. It lists incident Dependencies, defaults to Cancel,
and names the destructive action "Delete Task and remove Dependencies" when
needed. An unchanged empty-edge Task uses Delete Task. A changed preview or
Conflict reloads the dialog and requires a fresh explicit confirmation. The
server performs the final checks. Offline state disables writes and retains
readable content. Escape/Cancel returns focus to the invoking control.

Ready and Blocked badges have text. Topological and Lightest first ordering
apply through the server while existing Task search and filters stay usable.
A blocks_done_task refusal offers Create follow-up with the relevant done Task
preselected. Both clients expose identical operations through the generated
contract, with platform controls.

The graph initially shows the selected Task, direct blockers and dependents.
Expand one level by click or keyboard; show how many group nodes remain outside
the region. Whole-group overview is explicit, reversible and preserves the
region selection. Above about 50 Tasks, keep list/search prominent and do not
turn fit-to-window labels into the only action targets. A keyboard-accessible
Task/Dependency list provides every action independently of SVG semantics.
Click opens Task detail. Context menu and keyboard actions open the same pickers.

The shared adapter uses Pele 1.13.0 render output with app-owned x/y/scale,
selected id, focused id and expanded-id set. It does not use mount().update(),
which resets the viewport. SSE refreshes guard Profile/request identity, keep
these values, and replace data only on the latest response. A vanished selected
Task returns to the region root if it survives; otherwise show the deleted
notice and list. Stale errors cannot replace a newer graph. Offline retains the
last graph read-only and reconnect fetches current data. Error offers Retry
while connected and the Task list remains usable. Pele render failure shows
the keyboard-accessible Task/Dependency list, the render error, and Retry
while connected. There is no second renderer at runtime in v1. Our own renderer
is a deferred strategic replacement if Pele is abandoned, alongside the deferred
Excalidraw experiment. Dagre remains rejected.

Both apps and the TTY prompt always submit dependency_fingerprint from the
reviewed Delete preview; agents may omit it.

The adapter binds pointerdown on node anchors before Pele zoom capture for
issue 130 and returns focus to the graph when a zoom/reset control disappears
for issue 131. Host fixes are proven in both browser engines. Resources are
local, network-free, and styled by shared tokens in light/dark. SwiftUI wraps
WKWebView with NSViewRepresentable and copies deterministic local resources
through project.rb. Retain MIT and ISC notices in both app bundles.

Laws of UX guides the proposed interactions: familiar search/check controls
reduce new gestures, explicit direction reduces what a person must remember,
and retained results with progress show honest request state. These are design
hypotheses to test with keyboard flows and literal state assertions. Electron
uses installed shadcn controls; SwiftUI follows design/macos/DESIGN.md. The
coordinator alone reviews visual design before integration.

## Formal plan

Follow create-formal-verification-skill. Unit F owns DagAcyclic and a project
verification skill with one command, pinned tla2tools 1.7.4 and SHA-256, mapping,
coverage hashes, sensitivity receipts and a relative .claude skill symlink.
Existing AtomicCAS is not a multi-Task graph proof and must also be rerun.

Model two writers named CLI and server. Each may observe stale Versions before
Begin. Begin acquires SQLite's single writer lock. Separate Resolve, Begin,
ValidateVersions, ValidateGraphAndStatus, Record, ApplyEdges, ApplyTasks,
WriteVersions, Commit, Crash, RejectBegin, RejectRecord and RejectCommit.
Pending state is private; Commit alone publishes edges, Tasks, Versions and the
resolved event together. A crash discards pending state. A rejection can be lost
before its separate commit, as in AtomicCAS. Do not claim otherwise.

Actions include add, remove, complete, cancel, reopen, Delete with Dependencies,
and grouped Revert of each, including reopening cancelled blockers. Include
cross-Profile endpoints and deleting either endpoint while another writer adds.
Map Move/Purge integration with concrete replay/foreign-key tests; add small
model scenarios if they fit the reviewed finite bound. Do not overstate them.

Required invariants are TypeOK, Acyclic, SameProfileEdges, InDegreeAtMost13,
DoneHadResolvedDependencies, NoReopenUnderDone, OneEventPerDelete,
DependencyVersionOwnership, RejectedNoProjectionChange, AtomicGraphHistory,
CrashAtomicity and RejectionWitness. DoneHadResolvedDependencies is the durable
state predicate that every direct blocker of a done Task is done or cancelled.
NoReopenUnderDone also checks transition records to forbid accepted reopen of a
blocker with a done dependent in its pre-state. OneEventPerDelete compares one
lifecycle event, complete removed-edge set and once-per-dependent Version bumps.
RejectionWitness refers to the captured validation graph, not a later graph.

Use separate exhaustive configurations to keep the queue finite: three Tasks,
one Profile, two writers with one operation each and then a bounded Revert;
four statuses; Versions 1 through 4; max degree two for the count race. A
second small two-Profile scenario checks isolation. A dedicated 15-Task
single-add configuration checks 13 versus 14 if tractable, otherwise label
that exact bound as concrete proof only. Record all constants, initial states,
constraints, generated/distinct states, depth, queue remainder and elapsed
limits. Safety only; no fairness, unbounded safety or power-loss claim.

Mutants must produce intended counterexamples: cycle check before Begin,
no writer lock, status-pruned cycle check, omitted reopen guard and split
Delete event/edge publication. Do not accept a compiler failure, source-hash
failure, TLC timeout or unrelated invariant as sensitivity. Restore source
byte-for-byte and rerun clean after real-code mutation checks.

Generated-input checks import production code after A/B integration. Exhaust
all directed graphs through four nodes and status/weight subsets as affordable;
seed additional DAGs through 40 nodes with shared ancestors. Record exact seed,
case count and corpus. Assert every edge's blocker precedes dependent in both
Kahn orders; all-open weighted lightest equals reference scalar sorting;
remaining energy equals a brute-force distinct pruned ancestor sum; BFS returns
a shortest closed loop against brute-force small-graph paths; and rebuild
reproduces sorted task_dependencies exactly from the beginning and a checkpoint.
Include the literal 1,2,3,4 diamond, 101-plus-edge cycles, cancelled intermediate,
missing energy, shared ancestors and the 9/13/14 boundaries. Every property
needs a corresponding scratch broken variant caught by behavior, then a clean
recheck. Model mappings refresh after the final clients land.

## Units, reviews and proof

| Unit | Owned work and proposed domain additions | Gate and proof |
| --- | --- | --- |
| A | Storage/replay. `store/0007.ts`, `store/dependencies.ts`, `dependencies.ts` for schemas, and a narrowly scoped graph invariant file if authoritative append needs it. Extend events, projection, Snapshot, Purge, Revert and guarded validation. Regenerate OpenAPI and Swift for event-schema changes, with existing/new-kind SSE decode compatibility in both clients. New verify-dag from create-verification-skill. | After Phase 0 APPROVE. L1 behavior, compiled library replay, verify-op-log and verify-occ-atomicity. |
| F | Formal model/checker, coverage and generated-input driver. No product edits. Coordinate function interfaces with A/B. | Parallel with A. Finish production conformance after B, final mapping at integration tip. |
| B | Shared graph commands/queries/algorithms plus CLI and HTTP. Proposed `dependency-commands.ts`, `dependency-rules.ts`, `graph-queries.ts`, `graph-order.ts`, `graph-energy.ts`, `graph-mermaid.ts`; reuse and consolidate existing logic before adding each. Filters, lifecycle enforcement, batch, import/export/Obsidian, OpenAPI and regenerated Swift contract. | After A passes both seats and merges. Regenerate contracts again for new routes. L1 and L2 compiled CLI/server/filter/DAG drives. |
| E | Electron picker/drag/delete/graph/badges/sort/batch/Create follow-up and shared offline graph adapter. New renderer package only if a concrete two-client build requires it. | After A/B merge AND coordinator confirms final search-client base. L1 plus compiled unsigned host, Compact first, light/dark every new state. |
| S | SwiftUI parity using generated HTTP types; WKWebView local resources, production TodoModel state tests, offscreen renders and identifiers. | Same gate, parallel with E. L1, unsigned build, state reload proof and light/dark full/Compact captures. |

Every launch gets the full CONTRACT section, unit scope and standing.md verbatim.
Workers and seat-1 reviewers launch as top-level T3 Code threads with
t3_thread_launch, never delegate_task, under standing order 26. Use projectId
3a523920-22c1-494c-9832-b6ba933b7fb8 and modelSelection with instanceId codex,
model gpt-6.1-sol, and reasoningEffort xhigh for workers or max for seat 1.
Each code thread gets workspaceStrategy type worktree, baseRef feat/task-dag,
a unique unit branch and startFromOrigin false. At most three workers run
together. They commit locally and never push, merge, rebase or launch children.
Only L1 integrates. Every brief requires a terminal t3_thread_send to DAG-L1
and coordinator d1f1e5d1-fb49-4fdd-8fed-b1d95dbef97b, finished or blocked, with
branch, head SHA and status. L1 reads worker threads periodically using
t3_thread_read. If launch is unavailable, report blocked without fallback.
Before each launch, install, Electron build or xcodebuild, run disk-guard.sh.
Exit 3 stops work with DISK STOP and a WIP commit.

Each unit first proves itself at a commit. Then one read-only seat-1
Codex gpt-6.1-sol max thread reviews correctness, boundaries and comments.
Seat 2 and every visual review go to the coordinator. Merge only after both
pass. Run pnpm check after every merge and read its real exit code. Small
findings are fixed by L1; every new review or recheck gets a new read-only
t3_thread_launch worktree thread based on feat/task-dag. The reviewer inspects
the explicit unit SHA with git show and git diff; no checkout change is needed.

The no-comments skill requests an extra research child, which this run forbids.
As recorded in the search Phase 0 gate, inspect comments locally before commits
and include that audit in the permitted seat-1 review. No extra child launches.
After the coordinator authorizes rebasing onto the final search base, regenerate
packages/api/openapi.json and the Swift API with the generators. Never hand-merge
generated files. A must prove existing committed SSE operations still decode in
Swift GeneratedContractTests and Electron protocol decode, and new DAG kinds
are ignored or refresh safely without a decoder failure dropping the stream.

Before final report, run post-implementation-review and server-core-structure
across the whole branch, fix accepted findings and rerun affected proofs.

L1 is behavior tests at a commit with literal expectations and scratch databases.
L2 is compiled CLI/server/filter/DAG commands on fresh scratch databases with
real exit codes. L3 adds both clients seeing compiled CLI writes through SSE,
compiled unsigned Electron drive, production TodoModel state reload and offscreen
renders, all binaries from the report SHA. Compile binaries once per source
hash in .scratch/bin and record provenance. All Swift work uses swift-slot.sh;
Electron packages use the prescribed lock, but verify-electron takes its own.
Server readiness is at least 60 seconds. Stop only recorded server PIDs.

Final report names branch/head, merged units and both seats, pnpm check exit,
every proof level/exit/path, Compact-first screenshots in both appearances and
clients, formal bounds and mutant outcomes, domain files added, deviations and
unfinished proof. No push, PR, main merge, real Todo directory, signing,
Keychain, installed binaries, native Todo launch or owner Task edits.
The renderer investigation Task update remains with the coordinator because
this run explicitly forbids owner Task edits.

## Phase 0 receipts

Schema generation, migration-on-scratch checks, deterministic scene generation,
arrow binding/frame checks and render logs go to ignored
`docs/evidence/task-dag/phase-0`. Accepted records are ADRs 0016, 0017 and 0018.
No feature behavior is implemented or claimed proven by Phase 0 documents.
The coordinator approved Phase 0 with G1 through G10. A/F launches and product
implementation are authorized after committing these corrections.

The design check command is
`bun docs/decisions/task-dag/check-design.mjs <evidence-directory>`.
It checks the draft migration in an isolated in-memory SQLite database and
checks 11 workflow frames, 113 bound transitions, label syntax and frame bounds.
It is a draft SQL check against the required table shape, not a production
migrator proof. Schema generation resolves every internal reference. Render
success proves PNG production; the coordinator still reviews workflow/design.
No package install or pnpm check is needed for this documentation-only gate.

Coordinator G1 through G10 supersede the earlier proposals. They settle
nonterminal Ready/Blocked, true-only filters, tree orientation, inclusive
lightest_next, per-item batch atomicity, source-blocks-target list drag, same-note
Obsidian block links, mandatory client/TTY fingerprints, exact counted warning
text, and accessible-list recovery without a runtime second renderer.
Unit B owns the final CONTEXT.md and architecture update. The graph frames have
a further legibility pass after the coordinator review. Retry, SSE reconnect
and failed-read labels each sit on a separate horizontal transition segment.
The design check rejects overlapping transition labels or state-card collisions
and verifies those three recovery labels against the actual arrow geometry.

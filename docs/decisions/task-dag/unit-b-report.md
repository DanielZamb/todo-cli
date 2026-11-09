# Unit B delivery

Status: implementation complete within B's authorized scope; ready for L1's two
review seats. E/S feature UI, both-client L3 and final F review are not claimed.
Branch: feat/task-dag-b-commands.
Final source head: e7170510a376b51eaf3525bb9933cb0dd588b233.
The delivery commit contains this report, reviewed AtomicCAS mapping metadata
and the read verification helper's 60-second readiness correction. It changes
no production source after that head. Its full SHA is recorded after commit in
the local delivery receipt and terminal notifications.

## Source and provenance

The mandated first commit was N1/N2 only:
a01de1cee08d06e6b2621a0a3d7c624b6652326e. Its independent report and failing-
before/passing-after receipts remain in [unit-b-n1-n2.md](unit-b-n1-n2.md).
N1 separates projection DDL from migration 0007's version bump and proves legacy
0003 through 0006 cannot be skipped. N2 observes actual SQLite DELETE effects:
normal Delete removes all incident rows and defensive Purge deletes zero.

Algorithm checkpoint: f140c7b09bcb1db48ce4ccaee797ecfe60019ce4.
Public command checkpoint: dc35c13194fb04e1a21d3ef08cdcf1c427b0f595.
TTY checkpoint: 9dc862c0946f3d51146b24b6ea277dd92c8c65be.
Import/export source: 2b042586f666f7637db1ad381702fe5ca7f6b413.
Final public proof additions: e7170510a376b51eaf3525bb9933cb0dd588b233.

Final CLI and server were compiled from clean source at e7170510 into this
worktree's .scratch/bin. Both embed build e7170510. The source-content hash is
3dccd8a812dba9e935b94f3e6ad2959e472e78bbcc8e2eca882ca3240b03813c.
Contract identity is 3981d0f313389f41400069714ac721ab7eb85d02788fbd5c777135f6a4e5d0c9.
The build cache includes source hash and commit, preventing a WIP binary from
masquerading as a later committed build. CLI version, live server health,
binary SHA-256s, clean worktree, full source SHA and cache paths are retained in:
/Users/zambamon/.t3/worktrees/todo-cli/feat-task-dag-b-commands/docs/evidence/task-dag/unit-b/final-source/build/provenance.json.

## Delivered behavior

Shared Dependency commands own authenticated endpoint checks, no-op detection,
per-item atomic batch edits and response warnings. Valid stale no-ops write no
History or Version. Real changes CAS only the dependent. A's graph/status guards
remain authoritative inside BEGIN IMMEDIATE. Initial ordinary/Series edges
commit at Version 1; successors inherit none. Public edge Revert discovers the
dependent and uses its current expected Version. Full captured errors survive
rollback and reach CLI/HTTP; History is bounded and Purge redacts it.

Delete previews and TTY confirmation use incident-edge fingerprints checked
again under the writer lock. No/EOF/default No write nothing. JSON/non-TTY need
explicit confirmation; agents may omit the fingerprint. Changed-to-empty sets
still refuse stale confirmation with current empty evidence and renewed-preview
recovery. Force retains Purge semantics. Move drops/reports each incident edge;
copy carries none. Dry runs preserve source Tasks, edges, History, checkpoints
and owner Snapshot files.

Graph queries use OperationStore.graph(Profile)'s single read transaction.
Whole-Profile Kahn min-heap ordering precedes view/filter membership. Lightest
uses distinct terminal-pruned ancestor bitsets and weight masks, retaining all
edges in ordering. Queries expose Ready/Blocked, strict ancestry, components,
degrees, sources/sinks, longest-source depth, shape/orientation and root-inclusive
lightest_next. Mermaid is pure typed formatting, with escaped labels and stored
redundant arrows. No graph minutes, critical path or renderer dependency was added.

Import plans external-id references across the proposed Profile, including later
file rows, and restores report identity/order. Each Task resolves successful
mappings again under its writer lock; failure rolls back that Task completely.
Export emits depends_on only when nonempty and omits response-only metadata.
Obsidian stays one managed note, preserving surrounding text with stable blocks,
same-note Depends on links, outside-projection stubs and Mermaid.

Every new command/input schema is published through todo schema, with help/man
entries and shared recovery errors. CLI graph alone accepts mermaid. HttpApi,
OpenAPI and generated Swift contracts carry equivalent graph capabilities.
Existing formats, no-dependency goldens and SSE event kinds remain supported.

## Approved additive adaptations

- GraphNode.mermaid_id maps each safe diagram id to its typed Task identity.
- Canonical import error details preserve current_version and add optional
  dependency_error: DependencyError. Outer code/message mirror that witness.
  The compiled encode roundtrip retains the complete typed witness. This
  supersedes the earlier flattened proposal.
- has_dependencies.dependencies permits an empty set after a confirmed preview
  changes. Recovery explains the changed preview and asks for confirmation again.
- Named TaskWrite/DependencyError schemas reduce generated duplication without
  changing stored Tasks or weakening typed version/forbidden-key guards.

Count/advice/path and nonempty-graph/blocker constraints remain enforced. The
published-schema conformance reader explicitly applies trusted schema patterns.
OpenAPI/Swift are generator output; no generator or handwritten generated-code
merge was introduced. Existing typed v1/v2, malformed/contradictory and old-kind
versus DAG-kind decoder assertions remain intact.

## Final proofs

All commands below used fresh scratch data and read real process exits/statuses.
The absolute evidence root is:
/Users/zambamon/.t3/worktrees/todo-cli/feat-task-dag-b-commands/docs/evidence/task-dag/unit-b/final-source.
Each row names files/directories under that root. proof-exits.json retains every
actual exit, including the initial read-helper failure and its successful retry.

| Proof | Level | Actual exit | Evidence |
| --- | --- | --- | --- |
| pnpm check: 321 domain, 46 CLI, 30 server, 35 Electron passes | L1 | 0 | check.log, check-exit.txt |
| Compiled CLI, goldens and schema conformance | L2 | 0 | cli/commands.log, cli/actions.json, cli/goldens.json |
| Public CLI/HTTP graph, lifecycle, PTY and import/export corpus | L2 | 0 | public/actions.json, public/graph-public.json, public/import-export.json, public/cleanup.json |
| Compiled DAG library and competing writers | L2 library | 0 | library/result.json, library/race.json |
| Compiled base HttpApi | L2 | 0 | server/result.json, server/actions.json |
| Compiled read HttpApi after readiness correction | L2 | 0 | server-reads-60s/result.json, server-reads-60s/actions.json |
| Compiled write HttpApi and regressions | L2 | 0 | server-writes/result.json, server-writes/regressions/result.json |
| Combined CLI/HTTP filters | L2 | 0 | filters/result.json, filters/actions.json |
| Import, legacy migration order and transfer identities | L2 | 0 | import/commands.log, import/migrations, import/transfer-identities |
| SSE over real HTTP and concurrent CLI writes | L2 | 0 | sse/result.json, sse/provenance.json, sse/cleanup.json |
| Operation store, Purge and replay | L2 library | 0 | op-log/result.json, op-log/purge.json, op-log/dag-replay.json |
| Snapshot CLI/HTTP and restore/privacy | L2 | 0 | snapshots/commands.log, snapshots/result.json |
| Recurrence and browser import | L2 library | 0 | recurrence/result.json, recurrence/04-review-fixes.json |
| Real scratch protocol, production Electron decoder and Swift | L2 protocol | 0 | protocol/result.json, protocol/generated-tests-result.json, protocol/swift-result.json |
| Real Electron draft boundary regression | L1 | 0 | filter-draft.log |
| AtomicCAS one command, reviewed source mapping | finite formal + real code | 0 | atomic.log |

The protocol run executed all 20 GeneratedContractTests, including the live HTTP
case, with zero failures and no skip. The broader pnpm suite retains one existing
Electron skip; it is not a UI proof. All Swift invocations ran through swift-slot.
No native app or Keychain access occurred.

AtomicCAS final evidence:
/Users/zambamon/.t3/worktrees/todo-cli/feat-task-dag-b-commands/docs/evidence/fv01/fv01-check-nJSuwF.
Reviewed real-code sensitivity evidence:
/Users/zambamon/.t3/worktrees/todo-cli/feat-task-dag-b-commands/docs/evidence/fv01/sensitivity-jf9I1W.
Both real mutations failed with exit 1; restored production exited 0. The mapping
reviews schema/error forwarding and migration effects, rather than just hashes.
AtomicCAS remains finite single-Task/no-edge safety, not grouped graph proof.

## Acceptance witnesses and retained failures

The public actions cover same-Profile/self/shortest-cycle guards, redundant
stored edges, 9/13/14 counts, stale no-ops and real stale Conflicts, blocked
completion even with force, adding an unresolved blocker to a done Task,
reopen and completion Revert refusal, and edge Revert through CLI and HTTP.
TTY receipts cover No, EOF, default No, Yes and a competing write; agent paths
cover refusal, flag-only apply, previews and stale fingerprints including empty
sets. Move/copy and Series cleanup use real commands/routes.

Public graph receipts show cancelled-with-open-blocker exclusion from both
Ready/Blocked, preserved topo/lightest order, open-only filtering across that
terminal bridge, root-inclusive lightest_next, diamond sum 10, tree orientation
and an intact 105-Task closed-cycle witness. Library receipts add every shape
orientation, missing weights, exact degree/depth/strict ancestry and replay.
A 40,000-character blocker returns intact through public JSON, its rejected
History is bounded, and real Purge redacts that rejected row. A SQLite trigger
proves a failed first batch item rolls back while the next commits, with exit 1.

Import receipts retain failed-adoption exit 1 before the fix, and exit 0 after:
../import/before-adoption and ../import/after-adoption. The overlapping flat
detail union lost witness fields during encoding; before-error-encoding exited
1 and after-error-encoding exited 0 using the canonical nested schema. Public
proof covers both failed and successful adoption, later references, missing and
foreign references, cycle refusal with independent success, close-missing,
Version-1 initial edges and per-Task atomic failure. Exact source bytes and
owner Snapshot files remain equal for previews.

At final source, server-reads initially exited 1 because its inherited readiness
loop allowed only five seconds under concurrent load. No listen log appeared
before that deadline. The verification helper now allows 60 seconds as required;
server-reads-60s exited 0 against the same final binaries. Both receipts remain.
The fix changes only verification timing, not production behavior.

## Domain additions and F handoff

Added packages/domain/src files: dependency-contract.ts, dependency-commands.ts,
dependency-delete.ts, graph-contract.ts, graph-model.ts, graph-order.ts,
graph-energy.ts, graph-queries.ts, graph-mermaid.ts and import-dependencies.ts.
dependency-delete.ts is Node-only and is excluded from the browser index.

[unit-b-algorithms.md](unit-b-algorithms.md) gives exact production signatures
for shortest-cycle BFS, Kahn/lightest, remaining energy/unweighted/lightest_next,
Ready/Blocked and shape/orientation. They remain exported through the index.
There has been no BFS/Kahn/energy/status/shape algorithm change since f140c7b0.
Final graphMermaid accepts {tasks: readonly Pick<Task,"id"|"title">[], edges:
readonly Edge[]}; mermaidNodeIds(tasks: readonly Pick<Task,"id">[]) returns
Map<TaskId,string>. readGraph(store, request: AccessRequest & {task_id:TaskId},
generated_at:Instant) authenticates then queries the consistent graph snapshot.
These formatter/read/schema wiring changes require final F re-pin at e7170510.
F's b71b3869 checkpoint against f140 remains separate; this worker did not restart F.

## Client alignment, audit and limits

The only existing Electron UI-file change is the authorized draft conversion
boundary. taskFilterDraft and applyTaskFilterDraft in task-filter-draft.ts keep
string fields separate from true-or-absent readiness. The real regression covers
prefix/text and all existing exact filter values, initialization, Apply, omission
clearing and false refusal. Cancel/Clear retain existing semantics. No controls,
focus or selectors were added. Exact command:
pnpm --filter @todo/electron test task-filter-draft.test.ts.
L1 must take final search's dialog, reapply this boundary, regenerate contracts
and rerun this regression plus verify-electron's filter feature at its rebased tip.
This worker did not rebase or change checkouts.

Local no-comments audit ran before every commit under the explicit no-child
restriction: zero new manual source comments/suppressions, zero comment
deletions/restorations, no unresolved constraint comments. Generated comments
remain generator output. Structure review traced writes to shared commands and
authoritative guards, reads to consistent queries, and formatting to pure domain
code. New concerns have separate modules; adapters introduce no second rule set.

Post-implementation review: completion within B yes; caller usability yes;
function-led form yes; core simplicity, soundness, instructive naming and
composability yes within the recorded evidence. A caller can create blockers,
add a dependent, inspect graph/Ready, recover from a blocked completion and
confirm deletion through the same CLI/HTTP rules. Future client pickers reuse
those commands and typed graph identity. No open B product defect is known.

E/S feature UI and both-client L3 remain held. Final F conformance and both
independent review seats belong to L1/coordinator. Screenshots are inapplicable.
No dependency version changed. No children, owner Tasks, real Todo data,
installed binaries, native apps, signing, Keychain, merge, rebase, push or PR
were used. All recorded own servers were stopped; cleanup receipts retain PIDs
and actual exits. Final work is ready for review, not integrated or published.

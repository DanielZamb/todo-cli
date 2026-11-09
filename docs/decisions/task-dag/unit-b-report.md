# Unit B delivery

Historical candidate status at 8ea84c32: implementation reported complete within
B's authorized scope. Both review seats subsequently withheld approval for G11
and CLI input validation. The combined closure section records their fixes and
new source proof. E/S feature UI, both-client L3 and final F remain unclaimed.
Current combined closure source: 3cceb41efc08b8cd835d5c883c3d370709865c3f.
Branch: feat/task-dag-b-commands.
Original reviewed source head: e7170510a376b51eaf3525bb9933cb0dd588b233.
Original delivery: 8ea84c32e18634ac48767b5a6035502bbd78c079. It contains this
report, reviewed AtomicCAS mapping metadata
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

## Combined review closure

Both seats withheld approval on delivery 8ea84c32e18634ac48767b5a6035502bbd78c079,
source e7170510a376b51eaf3525bb9933cb0dd588b233. This is the one authorized
combined fix round for G11 and the CLI input boundary. Its status is fixes
verified and ready for fresh max closure review and coordinator delta review.
No review approval or integration is claimed.

Corrected product/source SHA: 3cceb41efc08b8cd835d5c883c3d370709865c3f.
Branch remains feat/task-dag-b-commands. The closure delivery commit contains
this report and AtomicCAS identity-review metadata only. Its full SHA is saved
after commit in the closure delivery receipt and both terminal notifications.
No checkout, merge, rebase, push, PR, child or self-arranged review occurred.

### G11 response and retained baseline

GraphNode now has only mermaid_id, task, in_degree, out_degree, ready, blocked,
depth and remaining_energy. GraphReport has strict ancestors, strict descendants
and lightest_next for the requested Task only. All three use whole-Profile
topological order. Root reachability and next-set membership are computed outside
node assembly. Shared temporary energy bitsets remain as approved; this change
does not claim linear query computation time.

The compiled e717 baseline ran before product edits on a fresh scratch database
seeded with the review's exact literal Task data and ids. The committed reusable
fixture is packages/domain/test/fixtures/dag/chain-1000.json. Its SHA-256 is
9954c8d86f6e9abac1ac3fb46be0ea16a7043297e2815dff32533a4c5de93c8f.
Requested root: 90d7ac86-4b7e-4eb6-abb0-f76343e124c2.
Before and after have the same 1,000 Tasks, 999 edges and exact 999 root ancestors,
zero root descendants and the first Task as lightest_next. The old response
contains 999,000 repeated ancestor/descendant id references across nodes.

| Deterministic size for this exact fixture | e717 before | 3cceb41e after |
| --- | ---: | ---: |
| Actual compiled CLI JSON stdout, UTF-8 bytes | 49,255,186 | 1,206,265 |
| Compact re-encoding of the parsed object, bytes | 39,853,167 | 844,214 |

These are response-size observations, not HTTP-size, latency or speedup claims.
The actual CLI graph command exits 0 in both runs. The compiled desired-contract
assertion fails before with exit 1 and passes after with exit 0. Every direct
query node and every raw public node must have exactly the eight fields; closure
arrays cannot survive hidden in assembly and then be stripped by the encoder.
The full before/after stdout, exact ids/root sets, fixture hash and output digests
are retained. The small branching fixture has topological order A,B,R,C,D and
energy order B,A,R,D,C, requiring root sets A,B / C,D / A,B. Ready-root inclusion
and terminal-root exclusion remain covered.

G11 is the embedded coordinator amendment committed on L1 as ca142014. This
worker did not merge it or edit the L1 gate/draft files. Production schemas,
CLI Markdown/help, architecture, OpenAPI and generated Swift reflect it.
There are no changes to graph-model.ts, graph-order.ts, graph-energy.ts or
dependency-rules.ts relative to f140c7b0. Shape logic is also unchanged. Unknown-
energy sorting remains deferred. Final F must re-pin this explicit corrected
source; no final F result is claimed or F restart requested.

### CLI boundary audit

New apps/cli/src/input.ts converts pure schema/JSON decoding failures into typed
CommandError(2, invalid_args, recovery). File reads stay in io, so actual file
failure keeps runtime_error and exit 1. Depend/undepend validate request fields
before no-op detection. Revert validates seq and Version before lookup. Graph
validates its nonempty id. Add validates --depends-on with flag-specific recovery.
rm validates dependency fields while retaining its existing current-Version and
latest-Task recovery. An optional fingerprint distinguishes omission from an
explicit empty string; the latter is invalid input, and agent omission still works.

The repeatable matrix is packages/domain/scripts/dag-cli-input-proof.ts, invoked
by .agents/skills/verify-dag/scripts/verify-closure.sh. All 31 final cases exit 2,
return exactly one invalid_args JSON object with the named recovery, and preserve
the actual SQLite Task payloads, edges and task_versions after every refusal.

| Boundary | Cases | Malformed/out-of-range inputs and required recovery |
| --- | ---: | --- |
| depend | 7 | Missing, zero and malformed Version; existing-edge and missing-edge zero; empty dependent/blocker; 201-character blocker. Names task-id, --on and --expected-version. |
| undepend | 5 | Zero on an absent edge with visible endpoints, negative/malformed Version, empty/201-character blocker. Names --from and --expected-version. |
| graph | 2 | Empty id and unsupported format. Names task-id or --format. The read id schema has no maximum length; a valid missing 201-character id remains not_found, not usage. |
| batch-depend | 3 | Zero Version, text Version and malformed JSON. Names --file, from_version and batch-depend-input. |
| rm dependency flags | 6 | Zero/malformed Version, bad/explicit-empty fingerprint, empty id and malformed confirmation boolean. Names the invalid flags; existing Version recovery remains intact. |
| add --depends-on | 4 | Empty/201-character ids, 14 entries and duplicates. Names --depends-on and its count/id requirements. |
| Revert | 4 | Zero/malformed seq, omitted Version and zero Version with a nonexistent valid seq. Names seq and --expected-version before lookup. |

The e717 before receipts retain actual runtime_error/exit 1 for invalid edge
Versions, including an existing linked edge and absent undepend; empty stdout
for malformed graph id/Revert seq; incorrect not_found before Version validation;
and missing --depends-on recovery. The explicit-empty fingerprint baseline
accepted Delete with exit 0 and failed the SQLite projection-equality assertion.
The final case refuses it with exit 2 and no projection change. This belongs to
the same input-boundary finding, not another implementation round.

Controls preserve valid missing Task/reference classification, real missing-file
runtime_error/1, and valid stale existing-add/absent-remove no-ops. Authenticated
HTTP still returns 400 for Version 0 on an existing linked edge and changes no
Task/edge projection. F's independent e717 baseline remains untouched at
/Users/zambamon/.t3/worktrees/todo-cli/feat-task-dag-f-formal/docs/evidence/dag-formal/public-xOPnjF.

### Client decode alignment and delta

New apps/electron/src/http-client.ts contains the production HttpApiClient factory
used by main.ts and the typed task-client boundary. This small approved extraction
is transport-only. The live proof calls that exact factory, receives the actual
HttpApi response and asserts all three ordered root sets, eight decoded node
fields and encoded root facts. There are no controls, focus, selector, renderer,
safeStorage or native changes.

GeneratedContractTests uses generated Swift calls to create the branching graph,
checks typed mixed-tree and single-Task response variants, root arrays and eight
node fields, and re-encodes the facts. The existing live test passes without a
skip. Numeric version, forbidden-key, contradiction and old/DAG-kind assertions
remain intact. No generator was weakened and generated files were not hand edited.
All Swift commands used swift-slot. The first new Swift assertion selected the
non-tree union branch for a mixed tree; its failed receipt is retained, followed
by the corrected typed assertion and passing live run.

Changed domain source files are graph-contract.ts and graph-queries.ts only.
No new packages/domain/src file was added in closure. New reusable proof files
are graph-response-proof.ts, dag-cli-input-proof.ts and chain-1000.json. CLI
input.ts and Electron http-client.ts are explicitly part of the closure delta.
The existing filter-draft correction and prefix/text regression still pass;
the previously recorded L1 search rebase checklist remains unchanged.

### Final corrected-source proof

Absolute closure evidence root:
/Users/zambamon/.t3/worktrees/todo-cli/feat-task-dag-b-commands/docs/evidence/task-dag/unit-b/closure.
The before receipts are graph-before-2 and input-before-expanded, both compiled
property exit 1; input-before-fullmatrix retains the explicit-empty fingerprint
projection failure. Early graph seed setup failure is retained in graph-before.
final/graph-size-comparison.json and final/input-audit-comparison.json collect
the comparisons without relabeling observed bad command exits as passes.

All final runs below use binaries built from clean corrected source 3cceb41e.
Their paths and SHA-256s, CLI version, live server health, contract identity
825e73aec777703499d20a728dd93ba41d92c20a9f75f4beb9da82a170702dfc and source
content hash 799f273d00a4f2153550e5d0ce6f068d8bbc82d7f40e70c010697fb7c45a3a89
are in final/build/provenance.json. Each table path is under the absolute root.

| Proof | Level | Actual exit | Evidence |
| --- | --- | ---: | --- |
| pnpm check: 321 domain, 46 CLI, 30 server, 35 Electron passes | L1 | 0 | final/check.log |
| 1,000-Task direct/public response and 31-case CLI audit | L2 | 0 | final/closure/graph-response/result.json, final/closure/dag-cli-input/result.json and both driver exit files |
| Compiled public CLI/HTTP/PTY/DAG/import/export | L2 | 0 | final/public/actions.json, result.json and cleanup.json |
| Compiled DAG library, replay and race | L2 library | 0 | final/library/result.json, race.json |
| Compiled CLI and unchanged goldens | L2 | 0 | final/cli/commands.log, goldens.json |
| Compiled base/read/write HTTP and regressions | L2 | 0/0/0 | final/server/result.json, final/server-reads/result.json, final/server-writes/result.json |
| Combined filters | L2 | 0 | final/filters/result.json |
| Import, migrations and transfer | L2 | 0 | final/import/commands.log |
| Operation store, Purge and replay | L2 library | 0 | final/op-log/result.json |
| Real SSE | L2 | 0 | final/sse/result.json |
| Live protocol, Electron factory decode and generated Swift | L2 protocol | 0 | final/protocol/electron-graph.json, generated-tests-result.json, generated-tests.log, swift-result.json |
| Filter draft roundtrip | L1 | 0 | final/filter-draft.log |
| AtomicCAS final command | finite formal + real code | 0 | final/atomic.log |

The live Swift run has all 20 tests passing with no skip. pnpm check retains one
existing Electron skip and does not claim UI parity. The final AtomicCAS evidence
is /Users/zambamon/.t3/worktrees/todo-cli/feat-task-dag-b-commands/docs/evidence/fv01/fv01-check-lhKZOj.
Fresh sensitivity evidence is /Users/zambamon/.t3/worktrees/todo-cli/feat-task-dag-b-commands/docs/evidence/fv01/sensitivity-pkZuib:
both real mutations exit 1 and restored source exits 0. Every covered production
file is byte-identical to e717; the mapping review names the unchanged functions
and retains the finite single-Task/no-edge limits. No source hashes were advanced
to bypass a failed check.

### Disk-order cleanup and final audit

Applied the coordinator's disk order after final proofs without compiling or
changing product code. Removed 83 superseded private .scratch/bin files,
7,453,502,862 logical bytes actually unlinked. Observed free space was separately
24.86394 to 25.20131 GiB by df during cleanup; the guard reported 26.7 to 27.1 GB.
APFS sharing and concurrent filesystem activity mean this is not a claim that
7.45 GB of capacity was reclaimed. Both disk guards exited 0.

The complete 83 removed paths, sizes/inodes, ownership checks, kept-file reasons,
reference audit and lsof in-use check are explicitly retained in
[cleanup-receipt.json](/Users/zambamon/.t3/worktrees/todo-cli/feat-task-dag-b-commands/docs/evidence/task-dag/unit-b/closure/final/cleanup-receipt.json).
The exact 3cceb41e and e717 CLI/server binaries, current proof drivers, immutable
baseline drivers and ambiguous cited N1/N2 binaries remain. No evidence directory
was removed: cited, current and ambiguous receipts were protected. No symlink was
followed and no other worker's tree was touched. The initial cleanup planner
stopped before any unlink because a cached driver had no build log; the corrected
plan's exit 0 and setup-failure receipt are retained.

Local no-comments and structure audits ran before each commit. No new manual
comments/suppressions or unresolved constraint flags were introduced. Shared
rules remain in the domain/store; the new CLI conversion handles input only and
the Electron extraction handles transport only. Core abstraction and caller
usability now match the requested-Task contract and shared usage-error contract.
All own servers were stopped. E/S feature UI, both-client L3, final F, fresh max
closure review and coordinator delta review remain unclaimed. No integration or
approval is implied by these passing proofs.

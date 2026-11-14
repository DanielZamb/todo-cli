# Unit A storage and replay

Status: implemented and locally proven; awaiting the two review seats arranged
by DAG-L1. Branch `feat/task-dag-a-storage`. Proven implementation head:
`96c0f3ea19dcab207d1d06a66d333a80d78c2f36`.
The report and final mapping receipt are a documentation-only descendant;
the terminal handoff names that delivery head separately. All product code and
compiled CLI/server provenance bind the implementation head above.

Migration 0007 adds the guarded WITHOUT ROWID edge table, composite endpoint
foreign keys and reverse covering index. The existing automatic pre-migration
owner Snapshot remains before migration. Compact Dependency events advance only
the dependent. Lifecycle v2 deltas, optional checkpoint edges, full/checkpoint
replay, grouped Delete, Move, Profile deletion, initial Occurrences, Revert and
Purge preserve exact edges and surviving Versions. Old v1 events/checkpoints
remain readable. Revert validates its complete proposed graph under the writer
lock and inverts deltas without replacing adjacency. Purge recognizes either
endpoint and Task content inside rejection witnesses, including owner Snapshots.
No owner database was accessed.

## Proof receipts

Every path below is absolute. A compiled library drive is identified as such;
it does not establish CLI/HTTP graph commands or client feature parity.

| Check and proof level | Actual exit | Evidence |
| --- | --- | --- |
| `pnpm check`, L1 repository behavior/type/lint/contract checks | 0 | docs/evidence/task-dag/unit-a/pnpm-check-final.log |
| Focused @effect/vitest, 18 literal DAG cases, L1 | 0 | docs/evidence/task-dag/unit-a/dag-tests.log |
| `verify-dag/scripts/verify.sh`, compiled library, scratch SQLite and opposite-edge processes | 0; race children 0, 0 | docs/evidence/task-dag/unit-a/final-dag |
| Extended `verify-op-log/scripts/verify.sh`, compiled library including exact edge replay and grouped Delete | 0 | docs/evidence/task-dag/unit-a/final-op-log |
| `verify-recurrence/scripts/verify.sh`, compiled library regression | 0 | docs/evidence/task-dag/unit-a/final-recurrence |
| `verify-occ-atomicity/check.ts`, bounded model and compiled production driver | 0 | docs/evidence/fv01/fv01-check-RnA0vB |
| `verify-occ-atomicity/prove-sensitivity.ts`, real-code mutations | 0 overall; broken variants 1, 1; restored 0 | docs/evidence/fv01/sensitivity-Srqe4N |
| OpenAPI/Swift regeneration through `swift-slot.sh` | 0 | docs/evidence/task-dag/unit-a/generate-api-final.log |
| Electron production SSE/IPC decoder literals, L1 | 0 | docs/evidence/task-dag/unit-a/electron-protocol.log |
| `verify-history-unions.sh` through Swift slot, bounded L2 HTTP/SSE compatibility observation | 0 | docs/evidence/task-dag/unit-a/final-history-unions |

The last drive observes AuthChanged and DependencyAdded/Removed on real scratch
SSE, decodes observed frames with Electron's production ChangeEvent schema and
round-trips generated Swift History/SSE. GeneratedContractTests passes all 18
cases with live scratch HTTP and no skips. Literal fixtures also cover all four
lifecycle v2 shapes through both client decoding paths. Existing client handlers
refresh after ordinary committed operations; no Dependency UI was added.
cleanup.json records the owned server's teardown exit 130 and curl's SIGTERM.
Both recorded PIDs were confirmed gone. No other server was stopped.

AtomicCAS renews inherited drift from ed4e2423 to the supplied 8745cdd base
separately from this unit. DAG-A-MAPPING.md reviews every changed covered
function, including baseline Attachment input limits and rejection bounds.
The clean run checks 86,631 generated / 37,036 distinct states, depth 15,
queue 0, model controls exiting 12, 216 concrete cases, 432 replay checks,
seven process-kill boundaries and competing writers. It remains a single-Task,
no-edge bounded proof. F's DagAcyclic files were not edited.

## Added domain files and handoff

Logic additions under packages/domain/src:

- `dependencies.ts`: Edge, VersionChange, DependencyChanges, DependencyError and bounded rejection schemas.
- `dependency-rules.ts`: shared endpoint, degree, status and deterministic shortest upstream BFS cycle checks.
- `store/0007.ts`: additive migration statements.
- `store/dependencies.ts`: edge projection reads/writes, incident cleanup and dependent Version application.
- `store/dependency-validation.ts`: authoritative validation of resolved deltas and the proposed graph.

Other added packages/domain files are `scripts/dag-proof.ts`,
`scripts/verify-dag.ts` and `test/dag.test.ts`. Every addition followed a search
of the existing domain modules. The new verify-dag skill has a feature map,
executable helper and resolving relative .claude link. Its full recipe passed
and retained evidence after cleanup. Fresh Claude-session discovery is unproven.

B consumes exported schemas and dependency-rules functions, plus
`OperationStore.dependencies()` and `graph(profile)` for a consistent read.
`changes(event, profile)` resolves compact events. AppendResult carries a full
captured dependency_error separately from bounded History details through the
store and authenticated ports. `reject` accepts dependency_error for B's
captured refusal evidence. StartSeries accepts optional depends_on and resolves
initial edges atomically at Version 1; successors inherit none.

## Review and limits

Local no-comments audit found no added handwritten source comments or
suppressions; no comment deletions/restorations, extra reviewer or child thread.
Independent audit remains with seat 1. Server/core and post-implementation
reviews found the Unit A responsibilities complete and composable: schemas,
projection, invariant rules and transaction validation each have one owner.
Adapters contain no graph policy. The resolved-event API intentionally remains
below B's public command layer.

DAG-L1/coordinator explicitly extended A to generated contract alignment and
minimal protocol compatibility proof. Swift normalization now groups equal
kinds only when required entity_version constants prove variants disjoint;
its seven transformation tests pass. Generated output was regenerated, never
hand-merged. Electron's only production compatibility edit adds two History
labels. No dependency version or lockfile changed.

Public graph commands, confirmation/fingerprint flows, warnings, public
edge-Revert target routing, filters, algorithms and client controls remain B/E/S
work. No new no-op event exists; B must return unchanged without appending.
Whole-feature L2/L3 parity, native UI, signing, Keychain, renderer and unbounded
formal safety are not claimed. No push, rebase, merge, PR or checkout change.

## Seat-1 closure, c0380fcc review

The earlier completion was a local checkpoint. Seat 1 found two P2 defects,
and the coordinator withdrew seat-2 approval. Both fixes are implemented;
renewed approval from both seats is still required. No merge is authorized.
Closure source proof SHA: `50ef7c3dccd50d427bb8dfa2bfff8915c49b907e`, on
`feat/task-dag-a-storage`. The terminal handoff names the report-only delivery
head. No new domain files were added in this closure.

The source delta removes the authenticated Series field whitelist, explicitly
forbids dependencies on lifecycle v1 schemas, and extends the existing generation
step to enforce component entity_version constants. Tests assert typed branch
selection and edge/Version fields. No N1/N2 or public DAG command changes landed;
N1/N2 remain required in B's first commit.

### Failing-before and passing-after reproductions

Both supplied sources were preserved unchanged and run against c0380fcc before
product edits. The compiled auth driver observed valid and absent blockers both
committing v1 with no edges. Swift selected case1 for every v2 while preserving
JSON roundtrip equality. After the fixes, valid auth creation retains its edge,
invalid creation is rejected, and all four Swift v2 cases select case2.

| Supplied reproduction | Before build/assert exit | After build/assert exit | Absolute evidence |
| --- | --- | --- | --- |
| auth-series.ts | 0 / 1 | 0 / 0 | docs/evidence/task-dag/unit-a/seat1-closure/auth-series-after.json |
| swift-boundary.swift | 0 / 1 | 0 / 0 | docs/evidence/task-dag/unit-a/seat1-closure/swift-repro-after.json |

The before sources, observations and real exits are under
docs/evidence/task-dag/unit-a/seat1-closure/before.
reproduction-provenance.json in the parent directory binds both source heads
and every build/assertion exit. The supplied auth source retains its original
candidate label; that provenance receipt identifies the actual build source.
Auth builds use `bun build --compile`; Swift builds use `swift-slot.sh swiftc`
with the generated TodoAPI module and the preserved object response file.

### Authenticated wrapper audit

Authentication.startSeries now forwards all parsed StartSeriesRequest facts
except credential, then supplies authenticated actor and Clock time. The compiled
authenticatedInitial case proves initial edges, TaskCreated v2, one event,
Version 1, Project/Tags, external id and Attachments. Missing and foreign blockers,
a self-cycle and existing identity reuse preserve Tasks/Series and append exactly
one rejected TaskAttemptRejected, never a committed creation. A fresh endpoint
cannot already have outgoing edges; the reachable transitive-cycle construction
requires identity reuse, which the authenticated identity guard rejects.

The same case proves authenticated append forwards TaskCreated v2 and compact
edge facts, Revert preserves the resolved edge inverse, finish refuses a blocked
completion without a successor, and cancellation creates a successor with no
edges. The wrappers return AppendResult intact. finishTask and revert requests
have no dependency fields to drop; their dependency effects resolve in the store.
TaskCommands.create and import were traced through their authenticated mutate
boundary to append/startSeries. CreateTask and ImportItem currently declare no
DAG fields; import rejects unknown fields. Public creation/import DAG inputs
remain B's work. No adapter graph rule or product policy was added.

### Generation strategy and limits

The pinned swift-openapi-generator emits numeric enums as unchecked Double
properties. The existing preserve-null postprocessor now resolves each component
property's schema and emits a required numeric constant check in its Decodable
initializer. The v1 case remains first; a v2 value fails its constant check and
selects v2 with typed DependencyChanges. No branch reversal, dependency-presence
selection, unknown-version coercion or handwritten client wrapper is used.

Optional Never properties in the shared Effect schema reject v1 dependency
shapes in Electron and the store. Normalization preserves that constraint as
x-todo-forbidden-properties; generated checks reject those keys while retaining
unrelated additional properties. The actual generated/client tests assert all
four v1 and v2 cases, literal added/removed/Version fields, legacy nullable and
extra-field preservation, and rejection of missing/null/string/boolean/fractional
or unsupported versions and contradictory dependency shapes. Existing disjoint,
optional, nullable and overlap tests remain; all nine normalizer tests pass.

This postprocessing is deliberately limited to component entity_version
constants and explicit forbidden keys. It is not a general OpenAPI constraint
validator. Operation-local non-component schemas retain prior behavior; lifecycle
History and CommittedOperation cases use the checked component decoders. No
manual generated-file edit, dependency upgrade, native app, Keychain or signing.

### Closure proofs at the source SHA

| Check | Actual exit | Absolute evidence |
| --- | --- | --- |
| pnpm check, including 317 domain / 46 CLI / 30 server / 34 Electron passes | 0; one existing Electron skip | docs/evidence/task-dag/unit-a/seat1-closure/final-check.log |
| Compiled verify-dag, including authenticatedInitial and opposite-edge processes | 0 | docs/evidence/task-dag/unit-a/seat1-closure/final-dag |
| Compiled verify-auth | 0 | docs/evidence/task-dag/unit-a/seat1-closure/final-auth |
| Compiled verify-op-log | 0 | docs/evidence/task-dag/unit-a/seat1-closure/final-op-log |
| Generated Swift / real scratch HTTP-SSE / all 19 GeneratedContractTests, no skips | 0 | docs/evidence/task-dag/unit-a/seat1-closure/final-history-unions |
| Electron production ChangeEvent/IPC typed and negative cases | 0 | docs/evidence/task-dag/unit-a/seat1-closure/final-check.log |
| AtomicCAS mapping/check | 0 | docs/evidence/task-dag/unit-a/seat1-closure/atomic-check.log |
| AtomicCAS behavioral sensitivity | 0 overall; broken 1/1, restored 0 | docs/evidence/fv01/sensitivity-mxTI1h |

DAG-A-MAPPING.md reviews the four changed v1 schemas. Valid no-edge legacy model
fixtures are unchanged; transaction and projection code did not change. Source
pins were renewed with that review and real-code sensitivity, not hashes alone.
The library drives remain compiled-library proof. HTTP/SSE observations establish
bounded protocol compatibility, not whole-feature L2/L3 parity or UI completion.

The recorded server PID 8665 and stream PID 8692 were stopped and confirmed gone;
cleanup.json retains exit 130 and SIGTERM respectively. Both reproduction scratch
directories were removed after preserving evidence. Local no-comments, structure
and post-implementation audits found no added source comments/suppressions or
further in-scope blocker. Independent renewed reviews remain with L1/coordinator.

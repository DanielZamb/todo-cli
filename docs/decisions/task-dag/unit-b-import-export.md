# Unit B import/export checkpoint

Branch: feat/task-dag-b-commands. This checkpoint follows 9dc862c0946f3d51146b24b6ea277dd92c8c65be.
Final source-SHA binary proof and the final unit report follow separately.

## Behavior

New domain file import-dependencies.ts plans external-id references across the
proposed Profile graph, including later file rows, using existing graph/rule
exports. Import applies in topological order and restores original report order.
Each Task applies atomically. Actual successful mappings are resolved again
inside auth.mutate's writer lock before creation or edge replacement. Failed
adoption cannot leave a dependent linked to an unassigned planned id.
Initial edges commit with TaskCreated v2 at Version 1. Preview changes no source
Tasks, edges, History, checkpoints or owner Snapshot files.

Export emits depends_on only when nonempty and removes response-only graph and
search metadata. No-dependency goldens remain unchanged. Obsidian preserves one
managed note and surrounding text, adding stable ^task-full-id blocks, same-note
Depends on wiki links and all Mermaid edges, including redundant ones. Outside-
projection references have stable stub blocks and are reported.

The shared creation payload factory now lives in task-commands.ts. Graph reads
use OperationStore.graph for one consistent Tasks/edges snapshot. Core BFS,
Kahn, energy/Ready/Blocked and shape algorithms are unchanged since f140c7b0.
Mermaid accepts typed id/title nodes and exports mermaidNodeIds; GraphNode adds
mermaid_id to carry explicit identity. readGraph/auth and formatter wiring need
F's final re-pin, owned by L1. No direct restart of F was requested.

## Approved additive schema adaptations

- GraphNode.mermaid_id is the n-number identity used by its deterministic Mermaid.
- Import errors preserve details.current_version and add optional complete typed
  details.dependency_error. Outer code/message mirror the captured witness.
  This canonical nested shape supersedes the earlier flattened proposal. The
  compiled encode roundtrip asserts every typed witness field survives.
- has_dependencies.dependencies may be empty when a confirmed preview changes
  to an empty set. Its message explains changed preview and renewed confirmation.
  Ordinary unconfirmed removal still names --with-dependencies.

Advice patterns, nonnegative counts, minimum cycle/redundancy path lengths and
nonempty graph/blocker constraints follow the approved schema. The trusted
published-schema conformance reader now applies patterns, rather than rejecting
their presence. This strengthens validation; generation guards and typed v1/v2,
forbidden-key and contradiction assertions remain unchanged. OpenAPI and Swift
were regenerated through existing scripts and swift-slot. A new Swift roundtrip
covers initial inputs, edge inputs and the full nested import witness.

## Checkpoint receipts

Evidence root:
docs/evidence/task-dag/unit-b/import.

| Proof | Actual exit | Evidence under that root |
| --- | --- | --- |
| Failed-adoption regression before fix | 1 | before-adoption |
| Failed-adoption regression after fix | 0 | after-adoption |
| Import encode regression before fix | 1 | before-error-encoding |
| Full typed import encode roundtrip after fix | 0 | after-error-encoding |
| Compiled library including import/export and replay | 0 | library-checkpoint-2 |
| Compiled CLI/HTTP, PTY, import/export and graph corpus | 0 | public-drive-7 |
| pnpm check | 0 | check-3.log |
| OpenAPI/Swift regeneration | 0 | swift-regenerate.log |
| GeneratedContractTests | 0, 20 tests with live case skipped | swift-contract-tests.log |
| AtomicCAS sensitivity | 0 overall; mutants 1/1, restored 0 | atomic-sensitivity.log |

AtomicCAS sensitivity evidence is
docs/evidence/fv01/sensitivity-jf9I1W.
The mapping review names the schema-only change and retains the finite single-
Task/no-edge bounds. It does not claim grouped graph or client proof.

The public corpus checks successful and failed adoption, missing/foreign refs,
close-missing refusal and apply, cycles with independent partial success,
large witnesses returned intact with bounded History then Purge redaction,
real SQLite batch failure followed by a successful next item, changed-to-empty
fingerprints, terminal ordering and a 105-Task closed cycle through CLI and HTTP.
Its earlier failed attempts are retained: timestamp equality, missing scratch
Profile Session and canonical cycle rotation were proof-fixture corrections.
They changed no production algorithm.

## Audit and remaining proof

Local no-comments audit, per the explicit no-child restriction: no new manual
source comments, suppressions, deletions or restorations. Generated API comments
are generator output. Structure review traced CLI/HTTP writes to shared commands
and authoritative guards, and reads to the consistent graph query. Planning,
ordering, energy, formatting and transport contracts have separate concerns.
No new invariant lives in an adapter.

Final binaries must embed the final source SHA. The build cache key now includes
both source hash and HEAD to prevent reuse of a WIP binary's older build identity.
The final pass must enable live GeneratedContractTests through the existing
scratch HTTP drive, plus broader compiled CLI/server/filter/import/SSE/store
proofs and pnpm check. E/S feature UI and both-client L3 remain unclaimed.
No children, native apps, signing, Keychain, real Todo data, installed binaries,
owner Tasks, merge, rebase, push or PR were used.

---
name: verify-dag-formal
description: Check finite Task dependency safety and immutable production conformance. Use after graph, transaction, replay or public Dependency changes. Read the active immutable product from production-pin.json and public-pin.json; final client/runtime mapping remains pending.
---

## Stream wake integration renewal

Immutable merged product a45ddeaa6d00b1fc62560f70be48c2e0e1202495 adds the
reviewed stream wake (21a4a52e) to 5f46e7b3's server. The only covered file that
changes is apps/server/src/server.ts, by the wake wiring: rejectUnknownQuery and
the importTasks, depend, undepend and batchDepend handlers are textually
unchanged and now reach their commands through the decorated store. All 53
public control anchors match exactly once on the product before renewal.
docs/decisions/ui-speed/stream-wake-integration.md records the review and the
full command's actual exit. No model, invariant or bound changed.

## Server and Snapshot integration renewal

Immutable merged product 5f46e7b3c36afaffe8f2328df6453b8546be27a5 combines the independently reviewed strict read scopes and Snapshot/Purge/CLI corrections. docs/decisions/ui-speed/server-integration.md records the per-function review, exact diffs, three-way constructor trace, current command exits and exclusions. No model, invariant or bound changed. The full fresh qualification remains separate from historical results below. The owed native Swift stage remains explicit.


## Server read mapping renewal

Reviewed immutable product eca430bf1f3b5b9aeeb69a82c0086e3dab364249. The per-function byte/hash table, exact diffs including the Clock context fix, model-step review and exclusions are in docs/decisions/ui-speed/server-reads-formal-renewal.md. Graph algorithms, authoritative validation/write/replay bodies and client publication guards are unchanged. Profile-selected projection reads and checked synchronous materialization replace global decoding; matcher yields occur after lease exit. Auth/clock/lease mechanics and multi-command import are concrete boundaries outside the finite models. No model, invariant or bound changes. Fresh full recipe and sensitivity exits are recorded in that report; pending results are not prior qualification. This section supersedes earlier active-source descriptions below.


## Current integrated mapping

Immutable product `7d947f917d1895df45c78f9f9df31638a9f3f2b8` includes both DAG clients, the two-part Delete/batch contract amendment and main PR #12 at `2c488fc72fe264741d5d8db8f90b441bf426af32`. The contract is `78a2be44ef613c16a8807eda28367fe07401cf6872b4124c360c67344dc68289`. Core graph and AtomicCAS source is unchanged. Pre-renewal compiled mutation, matcher, cache and Discovery controls passed with exact restores. The complete default passed at verifier `8807892be25f26b188930e54eac213000b078a39` against immutable product `7d947f917d1895df45c78f9f9df31638a9f3f2b8`: all 36 library and 53 public controls, G11 and guarded AtomicCAS. Integrated client, cache, search, Discovery, protocol and unsigned proofs are recorded in the integration report, with their actual source identities. Grouped independent seats, the owner native session and fresh Claude discovery remain pending. Finite bounds and manual-mapping limits are unchanged.


Historical F1 implementation closure: full default and locked F-worktree check exited 0 at committed verifier 0d9145443dc46ec4c6b75decee8be0b133d530ee, product 0f7a19488f15ec1f8d4c4dad14749de7720f17d0. The nested compiler shim, post-parent stop-latch propagation, fake-child refusal traces and real AtomicCAS tsc guard0/child0 are proven in docs/evidence/dag-formal/f1-default-8vDMKq/f1-completion.json. All 36 library and 53 public controls and final clean passed. Both F1 review seats passed exact delivery 2936e3c2 before merge. Final E/S runtime and fresh Claude discovery remain pending.

Historical merged-B behavioral checkpoint (F1 nested compiler guard gap; closure below): default one command exited 0 at F proof source 71a29afc764e2db32ed109c9314b1a8290460d46, product 0f7a19488f15ec1f8d4c4dad14749de7720f17d0. All 36 library and 53 public/read source-control executions passed sensitivity and exact clean restore. Receipt: docs/evidence/dag-formal/resume-default-nTbjKr/completion.json. F-worktree VITEST_MAX_WORKERS=1 pnpm check exited 0 with unchanged per-test deadlines; default-worker timing failures are retained. Final E/S runtime mapping, fresh Claude discovery and independent F review seats remain pending.

# Verify Task dependency safety and production conformance

Dependency writes must preserve the DAG, status rules and affected Versions and
publish resolved History and projection together. Reads must count distinct
remaining ancestors and preserve the specified ordering. A break can accept a
loop, lose replay facts or present an incorrect next Task.

Followed create-formal-verification-skill. Read mapping.md, coverage.json,
public-coverage.json, features/README.md and docs/decisions/task-dag/unit-f-report.md.
Historical f140/e717 receipts retain their original candidates and proof bounds.

## Historical main-rebase qualification

The active product is 42ae3fa90ddd9d7cfa19f384099aabbb1c2fb4da, rebased onto
main 9de893454cb6e3f5729407e9313c73e56bfd0481. Both pin files and coverage maps
must agree. Its contract is
bf54af931b6531866cbe23740582a5241999f5defcf98ad1d7f2da58774e1f3d.
The 16 covered graph implementation files and all AtomicCAS covered files are
byte-identical to the reviewed pre-rebase implementation. Search adapters,
public schemas and generated client bytes have changed. The current mapping
records the source review. Qualification must run actual generated algorithm,
replay, public boundary and graph-response checks on this product, together with
the nested guarded AtomicCAS command. A diagnostic subset is recorded as such;
it does not replace the historical full source-sensitivity run or final E/S gates.
The rebase seam requires a new independent correctness review before client merges.

The binary cache key includes the product pin, source bytes, compiler, build
defines and contract. Actual health and --version must agree with the pin.

```sh
bun .agents/skills/verify-dag-formal/check.mjs
```

The earlier default exit 2 was a preparation hold, not a product pass. Its
receipt remains at merged-hold-YEGKoo. The hold is now cleared after function
and hash review. Commit verifier inputs before the full proof, then report
its actual result. Expanded response/client paths require actual execution;
written assertions alone do not establish conformance. --model-only checks
only the finite model. --full remains reserved for final feature gates.

Preserve historical f140/e717/3cce evidence. Never switch checkouts or edit
another worker's files. Final E/S runtime mapping, fresh Claude discovery and
independent F review remain pending even when this checkpoint passes.

## Ordering and client references

The coordinator withdrew G11's all-three-topo wording. Ancestors and descendants
are strict sets in whole-Profile topological order. lightest_next retains G4:
own energy ascending, unknown energy last, then whole-Profile topo position.
It includes a Ready unresolved requested Task and excludes terminal roots.
The remaining-energy ranking key for --order lightest is unchanged.

GraphNode has exactly mermaid_id, task, in_degree, out_degree, ready, blocked,
depth and remaining_energy. GraphReport contains only the requested Task's
closures. The prepared response fixture checks direct objects before encoding,
encoded/public objects, the root500 1,000-chain in both directions, an unequal-
energy/unknown fork, equal-energy topo ties, Mermaid identities and readGraph.
Separate count-only instrumentation checks reachability calls, with no total
query-time claim. The merged-source run must compile and execute these fixtures.

The prepared portable-client test imports the production HttpApiClient factory
without native Electron imports. It constructs one client signed out and passes
a credential getter. Real HTTP forwarding records headers across sign-in,
profiles, sign-out and another profiles request. The last request must carry no
Authorization header; a 401 by itself is insufficient. The same client must then re-sign-in and read Profiles successfully. Header
presence is observed through a real HTTP forwarding endpoint.

## Compile, disk and cleanup discipline

Standing orders 28/29 also bind future runs. Before starting this full default
or any batch compiling more than five binaries, run df -k /System/Volumes/Data.
Under 30 GB, do not start the batch: retire only proven owned superseded
artifacts while keeping receipts, report capacity to the coordinator and wait.
The immediate per-compiler canonical guard still enforces the hard 10 GB floor.
Never signal an unowned process or shared CUA/node_repl helper. Cwd alone does
not block worktree removal; real open files require skipping removal and
reporting. Future archives contain text/source/config/receipts and binary hash
exclusion manifests, not rebuildable binaries/runtime copies. Existing archives
remain protected. These orders arrived after the completed F1 proof; no batch
was restarted.

The owner's resume lifts the prior disk stop. The stopped exit 3 remains in
its original receipt. compile-artifacts.mjs snapshots only owned directories
before each compiler call and retires only new regular .bun-build files after
that compiler settles. A retained copy must match the output or the actual Bun
runtime hash before removal; UID, inode stability and ps/lsof checks must also
pass. Preexisting, symlink, unmatched and open files remain. A full-command
self-check proves removal and preservation cases. No physical low-disk test is
used. The archive index at ~/Documents/worktree-cleanup-2026-11-09/todo-cli/ARCHIVE.md
resolves removed worktrees' historical evidence. Never recreate them.


compile-safety.mjs runs the canonical disk guard immediately before each actual
Bun.build or TypeScript compiler spawn. It records the actual exit immediately.
Exit 3 latches DISK STOP across the run. Isolated source restores byte-for-byte
in finally, then no further proof or compile begins. Source/compiler/hash
failures and timeouts never count as successful sensitivity.

compile-preload.mjs guards nested Bun.build calls and installs an AtomicCAS-local
PATH shim for nested Bun/TypeScript compiler children while running the unchanged
AtomicCAS skill. It preserves the original resolved executable, argv and stdio,
uses an absolute host Bun to avoid recursion, and enforces immutable import resolution.
The outer wrapper checks the shared stop latch after parent exit, so an unchanged
parent assertion that converts child 3 to parent 1 still returns DISK STOP 3.
The default nested-guard check installs a synthetic stop after preload initialization,
proves no fake compiler entry, and separately runs a real nested TypeScript compile.
AtomicCAS’s real nested TypeScript command and immediate guard are also recorded. B owns AtomicCAS
maintenance. The synthetic stop-sentinel check proves a prior stop prevents
compiler entry and permits exact isolated restoration; it is not a physical
low-disk observation or a product sensitivity control. The default path executes nested AtomicCAS through the guarded wrapper.

Retire completed isolated mutant binaries only from this worktree's .scratch/bin
and only after ownership, hash and in-use checks. Preserve all provenance
manifests and cited evidence directories. Keep current, e717 and 3cce review
baseline binaries. Each retirement records paths/bytes and, for future runs,
observed free capacity before and after. APFS sharing and concurrent activity
prevent equating logical unlinks with reclaimed capacity. Never follow a symlink
into another owned tree. The earlier housekeeping receipt lists 40 retired
mutation binaries and every protected evidence directory.

## Immutable inputs and full command

The checker materializes exact Git blobs under ignored owned evidence inputs,
without another Git checkout. Production aliases resolve only to those inputs;
loaded source outside them or installed node_modules fails the run. Manifests
must match the installed tree and production dependency versions must match.
Bun 1.4.4 is enforced. CLI/HTTP build and contract identities are checked.

The default full path runs with a 600-second library stage ceiling and a
3,600-second public stage ceiling. Each behavioral child retains its existing
180-second limit; TLC retains 120 seconds per config. A timeout never counts
as a completed control or proof. These are execution ceilings, not state
constraints. The full path runs:

1. The finite model and all original controls/reachability witnesses.
2. The actual-source exhaustive/seeded algorithms and replay corpus, source
   sensitivity, unchanged AtomicCAS and concrete migration/lifecycle drives.
3. Public CLI/HTTP predicates, B's committed 31-case input matrix, prepared G11
   and portable-client predicates, real-source controls, exact restoration and
   fresh clean builds/reruns.

Consult the report for the latest actual command result. --full remains reserved for final
coverage and must not claim approval while final clients, discovery and review
seats are pending. Diagnostic subsets are never a clean full-command pass.

## Proven preparation scope and retained bounds

At 3cce, the F boundary diagnostic passed 17 malformed-input cases, four genuine
missing/I/O classifications and valid stale no-ops. Seven new real-source
boundary controls compiled, failed at intended AssertionError assertions and
passed after exact restoration. Their superseded binaries were retired.
The historical preparation only inspected B's matrix. The merged default path executes all 31 cases.
Independent replay passed 93 cases and 186 rebuilds, seed 260911, all DAGs through
three nodes plus 64 seeded DAGs through twelve nodes. Nineteen concrete
integration checks passed. These are candidate-specific calibration receipts,
not a committed merged-source proof.

The model remains unchanged: CLI/server writers, stale observations, single
writer serialization, private Record/ApplyEdges/ApplyTasks/WriteVersions stages,
Commit, crashes and separately recorded rejections. Rejection History may be
lost before its commit. Captured refusal evidence never becomes a later graph.
There are 25 positive configs plus a clean recheck, five intended mutant
counterexamples and seven reachability controls. Typical bounds are three Tasks,
one Profile, four statuses, Versions 1..4 and one bounded grouped Revert; the
degree-two race has four Tasks. Two Profiles have a separate scenario. Separate
15-Task single-add configs check literal 13/14. No state constraints truncate the
queue. Every positive queue must finish empty.

TLC uses tla2tools 1.7.4, SHA-256
936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88,
768 MiB heap, one worker, fingerprint polynomial 0, seed 26 and 120s/config.
The latest model preparation rerun passed with clean 64 initial states,
32,816 generated, 19,784 distinct, depth 27, queue 0; controls fail at intended exit 12.
The historical algorithm corpus covers 4,165 directed graphs through 4 nodes,
572 DAGs, 140,660 status vectors, 709,242 weight vectors in separate dimensions,
plus 256 seeded DAGs through 40 nodes. Rerun it against the merged source; do not
relabel old f140 results with a new SHA.

## Evidence and limits

Ignored check-*, conformance-* and public-* directories retain source/config
copies, tool and import hashes, corpus, actual exits, mutations, restoration and
cleanup receipts. Response and portable-client checks cover their recorded process runs only.
Keep actual CLI bytes, compact re-encoding bytes and observed HTTP bytes separate.
Do not relabel B's static size receipts as F execution or infer a time bound.

SQLite single-writer serialization and atomic commit are assumptions. The model
has no unbounded, liveness, SQLite-engine, power-loss or client-runtime claim.
Move/Purge/creation/auth/checkpoints/filesystem paths are concrete tests, outside
the finite model. No real Todo data, native apps, signing, Keychain, dependency
install, installed binary replacement, child agent, merge/rebase/push or PR is
used. Final E/S feature/runtime mappings, coordinator-owned fresh Claude
discovery and independent review seats remain pending.

The relative .claude/skills/verify-dag-formal symlink resolves here. Use
/maintain-formal-verification-skill when requesting a later mapping review;
that maintenance skill is not installed by this work.

Standing order 30 also requires a no-symlink find for owned hidden .*.bun-build
files after each compile batch and while no compiler is running. Skip open
files and unproven ownership; record safe removals with paths/hashes/bytes and
separate capacity observations. Never signal unowned/shared helpers. The
completed run has no active compiler, and the exact-pattern find receipt is
under f1-closure-5PIxSP/order30-find-before.txt.

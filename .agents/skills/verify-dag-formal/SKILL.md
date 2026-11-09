---
name: verify-dag-formal
description: Check finite Task dependency safety and immutable production conformance. Use after graph, transaction, replay or public Dependency changes. Full conformance is held for L1's exact merged integration SHA; G4/getter fixtures are prepared but unproven.
---

# Verify Task dependency safety and production conformance

Dependency writes must preserve the DAG, status rules and affected Versions and
publish resolved History and projection together. Reads must count distinct
remaining ancestors and preserve the specified ordering. A break can accept a
loop, lose replay facts or present an incorrect next Task.

Followed create-formal-verification-skill. Read mapping.md, coverage.json,
public-coverage.json, features/README.md and docs/decisions/task-dag/unit-f-report.md.
Historical f140/e717 receipts retain their original candidates and proof bounds.

## Current hold and source gates

The owner requires the next full F proof at the exact merged integration SHA
after B's held closure passes and B merges. Do not repin to leaf
6486b347f611e118a0d60ead4ebe40ac77d86666. The last inspected input pin is
3cceb41efc08b8cd835d5c883c3d370709865c3f. Its response-order and captured-credential
issues are known incomplete. awaitMergedIntegration is true in both pins.

```sh
bun .agents/skills/verify-dag-formal/check.mjs
```

The current default exits 2 with awaiting-merged-source before any compile.
production-check.mjs and public-check.mjs also refuse compilation while that
hold is set. This is not a proof pass. --model-only still runs the unchanged
finite model and its controls, with no product compilation.

When L1 supplies the exact merged SHA, review the covered functions against the
last inspected Git objects. Update both pins and both coverage mappings only
after reviewing the actual changed code. Clear the hold after that review.
Preserve e717 and 3cce evidence and review binaries. Do not switch checkouts.
Commit the verifier before the final source-bound command, then commit the
report separately. No final F approval or client acceptance is implied by a
candidate conformance checkpoint.

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
query-time claim. These new response fixtures have not yet compiled or passed.

The prepared portable-client test imports the production HttpApiClient factory
without native Electron imports. It constructs one client signed out and passes
a credential getter. Real HTTP forwarding records headers across sign-in,
profiles, sign-out and another profiles request. The last request must carry no
Authorization header; a 401 by itself is insufficient. The getter fixtures and
controls remain uncompiled/unproven until the merged source arrives.

## Compile, disk and cleanup discipline

compile-safety.mjs runs the canonical disk guard immediately before each actual
Bun.build or TypeScript compiler spawn. It records the actual exit immediately.
Exit 3 latches DISK STOP across the run. Isolated source restores byte-for-byte
in finally, then no further proof or compile begins. Source/compiler/hash
failures and timeouts never count as successful sensitivity.

compile-preload.mjs guards nested Bun.build calls while running the unchanged
AtomicCAS skill and enforces immutable import resolution. B owns AtomicCAS
maintenance. The synthetic stop-sentinel check proves a prior stop prevents
compiler entry and permits exact isolated restoration; it is not a physical
low-disk observation or a product sensitivity control. Nested AtomicCAS wrapping
still needs its full merged-source run.

Retire completed isolated mutant binaries only from this worktree's .scratch/bin
and only after ownership, hash and in-use checks. Preserve all provenance
manifests and cited evidence directories. Keep current, e717 and 3cce review
baseline binaries. Each retirement records paths/bytes and, for future runs,
observed free capacity before and after. APFS sharing and concurrent activity
prevent equating logical unlinks with reclaimed capacity. Never follow a symlink
into another owned tree. The earlier housekeeping receipt lists 40 retired
mutation binaries and every protected evidence directory.

## Immutable inputs and planned full command

The checker materializes exact Git blobs under ignored owned evidence inputs,
without another Git checkout. Production aliases resolve only to those inputs;
loaded source outside them or installed node_modules fails the run. Manifests
must match the installed tree and production dependency versions must match.
Bun 1.4.4 is enforced. CLI/HTTP build and contract identities are checked.

After the merged pin is reviewed, the default full path is intended to run:

1. The finite model and all original controls/reachability witnesses.
2. The actual-source exhaustive/seeded algorithms and replay corpus, source
   sensitivity, unchanged AtomicCAS and concrete migration/lifecycle drives.
3. Public CLI/HTTP predicates, B's committed 31-case input matrix, prepared G11
   and portable-client predicates, real-source controls, exact restoration and
   fresh clean builds/reruns.

The expanded full path is not yet proven. --full remains reserved for final
coverage and must not claim approval while final clients, discovery and review
seats are pending. Diagnostic subsets are never a clean full-command pass.

## Proven preparation scope and retained bounds

At 3cce, the F boundary diagnostic passed 17 malformed-input cases, four genuine
missing/I/O classifications and valid stale no-ops. Seven new real-source
boundary controls compiled, failed at intended AssertionError assertions and
passed after exact restoration. Their superseded binaries were retired.
The 31-case B matrix was inspected; its new F rerun path is prepared, not run.
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
cleanup receipts. Current client/response draft files are explicitly unproven.
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

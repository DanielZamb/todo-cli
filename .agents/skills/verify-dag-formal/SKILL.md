---
name: verify-dag-formal
description: Check finite Task dependency safety and immutable production conformance. Use after graph, transaction, replay or public Dependency changes. The e717 public checkpoint retains a known malformed CLI failure; G11 response and clients await a corrected candidate.
---

# Verify Task dependency safety and production conformance

A committed Dependency change must preserve the DAG, status rules and affected
Versions, and publish resolved History and projection together. Planning reads
must preserve edge order and count each remaining unresolved ancestor once.
A break can accept a loop, lose work in replay or understate required energy.

Created with create-formal-verification-skill. Read [mapping.md](mapping.md),
[coverage.json](coverage.json), the [feature index](features/README.md) and the
[report](../../../docs/decisions/task-dag/unit-f-report.md). This is the second
conformance checkpoint, not final F approval or whole-feature L2/L3 proof.

## Current public continuation

Use [public-coverage.json](public-coverage.json) and
[the public mapping](features/public.md) for the explicit final B candidate
`e7170510a376b51eaf3525bb9933cb0dd588b233`. Read its code from Git objects only.

```sh
bun .agents/skills/verify-dag-formal/public-check.mjs
```

This command currently exits 1 at the literal malformed CLI Version-0 property.
An existing-edge add with --expected-version 0 must fail usage at exit 2; e717
returns runtime_error at exit 1. Preserve the failure. L1 included it in B's
combined correction round. A failure is not a negative-control pass.

To finish checks unaffected by that finding and the G11 response amendment:

```sh
bun .agents/skills/verify-dag-formal/public-check.mjs unaffected
```

Exit 0 means diagnostic-pass for the explicitly selected subset, not public or
F acceptance. It runs public assertions, actual product-source mutations with
successful compilation and intended AssertionError failures, byte-exact
restoration and clean reruns, raw replay/integration and a final fresh clean
compilation. The runner captures process exits and dependency/import hashes.
Every server has a recorded PID and a 60-second startup deadline, including its
initial daily Snapshot before no-write comparisons. Products compile once per
source hash into this worktree's scratch; cached binary hashes are checked.

G11 at ca142014 pauses old GraphReport conformance. GraphNode must have exactly
mermaid_id, task, in_degree, out_degree, ready, blocked, depth and
remaining_energy. Only GraphReport's requested Task gets ancestors, descendants
and lightest_next, each in whole-Profile topological order. The unexecuted
root-response-fixture.mjs defines a 1,000-Task chain and exact root/node-key
assertions for the next explicit corrected B SHA. Actual serialized before/after
bytes and final graph/client mappings remain pending. Do not run the old public
graph driver as final G11 evidence. Unknown-energy sorting remains deferred.

The original commands below reproduce the earlier f140 checkpoint. Their
successful results must not be cited as final e717 public proof. AtomicCAS is
still a separate one-Task/no-edge proof maintained by B.

## Run

From the checkout root:

```sh
bun .agents/skills/verify-dag-formal/check.mjs
```

Requires the current pnpm-installed dependencies, Bun 1.4.4, Java 11 or later,
and curl only if the pinned TLC jar is missing. No dependencies or manifests
are changed. The production pin is exactly
`f140c7b09bcb1db48ce4ccaee797ecfe60019ce4`, available as local Git objects.
The checker never imports B's moving working tree or this branch's older
product modules. Missing objects, dependency version mismatches or escaped
source resolution fail the run. Do not substitute another checkout.

Exit 0 means the finite model, intended model controls, generated production
corpus, concrete integration drives, real-source sensitivity and final clean
rechecks all passed for that candidate. The result explicitly lists pending
final public commands and clients. `--model-only` exits 0 for only the finite
model. `--full` runs the default proof and exits 2 because final public/client
coverage remains pending. Neither mode is final F acceptance.

To rerun only production conformance:

```sh
bun .agents/skills/verify-dag-formal/production-check.mjs
```

Its `--literal` and `--skip-sensitivity` options are diagnostic subsets. They
write diagnostic-pass and never produce the normal acceptance marker. A
compiler failure, source/hash mismatch, wrong invariant or timeout never counts
as a successful negative control.

## Doctor and provenance

coverage.json pins reviewed product files/functions, the candidate commit and
the current model hash. production-pin.json pins the candidate and seed. The
source gate reads exact Git objects. To move the pin, first review changes to
every covered function, update the mapping and applicable assertions/mutants,
then rerun. Never advance hashes alone. Model source, config copies, compiler
import paths, tool pin, installed versions and verification-source hashes are
recorded in each evidence directory.

Production inputs are materialized under that run's ignored candidate directory,
without a Git directory. All packages/domain files remain byte-identical to
the recorded Git blobs except during isolated sensitivity steps. Domain import
aliases resolve to candidate exports. Loaded source outside candidate inputs
or installed node_modules is refused. Dependency manifests must match this
worktree and production package versions must match the manifest. Strict
TypeScript checks cover F drivers and their candidate production imports.

The runner copies AtomicCAS's candidate skill unchanged, reuses a verified jar
in its isolated evidence, and executes its one command. B owns its maintenance.
It also compiles the unchanged candidate migration and DAG drives, including
opposite-edge child processes. No other worker's evidence is changed.

## Model bounds

DagAcyclic remains a finite TLA+ ordering model, not a verifier for arbitrary
TypeScript. It uses CLI/server writers, stale observations, BEGIN IMMEDIATE,
private Record/ApplyEdges/ApplyTasks/WriteVersions stages, Commit, separate
rejected-History stages and crashes that can lose uncommitted rejection rows.
A captured refusal graph is never replaced by later durable state.

The original 25 positive configurations and five controls remain. Most have
three Tasks, one Profile, Versions 1..4 and at most one later grouped Revert.
All four statuses occur, including all 64 initial assignments in statuses.
profiles uses two Profiles. degree-two-race has four Tasks and degree two;
three non-self blockers need four Tasks. count-race uses three Tasks and limit
one. The two 15-Task single-add configurations check literal 13 versus 14 in
the model. All constants and initial edges/statuses are in suite.json/configs.
Seven reachability controls require real traces, including stale edge no-ops,
grouped Delete/Revert, witness recording after a graph change, the 13/14
outcomes, and rejection of Revert after a newer dependent Version.

The reviewed production mapping refined Resolve for Revert to retain the original
resolved after Versions. No invariant was weakened. Full before/after maps and
writer/epoch are ghost audit data; production compact events do not store them.

TLC is pinned to tla2tools 1.7.4/TLC 2.19 and SHA-256
936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88,
identical to AtomicCAS's pin. Every run checks the jar. Each config has a
120-second deadline, 768 MiB heap, one worker, fingerprint polynomial 0, seed
26, no symmetry or state constraints. Positive queues must finish empty.
CHECK_DEADLOCK FALSE permits stopped writers; there is no fairness claim.

The five model mutants fail Acyclic for validation before Begin, missing lock
and status-pruned cycles; NoReopenUnderDone for omitted reopen protection;
and AtomicGraphHistory for split Delete publication. The no-lock mutant applies
each edge fact to the current durable set, never a stale graph replacement.
Nonempty mutant/reachability queues are counterexample frontiers, not safety
passes. The clean 64-initial-state configuration runs last.

## Production corpus and sensitivity

Graph drivers import actual candidate modules. Independent expectations use
set traversal, simple-path enumeration, valid permutations and scalar sorting.
The graph corpus exhausts all 4,165 directed non-self graphs through four nodes,
selects 572 DAGs, and checks all 140,660 status vectors and 709,242 weight
vectors in separate dimensions. It does not exhaust their full Cartesian
product. Seed 260911 generates 256 further DAGs through 40 nodes with shared
ancestors, mixed terminal states and missing weights, plus all-open positive
variants. Exact random inputs and exhaustive recipes survive in graph-corpus.json.

Checks cover both Kahn orders, comparator ties, scalar weighted equivalence,
distinct pruned energy/unweighted, contains, inclusive Ready lightest_next,
shortest unpruned BFS loops and a 103-edge chain, terminal Ready/Blocked,
connected shape/orientation, and literal domain 9/13/14 count/advice/refusal.
Public warning/filter/format responses remain pending B.

The independent replay driver uses all DAGs through three nodes and 64 seeded
DAGs through twelve nodes, 93 cases and 186 rebuilds. It alternates compact
edge events and grouped initial edges. Sorted raw task_dependencies,
task_versions and complete Tasks must match issued-input expectations before
and after full/checkpoint replay. Candidate integration fixtures additionally
check grouped lifecycle, Move/Purge FK ordering, row-delete effects, rejection
redaction, owner Snapshot restore and authenticated initial edges. N1 tests
legacy migration 1 and concurrent starts from versions 2..5.

36 broken-real-source variants each compile, then must fail a named behavioral
assertion. Mutation definitions live in production-mutants.mjs. They alter only
owned isolated candidate copies; B's files and this branch's product files are
never mutated. Every source is restored in finally, with byte-for-byte hash
confirmation and a clean targeted rerun. Final graph and replay binaries are
compiled again from restored inputs and rerun against the complete corpus.
The clean random corpus must be byte-identical to baseline. The report records
observed property names, exits and source hashes for every variant.

## Evidence, cleanup and limits

Each run prints docs/evidence/dag-formal/check-* and a linked conformance-*
directory. Outputs are ignored by Git and survive cleanup. They retain model
and config copies, counts/depth/queues, full TLC traces, verified jar, committed
input manifest, compiler import/source hashes, corpus, actual process exits and
signals, mutation sources, restoration receipts and result.json. Production
processes have a 180-second deadline; the combined production stage has 300
seconds. A timeout is incomplete proof. Helpers close SQLite stores and remove
only their own scratch data. Only recorded child processes are stopped.

There is no unbounded safety, liveness, SQLite-engine, power-loss, client-runtime
or rendering claim. SQLite serialization/atomic commit are assumptions. Move,
Purge, creation, checkpoints, authentication and filesystem protocols are
concrete tests, outside the finite model. Public edge no-op/malformed/auth
boundaries still need final B command checks. True-only CLI/HTTP filters,
response warnings/formats, final clients and source mapping must be completed
before final F approval. No real Todo data, native app, signing, Keychain,
installed binary or Python workaround is used.

The relative .claude/skills/verify-dag-formal link resolves here. Fresh Claude
session discovery remains with L1; this worker launches no children. Use
/maintain-formal-verification-skill when requesting a future mapping review.
That maintenance skill is not installed by this change.

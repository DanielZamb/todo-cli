---
name: verify-dag-formal
description: Check finite Task dependency transaction safety with DagAcyclic, including two writers, stale Versions, grouped Delete/Revert, captured refusal evidence and crash stages. Use after DAG validation, serialization, event, replay or graph algorithm changes. Production conformance is pending A/B integration at this checkpoint.
---

# Verify Task dependency transactions

A committed Dependency change must preserve the DAG, status rules and affected
Versions, and publish its resolved History and projection together. A break can
accept a loop, reopen a blocker of a done Task, or recover a different graph.

Created with the create-formal-verification-skill workflow. This is a runnable
finite-model checkpoint, not final unit F approval or a production graph proof.
Read [coverage.json](coverage.json), [mapping.md](mapping.md), the
[feature index](features/README.md), and the
[checkpoint report](../../../docs/decisions/task-dag/unit-f-report.md).

## Run

From the checkout root:

```sh
bun .agents/skills/verify-dag-formal/check.mjs
```

Prerequisites are Bun, Java 11 or later, and curl on the first run. No package
installation is required by this model command. The tested runtime is Bun 1.4.4
and Java 21. It pins tla2tools 1.7.4, TLC 2.19, to the SHA-256 in
[tool.json](tool.json), identical to verify-occ-atomicity's pin. It first reuses
this skill's ignored cache, then an existing AtomicCAS jar. Download is allowed
only after the repo disk guard succeeds. Every run verifies the jar hash.
It does not edit the AtomicCAS cache or any product source.

Exit 0 means only the finite model, five model negative controls, reachability
witnesses and final clean model recheck passed. The terminal result explicitly
says production conformance is pending. `--full` runs the same checks and exits
2 because production coverage is not implemented yet. Never report that as a
full pass. Exceptions, wrong invariants, incomplete queues on positive runs,
source drift, compiler errors and timeouts fail the command.

## Doctor and evidence

The one command verifies the reviewed source hashes before TLC. If those hashes
changed, read the changed functions against mapping.md. Do not refresh hashes
to bypass drift. `coverage.json` records the reviewed product/design commit
`8745cdd0247fb8cc0ff74f95bff257fd95cfa4d3`. It does not claim that commit
implements Dependency commands. Renew the mapping after A/B commits land and
again after client integration, with real behavior and real-source sensitivity.

Each run prints a unique `docs/evidence/dag-formal/check-*` directory. It retains
model/config copies, the verified jar, source provenance, commands, process exit
codes/signals, timeouts, stdout/stderr, counterexamples and result.json. Inputs
are versioned under this skill. Output is ignored by Git and survives cleanup.
No server or app is launched. Child processes are owned Java checks with a
120-second deadline per configuration and a 768 MiB heap. A deadline means
incomplete proof, never success. TLC uses one worker, fingerprint polynomial 0,
seed 26, breadth-first exhaustive search, no symmetry and no state constraints.
CHECK_DEADLOCK FALSE permits finite stopped writers. No fairness is assumed.

## Bounds and interpretation

The suite lists every configuration in suite.json and configs/. Most use three
Tasks, one Profile, two writers named CLI and server, one operation per writer,
and at most one later grouped Revert selected from committed History. Versions
start at 1 and range through 4. Every stage can crash permanently. Four statuses
are present; `statuses` starts from all 64 status assignments on three Tasks.
`profiles` puts Task 3 in another Profile. `degree-two-race` uses FOUR Tasks and
limit two because three non-self blockers cannot exist on three Tasks. The
three-Task `count-race` uses limit one to expose the same competing-count issue.
The ordinary three-Task degree bound is two, not a literal proof of 13.

`boundary13` and `boundary14` use 15 Tasks, one active writer and one add, with
12 or 13 existing blockers of Task 15. These finish exhaustively. They prove
that boundary in the model only. The concrete CLI/API 9/13/14 check remains
pending B. The other writer starts stopped in these two configurations.

Read the report for generated/distinct state counts, depths and empty queues.
Positive runs must end with queue zero. Negative controls stop at the first
intended failure. Their nonempty queues are not exhaustive passing results.
Reachability controls deliberately negate a reachable event. They establish
that stale no-ops, grouped Delete, committed Revert, post-rollback witness gaps,
and the 13/14 outcomes actually occur in the explored model.

## What the model does

Resolve reads observations before Begin and can become stale. Begin takes the
writer lock and captures current Tasks, edges and Versions. Validation checks
boundaries and endpoint visibility before edge no-ops, then affected Versions,
then graph/status rules. An edge no-op creates neither accepted nor rejected
History, even if its valid observed Version is stale. Malformed and unauthorized
inputs go to a boundary error state instead. This abstracts boundary failures;
it does not prove a parser, credential implementation or exit-code mapping.

Record, ApplyEdges, ApplyTasks and WriteVersions modify private pending state.
Commit alone publishes the pending state and one resolved event. Replay applies
recorded edge and Version facts without validation or clocks. The no-lock mutant
instead applies each writer's edge delta to the current durable graph. It cannot
hide a race by replacing the whole graph with an old private copy.

A rejection captures its validation state and a valid closed loop in that
proposed graph. RejectBegin, RejectRecord and RejectCommit use a separate writer
transaction after rollback. Another writer may commit between them. Witnesses
continue to refer to the captured graph. Crashes can lose rejected History
before its commit. Delete removes all incident edges and bumps each affected
Task once, including the primary only once. Revert inverts recorded deltas
against the current graph and rechecks status and cycle guards. No Move or Purge
transition is modeled in this checkpoint.

The checked invariants are TypeOK, Acyclic, SameProfileEdges,
InDegreeAtMost13, DoneHadResolvedDependencies, NoReopenUnderDone,
OneEventPerDelete, DependencyVersionOwnership, RejectedNoProjectionChange,
AtomicGraphHistory, CrashAtomicity and RejectionWitness. The model's loop
construction is only a specification witness. Production shortest BFS remains
a separate generated-input obligation.

## Sensitivity and limits

Five config-only mutants must exit TLC 12 for the named property: graph check
before Begin, no writer lock and status-pruned checks fail Acyclic; omitted
reopen protection fails NoReopenUnderDone; split Delete edge publication fails
AtomicGraphHistory. They change model constants, never real code. The runner
copies and hashes the original model and reruns clean after them. Real-code
mutation sensitivity remains pending A/B. No compiler or hash failure counts.

No unbounded, liveness, SQLite-engine, power-loss, client-runtime or rendering
claim follows. SQLite's one-writer isolation and atomic transaction commit are
assumptions. Native applications, signing, Keychain, real Todo data and Python
workarounds are outside this skill. AtomicCAS is complementary and must also be
rerun through its own command. Its inherited mapping gate currently fails;
A owns its renewal and sensitivity, as recorded in the checkpoint report.

## Discovery and maintenance

The relative `.claude/skills/verify-dag-formal` link resolves to this directory.
A fresh Claude discovery invocation is pending L1 because this worker is
forbidden to launch another thread solely for discovery. Do not describe a
resolved symlink as proof of fresh discovery. Use
`/maintain-formal-verification-skill` when requesting later mapping maintenance;
that maintenance skill is not installed by this unit.

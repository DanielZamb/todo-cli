# FV01 report

Status is complete on branch `own-work/fv01-formal`, based on
`own-work/round-2026-11-03` at `a595e277dcb1f4356c8451df0bc3f5cc1fab28d9`.
That is also the reviewed product-code commit in `coverage.json`.
The worker's final response records the delivery commit.

Property: A Task change commits only against the current Task at the next Version, and its History entry and new value become durable together.

Harm: A break can overwrite another client's work or make replay recover a different Task than the owner saw.

The skill is [verify-occ-atomicity](SKILL.md), discovered through its relative
`.claude/skills/verify-occ-atomicity` symlink. Only that new skill and the symlink
are delivery files. Product code, dependencies, ADRs, and existing skills are unchanged.

## Tool and bounds

TLC explores ordering and crash cases at lower cost than a TypeScript theorem
prover integration. [tool.json](tool.json) pins TLA+ tools v1.7.4, TLC 2.19 of
08 August 2024, by URL and SHA-256. It predates the seven-day package floor.
The jar stays in ignored evidence. The runtime is Bun 1.4.4 with SQLite 3.51.0.
No dependency was added, so the conditional package-age dependency check did
not apply. Existing dependencies were installed from the frozen pnpm lockfile.

The TLA+ model covers two writers with one attempt each, one existing Task,
Versions 1 through 3, three content values, every enabled order, separate
rejection transactions, and crashes at every stage. Task payload and
`task_versions` writes are separate statements in the model.
TLC found 37,036 distinct reachable states and left zero queued states.

The unmodified production driver checks 216 event combinations and 432 replay
results. A separate instrumented driver checks seven SIGKILL boundaries.
Two unmodified processes compete after both read Version 1. A real SQLite
projection trigger forces rollback after History insertion. The run checks the
durable Version row before rebuilding the projection.

This is exhaustive model checking within those bounds, plus bounded production
conformance and recovery checks. It is not a machine-checked refinement proof
of all TypeScript. It leaves out multiple Tasks, Series, Occurrences, Revert,
Move, Purge, owner Snapshot restore, authorization, Profile isolation, expected
Version handoff through clients and import, external id uniqueness across Tasks,
attachment bytes and filesystem cleanup, HTTP, SSE, UI, power failure, and
unbounded behavior. The skill describes these limits beside the command.

## Findings and sensitivity

No violation appeared in the unchanged product code within the stated scope.
Both scratch breaks were detected in the unmodified compiled production driver,
before the source hash gate or TypeScript checker could reject them.

1. Removing the Task before-value check in `OperationStore.validate` lets a
   `TaskEdited` event claim a different before title at Version 1 and commit at
   Version 2. The original code records a Conflict instead.
2. Skipping `TaskEdited` projection application in `appendSync` commits History
   containing the imported title and external id, while the stored Task still
   has its original values. Replay would apply the committed after-value.

The sensitivity helper restored the original store bytes in `finally` after
each scratch break. Its final check returned to a pass. No scratch product
change remains. Model controls also fail when either compare-and-swap or atomic
commit is disabled. Neither the property nor its bounds were relaxed to pass.

The authoritative local evidence is:

- [Sensitivity exits and restoration](../../../docs/evidence/fv01/sensitivity-SOg8aP/result.json).
- [Incorrect before-value counterexample](../../../docs/evidence/fv01/fv01-check-W3MHj6/enumerate.stderr).
- [Missing projection counterexample](../../../docs/evidence/fv01/fv01-check-7OunkI/enumerate.stderr).
- [Restored run](../../../docs/evidence/fv01/fv01-check-NbWNQm/result.json).
- [Model output](../../../docs/evidence/fv01/fv01-check-NbWNQm/tlc-baseline.stdout).

## Commands and exit codes read

| Command or child check | Exit code | Result |
| --- | --- | --- |
| `scripts/disk-guard.sh` | 0 | About 166 GB free before dependency installation and tool download. |
| `pnpm install --frozen-lockfile` | 0 | Local dependencies installed; manifests and lockfile unchanged. |
| `bun .agents/skills/verify-occ-atomicity/check.ts` on the baseline | 0 | Model, production checks, and source mapping passed. |
| Same command with the Task before-value check removed | 1 | Observed incorrect committed outcome. |
| Same command with TaskEdited projection application skipped | 1 | Observed incorrect stored Task. |
| Same command after exact restoration | 0 | Model, 216 cases, 432 replay checks, seven crashes, race, rollback, strict types, and source gate passed. |
| `bun .agents/skills/verify-occ-atomicity/prove-sensitivity.ts` | 0 | Read both scratch exits as 1 and the restored exit as 0. |
| TLC baseline, invoked by `check.ts` | 0 | AtomicCAS and TypeOK passed. |
| TLC without the before check | 12 | Expected AtomicCAS counterexample. |
| TLC without atomic commit | 12 | Expected AtomicCAS counterexample. |
| `bun --bun node_modules/typescript/bin/tsc -p .agents/skills/verify-occ-atomicity/tsconfig.json` | 0 | Strict types passed. |
| Biome `check --write` through scoped stdin, requiring unchanged output | 0 | New TypeScript and JSON passed without changing product files. |
| `git diff --exit-code -- packages apps scripts docs/adr` | 0 | No product or ADR diff after restoration. |

SIGKILL checks require the child's signal to be `SIGKILL`, not a successful
process exit. Each child command record keeps both its exit code and signal.
The final restored run took about seven seconds, including model controls,
compilation, production checks, strict types, and source validation.

During development, the first model invocation exited 150 because `FiniteSets`
was missing from the imports. Three early sensitivity-helper invocations exited
1 while the proof recipe was being corrected. They exposed an unused-variable
compiler failure before behavior ran, an overly early rejection-reason assertion,
and instrumentation that altered a conditional statement. The final recipe
runs production behavior first, prioritizes valid next-Version proposals, and
uses a separate instrumented binary only for crash tests. Failed authoring
runs remain in ignored evidence. Every scratch source change was restored.

## Deviations and follow-up

The no-comments skill says "Spawn Comment Sicko." The assignment says "Do not
launch a reviewer." The assignment took precedence. I read that skill and its
review brief, inspected the new code myself, and checked for comments and
suppressions. There were none to delete or restore. No reviewer, subagent, or
other thread was launched. No signing, Keychain, native app, owner database,
real HOME installation, push, or PR was involved. Python was not used.

A close next target is preserving the caller's expected Version through import
adoption, especially when a Task gains an external id while another client
edits it. The current skill protects the shared storage transaction; it does
not prove that callers pass the Version the owner approved.

## PERF-tags renewal

Reviewed product `07550ecd35890094625711a5269b8d7c6eb476dc` and inherited source
drift from the previous confirmed commit. The new link comparison is private
within `Apply`; the Task and Version writes and commit order are unchanged.
The model remains unchanged. See the PERF-tags mapping section in `SKILL.md`
for the reviewed inherited guards and the separate concrete Tag coverage.
Sensitivity caught both real-code mutations at assertions, exit 1 each, then
the restored one command passed, exit 0. Local evidence:
`docs/evidence/fv01/sensitivity-Km03fK/`.

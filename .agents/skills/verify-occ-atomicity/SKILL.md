---
name: verify-occ-atomicity
description: Formally check the operation store's Task compare-and-swap and atomic History and projection commits. Use after changes to OperationStore transactions, validation, append, rejection recording, replay, event schemas, Version, Attachment events, or import adoption.
---

# Verify Task compare-and-swap atomicity

Property: A Task change commits only against the current Task at the next Version, and its History entry and new value become durable together.

Harm: A break can overwrite another client's work or make replay recover a different Task than the owner saw.

Created with the `create-formal-verification-skill` workflow. The authority is
[ADR-0007](../../../docs/adr/0007-operation-log-is-the-source-of-truth.md).
The shared operation store protects every writer, including Attachment changes
and import adoption. Its failure can damage accepted changes across features.
The existing store tests exercise sequential Conflicts and a projection SQL
error; the model checks all writer and crash orders within the stated bounds.
Purge privacy is another high-cost promise, with dedicated existing Purge and
Snapshot verification. This skill targets the transaction those features depend on.

## Run the check

From the checkout root, run this one command:

```sh
bun .agents/skills/verify-occ-atomicity/check.ts
```

Prerequisites are the checkout's pnpm-installed dependencies, Bun 1.4.4, Java 11
or newer, and curl for the first run. Use pnpm to install dependencies from the
existing lockfile. The check never installs Bun or changes dependencies.

The checker uses [TLA+ tools v1.7.4](https://github.com/tlaplus/tlaplus/releases/tag/v1.7.4),
whose TLC version is 2.19 of 08 August 2024. [tool.json](tool.json) pins its HTTPS
URL and SHA-256. The first run downloads the jar into ignored evidence after
checking that at least 10 GB is free. Every run verifies the hash before running
Java. No global TLC installation is needed. During FV01 work, run the assignment's
disk-guard command before installing anything.

Exit 0 and `PASS: AtomicCAS model and production checks` mean every required
stage finished and the covered source still matches the reviewed mapping.
Exit 1 means failure. Read `result.json` in the evidence directory printed by
the command. An interrupted or timed-out run is incomplete, even if an earlier
stage passed. A warm run took about seven seconds on the FV01 machine.

TLC suits this question because the failure depends on the order of writers,
commits, rejection recording, and crashes. It checks the finite model exhaustively.
It does not verify arbitrary TypeScript directly. Production conformance checks
and a source-drift gate support the reviewed model-to-code mapping.

## Read the result

The command performs these checks:

1. TLC checks `AtomicCAS` and `TypeOK` with one worker, a fixed fingerprint
   polynomial, no symmetry reduction, and no state constraints. It must finish
   with zero states left on its queue. The baseline has 37,036 distinct states.
2. Two model controls disable the before-value check or publish History before
   commit. Each must fail `AtomicCAS` with TLC exit 12 and a counterexample.
3. A compiled driver imports the unmodified production operation store and
   checks all 216 combinations of three current Versions, three proposed before
   Versions, matching or different before content, four proposed after Versions,
   and `TaskEdited`, `AttachmentAdded`, or `TaskDeleted`. `TaskEdited` carries an
   external id to exercise the storage shape used by import adoption.
4. Every case checks the returned outcome, rejection reason, durable Task,
   History, and replay both from the beginning and from a replay checkpoint.
   Expected Task values come from the issued fixture, without calling production
   projection helpers to calculate the expected result.
5. A separate compiled driver adds SIGKILL calls at seven reviewed boundaries.
   It kills its own process after validation, History insertion, projection
   application, successful commit, rejected History insertion, and rejection
   commit, plus the gap between the Task payload and task_versions writes.
   A fresh unmodified driver reopens each database and checks recovery,
   including the durable task_versions row before replay.
6. Two unmodified processes read the same Task before either writes. An
   Attachment change and an import-shaped edit compete. Exactly one change
   commits at Version 2, and the other records a Conflict. A projection SQL
   trigger also forces rollback after History insertion.
7. Strict TypeScript checks and the source SHA-256 gate must pass. Typechecking
   follows behavioral checks so a scratch deletion cannot substitute an unused
   variable error for a detected incorrect write.

An unchanged source mapping plus a model counterexample is a finding until you
can show that the model added an impossible code transition. A production
assertion is a finding until its expected Task or outcome contradicts the
contract. Read the preserved input and observed output before deciding.
Do not relax `AtomicCAS`, change a pin, or update hashes to obtain a pass.

## Check the model against the code

The mapping was confirmed at commit
`ed4e2423d696d0321bb0e19674bba1865bd2541d`.
[coverage.json](coverage.json) records exact source hashes and covered functions.
The gate covers whole files conservatively, even when only one function matters.

The model has two kinds of Task state. `task` and `history` are the values another
connection can observe after recovery. `version` is the task_versions row.
`pendingTask`, `pendingVersion`, and `pendingHistory` are the current writer's
uncommitted values. `lock` represents SQLite's single writer
lock. `content` represents the complete resolved Task payload other than Version,
compared by `same` in the store. It does not stand for the title alone.
Validation reads and compares values without writing them. The writer lock keeps
those rows stable, so the model groups those checks without losing a durable
state or a crash outcome.

| Model step or check | Code a reviewer must inspect | Mapping |
| --- | --- | --- |
| `Init` | [OperationStore constructor](../../../packages/domain/src/store/store.ts), [Task](../../../packages/domain/src/entities.ts) | Start after one valid TaskCreated has committed at Version 1. That seed entry is implicit in the model. |
| `Resolve` | [OperationStore.append and appendSync](../../../packages/domain/src/store/store.ts), [Event schemas](../../../packages/domain/src/events.ts) | Abstract input selection at the append boundary. Before values may be stale or fabricated; the store accepts unknown input. Other metadata and schema checks are assumed valid. This is an environment step, not a database transaction. |
| `Begin` | [OperationStore.transaction](../../../packages/domain/src/store/store.ts) | Bun's synchronous `.transaction(...).immediate()` obtains the writer lock before validation. Statements within the callback do not await. |
| `Validate` | [OperationStore.validate](../../../packages/domain/src/store/store.ts), [Version](../../../packages/domain/src/ids.ts) | `same(current, change.before)` must hold, and `after.row_version` must equal the stored task_versions value plus one. A Rejection rolls back before recording a rejected attempt. |
| `Record` | [OperationStore.record and appendSync](../../../packages/domain/src/store/store.ts) | The INSERT into op_log is still private to the writer transaction. Actor, Profile, timestamps, seq, and rejection details are omitted from the abstract entry. |
| `Apply` | [applyEvent, changes, applyChanges, and putTask](../../../packages/domain/src/store/projection.ts) | The single tasks INSERT or UPDATE statement changes the pending Task payload. With no Series, Project, or Tags in scope, other projection work is absent or leaves the modeled values unchanged. |
| `WriteVersion` | [putTask](../../../packages/domain/src/store/projection.ts) | The separate task_versions INSERT or UPDATE statement changes the pending Version. Crashes may occur between this statement and the Task payload write. |
| `Commit` | [OperationStore.transaction and appendSync](../../../packages/domain/src/store/store.ts) | Successful return from `.immediate()` publishes the log entry and projection together. SQLite commit is the atomic step. |
| `RejectBegin` | [OperationStore.recordRejection](../../../packages/domain/src/store/store.ts) | A separate transaction starts after the failed append transaction has rolled back; another writer may commit in the gap. |
| `RejectRecord` | [OperationStore.recordRejection and record](../../../packages/domain/src/store/store.ts) | Insert TaskAttemptRejected without applying a Task change. |
| `RejectCommit` | [OperationStore.transaction](../../../packages/domain/src/store/store.ts) | Only the rejected History entry becomes durable. |
| `Crash` | [OperationStore.transaction](../../../packages/domain/src/store/store.ts), [SQLite transactions](https://www.sqlite.org/lang_transaction.html) | An interrupted writer or a thrown SQL error discards its uncommitted work and releases its lock. A crash before rejected History commits may lose that attempted-change record. |
| `AtomicCAS` | [OperationStore.rebuild](../../../packages/domain/src/store/store.ts), [applyEvent](../../../packages/domain/src/store/projection.ts) | Committed before-values form a chain starting at the seed Task, Versions advance by one, and the last committed after-value equals the durable Task. The task_versions row equals the Task Version. Rejected entries do not affect replay. |
| Concrete Attachment fixture | [Attachment and validAttachmentLocation](../../../packages/domain/src/attachments.ts) | One valid HTTP link; no filesystem reads or copied images. |

Bun 1.4.4 and SQLite supply transaction isolation, atomic commit, and process
crash recovery. This check tests those assumptions on the installed runtime;
it does not prove SQLite or the operating system. The source retains WAL and
`synchronous=FULL`. See [SQLite transaction behavior](https://www.sqlite.org/lang_transaction.html)
and [WAL](https://www.sqlite.org/wal.html) for the external guarantees.

## Respect the bounds

TLC checks two writers with one attempt each, one existing Task, Versions 1
through 3, and three abstract content values. It allows every proposed before
value and proposed after Version within those bounds, every enabled writer
order, and a crash at every stage. A writer can stop permanently. There is no
fairness assumption or liveness claim. History contains at most two attempted
changes beyond the implicit seed.

The production cases use current and before Versions 1 through 3 and after
Versions 1 through 4. They hold the Profile, identity, timestamps, Project, Tags,
Series, and other Task fields fixed except for each fixture's stated changes.
The model and production enumeration have different roles and bounds; neither
is a machine-checked proof of refinement from all TypeScript to TLA+.

This check leaves out multiple Tasks in one event, Series and Occurrences,
Revert, Move, Purge and redaction, owner Snapshot restore, Profile isolation,
authorization, client or import expected-Version handoff, external id uniqueness
across Tasks, attachment bytes and filesystem cleanup, HTTP, SSE, and UI behavior.
It does not establish unbounded safety, eventual delivery, persistence of a
rejection interrupted before commit, power-loss durability, or hardware safety.
Use the existing subsystem verification skills for their behavioral contracts.

## Preserve evidence and renew the mapping

Each run creates `docs/evidence/fv01/fv01-check-*`, which Git ignores. It keeps
commands, exit codes and signals, source hashes, tool pin, model and configs,
TLC logs and counterexamples, compiler records, instrumented source, concrete
assertions, and a final result. It removes only its own scratch directory,
compiled binaries, and scratch databases. It kills only its own child processes.
No server, native app, owner database, real HOME, credentials, or Keychain is used.

When the source gate fails, compare every changed covered function with the
mapping above. Update the model, fixtures, and crash boundaries for intended
changes. Run the check and reproduce sensitivity before moving `confirmedCommit`
and the corresponding SHA-256 values forward. Record the commit whose product
code you reviewed. Advancing the commit or hashes alone is not verification.
Use `/maintain-formal-verification-skill` to request that maintenance workflow;
it is not installed as a project-local skill by this change.

## Reproduce the sensitivity proof

The normal check never edits product code. To repeat the proof of sensitivity,
start with the exact confirmed store source and exclusive access to this worktree,
then run `bun .agents/skills/verify-occ-atomicity/prove-sensitivity.ts`.
That maintenance helper temporarily changes the real store source and restores
its original bytes in `finally`. Do not interrupt it with SIGKILL.

It first removes the Task before-value check from `validate`. A TaskEdited event
whose before title differs from the current Task then commits at Version 2.
The production enumeration must fail on the observed committed outcome.
It next skips the TaskEdited projection application in `appendSync`. History
then commits the imported title and external id while the stored Task remains
unchanged. The enumeration must fail on that Task value. Neither failure may
be satisfied by a source hash mismatch or a compiler error.

Both scratch variants made the one check command exit 1. After byte-for-byte
restoration, the same command exited 0. No product-code finding appeared in the
unchanged source within these bounds. [REPORT.md](REPORT.md) records the run.

## CLI01 mapping review

At product commit `ed4e2423d696d0321bb0e19674bba1865bd2541d`, only `attachments.ts` changed among the covered files. Its URI validator accepts absolute URIs, including HTTP user information, and its new input and report schemas describe Attachment groups. The store transaction, before-value comparison, Version check, projection, event schemas and replay are byte-identical to the earlier mapping. The model already treats the whole resolved Task payload as content. URI locations therefore fit the same abstract content values without changing a transition or invariant.

Batch groups and import adoption compose existing commands within the existing immediate transaction. The model still excludes command-input handoff and multiple operations in an outer transaction. The compiled CLI01 drive, import tests and Attachment verification cover those behaviors separately.

## PERF-tags mapping review

Product commit `d83d61863b95d2482ca9281a34d5db4494abffbb` changes only
`putTask` in the modeled production path. Its SELECT reads actual link rows
inside the existing immediate transaction. Equal Tag sets with distinct payload
ids skip only link DELETE and INSERT. Other inputs use the original array INSERT
loop, so duplicate ids fail the link primary key and roll back the transaction.
This D1 correction supersedes the duplicate-collapse behavior in `07550ecd`.
The Task payload statement still precedes the separate
Version statement, so `Apply`, `WriteVersion`, `Commit` and every crash boundary
remain in the same order. The abstract no-Tag fixture still describes both
writes; the concrete Tag proof in `verify-op-log` covers link branches, payload
order, duplicate constraint failures, rebuild, rollback, Move, Delete and Revert.

The inherited mapping had drifted before this unit. Inspection of the delta
from `ed4e2423` through parent `8c7c7b10` found bounded rejection inputs and
result-list limits in `store.ts`, auth-only event alternatives in `events.ts`,
and Attachment input limits in `attachments.ts`. The existing small concrete
fixtures remain valid, before-value comparison and next-Version validation
remain mandatory, and the transaction and append order are unchanged. These
new guards can reject other inputs before `Record`, without adding a durable
state. Entities and ids are unchanged. The model still excludes input limits,
auth and multi-Task composition as stated above.

Both real-code sensitivity variants failed at behavioral assertions with
exit 1; the restored checker passed with exit 0. The reviewed production source
hashes and `confirmedCommit` were then renewed. Local evidence is
`docs/evidence/fv01/sensitivity-Km03fK/` and
`docs/evidence/perf-tags/sensitivity-reviewed.log`. The one-command clean
recheck and the full worker report record the final evidence location.

For the D1 correction, the pre-renewal checker completed the model and production
stages before failing only the changed projection hash. The mapping review above
keeps every atomicity boundary unchanged. Fresh sensitivity again rejected both
real-code defects with exit 1 and passed the restored command with exit 0.
Evidence is `docs/evidence/perf-tags/d1/sensitivity.log` and
`docs/evidence/fv01/sensitivity-d7gc1J/`. The source hashes now identify `d83d6186`.

## SEC limits mapping review at its pre-Tag base

This section records SEC's review of its pre-Tag base. Its projection comparison does not describe the integrated Tag optimization above.


The source gate failed against `ed4e2423`, which is not an ancestor of `main`. The drift in `store.ts`, `events.ts` and `attachments.ts` came from the input-limits and sign-in-lockout work already on `main`. `projection.ts`, `entities.ts` and `ids.ts` are byte-identical. The reviewed product commit is `main` at `f709549c30d7f76543b103f6d31b7c78d2840664`. Its covered files are byte-identical to `feat/task-search` at `c11f7ec9`.

- `events.ts` adds the `resetPassphrase` auth action and the `sign_in_locked` and `sign_in_busy` auth rejection reasons. No Task event schema changed.
- `recordRejection` now replaces an over-long `occurred_at` with the recording time. It stores a Task id longer than 200 units as null and bounds the received payload with `rejectedInputForHistory`. The model omits timestamps and rejection details from History entries. `RejectRecord` still inserts only `TaskAttemptRejected` in its own transaction, with no Task change.
- `validate` gains Tag and Attachment list-limit checks. They read Series rows and resolved predecessors under the writer lock and throw `Rejection("validation")` before any write. `Resolve` already assumes other metadata and schema checks are valid, and a failure takes the existing rollback-then-reject path. The Series exclusion-date and Tag checks and the Move arrival checks are outside the model's scope.
- `attachments.ts` adds input-side length limits and moves the link member into the stored `AttachmentLocation`. The stored `Attachment` and `validAttachmentLocation` are unchanged, so the one-HTTP-link fixture still fits.
- The external reason passed to rejection recording is now capped at 64 units. The driver's reasons are short codes.

No transition, invariant or fixture changed. The check exited 0 with 37,036 distinct states. `prove-sensitivity.ts` exited 0: both store breaks failed the enumeration, and the restored source passed. One earlier candidate run exited 1 when `kill-validated` exceeded its 15-second readiness timer at host load 41. A rerun on the same source exited 0.

## PERF and SEC base integration

The merged covered source files are byte-identical to the reviewed Tag mapping at `d83d61863b95d2482ca9281a34d5db4494abffbb`. SEC changes search preparation, filtering and command reads outside these covered store files. The combined mapping retains the distinct-Tag fast path, duplicate rollback, transaction boundaries and both prior sensitivity receipts. The integration runs the unchanged atomicity command again; no source hash is advanced.

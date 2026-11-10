# Unit A mapping renewal

The inherited base 8745cdd0247fb8cc0ff74f95bff257fd95cfa4d3 differed from the
ed4e2423 mapping before this unit changed code. Review compared both commits,
then reviewed the Unit A diff. These are separate changes.

## Inherited changes

- store.ts imports bounded input limits. recordRejection bounds timestamps,
  target IDs and received input. validate prevents growth past Task Tag,
  Attachment, Series Tag and exclusion-date limits, while preserving existing
  oversized values for Move/Revert/successors. Move applies equivalent growth
  checks before departure. reject bounds reason codes. These add refusal
  predicates and bounded History metadata; they do not move CAS, record, apply
  or commit. The 216-case fixture has no oversized lists and stays in scope.
- events.ts adds passphrase-reset and sign-in-lockout auth labels. Auth events
  are outside the one-Task model and do not change its event fixtures.
- attachments.ts separates stored location schemas from bounded request schemas,
  bounds labels, IDs and batch sizes, and retains the same absolute URI and
  location validator. The model treats a complete Attachment as Task content;
  the valid link fixture still exercises that content path. Request parsing and
  bulk commands remain outside this model.

## Unit A changes

The constructor still sets WAL, foreign keys and FULL synchronization, takes
pre-migration owner Snapshots under the same transaction and migrates on scratch.
transaction still uses synchronous immediate transactions and publishes only
on return. No callback awaits. record now writes the event's actual schema
version instead of hardcoded 1; the SQL placement and atomicity are unchanged.
historySync decodes both v1 and v2 variants through OpLogEntry.

validate retains the exact full Task before-value comparison and the separate
Task Version successor check. validateDependencies executes inside that writer
transaction. It adds endpoint, graph, status and dependent-Version constraints.
The one-Task/no-edge finite model cannot enable any graph transition. Its three
concrete event kinds and their literal expected outcomes therefore remain the
same 216 cases. New graph and multi-Task cases are proven by verify-dag and F's
separate DagAcyclic work; they are not added to AtomicCAS's claim.

appendSync still validates, records and applies before the same commit. It
resolves legacy Delete cleanup under the lock. A graph refusal carries captured
witnesses across rollback into recordRejection, which retains bounded details
and returns the full witness separately. The rejected transaction still cannot
change Task projections. Rejection crashes retain the model's documented gap.
The reviewed instrumentation now passes the envelope Profile into applyEvent;
all seven old crash boundaries retain their meanings.

changes and applyChanges add an independent edge delta. With empty dependencies,
Task, Series and Tag writes remain unchanged. putTask still writes the Task
payload and task_versions separately inside the transaction; the intermediate
crash boundary is unchanged. Edge-only Version updates avoid rewriting content
or Tag links and are outside this one-Task model. replay drops child edges
before Tasks, applies resolved facts, and accepts checkpoints without edges.
TakeSnapshot retains entity_version 1 and adds optional edges.

The TaskCreated, TaskDeleted, TaskMovedOut and TaskReverted schemas now accept
required v2 DependencyChanges, while legacy v1 remains accepted. The finite
model fixtures still use v1. AttachmentAdded, TaskEdited, Task, Version and
identity schemas remain the same. Coverage conservatively pins the new graph
validation and projection modules, even though graph actions remain excluded.

## Sensitivity and limits

The maintenance command removes the real Task before-value check, then skips
TaskEdited projection application. Both must fail behavioral enumeration before
typechecking or the source gate. It restores source bytes in finally and reruns
the complete command. No change was made to AtomicCAS, TLC bounds or model
negative controls. Source hashes advance only with this review and that proof.

AtomicCAS remains bounded single-Task safety, not a proof of grouped graph
operations, graph races, Revert, Move, Purge, Profile deletion, authorization,
transport or client behavior. The unit report records actual paths and exits.

The final pass also reviewed StartSeries's optional initial endpoint list,
which becomes TaskCreated v2 with no separate Version bump. AppendResult carries
the full captured DependencyError through authenticated ports; only the bounded
copy enters History. Neither changes the one-Task v1 fixtures. Purge now finds
Task content inside rejection witnesses as well as compact edge endpoint IDs.
Those paths are exercised by the compiled DAG cases, outside AtomicCAS's bounds.

Reviewed product commit: 96c0f3ea19dcab207d1d06a66d333a80d78c2f36.

## Seat-1 closure mapping

The closure adds optional Never dependencies fields to TaskCreated/Deleted/
MovedOut/Reverted v1. This makes v1-with-dependency payloads invalid at the same
Event schema used by the authoritative store and client decoders. Valid legacy
v1 events omit the field, so the 216 AtomicCAS fixtures and their compare-and-swap,
record/apply/commit and crash transitions remain unchanged. No store transaction
or projection function changed in this delta. Authenticated startSeries now
forwards all parsed Series facts except the credential and supplies actor/time
itself. Authentication handoff remains outside AtomicCAS; authenticatedInitial
in the compiled DAG drive covers it. Renew the event source pin only after
reviewing these changes and rerunning behavioral sensitivity and the clean check.

Closure reviewed product source: 50ef7c3dccd50d427bb8dfa2bfff8915c49b907e.

## Unit B N1/N2 mapping review

Reviewed the N1 diff from integration base 9f2ec0fb798dfbb7fa7cd1ccd666cbabbb1a7d89.
Only createProjection changes among covered production functions. It creates
exactly the same dependency tables, indexes and guards through dependencySchemaSql,
without executing a schema-version pragma. Migration 0007 still creates that
schema and advances to 7 inside the existing constructor migration transaction.
Legacy migration order and pre-migration Snapshot placement stay in migrate.
Task writes, before-value and Version checks, History publication, projection
application and seven crash boundaries are unchanged. Rebuild no longer changes
user_version as a side effect of recreating projections. The compiled migration
driver asserts preservation of version 1, the full legacy 0003 through 0007
schema and literal migrated Tasks. N2 changes verification only, observing actual
SQLite DELETE effects with a scratch audit trigger around Delete then Purge.
AtomicCAS retains its one-Task/no-edge bounds. Renew the projection pin only
with this review and fresh real-code sensitivity plus the clean one command.

## Unit B command error forwarding

Reviewed store.ts against algorithm checkpoint f140c7b09bcb1db48ce4ccaee797ecfe60019ce4.
Rejection optionally carries a captured DependencyError through the Move outer
transaction. recordRejection now returns that same full witness in AppendResult,
while its History copy retains the existing bounded RejectionDetails and Purge
redaction. The SQL transaction, before-value/Version checks, record/apply/commit,
replay, and all seven instrumentation boundaries stay in the same positions.
No graph guard is moved out of authoritative validation. The no-edge AtomicCAS
fixtures produce no witness and retain their literal results. Command handoff,
public edge Revert, fingerprints and graph batch operations remain outside this
single-Task model and are exercised by compiled verify-dag public commands.
Renew the store source pin only with this review, real-code sensitivity and the
clean full check. Do not infer a grouped graph proof from AtomicCAS.

## Unit B import and public schema review

Compared dependencies.ts with public checkpoint dc35c131. DependencyError now
has a shared schema identity and literal nonempty evidence constraints: cycle
paths have at least two ids, blocked/done-dependent lists have at least one
Task, counts are nonnegative and counted advice follows the approved exact text.
has_dependencies may carry an empty incident set after a confirmed preview
changes. These affect captured error decoding, not Task CAS or SQL boundaries.
No covered transaction, projection, Event, Task or Version implementation changed.
The one-Task/no-edge AtomicCAS fixtures produce no DependencyError and preserve
all 216 literal outcomes. Import resolves successful external-id mappings under
the existing writer transaction and rolls back each failed Task; its multi-Task
planning is outside this finite model and has separate compiled public proof.
Advance this schema pin only with fresh real-code sensitivity and clean check.

## Unit B combined review closure

Reviewed corrected source 3cceb41efc08b8cd835d5c883c3d370709865c3f against
e7170510a376b51eaf3525bb9933cb0dd588b233. Every covered production file is
byte-identical, including transaction, validate, appendSync, recordRejection,
projection/replay and Event/Version schemas. G11 changes graph-contract and
graph-queries only; CLI pure-input conversion remains outside these functions.
No source pin or finite model changes. Advancing confirmedCommit records this
identity review, not a stronger claim. Fresh real-code sensitivity removes the
Task before check and edit projection in turn, requires exit 1 for each, restores
bytes and requires exit 0. Final source runs the one command again. AtomicCAS
remains bounded single-Task/no-edge safety; graph response and CLI boundaries
have separate compiled public proofs, and final F remains coordinator-owned.

## Main cache/discovery composition, product97eb4002

The merged bodies were reviewed against both8ef210ff and cabf4866 before renewal.
putTask reads the existing Tag set and skips delete/reinsert only for an equal
set, while Task payload and Version writes retain their transaction order. The
DAG-specific dependency Version path still uses json_set without relinking Tags.
OperationStore adds memo initialization, close/Profile eviction, restore callback,
a read-only event cursor and clearAll before Purge redaction. None changes the
writer lock, before-value validation, History/Task/Version publication or crash
boundaries. Cache epoch effects are separate from the atomic database model.
Attachment report errors add authorized lookup details and exit pairs; stored
Attachment values are unchanged. Dependency refusal objects add exit2/meaning;
the stored-witness decoder supplies defaults only for older History. The graph
checks and Version ownership rules remain the same. No model invariant or bound
is changed by these report/cache additions.

Before publishing new hashes, candidate-byte-checked calibration ran both real
store breaks and observed the intended enumeration failures, then restored exact
bytes. The normal sensitivity helper then reproduced both failures and the
complete restored command exited0. Relative receipts:
docs/evidence/fv01/sensitivity-KdAFKt/result.json and
sensitivity-WnZxRk/result.json. These are actual current-source controls, not a
hash-only refresh. AtomicCAS remains one Task without Dependency edges; graph
and cache safety require their separate checks.

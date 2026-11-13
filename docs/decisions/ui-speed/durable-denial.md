# Durable refusal recording

The 2026-11-13 coordinator ruling chooses a database-only look-back without a
schema change. It supersedes the initial exact-membership implementation brief,
not the append-only rule. This is an implementation record; the proposed ADR
clarification remains subject to owner acceptance.

## Decision and limit

For an attempt at t, let m = floor(t / 60000) and horizon = (m - 1) * 60000.
Inside the rejection's existing immediate transaction, walk that Profile's rows
by descending seq. A matching rejected auth event in minute m suppresses the
append. The first usable recording-clock stamp before the horizon ends the
walk. A stamp after t, an invalid or absent stamp, or a row without a known
recording-clock provenance cannot end it. End of History means append.
Wrong passphrases always append because the lockout counts each one.

The decision uses History alone and is the same in separate CLI and server
processes. It deliberately is not exact membership under arbitrary timestamp
order. An older-than-horizon recording-clock row committed after a refusal
can hide it and permit another row. The preceding minute is included so a
writer crossing the current minute boundary does not hide that refusal.
The tests pin both results: 5,000 rows at 00:19:59.999 committed after a
00:20:00.001 refusal still yield one row; a later committed row stamped
00:18:59.999 permits a second row.

## Timestamp writer audit

This inventory covers every production event kind in events.ts. Privileged
OperationStore.append takes resolved facts, including their supplied event time;
it does not resample the clock. The normal command producers below supply the
operation's recording clock, not its scheduled/due/Occurrence time. Arbitrarily
backdated privileged inputs have the same documented ordering limit.

| Event kind | Production stamp writers and meaning | May end the walk? |
| --- | --- | --- |
| AuthChanged, AuthAttemptRejected | auth/auth.ts record receives perform's Effect Clock time, or the sign-in/reset/cleanup operation's sampled clock. Session expiry and lock deadlines are separate fields. | Yes. |
| ProfileDeleted, ProfileDeletionRejected | auth.profileDeletion samples Effect Clock; store.deleteProfileSync copies input.occurred_at to all Task Deletes and the Profile event. The second, applying admission samples again after the pre-change Snapshot. | Yes. |
| DatabaseRestored | store/snapshots.ts samples new Date at the restore boundary. Snapshot creation time is not copied into this event. | Yes. |
| ReminderFired | store/scheduled-work.ts samples Effect Clock at scheduler pass start. due_at is a separate receipt key, never the event stamp. | Yes. |
| TaskCreated | commands.create samples now. Recurring creation passes that same occurred_at through startSeriesSync/resolveOccurrence; its occurrence date/time only determines schedule/due fields. Copy creates a new operation with context.time. Migration 0002 instead copies legacy task.updated_at with actor migration:0002. | Yes, except migration:0002. |
| TaskEdited | commands edit/Series edit and batch edit use now/context.time. Imported source creation/update/due values do not replace the command event clock. | Yes. |
| TaskCompleted, TaskCancelled | commands transition and auth.finishTask use the sampled operation clock. finishTaskSync copies it into the resolved event and successor created_at/updated_at; recurrence expansion time is separate. Import close-missing calls transition. | Yes. |
| TaskReopened | commands transition uses now; scheduled-work samples the scheduler pass clock. The old snooze deadline is not the stamp. | Yes. |
| TaskDeleted, TaskPurged | commands lifecycle/delete uses now/context.time; Profile deletion uses its freshly sampled admission time for grouped Task Deletes. | Yes. |
| AttachmentAdded, AttachmentRemoved | attachment-commands.ts samples Effect Clock in single/multiple attachment commands. Labels also use those operations. | Yes. |
| TaskMovedOut, TaskMovedIn | commands transfer supplies context.time as the destination Task updated_at. store.move copies after.updated_at into both events. This is the current transfer clock, not the source Task's old updated_at. Inverse transfer uses the current Revert clock. | Yes. |
| TaskReverted | auth.revert supplies its sampled Clock; resolveRevertSync copies this occurredAt into the inverse event and new versions. Original task/Series scheduling/content is copied, but its historical event stamp is not. | Yes. |
| DependencyAdded, DependencyRemoved | dependency-commands.ts samples Effect Clock into generated_at. Import-dependencies receives the command's generated_at. commands batch dependency paths use context.time. store/dependency-validation.ts copies event.occurred_at into rejection witnesses, not into a separately timed operation. | Yes. |
| TaskAttemptRejected | OperationStore.recordRejection copies the attempted event's supplied occurred_at, with a wall-clock fallback only when that string exceeds the input length limit. Normal commands supply now/context.time, import-tasks.ts and attachment-commands.ts failure handlers sample new Date, and commands.rejectValidation samples now. The stored row cannot distinguish those from a backdated privileged attempted event. | No. |
| TaskHistoryRedacted | store/purge.ts preserves the original event.occurred_at while rewriting its content. It is not the Purge recording clock; original_kind may include a migration TaskCreated or a supplied rejection. Repeated redaction keeps that same value. | No. |
| Unknown kind, missing/unparsable stamp, future stamp | No established usable recording-clock evidence. JSON extraction does not decode the entire event. | No. |

Migration 0002 is the only production writer with actor migration:0002 and
explicitly historical TaskCreated stamps. Later migrations preserve History
payloads. Rebuild applies existing events without appending new timed rows.
Snapshot replacement restores stored History; DatabaseRestored marks the new
boundary. Restore therefore needs no in-memory refusal reset. Purge explicitly
preserves auth events. Profile deletion retains the old Profile id and History;
a reused name receives a different id and hence a different refusal key.

## Query and cost

The shared auth/rejection-history.ts query uses profile IS ? and ORDER BY seq
DESC. The existing op_log_profile_seq index supplies both Profile equality,
including NULL, and reverse seq traversal. It needs neither a sort nor a
temporary b-tree. Bun's statement iterator steps rows as needed. Returning from
the for-of loop closes it, so a usable old row or match stops SQLite stepping;
all() would unnecessarily materialize the entire Profile and is not used.

Work is proportional to rows actually visited before that match or usable old
row. Under ordinary ordering these are the Profile rows since the horizon plus
one boundary row. Unusable/future/backdated rows can increase the walk; an
entire History inside the window is necessarily visited on absence. There is
no constant row cap or absolute worst-case bound independent of History, and
no time threshold is treated as a throughput guarantee.

The old Set hit already ran within a dedicated BEGIN IMMEDIATE transaction.
The new lookup adds no transaction. A read-only positive fast path would need
its own Snapshot-restore linearization proof and an in-writer recheck on
absence. It is outside this unit.

## Verification

verify-auth's verify-durable.sh compiles or reuses the real CLI, server and
verify-durable-denial domain driver. The process matrix pins literal counts
[1, 1, 1, 1, 1, 1]. The compiled driver proves the two horizon orderings with an
IPC barrier, all key variations, wrong-passphrase lockout, Snapshot restore,
Profile deletion/name reuse and Purge. durable-denial.test.ts additionally
pins malformed/future stamps, exact horizon equality and skipped provenance.
Existing auth, CLI auth-History and HTTP test literals remain unchanged.

The initial index options and their measurements remain in the local run
report as considered and not taken. No migration, mutable counter/table,
History rewrite or HTTP contract change is part of this implementation.

# Durable refusal recording

The 2026-11-13 coordinator ruling chooses a database-only look-back without a
schema change. It supersedes the initial exact-membership implementation brief,
not the append-only rule. This is an implementation record; the proposed ADR
clarification remains subject to owner acceptance.

## Decision and limit

For an attempt at t, let m = floor(t / 60000) and horizon = (m - 1) * 60000.
Walk that Profile's rows by descending seq, in one pass: first in a read, and
on absence again inside the rejection's immediate transaction. A row whose
stored event is over 4,096 bytes is skipped unread (its length comes from the
record header). A matching rejected auth event in minute m suppresses the
append, whether its stamp is before or after t: two processes can read their
clocks in one order and commit in the other, and the later-clock refusal
committed first is still this minute's refusal. The first usable
recording-clock stamp before the horizon ends the walk. A stamp after t, an
invalid or absent stamp, a row without a known recording-clock provenance or a
row over the size bound cannot end it. End of History means append.
Wrong passphrases always append because the lockout counts each one.

The decision uses History alone and is the same in separate CLI and server
processes. It deliberately is not exact membership under arbitrary timestamp
order. A row of at most 4,096 bytes stamped before the start of the preceding
minute and committed after a refusal can hide it and permit another row. Two
writers produce one: a writer that commits more than a minute after reading
its clock, or a writer whose clock is behind another's (or steps back). The
review seat measured two stores whose clocks were 30, 90 and 150 s apart,
alternating ten refusals each: 1, 2 and 2 rows. The count stays bounded
because each process's own newest row matches first. A larger row never hides
a refusal: it is never read. The preceding minute is included so a writer
crossing the current minute boundary does not hide that refusal. The tests pin
these results: 5,000 rows at 00:19:59.999 committed after a 00:20:00.001
refusal still yield one row; a later committed small row stamped 00:18:59.999
permits a second row; a 100,000-byte row in the same place does not.

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

### Under the lock (the first form, measured)

Measured on 2026-11-13 with the compiled driver's bench mode, five pairs in
alternating order, base 2a840b55 against the look-back decided only inside the
recording transaction, load 5 to 11 on ten cores. Each refusal opens two write
transactions: the failed credential check's own (median 0.008 to 0.036 ms in
every case, as on the base) and the recording one. Medians: the first refusal
costs about the same as the base when its Profile is quiet (3.9 ms against 4.4)
or for the null Profile; 6.3 ms against 2.0 after 5,000 small prior-minute rows;
11.2 ms against 2.1 after 5,000 real TaskCreated rows; 145 ms against 4.0 when
all 200,000 rows lie inside the window. A burst of 1,000 repeats whose match is
the newest row costs what the base costs (34 ms against 35). When 5,000 rows are
committed after the first refusal, every repeat reads them again under the
lock: the burst takes 3.7 s (small rows) and 7.7 s (TaskCreated rows) against
0.03 s, and each recording transaction holds the write lock 3.4 ms and 7.2 ms
at the median, 20 and 19 ms at p99, 68 and 182 ms at most. A client retrying a
refused credential in the two minutes after an import could keep the lock busy
for most of that time. Pushing the walk into SQLite does not help, because
reading each row's event JSON is most of the cost.

### Read first (ruling 2026-11-13)

Authentication.perform now decides a repeat first in a read: the same
repeatedAuthRejection walk, outside any transaction, as one SELECT and so one
WAL read snapshot that is released when the walk returns. A match appends
nothing and opens no recording transaction. Absence takes BEGIN IMMEDIATE, and
record() decides again inside it with the same function; nothing is carried
from the read to the locked decision. A caller already inside a transaction
keeps the locked path. Wrong passphrases never reach this path: they are
recorded inside the sign-in queue's own transaction, and the read is also
skipped for that detail. The failed credential check keeps its own transaction,
exactly as on the base, so a repeat still takes the write lock once, for
microseconds, but never for its walk.

A Snapshot restore that lands between a matching read and the refusal's return
leaves one outcome. The refusal linearizes at its read snapshot, where the
match existed, so it is merged; the restore then replaces History, which holds
no refusal in that minute if the Snapshot predates the first one. That is the
same History as a merged repeat committing just before the restore under the
locked form. The next identical refusal finds nothing and is recorded. Purge
never removes auth rows, and Profile deletion keeps the Profile id and its
History, so neither changes a read decision. Two processes whose reads both
miss serialize on BEGIN IMMEDIATE; the second re-walks inside the lock, finds
the first one's row and appends nothing: one row.

Measured the same way (five rounds, three arms in rotating order on one cloned
fixture per scenario, load 5.3 to 6.4; table in the unit's local evidence).
Across quiet, null, whole-window, import-before, import-after and prior-after,
0 of 5,000 repeats per arm opened a recording transaction, so the recording
hold is 0; the locked form opened one for every repeat (median 5.70 ms, max
9.90 after a 5,000-Task import committed after the first refusal). A repeat's
only write transaction is the failed check's own, median 0.007 to 0.017 ms in
every arm. Repeat wall time does not change: 5.67 ms against 5.75 after that
import (base 0.019), 2.71 against 2.75 after 5,000 small rows; a burst of 1,000
takes 5.7 s and 2.7 s, against 0.02 s on the base. The first refusal walks twice
on absence: after a 5,000-Task import committed before it, 18.3 ms against 10.1
locked and 3.0 base, of which 10.0 ms under the lock; with 200,000 rows inside
the window, 274 ms against 132 and 3.0, 131 ms under the lock. The CLI-shaped
case (a new store per refusal) is dominated by opening the store (240 to 370 ms
in every arm); its refusal then costs 6.2 ms after the import without the lock,
and leaves one row for 20 fresh stores where the base leaves 21.

On the server's single thread a repeat still costs its walk: after 5,000
Tasks imported after the first refusal, 5.7 ms per repeat (p99 7.2), for every
repeat until the minute ends, while no other request on that server runs.

### Size bound (review seat F1)

The review seat found that the walk's cost followed the bytes it parsed: each
row's whole event went through json_extract. After one import of 1,000 Tasks
with 100,000-character descriptions (within the HttpApi limits) a repeat cost
57 to 67 ms on the server's thread and a first refusal 139 to 151 ms, about
70 ms under the write lock; after 5,000 Tasks with 200-character descriptions,
7.9 ms and 19.3 ms.

The walk now reads octet_length(event) and nothing else of a row whose stored
event is over 4,096 bytes. In the SQLite the compiled CLI, server and drivers
load (/usr/lib/libsqlite3.dylib, 3.51.0, source f0ca7bba…, the same library
UUID in all three under dyld's trace), octet_length() of a TEXT value is
answered from the record header: with every overflow page of 20 large rows
zeroed, octet_length() and the production walk still answer while length(event)
and any column stored after event fail as malformed. outcome and reason are
stored after event, so they are read only inside the same gate. The query plan
is unchanged: SEARCH op_log USING INDEX op_log_profile_seq (profile=?).

A refusal is a fixed shape of bounded literals and an instant, at most about
160 bytes, so the bound never skips one. Skipping a large row as evidence lets
the walk go further, never end early. A Profile whose History is mostly large
rows is walked further on absence, at about half a microsecond per skipped row.

Measured with the same method (one cloned fixture per scenario, three arms in
rotating order: base 2a840b55, the unbounded read-first walk 65ee6900, the
bounded walk 8061ae00; five rounds, three for the 100,000-character cases;
load 3.6 to 5.0). Medians, unbounded against bounded:
- 1,000 Tasks with 100,000-character descriptions after the first refusal:
  repeat 46.5 ms (p99 65.9) against 0.34 ms (p99 0.44); burst of 1,000 47 s
  against 0.35 s (base 0.02 s).
- The same import before the first refusal: first refusal 96.4 ms, 50.2 under
  the lock, against 4.4 ms, 2.7 under the lock (base 3.8).
- 5,000 Tasks with 200-character descriptions after the first refusal: repeat
  5.6 ms against 6.6 ms; before it, first refusal 17.0 against 18.1 ms, 9.9
  against 10.2 under the lock. These rows are under the bound and still read.
- 5,000 title-only Tasks after the first refusal: repeat 5.3 against 6.2 ms.
- Every repeat in every arm except base opened no recording transaction.
The gate costs about 15 to 20 percent on rows under the bound, from
evaluating octet_length() once per gated column. The quiet, null and whole-window fixtures of that run were seeded with 5,000
extra title-only Tasks by a driver bug (fixed in 208dccc8) and were measured
again (five rounds, load 2.2 to 6.1). First refusal, base / unbounded /
bounded: quiet 3.1 / 3.7 / 5.1 ms; null Profile 4.0 / 4.3 / 4.0 ms; 200,000
rows inside the window 4.4 / 214 / 278 ms, of which 110 and 141 ms under the
lock. Repeats cost 0.011 to 0.019 ms in every arm, and no repeat opened a
recording transaction outside the base.

### Considered and not taken: a remembered position

A process could remember, per actor, Profile, action, detail and minute, the
matching refusal's seq. Checking only that row is wrong: in the stated limit
case the walk stops at an older-than-horizon row committed after the match and
appends, while a process holding the position would merge, so a server and a
fresh CLI would leave different History. The exact form also remembers the
Profile's newest row at the last walk, with both rows' exact event bytes. A
repeat, in one read transaction, looks both up by seq, requires byte identity,
and walks only rows newer than that boundary: a match or reaching the boundary
means found, a terminator means append, any mismatch falls back to the full
walk. Rows below the boundary are append-only History. Purge only redacts Task
events to a kind that never ends the walk, and a changed boundary row forces
the full walk. A restore appends DatabaseRestored with a fresh random
generation, so a restored boundary row is never byte-identical. Derived cost:
two primary-key lookups plus the rows committed since the last walk, tens of
microseconds in a burst; a new process pays the full walk. It saves CPU on the
server's thread only for a tight retry loop after a bulk import, and needs that
exactness argument accepted line by line. Filed as a follow-up.

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

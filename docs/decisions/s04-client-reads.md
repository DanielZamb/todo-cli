# S04 client reads and quick-add

The order-14 search covered effect-port, track/core, track/server and track/clients.
No existing quick-add parser or client read module existed. New production domain
paths are `packages/domain/src/client-reads.ts` and `packages/domain/src/quick-add.ts`.
The track coordinator received both paths before implementation.

`ClientReads` owns counts, planning views and Task History selection. It uses
C05's `taskView` and `filterTasks` for existing date comparisons. Adapter handlers
only obtain credentials, pass validated requests and translate errors. S01's
Profile-scoped metadata resolution is preserved. No task-command logic is added.

The coordinator's Inbox ruling uses CONTEXT everywhere: an open Task with neither
due nor scheduled date. `isInboxTask` is the single exported predicate at
`@todo/domain`, used for the view and Profile inbox_task_count. C05 presentation.ts
and commands.ts are unchanged; X01/core adopts this predicate there separately.
Open counts exclude deleted Tasks and statuses other than open. Metadata with no
open Tasks remains listed with a zero count. Profile discovery authenticates once
and filters by credential Profile access before computing counts.

Today returns Overdue, Due today and Scheduled today groups. Groups can overlap.
Day boundaries retain C05 UTC comparisons. Scheduled lists all open Tasks with a
scheduled value, including past and future values. Explicit optional now supports
reproducible view reads; otherwise the domain reads Effect Clock.

History selects changes and rejected attempts concerning the requested Task from
the authenticated Profile's History, ordered by sequence. It includes successor
Occurrences and Revert changes. A Task ID with no History in the requested
Profile returns an empty array. Delete and Purge preserve the existing History,
including TaskCreated, TaskDeleted and TaskPurged after the Task is gone.
ReminderFired is included for its Task. Auth attempts cannot identify a Task
and are excluded.

Quick-add is a pure Effect library API with a small grammar, explicit now and IANA
time_zone. Bare dates mean due; due: and scheduled: select a destination. Dates,
weekdays, today, tomorrow and following 12-hour wall times resolve using the given
zone. A weekday means the next such day, seven days ahead when matching today.
Unknown words stay in the title. Quoted tokens stay literal. Tags normalize to
lowercase, deduplicate and sort; priority defaults P3. Repeated priority, Project
or date for one destination fails. Invalid, ambiguous or nonexistent wall times
fail instead of shifting. Parsing creates no Tasks or metadata definitions.

S03 track/server 24560b4 is integrated, preserving scheduler/lifecycle and the SSE
OperationEvent contentSchema including ReminderFired. The combined generated
OpenAPI exceeds Biome's default 1 MiB limit; its file limit is now 2 MiB so the
normal generation and lint commands still process the complete contract.

S02 idle connection fix dc64c5c is integrated unchanged. Its Bun HTTP idleTimeout=0
and scheduler wiring remain in serverLayer. isInboxTask accepts both TaskTime|null
fields and C05 TaskView's optional string fields, so X01 can reuse one predicate.

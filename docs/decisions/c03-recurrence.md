# C03 recurrence decisions

The required spike had a one-hour limit. It started at 2026-10-27 05:21 UTC
and finished at 05:22 UTC. No implementation preceded the comparison.

Choose `rrule-temporal@2.2.8` with an explicit `temporal-polyfill@1.0.1`
implementation. The npm search found one Temporal-based RFC 5545 library.
Compare it with the established Date-based `rrule@2.8.1` as a baseline rather
than claiming two Temporal libraries exist. The attempted package
`temporal-recurrence` returned npm E404.

Primary sources are the [rrule-temporal repository](https://github.com/ggaabe/rrule-temporal)
and [rrule repository](https://github.com/jkbrzt/rrule). Installed package types
and READMEs supply the API contracts. The rerunnable comparison is
`packages/domain/scripts/spike-recurrence.ts`. Run it with Bun under `TZ=UTC`
and `TZ=Asia/Tokyo`. The results are in `docs/evidence/c03/spike/`.

Both libraries passed timed DTSTART/TZID, BYSETPOS, COUNT, UNTIL, EXDATE and
spring DST under UTC. The Temporal implementation also passed date-only
DTSTART and every case under Asia/Tokyo. The baseline ignored date-only
DTSTART, falling back to the current time. Under Asia/Tokyo it shifted the
zoned results by nine hours. Its failures remain visible as `baselineMatches`
in the JSON. No performance claim is made.

Use the library's strict RFC mode and explicit iteration/candidate limits.
Persist the structured recurrence definition, and serialize DTSTART and EXDATE
into a single ICS snippet to avoid the documented option-merging ambiguity.
Reject embedded properties in RRULE, mismatched EXDATE value kinds, fractional
recurrence seconds and time selectors on date rules. UTC instants outside a
recurrence continue to support fractional seconds. Exceeding an expansion limit
fails explicitly instead of silently ending a Series.

The domain library is this ticket's public API. `startSeries` creates the first
Occurrence and Series atomically. `finishTask` completes or cancels a task and
creates at most one next Occurrence in that same SQLite transaction. Resolve
from the Occurrence's original scheduled time rather than the completion clock.
Persist that time in new Occurrence origins, so editing a task's scheduling
cannot move its recurrence cursor. Legacy origins use their date with the
Series DTSTART time. A finished Occurrence cannot advance again. Reopening
and finishing an earlier Occurrence must not duplicate an existing successor.

Series task metadata supplies each new task. Shift scheduled and due values
by the local calendar difference from DTSTART, preserving their own zones.
If neither exists, use the recurrence time as scheduled_at. Dates remain dates.
Deleted Series stop advancement. COUNT and UNTIL exhaustion produce no task.
Resolved tasks, IDs, dates and instants live in completion/cancellation events.
Replay applies these facts without importing the recurrence engine or clock.

Use only scratch databases. Do not change migration 0002 or the real database.
Correctness review dispatch belongs to the parent.

RFC 5545 resolves an ambiguous local DTSTART to the first instant in the
fall overlap. Reject a structured DTSTART selecting the second instant rather
than silently changing its UTC value. Serialize instant EXDATE values as UTC,
so an exclusion of the second instant does not accidentally exclude the first.

The C04 worktree uses synchronous ports inside its authenticated transaction.
C03 therefore exposes StartSeries and FinishTask input schemas and keeps
synchronous store handlers for constructor callbacks. Integration can add both
callbacks to C04's existing ports without another connection or precomputed
client events. Nested transactions restore the previous write-guard state.

## Review corrections

C03 review found that the supported library accepts parts in any order and
silently accepts repeated keys. Validate unique part names before calling it,
accept FREQ in any position, and normalize case. Date-only metadata shifts by
calendar-date difference even when the elapsed wall time is less than one day.

Do not rewrite migration 0002 to repair already migrated files. Resolve its
durable `legacy-series:<task-id>` relationship when the original task has no
Occurrence. A frozen v2 fixture proves this path independently of current
migrations. Resolve the next cursor from that Series DTSTART. For new Series,
load Project and Tag definitions from the same Profile in the write transaction.
Ignore deleted successors when preventing duplicate advancement after Revert.

The raw command boundary accepts unknown JSON input. Validate identity and time
first, then turn command schema failures into rejected task History. Auth keeps
its existing credential-safe request parsing and rejected auth History.

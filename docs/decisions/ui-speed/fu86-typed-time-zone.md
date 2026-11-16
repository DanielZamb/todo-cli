# Typed times keep the zone they were typed in (follow-up 86), and the weekly review's groups (follow-up 88)

2026-11-16, Claude Opus 5.5 (INTEG-STEP2), on `fix/cli-typed-time-zone` from
`feat/cli-due-zone` 6d0407c6. Not merged. Both ride into the next candidate.

**For the owner, in two lines.** A time you or an agent type for `--due` or
`--scheduled` now means that time where your Mac is (21:00 is 21:00 in
Bogotá, not 16:00) and is saved with your zone; a time typed with an offset
or `Z` keeps its exact moment. Times already saved are not changed, and a
local time that a daylight-saving change skips or repeats is refused: add the
offset you mean.

## Follow-up 86: the rule

ADR-0006 stores an instant in UTC together with the IANA zone the person
meant. `parseTime` read `YYYY-MM-DD HH[:MM]` as UTC and stored every instant
with the zone `UTC`. As ruled:

| Typed | Before | Now |
| --- | --- | --- |
| A local time, `2026-11-16 21:00` (also `11/16/2026 21:00`) | that wall time in UTC, zone UTC | that wall time in the typing machine's zone, stored with that zone |
| With an offset or `Z`, `2026-11-16T21:00:00-05:00` | its instant, zone UTC | its instant, stored with the typing machine's zone (never a zone made up from the offset) |
| A date, `2026-11-16` | a calendar date | unchanged |
| RFC 9557 text, `2026-11-16T21:00:00-05:00[America/Bogota]` | refused | its instant, stored with the bracketed zone (what the CLI now sends; see below) |

Stored Tasks are not touched. No migration.

## Where "the machine where it was typed" is known

- **The CLI process resolves the zone.** `taskInput` (`apps/cli/src/main.ts`),
  which builds the flags for `add` and `edit`, turns a typed `--due` or
  `--scheduled` into RFC 9557 text in the machine's zone
  (`resolveTypedTime(text, processTimeZone())`: `TZ` when set, the system zone
  otherwise). A date, an empty value or text the parser refuses is passed on
  unchanged, so it is refused again where it is applied, with the same error.
- **Whoever parses keeps that zone.** `prepareFlags` calls
  `parseTime(text, processTimeZone())`. In the direct path that process is the
  CLI. In a routed add (`/local/commands`, the server runs `createTask`) the
  flags already carry `[zone]`, so the server keeps the CLI's zone; only text
  that no CLI resolved (another client of `/local/commands`) would fall back
  to the server's own zone, which today is the same machine.
- **Why bracketed text and not a new field.** The routed command's `flags`
  object is part of the published OpenAPI document; a `time_zone` field would
  move the contract and the Swift client. `flags.due` stays a string, so the
  contract (4c932cfc) does not change. RFC 9557 is the standard form for an
  instant with its zone, and an agent may type it directly to name a zone.
- **Injectable for tests.** `parseTime(text, zone)` and
  `resolveTypedTime(text, zone)` take the zone; the CLI's is set by `TZ`.
  Parsing a typed time needs no clock (no relative words; quick-add, which
  has them, already takes `now` and `time_zone`).

## Every caller, after the change

| Caller | Rule after the change |
| --- | --- |
| `todo add --due/--scheduled` | the new rule, resolved by the CLI |
| `todo edit --due/--scheduled` | the same |
| A routed add (`/local/commands`) | the CLI's resolved text; the server keeps its bracketed zone |
| Quick-add (`todo add --parse`, `todo parse`) | unchanged: already the machine's zone and `now`, and it already refuses a skipped or repeated local time |
| Series (`--recurrence` JSON) | unchanged: JSON times with their zone, not typed text |
| `todo import` (JSON rows) | unchanged: JSON times, never `parseTime` (paired run below) |
| HTTP bodies | unchanged: JSON times, never `parseTime` |
| Reminders and snooze | no typed path in the CLI: reminders fire from the stored instant; snooze is an HTTP JSON instant |
| List filters `--due`, `--scheduled`, `--today`, `--overdue` | unchanged: calendar days in each Task's stored zone |
| `todo catalog --now/--time-zone` | unchanged: an instant and a zone name |

## Daylight saving

Both a local time that does not exist (02:30 on 8 March 2026 in New York)
and one that exists twice (01:30 on 1 November 2026) are **refused** with
`invalid_args`, naming the time and zone and showing the offset form, the
same as quick-add's `disambiguation: "reject"`. A guess would store a moment
the person may not have meant; the offset form says which, and is accepted
(`2026-11-01T01:30:00-04:00` and `-05:00` are 05:30Z and 06:30Z).

## Proof (logic passes; nothing used for real)

- `packages/domain/test/typed-time.test.ts`: local times in Bogotá, New
  York, Tokyo and UTC; offsets and `Z` in three zones; the New York gap and
  overlap, refused, and their offset forms; bracketed text in another
  process's zone, a mismatched offset and an unknown zone; dates, empty and
  malformed text; `resolveTypedTime` and its round trip. Five of six fail on
  the parent (the dates and malformed text behave the same by design).
- `apps/cli/test/typed-zone.test.ts`, compiled CLI, machine zone by `TZ`:
  for each of Bogotá, New York, Tokyo and UTC, the local, offset and `Z`
  forms read back through the Catalog at a fixed `now` (stored `utc` and
  `time_zone`), the `due:` label and the Today group. Bogotá: all three
  stored with Bogotá, 02:00Z, 02:00Z and 21:00Z, labelled 2026-11-16, all due
  today at 20:00 local. Tokyo: 12:00Z on the 16th, and 02:00Z and 21:00Z
  labelled the 17th; only the local one due today at 23:00 local. Also
  `edit`, and the two refusals. Four of five fail on the parent; the UTC
  machine stores the same either way.
- **S1-16** (same file): Los Angeles, UTC−8, so 18:00 and 23:30 on the 16th
  are already the 17th in UTC. Typed as local times and with their offsets,
  all four are stored with Los Angeles' zone and are in Due today at 19:00
  local. On the parent the offset forms are stored with the zone UTC on the
  17th and missing from Today, a day late, and the local forms are stored
  eight hours early.
- **JSON input byte-identical**, paired: the parent's CLI and this branch's
  import the same NDJSON (a Tokyo instant, a UTC instant, a Bogotá scheduled
  instant, a date) into fresh databases with the machine in Bogotá: the
  replies (ids and clock masked) and every stored `due_at` and `scheduled_at`
  are identical.

## Follow-up 88: every Task due this week in exactly one review group

`renderReview`'s weekly Overdue had moved to the calendar day for a date-only
due date, but its Scheduled still compared `Date.parse(due_at)` with `now`:
for a date-only value that is UTC midnight, before `now` all day, so a Task
due today was in no group, and one due on the seventh day was listed.

**The rule now**, one week shared with `export --scope weekly`
(`lastDayOfWeek`, planning-day.ts): today and the six calendar days after it,
in the reader's zone, each due date dated in its stored zone.
- Overdue: a due day before today (weekly and daily).
- Weekly Scheduled: due from today through the sixth day after it. A
  date-only Task due in exactly seven days is **outside** the week: today
  plus six days is seven calendar days, as the old instant window covered
  seven times 24 hours.
- Daily Scheduled: due or scheduled today, unless Overdue. Overdue wins, as
  the Today view puts each Task in one group, so a Task overdue and
  scheduled today is no longer listed twice.
- **A timed Task due earlier today is Scheduled (due today), not Overdue,**
  in both reviews, as the Today view's "Due today". This departs from "a
  timed due date keeps its instant comparison for Overdue" for that one case:
  on every earlier day the instant and the day agree; only within today they
  differ, and keeping the instant there would make the weekly review
  disagree with the daily review and the Today view. If you want the
  instant kept there, it is a one-line change. A timed Task due later today
  is Scheduled either way.

**The property, tested** (`packages/domain/test/review-groups.test.ts`): for
every open Task due in the past or within the window (weekly: through the
sixth day; daily: through today), exactly one of Overdue and Scheduled holds,
and a Task due after the window is in neither. 624 cases: weekly and daily,
date-only and timed (00:30, 12:00, 23:30 in the Task's zone), due from three
days before to nine after, a reader at 00:00, 12:00 and 23:59 local, in
Bogotá and Tokyo. On e01c1554, 31 cases fail. The daily window is today
because the daily review is the Today review; a Task due in three days is in
neither of its groups by design.

**Literal, red on e01c1554:** the review's example (now
2026-11-16T12:00:00Z, an open Task with a Project due 2026-11-16): Scheduled
now, in no group before; due in seven days: outside now, Scheduled before.
Also the timed earlier-today case and the daily double listing.

**Why the earlier checks missed it.** The 28-case fixture of the routing
unit and my paired runs compared two builds of lines that both carried the
defect: it came in with the Catalog line's day rule (Q8/Q9), so every pair
agreed. My Markdown pairing checked that only `due:` labels changed, not
which group a Task is in, and no fixture had an open date-only Task due
today with a Project, read in the weekly Markdown. **The case that would have
caught it:** `apps/cli/test/review-week.test.ts`, the compiled CLI's weekly
review on the real clock in Bogotá with Tasks due yesterday, today and in
seven days. It fails on e01c1554 at any hour.

**Its neighbours.** Every other day comparison the joined line changed is by
calendar day on both sides: the Today rule and the Catalog's counts
(`planningMembership`), the daily review, the list filters (`filterTasks`,
task-filters.ts). `export --scope weekly` had the same instant-against-midnight
comparison (it predates the joined line) and now uses the same week, past due
dates included as before. Electron's overdue row styling compares a timed
Task's instant with now and a date by local day: no midnight mixing, and
unchanged by the joined line.

## For Q14 (stored UTC-zoned instants)

This change stops the CLI from creating new UTC-zoned instants, so after it a
stored `time_zone: "UTC"` means: typed into the CLI before this fix, a
machine genuinely set to UTC, or a client that sent UTC.
- **A repair once** gets easier to select (the UTC-zoned rows are the
  suspects, and the set stops growing) but no easier to decide: a row typed
  as a local time is the wrong instant by the machine's offset, while a row
  typed with an offset is the right instant with the wrong zone, and History
  records the stored time, not the text that was typed, so the database alone
  cannot tell the two apart. A reviewed command would need the owner's
  machine zone and a rule (or the owner's word) for each kind.
- **The server dating UTC times by its own zone** becomes safer: no new data
  reaches that rule except genuinely UTC times, which it would move by the
  offset.
- **Leaving them** affects only rows typed before this fix.

## Gates, mappings

On c31d9ead, under the reference profile after its five controls, each with
the 1-minute load at start and end: verify-cli 0 (3.3 → 3.4), verify-filters
0 (3.4 → 5.3), verify-quick-add 0 (5.3 → 5.3), verify-recurrence 0
(5.3 → 5.3), verify-import 0 (5.3 → 4.6), verify-server-api 0 (4.6 → 4.7),
the root check 0 (4.7 → 5.2: domain 642, server 203, CLI 108, Electron 168
plus 1 skipped).

No function in `verify-occ-atomicity/coverage.json` changes; that mapping
covers none of the files touched (`commands.ts`, `presentation.ts`,
`planning-day.ts`, `main.ts`). Every mapped declaration in them is
byte-identical to 6d0407c6 (declaration text compared); the declarations
that changed (`parseTime`, `prepareFlags`, `exportScope`, `renderReview`,
`taskInput`) are in no mapping. Renewals, each a candidate until a seat
accepts it:
- Task search formal: `presentation.ts` and `commands.ts` rows; before
  renewal the check passed every model stage and stopped only at the
  mapping; after, it passes (check-ylNIcR).
- Task search cache: `commands.ts` and the `main.ts` hygiene row; before,
  `check.mjs` ran its controls and stopped only at `commands.ts`, and the
  hygiene check passed; after, `check.mjs` (generated-8Dz1Iu),
  `check-hygiene.mjs` (hygiene-pDitUT), the uncached baseline and the full
  `verify.mjs` (verify-mEYEoF) pass.
- Dependency: the public rows of `commands.ts`, `presentation.ts` and
  `main.ts`, and both pins, at bc50a565 (the product 2b42e3f7 plus the two
  renewals above); full default CONFORMANCE CHECKPOINT PASS (check-h2GFNF),
  36 production controls broken 1 and restored 0, byte-identical
  (conformance-t3ybvT), 53 public mutants exit 1 and restore 0
  (public-lYjLuY). Renewed in c31d9ead.

Premise at c31d9ead: nothing in either pin's scopes differs from bc50a565.
Pin audit at c31d9ead: **filesScanned 535, occurrences 915, match 138,
drift 0, unknown 0**.

| Commit | What |
| --- | --- |
| 4d5c7e8b | Follow-up 86: typed times stored with the typing machine's zone, and their tests. |
| 5b0379a3 | S1-16's case in the CLI test. |
| 2b42e3f7 | Follow-up 88: one week for the reviews and the weekly export, and its tests. **The product.** |
| bc50a565 | Task search and cache renewals. **The Dependency pin.** |
| c31d9ead | Dependency renewal. |
| (this commit) | This report. |

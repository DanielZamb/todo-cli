# Typed times keep the zone they were typed in (follow-up 86), and the weekly review's groups (follow-up 88)

2026-11-16, Claude Opus 5.5 (INTEG-STEP2), on `fix/cli-typed-time-zone` from
`feat/cli-due-zone` 6d0407c6. Not merged. Both ride into the next candidate.

**For the owner, in two lines.** A time you or an agent type for `--due` or
`--scheduled` now means that time where your Mac is (21:00 is 21:00 in
Bogotá, not 16:00) and is saved with your zone; a time typed with an offset
or `Z` keeps its exact moment. Times already saved are not changed, and a
local time that a daylight-saving change skips or repeats is refused: add the
offset you mean. The message gives the exact values that exist, with their
offsets, ready to paste.

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

- **The CLI process resolves the zone, and refuses there.** `add` and `edit`
  (`apps/cli/src/main.ts`) resolve a typed `--due` or `--scheduled` in one
  Effect step (`resolvedTimes`, calling `resolveTaskFlagTimes`) into RFC 9557
  text in the machine's zone (`resolveTypedTime(text, processTimeZone())`:
  `TZ` when set, the system zone otherwise). Only a date or an empty value is
  passed on as typed. Anything the parser refuses (malformed text, an unknown
  zone, a 60th second, a local time a daylight-saving change skips or
  repeats) is refused in the CLI process with `invalid_args` (exit 2), before
  any write or routing.
- **Correction (server seat F1).** The first version of this report said text
  the parser refuses "is passed on unchanged, so it is refused again where it
  is applied, with the same error". That was false: a time that does not
  exist in the CLI's zone can exist in another, so a routed add from a CLI in
  New York with `2027-03-14 02:30` was stored by a server in Bogotá at 02:30
  Bogotá time. Shown on 8434a7e1 and fixed in 98deaaac (below).
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

A local time that does not exist and one that exists twice are **refused**
with `invalid_args`, the same as quick-add's `disambiguation: "reject"`: a
guess would store a moment the person may not have meant. The message names
the time, the zone and the day, and gives complete values with the zone's own
offsets at that wall time (server seat F2; the first version always said
`-05:00`):

- Skipped, New York: `2027-03-14 02:30 does not exist in America/New_York: a
  daylight-saving change skips it on 2027-03-14. The nearest times that exist
  are 2027-03-14T01:59:00-05:00 and 2027-03-14T03:00:00-04:00.`
- Repeated, New York: `2026-11-01 01:30 occurs twice in America/New_York: a
  daylight-saving change repeats it on 2026-11-01. Type the one you mean:
  2026-11-01T01:30:00-04:00 (the first) or 2026-11-01T01:30:00-05:00 (the
  second).`
- Berlin, the same shape: skipped 2027-03-28 02:30, nearest
  `2027-03-28T01:59:00+01:00` and `2027-03-28T03:00:00+02:00`; repeated
  2026-10-25 02:30, `2026-10-25T02:30:00+02:00` or `+01:00`.

Each suggested value, pasted, is accepted at the instant it names (New York
06:59Z, 07:00Z, 05:30Z, 06:30Z; Berlin 00:59Z, 01:00Z, 00:30Z, 01:30Z),
stored with the typing machine's zone. Also from the seat: a 60th second is
refused in the bracketed form as in the offset form, and a refused value is
echoed in the message to at most 64 characters (then `…`).

## Proof (logic passes; nothing used for real)

- **Server seat F1**, `apps/cli/test/typed-zone-routed.test.ts`: a compiled
  CLI, routing companion and server; the server runs in Bogotá, the CLI side
  resolves in New York and routes only what resolved through the real
  `/local/commands` path. The seat's skipped and repeated New York times are
  refused `[2, "invalid_args", <the messages above>]` and the server's Tasks
  and History counts are unchanged; the direct write in New York refuses them
  with the same exit and message and writes nothing; control: a valid
  `2026-11-16 21:00` routed is stored by the Bogotá server as 02:00Z with
  New York's zone. On 8434a7e1 two of three fail: the routed add is stored
  by the server, and the direct write's message is the old one (it did
  refuse).
- **Server seat F2**, `packages/domain/test/typed-time.test.ts` (now eight
  tests): the New York and Berlin messages literally, every suggestion
  accepted, the 60th second in both forms, the echo, `resolveTypedTime`
  refusing instead of passing text on. On 8434a7e1 three of eight fail (the
  pasted suggestions were already accepted, and the five earlier tests pass).

- `packages/domain/test/typed-time.test.ts`: local times in Bogotá, New
  York, Tokyo and UTC; offsets and `Z` in three zones; the New York gap and
  overlap, refused, and their offset forms; bracketed text in another
  process's zone, a mismatched offset and an unknown zone; dates, empty and
  malformed text; `resolveTypedTime` and its round trip. Five of the first six
  failed on 6d0407c6 (the dates and malformed text behave the same by
  design).
- `apps/cli/test/typed-zone.test.ts`, compiled CLI, machine zone by `TZ`:
  for each of Bogotá, New York, Tokyo and UTC, the local, offset and `Z`
  forms read back through the Catalog at a fixed `now` (stored `utc` and
  `time_zone`), the `due:` label and the Today group. Bogotá: all three
  stored with Bogotá, 02:00Z, 02:00Z and 21:00Z, labelled 2026-11-16, all due
  today at 20:00 local. Tokyo: 12:00Z on the 16th, and 02:00Z and 21:00Z
  labelled the 17th; only the local one due today at 23:00 local. Also
  `edit`, and the two refusals (their messages now the F2 wording). Four of
  five failed on 6d0407c6; the UTC
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

On 2a29d933 (the product 98deaaac plus its renewals), under the reference
profile after its five controls, each with the 1-minute load at start and
end: verify-cli 0 (5.7 → 4.8), verify-filters 0 (4.8 → 4.3),
verify-quick-add 0 (4.3 → 4.3), verify-recurrence 0 (4.3 → 4.1),
verify-import 0 (4.1 → 4.0), verify-server-api 0 (4.0 → 4.4), the root check
0 (4.4 → 5.9: domain 644, server 203, CLI 111, Electron 168 plus 1 skipped).
The first version's gates passed on c31d9ead.

No function in `verify-occ-atomicity/coverage.json` changes; that mapping
covers none of the files touched (`commands.ts`, `presentation.ts`,
`planning-day.ts`, `main.ts`). Every mapped declaration in them is
byte-identical to 6d0407c6 and, for the F1 and F2 fixes, to 8434a7e1
(declaration text compared). The declarations that changed (`parseTime`,
`resolveTypedTime`, the new `resolveTaskFlagTimes`, `prepareFlags`,
`exportScope`, `renderReview`, `taskInput`, the new `resolvedTimes`, `add`,
and the edit line of `mutation`, its deletion `Prompt.Confirm` untouched) are
in no mapping. Renewals, each a candidate until a seat accepts it:
- Task search formal: the `commands.ts` row (and `presentation.ts` in the
  first round); before renewal the check stopped only at the mapping; after,
  it passes (check-SUm2e5; first round check-ylNIcR).
- Task search cache: `commands.ts` and the `main.ts` hygiene row; before,
  `check.mjs` ran its controls and stopped only at `commands.ts`, and the
  hygiene check passed; after, `check.mjs` (generated-3vhBei),
  `check-hygiene.mjs` (hygiene-LHfJCd), the uncached baseline and the full
  `verify.mjs` (verify-OgGwX3) pass. Committed in 7fb9e005.
- Dependency: the public rows of `commands.ts` and `main.ts`, and both pins,
  at 7fb9e005 (98deaaac plus the two renewals above); full default under the
  reference profile with the ps proxy: CONFORMANCE CHECKPOINT PASS
  (check-R1huHo), 36 production controls broken 1 and restored 0
  (conformance-XgVCKC), 53 public mutants exit 1 and restore 0
  (public-KGUHOa), clean recheck 19,784 states. Committed in 2a29d933.

Premise at 2a29d933: nothing in either pin's scopes differs from 7fb9e005.
Pin audit at 2a29d933: **filesScanned 535, occurrences 932, match 138,
drift 0, unknown 0**, no problems, no unused ledger entries.

| Commit | What |
| --- | --- |
| 4d5c7e8b | Follow-up 86: typed times stored with the typing machine's zone, and their tests. |
| 5b0379a3 | S1-16's case in the CLI test. |
| 2b42e3f7 | Follow-up 88: one week for the reviews and the weekly export, and its tests. **The product.** |
| bc50a565 | Task search and cache renewals. **The Dependency pin.** |
| c31d9ead | Dependency renewal. |
| 8434a7e1 | The first report. |
| 98deaaac | Server seat F1 and F2: refuse in the CLI, the zone's real offsets, the 60th second, the echo, and their tests. **The product now.** |
| 7fb9e005 | Task search and cache renewals for it. **The Dependency pin now.** |
| 2a29d933 | Dependency renewal for it. |
| (this commit) | This report, corrected. |

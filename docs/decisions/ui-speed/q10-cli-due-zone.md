# Q10: the CLI's `due:` label by the stored zone

2026-11-16, Claude Opus 5.5 (INTEG-STEP2), on `feat/cli-due-zone` from
`integ/step2` e01c1554. Not merged into `integ/step2`. The owner's answer A to
Q10 (2026-11-14): the `due:` label in the CLI's Markdown shows the date in the
zone stored with the instant, the rule Today and Overdue use, instead of the
instant's UTC date. Display only.

## The change

`packages/domain/src/presentation.ts`, three hunks:
- `taskView` records `taskDay(due_at)` (planning-day.ts: the date of the
  instant in its stored zone; a calendar date as it is) under a symbol key,
  `DueDay`. A symbol key never reaches JSON (`JSON.stringify` and schema
  encoding both ignore it), and a spread copy of a view keeps it.
- `taskLine` prints `due:<DueDay>`, falling back to the old UTC slice only
  for a view not built by `taskView`.
- The `TaskView` type carries the optional symbol.

No stored value, JSON field, filter or sort order changes. `TaskViewSchema`,
`encodeResponse`, `renderError` and `renderTask` are byte-identical.

## Every place the CLI prints a date from a time

| Output | Follows the rule after the change | Why |
| --- | --- | --- |
| `todo list` (Markdown) | yes | Task lines come from `taskLine` |
| `todo show` (Markdown) | yes | its first line is `taskLine` |
| `todo export`, both templates | yes | `taskLine` per Task (jira-context wraps the same body) |
| `todo catalog` (Markdown) | yes | `taskLine(taskView(...))` per Task |
| `todo review daily` and `weekly` | yes | Task lines through `renderTasks`; which Tasks are listed already followed the day rule (Q9) |
| `todo sync obsidian` | yes | `taskLine` per Task |
| An error's "Latest Record" (Markdown) | yes | `renderTask` |
| `--format table` | not applicable | prints no due date |
| Every `--format json` output | unchanged on purpose | the instant as stored (`due_at`), byte-identical (below) |
| `todo show`: `created_at`, `updated_at`, `completed_at` | unchanged on purpose | full instants, not a date label |
| `todo history` | unchanged on purpose | each entry's full `occurred_at` instant |
| `todo parse` (Markdown) | unchanged on purpose | prints the draft as JSON, with its zone |
| `scheduled_at` | not printed in Markdown | `taskLine` has no scheduled label |

**No zone stored.** Every instant has a zone (`ZonedInstant.time_zone` is
required). A time typed into the CLI is stored with the zone `UTC`
(`parseTime`, for `Z` and offset inputs alike), so for the CLI's own entries
the label is the UTC date, as before. That is the rule Today and Overdue
already apply to them: the label and Today never disagree. Inferring the
machine's zone for them would make the label differ from Today's grouping.

## Proof (logic passes; nothing used for real)

- `apps/cli/test/due-zone.test.ts`, compiled CLI on scratch data, machine
  zone Pacific/Kiritimati so it cannot matter. Seeded through the domain:
  Bogota at 21:00 (`2026-11-15T02:00:00Z`) and at 23:59
  (`2026-11-15T04:59:00Z`) label **2026-11-14**; Tokyo at 08:00
  (`2026-11-14T23:00:00Z`, Asia/Tokyo) labels **2026-11-15**; a time typed
  into the CLI (`2026-11-15T02:00:00Z`, stored UTC) labels 2026-11-15; a date
  only due date (2026-11-14) is unchanged. Through list, export, catalog,
  show and the Obsidian projection. The JSON test reads back every `due_at` as
  stored. With `taskLine` put back to the UTC slice the label tests fail
  (Bogota 2026-11-15, Tokyo 2026-11-14) and the JSON test passes; restored
  byte for byte, all pass.
- **JSON byte-identical, paired:** the base CLI (e01c1554's CLI and package
  sources) and this branch's read one scratch database (the five Tasks above
  plus one without dates, with scheduled times, a Tag and a Project), machine
  zone America/Bogota. 25 of 25 JSON outputs are identical once the read's
  clock (`generated_at`, and the catalog's `now`) is masked: list (plain,
  `--today`, `--overdue`, `--tag`), export (all, today, weekly, jira-context),
  catalog (all, today, overdue), review daily and weekly, and `show` and
  `history` for every Task.
- **Markdown, paired:** in list, export, catalog (all, overdue) and review
  (daily, weekly) every changed line is a `due:` label; no other line
  changes.
- Gates under the reference profile: verify-cli 0, verify-filters 0, the root
  check 0 (domain 632, server 203, CLI 101, Electron 168 plus 1 skipped).
- No function in `verify-occ-atomicity/coverage.json` changes (that mapping
  does not cover `presentation.ts`).

## Mappings

`presentation.ts` is pinned by two mappings:
- Task search formal (`TaskViewSchema`, `taskView`): before renewal the check
  passed every model stage and stopped only at the hash; renewed; passes
  (check-Tl04no).
- Dependency public (`encodeResponse`, `renderError`, both byte-identical):
  the row's hash and both pins move together to 8d32f810 (the product
  2f70298f plus the Task search renewal); full default under the reference
  profile CONFORMANCE CHECKPOINT PASS (check-Sxy2fj), 36 production controls
  broken 1 and restored 0, byte-identical (conformance-rAFhoQ), 53 public
  mutants exit 1 and restore 0 (public-uFrn7P). Renewed in 65749b97.

Premise at 65749b97: nothing in either pin's scopes differs from 8d32f810.
Pin audit at 65749b97: **filesScanned 535, occurrences 892, match 138,
drift 0, unknown 0**. Each renewal is a candidate until a seat accepts it.

## The line

| Commit | What |
| --- | --- |
| 2f70298f | The change and its test. **The product.** |
| 8d32f810 | The Task search renewal. **The Dependency pin.** |
| 65749b97 | The Dependency renewal. |
| (this commit) | This report. |

For the owner's notice: point 6 ("The CLI still prints a timed due date by
its UTC date") no longer holds once this branch is installed; the label is
the same day the apps show.

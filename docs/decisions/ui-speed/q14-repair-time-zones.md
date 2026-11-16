# Repair the time zone of typed times, once (Q14, Q17)

2026-11-16, Claude Opus 5.5 (INTEG-STEP2), branch `feat/repair-typed-zones` from candidate 15's
head f8d0cb4a. Not merged, not pushed. The server seat reviewed d5af970d (CHANGES REQUIRED: F1, F2,
F3 and notes); this head answers them, with the owner's Q17 (always the same moment) and the
ADR-0009 note in the seat's wording. Nothing was run against the owner's database.

## For the owner: how to run it

1. Install the candidate that carries it, on the Mac whose zone you want (check with `date +%Z`).
2. `todo repair time-zones --dry-run` lists every due and scheduled time stored with the zone UTC: what it shows today and what it will show after. It keeps the moment each reminder has always fired at, so a time you typed as 21:00 shows 16:00, and one typed between 00:00 and 04:59 moves to the day before. It writes nothing.
3. Save that list as the plan: `todo repair time-zones --dry-run --format json > ~/todo-repair-plan.json`. Add `--all-profiles` for every Profile, `--include-closed` for done and cancelled Tasks, or `--task <id>` (repeatable) to repair only those.
4. `todo repair time-zones --plan ~/todo-repair-plan.json` takes a Snapshot first (it prints the id) and edits each listed Task once. If anything stored differs from that list, it changes nothing and says which Task.
5. A Task you changed after the dry run is skipped as a Conflict (exit 4); make a new dry run and run that plan. Series templates are listed, not changed: a repeating Task's next Occurrence comes back with UTC.
6. Undo one Task with `todo history <task-id>` and `todo revert <seq> --expected-version N`, as long as the repair is that Task's latest change (after a later edit Revert refuses); undo everything with `todo snapshot restore <snapshot-id>`.

## What it does

`todo repair time-zones` gives each due or scheduled instant stored with the time zone UTC the
machine's zone: the zone of the process where it runs (`TZ` when set, the system zone otherwise),
as follow-up 86 resolves it. **The instant stays the same** (Q17, "B, always the same moment"): the
moment each reminder has always fired at, not the clock time that was typed. A time typed bare
("2026-11-16 21:00" in Bogotá) was stored as 21:00 UTC, so it shows 16:00 after the repair, and one
typed between 00:00 and 04:59 shows on the day before. Nothing else of the Task changes, except
what any edit changes (its Version and `updated_at`).

- **The dry run** (`--dry-run`) writes nothing: no Snapshot, no History, no rejected attempt. The
  database file and its WAL are byte-identical after it, with and without a running server. Its
  first line, its JSON `note` and the help carry one sentence: "This repair keeps the moment each
  reminder has always fired at, not the clock time that was typed: a time typed as 21:00 in Bogotá
  before the fix shows 16:00 after it, and one typed between 00:00 and 04:59 shows on the day
  before." Per value it gives:
  - the Task id and title, the field and the stored instant;
  - the local date and time it shows today (`shown_before`, UTC) and after (`shown_after`, the
    machine's zone);
  - the day before and after, and the Version it read.

  Then come the values it leaves, each with its reason, and the totals, Series templates counted
  apart.
- **The run** (`--plan <file>`) takes every option from the plan; a run with options of its own is
  refused. It is bound to the plan (F1, below). If anything is left to write, it takes a Snapshot
  first (ADR-0012), and a failed Snapshot means no write. Then it edits each Task once through
  `TaskCommands.edit` with the Version the dry run read: one History entry per Task, revertable.
- **A Task changed since the dry run is a Conflict.** It is found before any write, reported with
  its current Version (exit 4) and not written. A change between that read and the write is still
  refused by the edit's own Version check.
- **Twice changes nothing.**
  - A value already stored with the plan's zone is `already_repaired` and not written.
  - A plan with nothing writable takes no Snapshot and leaves the file byte-identical.
  - A fresh dry run after a full run is empty.
- **Reminders do not fire again.** A reminder's receipt is keyed on the Task and its due instant
  (`scheduled-work.ts`), and the instant does not move (tested).

## The seat's findings on d5af970d

**F1 (P1), the plan is bound to what is stored.** Before any Snapshot or write, `checkPlan` holds
the plan to the stored data.
- Every item not yet applied must be stored as its instant with the zone UTC.
- Its zone must be the plan's, and the plan's must be the machine's.
- It must equal, field for field, the item a dry run made now with the plan's own options has at
  the same place: id, Profile, field, instant, zones, both shown times and both days. Title,
  status and Version are left out, because a Task changed since is a Conflict, not another plan.
- The fresh dry run must list nothing more.

Otherwise the whole plan is refused (exit 2, code `plan_mismatch`), naming the first item that
differs, and nothing is written. Items come in one order that a later edit cannot change: stored
instant, Profile, Task, field. Tested in the domain and the compiled CLI, each refused with
nothing written and no Snapshot taken: the seat's four edited plans (another instant, another
zone, an item for a Task stored with Bogotá, `scheduled_at` on a date-only Task), a reordered
plan, a truncated one, and one from another database.

**F2 (P2), `--all-profiles`.** It now takes the Profiles from the Profile directory
(`ClientReads.profiles`, as `todo profile list`): every Profile the credential may read. Each read
and each edit is authorized per Profile, as `todo list` and `todo edit` are. Kept rather than
removed, because the owner has more than one Profile and one run that lists them all is easier to
read than one per Profile. Tested with two Profiles: `profiles` is `["default", "work"]` and the
`work` Task is listed.

**F3 (P2), what the owner sees.** The owner chose Q17 B, always the same moment, so there is one
reading and no `--keep`. The dry run shows, per value, the local time today and after. `--task`
stays: it lets the owner leave a Task out.

**The notes.**
- **Series templates** are listed, not changed. Changing one is a Series edit, whose rebase
  rewrites the whole template from one Task and needs an open Task, which is more than a zone. A
  repaired Occurrence's next Occurrence comes back with UTC, so the dry run counts templates apart,
  and the help and the "how to run it" say that a repeating Task is not finished after one run.
- **A plan from another database** is refused before any Snapshot (F1's ordering; tested).
- **Revert after a later edit** is refused by Revert's own rule; the "how to run it" says so and
  names the Snapshot as the undo.
- **A non-owner Access Token** is refused with the existing `requireOwner` wording (N4,
  pre-existing, unchanged).

**ADR-0009.** The note now carries the seat's four conditions, as the owner accepted it (Q16). A
data repair may be CLI-only when:
1. a recorded owner decision orders it;
2. it re-applies values the stored data already implies and makes no new kind of change;
3. its run applies exactly a dry run the owner read and refuses anything else;
4. it is meant to run once per database.

A repair that fails any of these is a capability.

## What was worked out before anything runs (unchanged from d5af970d, as the seat confirmed)

- **Candidates:** History does not say which client wrote a value. `actor` is a credential id, and
  credentials record only Session or Access Token and a token's name; the CLI and both apps use
  Sessions. So every UTC-zoned instant is a candidate, and the dry run is the owner's check.
- **Tasks:** open and snoozed by default; `--include-closed` adds done and cancelled ones. Deleted
  and purged Tasks are never touched.
- **Other stored instants:**
  - Series templates: listed, not changed.
  - `Recurrence.dtstart` and `exdate`, and an Occurrence's origin time: written from JSON that
    names its zone, not by the typed path.
  - `ReminderFired.due_at`: has no zone.
  - Snooze: uses `scheduled_at`.
- **Path:** a direct write plus one nudge to the proven server, as every production CLI write here
  (ADR-0023); open apps receive the edits on SSE. With `--require-server` the run is refused, as
  `todo edit` is. The dry run takes the read path.

## Proof

**Tests.**
- `packages/domain/test/repair-time-zones.test.ts` (5 tests), literal:
  - Bogotá: typed 21:00 (stored 21:00Z) shows 16:00 after; typed 03:00 shows 22:00 the day
    before; typed 01:30 shows 20:30 the day before. Tokyo: 21:00Z shows 06:00 the next day.
  - The plain sentence.
  - `--task`, closed Tasks, never a deleted Task or a date, a UTC machine.
  - Every F1 refusal with its message: the seat's four edited plans, reordered, truncated,
    another database, an edited shown time. A plan already applied is accepted; another
    machine's zone is refused.
- `apps/cli/test/repair-time-zones.test.ts` (8 tests), the compiled CLI and server on scratch data
  with two Profiles:
  - The dry run's sentence and local times; the database file and WAL byte-identical with and
    without a running server.
  - `--all-profiles` covers both Profiles.
  - The seven edited or foreign plans are refused with nothing written and no Snapshot.
  - `--task`; a Conflict; a stale plan writes nothing; the rest repaired; no second reminder.
  - Revert; the Snapshot restored.
  - A plan from another zone, a run with options, `--keep` and a bare call are refused.
- **Red on d5af970d:** its compiled CLI and server fail 6 of the 8 CLI tests, among them F1's
  edited plans, which it wrote. The 2 that pass there are the server-running dry run and Revert.
  The domain test cannot import `checkPlan` there.

**Gates**, under the reference profile after its five controls, with the 1-minute load at start
and end:
- On abbf55a2: verify-op-log 0 (6.1 → 6.1), verify-snapshots 0 (6.1 → 11.9), verify-server-api 0
  (11.9 → 11.0), verify-occ-atomicity 0 (11.0 → 11.2; fv01-check-yHr7v6), verify-cli 0
  (4.0 → 6.1). The root check failed there on one thing: the domain test edited the read-only
  plan type, which tsc refused. 06ad957d types those edits as plain objects.
- On ddfe237d: verify-cli 0 (7.7 → 7.3) and the root check 0 (7.3 → 6.9: domain 649, server 203,
  CLI 119, Electron 168 plus 1 skipped). The sources the other four gates cover are unchanged
  since abbf55a2.
- verify-occ-atomicity: no function in its `coverage.json` changed; it covers none of the touched
  files.

**Mappings**, each a candidate until a seat accepts it:
- **Task search formal:** needed nothing. It passes on e989d62b and 5436c37a without renewal.
- **Task search cache:** the `main.ts` hygiene row, renewed for e989d62b (c55f7362) and again for
  5436c37a (7ca4da9d). At 5436c37a, check-hygiene.mjs (hygiene-yVi44b), check.mjs
  (generated-GRspKF), the uncached baseline and the full verify.mjs (verify-NfEPMY) pass.
- **Dependency:** the public rows of `main.ts` and `help.ts`; no production row moves.
  - Pins at 7ca4da9d: CONFORMANCE CHECKPOINT PASS (check-6gg8OA), 36 production controls broken 1
    and restored 0 (conformance-IBNKeX), 53 public mutants exit 1 and restore 0 (public-nOMnrU).
  - The domain test is in the pins' scope, so both pins moved again to 06ad957d: PASS
    (check-29Fs1Y), 36 broken 1 and restored 0 (conformance-cIRjCj), 53 exit 1 and restore 0
    (public-JhkDvh), clean recheck 19,784 states.
  - Committed in abbf55a2 and ddfe237d.

Premise at ddfe237d: nothing in either pin's scopes differs from 06ad957d. Pin audit at ddfe237d
with main's ledger (identical to main's): **filesScanned 536, occurrences 994, match 138, drift 0,
unknown 0**, no problems, no unused ledger entries.

| Commit | What |
| --- | --- |
| f5b502ab, 3fe080d2, a016b7e3, 96e0cc2e, 3b67e253, d5af970d | The version the seat reviewed. |
| e989d62b | F1 and F2 (and a first F3 with two readings, superseded by Q17). |
| c55f7362, a608b8ec | Renewals for e989d62b (superseded). |
| 5436c37a | Q17: one reading, the same moment; the plain sentence. **The product.** |
| 7ca4da9d | Cache and Dependency public-row renewals. |
| abbf55a2 | Dependency renewal at 7ca4da9d. |
| 06ad957d | The domain test's typing (the root check). **The Dependency pin.** |
| ddfe237d | Dependency renewal at 06ad957d. |
| (this commit) | This report. |

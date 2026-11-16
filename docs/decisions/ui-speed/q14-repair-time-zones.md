# Repair the time zone of typed times, once (Q14)

2026-11-16, Claude Opus 5.5 (INTEG-STEP2), branch `feat/repair-typed-zones` from candidate 15's
head f8d0cb4a. Not merged, not pushed. For the server seat's review, then the next candidate after
15. Nothing was run against the owner's database.

## For the owner: how to run it

1. Install the candidate that carries it, on the Mac whose zone you want (check with `date +%Z`).
2. `todo repair time-zones --dry-run` lists each due and scheduled time stored with the zone UTC, with its day before and after. It writes nothing.
3. Save the list you read as the plan: `todo repair time-zones --dry-run --format json > ~/todo-repair-plan.json`. Add `--all-profiles` or `--include-closed` here if you want them.
4. `todo repair time-zones --plan ~/todo-repair-plan.json` takes a Snapshot first (it prints the id), then edits each Task once.
5. A Task you changed after the dry run is skipped as a Conflict (exit 4); make a new dry run and run that plan.
6. Undo one Task with `todo history <task-id>` and `todo revert <seq> --expected-version N`; undo all of it with `todo snapshot restore <snapshot-id>`.

## What it does

`todo repair time-zones` gives each due or scheduled instant stored with the time zone UTC the
machine's zone: the zone of the process where the command runs (`TZ` when set, the system zone
otherwise), as follow-up 86 resolves it. The instant stays the same; only the zone, and with it
the calendar day the time falls on, changes. Nothing else of the Task changes, except what any edit
changes (its Version and `updated_at`).

- **The dry run** (`--dry-run`) writes nothing: no Snapshot, no History, no rejected attempt. The
  database file and its WAL are byte-identical after it, with and without a running server
  (tested). Per value it prints the Task id and title, the field, the instant, the old and new
  zone, the day before and after, the Task's status and the Version it read. Then come the totals and
  the UTC-zoned values it leaves, each with its reason.
- **The run** (`--plan <file>`) applies exactly the plan the owner read. The owner Session is
  required. It reads every planned Task again. If a value is left to write, it takes a Snapshot
  (ADR-0012, reason `repair time-zones`); if the Snapshot fails, it writes nothing. Then it edits
  each Task once through `TaskCommands.edit`, the one write path (`OperationStore.append`), with
  the Version the dry run read. Both fields of one Task go in that one edit: one History entry per
  Task, which the existing Revert undoes. A Task changed since the dry run is refused as a Conflict,
  recorded as any refused edit is, skipped and reported, never forced; the run then exits 4.
- **Twice changes nothing.** A value already in the plan's zone is reported `already_repaired`
  and not written. A plan with nothing left to write takes no Snapshot and leaves the file
  byte-identical (tested). A fresh dry run after a full run is empty.
- **The zone is the plan's.** A plan made in another zone is refused (exit 2): make a new dry run
  on this machine.
- **Reminders do not fire again.** The scheduler keys a reminder's receipt on the Task and its due
  instant (`scheduled-work.ts`); the repair keeps the instant.

## What was worked out before anything runs

**Which values are candidates.** History does not say which client wrote a value. An entry's
`actor` is a credential id, and the `credentials` table records only the kind (Session or Access
Token), a token's name, its Profile and scope. The CLI and both apps sign in with Sessions. Neither
the events nor the Task record the client (`source` is free text set on add). So every UTC-zoned
due or scheduled instant is a candidate, and the dry run is the owner's check: it lists each one
with its title and both days, for the owner to read before the run. Other ways a value can carry
UTC: a machine really set to UTC, an import row or an HTTP body that named UTC. On a machine
whose zone is UTC the repair has nothing to do.

**Which Tasks.** By default, open and snoozed Tasks: the ones Today and Overdue show.
- **Done and cancelled:** listed under `not_changed` as `closed_task`, with their count. `--include-closed`
  repairs them too. Editing a closed Task is allowed (only a Series change needs an open one), and
  their days appear in History and the weekly export, so the option is there. The default leaves
  them because they no longer appear in Today or Overdue.
- **Deleted:** never. An authorized read does not return them, and an edit refuses a deleted Task.
  To repair one, Revert its deletion first, then make a new dry run.
- **Purged:** never; they no longer exist.

**Which Profiles.** The selected Profile (`--profile`) by default; `--all-profiles` covers every
Profile the read returns. The command requires the owner Session, as a Snapshot does, so a
Profile-scoped Access Token cannot run it. Each edit still goes through `TaskCommands.edit`, which
authorizes it as `todo edit` is (`auth.mutate` per Profile); there is no path around it.

**Other stored instants**, censused in the code:
- **A Series' template** (`series.task.due_at` and `scheduled_at`): the typed path can write it
  (`todo add --due ... --recurrence ...`), and the next Occurrences are made from it. **Listed, not
  changed** (`not_changed`, `series_template`). Changing it is a Series edit. Its rebase rewrites the
  whole template from one Task, which is more than a zone, and it is refused unless the Task is open.
  If the dry run lists any, the owner decides, and a follow-up can edit the template on its own.
- **A Series' `dtstart` and `exdate`, and an Occurrence's origin time:** written from Recurrence JSON,
  which names its zone. The typed path never writes them, so they are not candidates.
- **Reminders:** a `ReminderFired` stores a plain UTC instant with no zone; nothing to repair.
- **Snoozes:** no separate stored time; a snoozed Task's due and scheduled times are repaired like
  an open Task's.

**Through the server or directly.** As every production CLI write in this build (ADR-0023), the
run writes directly to the database and then nudges the proven server once. The server tails the
operation log and publishes the edits on SSE, so open apps receive them as any other write
(verify-sse covers CLI writes reaching subscribers). With `--require-server` the run is refused
(`server_command_unsupported`), as `todo edit` is. The one-server guard is the same as for any
CLI write. The dry run takes the read path: no server discovery, no nudge.

**Name, help and parity.** `todo repair time-zones`, under a new `todo repair` group for
maintenance. Its help uses CONTEXT.md's terms: Task, due date, scheduled time, Snapshot,
History, Revert, Conflict, Version, Profile. Both commands publish their JSON Schema
(`todo schema 'repair time-zones'`). ADR-0009 gains an amendment (2026-11-16): a one-time data repair
is maintenance, not a capability. It is CLI only and owner-only, with a dry run, and every change
is an ordinary Task edit, which both apps already show (History) and undo (Revert). The amendment
is part of this unit and needs the coordinator's and owner's acceptance.

## Proof

**Tests.**
- `packages/domain/test/repair-time-zones.test.ts`, the plan, literally. In Bogotá, 02:00Z on the 17th
  (21:00 on the 16th) moves back a day; 20:00Z and the noon values keep their day; a snoozed Task is
  included. In Tokyo (east of UTC), 20:00Z on the 16th moves forward to the 17th. A date-only value,
  a value already zoned and a deleted Task are never in the plan. A done Task is in the plan only
  with `--include-closed`. A Series template is listed, not changed. A UTC machine has nothing to do.
- `apps/cli/test/repair-time-zones.test.ts`, the compiled CLI and server on scratch data, with Tasks
  typed on a UTC machine:
  - **The dry run** lists exactly the four UTC-zoned values. The database file and its WAL are
    byte-identical after it (SHA-256), and the History count is the same.
  - **The dry run with a running server**, measured once the database is quiet: byte-identical too.
    The server's own scheduler writes a reminder for a past-due Task when it starts, so the test
    waits for two quiet seconds first.
  - **A Task edited between the dry run and the run** is a Conflict: skipped, current Version
    reported, exit 4. The other values are changed with one History entry per Task, and their
    stored values are checked literally.
  - **The run's Snapshot** is listed with reason `repair time-zones`.
  - **A new dry run** picks up the skipped Task at its new Version and repairs it. After that, the same
    plan again and a fresh empty plan write nothing and take no Snapshot (byte-identical).
  - **Revert** of the one repaired edit gives back the zone UTC.
  - **The Snapshot restored** gives back the state before the repair.
  - **`--include-closed`** repairs a done Task.
  - **A plan from another zone** is refused, and so is a call with neither `--dry-run` nor `--plan`.
- Red: against f8d0cb4a's compiled CLI and server, all 8 CLI tests fail, since the command does not
  exist there; the domain test cannot import its module there.

**Gates** on 3b67e253, under the reference profile after its five controls, with the 1-minute load
at start and end:
- verify-cli 0 (5.9 → 5.7)
- verify-op-log 0 (5.7 → 5.7)
- verify-snapshots 0 (5.7 → 6.1)
- verify-server-api 0 (6.1 → 5.8)
- verify-occ-atomicity 0 (5.8 → 5.6; fv01-check-QLi3DC)
- the root check 0 (5.6 → 5.5): domain 647, server 203, CLI 119, Electron 168 plus 1 skipped

On 3fe080d2, verify-cli and the root check failed for one reason: the CLI flag contract had no
reviewed consumer for the new flags. a016b7e3 adds them, and the contract gains only the `repair`
entries. Of the existing entries only `todo`'s help hash moves, because its help now lists `repair`.

**Mappings**, each a candidate until a seat accepts it:
- **verify-occ-atomicity:** no function in its `coverage.json` changes; it covers none of the
  touched files.
- **Task search formal:** needed nothing. It passes on a016b7e3 without renewal.
- **Task search cache:** the `main.ts` hygiene row. After renewal, check-hygiene.mjs
  (hygiene-ujPqcG), check.mjs (generated-ViwuQT), the uncached baseline and the full verify.mjs
  (verify-iizcQJ) pass. Committed in 96e0cc2e.
- **Dependency:** the public rows of `main.ts`, `help.ts` and `schema.ts`, and both pins at 96e0cc2e;
  no production row moves. The full default under the reference profile with the ps proxy:
  - CONFORMANCE CHECKPOINT PASS (check-2QAl8o)
  - 36 production controls broken 1 and restored 0 (conformance-OejgdC)
  - 53 public mutants exit 1 and restore 0 (public-OHqdP1)
  - clean recheck 19,784 states

  Committed in 3b67e253.

Premise at 3b67e253: nothing in either pin's scopes differs from 96e0cc2e. Pin audit at 3b67e253
with main's ledger (identical to main's): **filesScanned 536, occurrences 971, match 138, drift 0,
unknown 0**, no problems, no unused ledger entries.

| Commit | What |
| --- | --- |
| f5b502ab | The command, its domain module, help, schema, and tests. |
| 3fe080d2 | `--include-closed` test; ADR-0009's amendment. |
| a016b7e3 | The flag contract's reviewed consumers and entries. **The product.** |
| 96e0cc2e | Cache and Dependency public-row renewals. **The Dependency pin.** |
| 3b67e253 | Dependency renewal. |
| (this commit) | This report. |

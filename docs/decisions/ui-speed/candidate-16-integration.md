# Candidate 16: candidate 15 with its deadlock fix and the time zone repair

2026-11-17, Claude Opus 5.5 (INTEG-STEP2), branch `integ/c16` from candidate 15's report commit
(d9a9ef9a). **Final head e9f905a46db7cc25f7b1b023632623ed72f85ce3; gate cycle PASS, 20 gates
(11 run on this head, 9 carried by the input-hash rule).** Not pushed.

## For the owner: what changes

- **The Mac app cannot hang on candidate 15's deadlock.** The correctness seat's stress run found
  it: cancelling a request at the moment the transport admitted it could leave both sides waiting
  on each other's lock. Nothing under the transport's lock now waits on a task's status lock.
- **`todo repair time-zones`** fixes due and scheduled times that an older build saved with the
  zone UTC, keeping the moment each reminder fires at. `--dry-run` lists each time as it shows now
  and as it will show after, and writes nothing. Save that list as a plan (`--format json`; add
  `--all-profiles` for every Profile). Then `--plan <file>` takes a Snapshot and edits each listed
  Task once. A Task changed since the dry run is skipped as a Conflict. The guide is
  `docs/decisions/ui-speed/q14-repair-time-zones.md`.

## The merges

| Commit | What |
| --- | --- |
| 8854e828 | Merge `feat/repair-typed-zones` at 2a9f37ee (Q14; server seat PASS). |
| b1a514f7 | Merge `mac-c15-fix` at 948b5b91: candidate 15's ScopedTransport deadlock. Two files: `ScopedTransport.swift` and its test `StuckSendReleaseTests.swift`. The Mac sources equal 948b5b91's. |
| 93e82aaa | Merge `mac-restore-wake-test` at fb7581d5. The first test fixture; superseded (below). |
| e9f905a4 | Merge `mac-restore-wake-test` at 7f194391, by hash. **The candidate.** |
| (this commit) | This report. |

The two fixture merges each change one file against their parent, the gate's fixture
`.agents/skills/verify-macos/fixtures/sign-out-stream/ProfileRestoreWakeTests.swift`. Its only
reader is `verify-sign-out-stream.py`, which copies the whole fixtures folder. No mapping, pin or
manifest names it or its old blob. The pin audit is identical at b1a514f7 and 93e82aaa (0 unknown,
0 problems, no unused ledger entries). The branch's later head 0bf4bc3f is the next candidate's and
is not merged.

## The gate cycle: which gate ran on which head

| Gate | Head it passed on | When | Load (1 min) start → end |
| --- | --- | --- | --- |
| task-search-formal | b1a514f7, carried | 11-16 18:15–18:19 | 10.5 → 47.1 |
| dag-public | b1a514f7, carried | 18:19–18:33 | 44.2 → 92.5 |
| doc-links | b1a514f7, carried | 18:33 | 92.5 |
| state | b1a514f7, carried | 19:43–19:51 | 15.3 → 16.5 |
| hold | b1a514f7, carried | 19:51–19:59 | 16.5 → 38.4 |
| stress | b1a514f7, carried | 20:59–21:26 | 56.1 → 27.2 |
| race | b1a514f7, carried | 21:40 (retirement only, 200 iterations, 10 s) | 10.4 → 9.4 |
| design | b1a514f7, carried | 21:40–21:58 | 9.4 → 3.6 |
| root | 93e82aaa, carried | 23:52–23:57 | 7.5 → 10.0 |
| sign-out-stream | e9f905a4 | 11-17 00:22–00:42 | 6.9 → 7.3 |
| connections | e9f905a4 | 00:43 | 7.3 → 7.5 |
| sockets | e9f905a4 | 00:43 | 7.5 → 7.8 |
| restart | e9f905a4 | 00:43–00:44 | 7.6 → 7.9 |
| diagnostics | e9f905a4 | 00:44–00:45 | 7.9 → 7.6 |
| unsigned | e9f905a4 | 00:45–01:02 | 7.6 → 29.0 |
| idle | e9f905a4 | 01:09–01:15 | 6.1 → 8.4 |
| subscribers | e9f905a4 | 01:15 | 8.4 → 11.4 |
| discovery-prepare | e9f905a4 | 01:15–01:16 | 11.4 → 11.1 |
| discovery-quarantine-temporaries | e9f905a4 | 01:16 | 11.1 |
| discovery-formal | e9f905a4 | 01:16–01:25 | 10.8 → 3.3 |

- **The carry rule.** A gate is carried when it passed on the earlier head, and the earlier head
  and e9f905a4 differ only under `.agents/skills/verify-macos/fixtures/sign-out-stream`. The
  receipt is in `result.json`: the diff naming that one file, and the full-tree digest with that
  folder left out. That digest is 5bbf7d60 (1,591 entries) at b1a514f7, 93e82aaa and e9f905a4. A
  different tree gives a different digest. `sign-out-stream` reads that folder and is never
  carried. No compiled binary's hash is used.
- **The result on e9f905a4.** PASS; nothing kept apart; every Swift test log ends in its summary
  line (20 of 20). No Keychain linked, nothing signed, no app launched. The owner was active at
  the start of `sign-out-stream` only (idle 0.2 s); it passed. Each gate set
  `GATES_OWNER_ACTIVE_OK` to its own date (2026-11-16, then 2026-11-17).
- **How it ran.** The runner is `gates.py` at each head, run as a segment copy whose changes are
  each marked SEGMENT. The copy, its diff and its patches are in
  `docs/evidence/mac-perf/c4/segment-receipts-<head>/`, one folder per head. Ten segments (A to J)
  resumed one evidence folder per head and skipped only gates that had passed on that head. A
  gate started only when no other job held or waited on the Swift slot. From 01:08, a gate also
  started only below a 1-minute load of 20.

## Kept apart: `sign-out-stream` on b1a514f7 (twice) and on 93e82aaa

**The two failures on b1a514f7.** Both were in `ProfileRestoreWakeTests.aDeletionThenARestoreReturnsToTheRestoredProfile`
at gapMS 0, lines 88 and 89. The test's own wait ("back on the restored Profile") passed. After a
fixed settle, the receipt read the restored Profile, live, with `tasks_shown` 0 and
`catalog_matches_server` false, while the server listed the Task. The 400 ms case passed both times.
- Attempt 1, 19:59–20:33: load 38.4 → 70.9; the owner became active (idle 5,602 → 15 s).
- Attempt 2, 20:40–20:58: load 22.2 → 67.6; owner not active (idle 175 → 238 s).
- From restore to the client's reconnect in the server log: 321 ms in attempt 1, 319 ms in
  attempt 2. Candidate 15's cycle read 114 ms.

Both are kept apart, with their logs and receipts, in
`docs/evidence/mac-perf/c4/sign-out-stream-owner-active-b1a514f7/` (attempt-1, attempt-2,
LABEL.txt). Attempt 2 was not owner-active; the folder name dates from attempt 1, and the label
says so.

**The measurement: the test's race, not the product.** The Mac worker ran the case alone, five
runs at each head, with an instrumented receipt. **Candidate 15 failed the same check too**
(33c7e3c5, run 3). Its reconnect came at 361 ms, after the fixed settle had ended at 334. The
check then read 0 Tasks at 818 ms, inside a blank from 811 to 831 ms. The reconnect medians are
205 ms on b1a514f7 and 250 ms on 33c7e3c5. The gates' 114 and 321 ms were single samples from a
spread of about 170 ms. The transport adds no cost per send at either head. With a receipt that
waits for the list, all ten runs passed at both heads, and the list was never ready and empty.
So the fixed settle was the test's race, independent of the head.

**The three fixtures.**
1. **fb7581d5** (head 93e82aaa): the receipt waits up to 15 s for the client to settle on the
   restored Profile with a list equal to the server's. A 10 ms sampler fails on a ready and empty
   list. *Superseded:* its wait can end before the restore's reload. The never-refreshes red
   control (c32b9b94) matched at 388 ms, before the reconnect at 463, and then blanked.
2. **cf03a44e**: the wait also requires the client's restore generation to have changed.
   *Superseded:* it compared with the generation from before the restore, so a reload still owed
   by an earlier restore could satisfy it (the correctness seat).
3. **7f194391** (head e9f905a4, merged): the wait targets the restore's own generation and
   exactly one reload.

**The five proof runs of 7f194391**, read by the coordinator before the merge:
1. Green, b1a514f7's product alone. 0 ms: match 671 ms after the reconnect at 216,
   `reload_count_delta` 1. 400 ms: match 755, `reload_count_delta` 1. Never ready and empty.
2. The never-refreshes control fails in both cases, in the waits before `matched`, because its
   reconnect came early.
3. Frozen and late (eea5cba3: never refreshes, and the stream reconnects 3 s late): the 0 ms case
   fails on `matched` (line 157), `reload_seen` true, `tasks_shown` 0.
4. The same client with fb7581d5's fixture: the wait is met at 304 ms, before the reload, and only
   the later liveness check (line 145) fails. This is the hole in fb7581d5.
5. Correct and late (78149f2c): PASS. The 0 ms match comes at 3307 ms, after the reconnect at
   3120, with `reload_count_delta` 1.

**On 93e82aaa**, `sign-out-stream` with fb7581d5's fixture ran 23:13–23:34 and exited 0 (load
13.2 → 9.3). It was recorded apart as a run on a superseded fixture and taken out of 93e82aaa's
commands. It is not this candidate's receipt. It is kept in
`docs/evidence/mac-perf/c4/sign-out-stream-superseded-fixture-93e82aaa/`.

**On e9f905a4**, `sign-out-stream` passed: both cases in 2.661 s.

| Receipt | `ms_restore_to_match` | `ready_and_empty_ms` | `reload_seen` | `reload_count_delta` | Tasks shown | Matches server |
| --- | --- | --- | --- | --- | --- | --- |
| 0 ms | 314 | none | true | 1 | 1 | yes |
| 400 ms | 594 | none | true | 1 | 2 | yes |

## Deviations, in the order they happened

- **The slot wait matched its own waiter.** The command line of the `generate-api` waiter contained
  the slot-lock text the runner looks for, so the runner and the waiter both waited about 55
  minutes (18:20–19:15). The pattern is now anchored to the start of the `lockf` command line.
  A stale-slot guard ends the segment after 10 minutes with `lockf` on the slot and no holder.
- **`hold`, two load failures before it passed.**
  - Attempt 1, 19:16–19:27: the first build of this head started from an empty StateProof
    folder. It did not finish inside the 600 s that `verify-write-state.py:95` gives its
    `swift build` (load 42 → 71.7).
  - Attempt 2, 19:31–19:41: the same limit stopped it at build step 142 of 172 (load 53.0 → 19.5).
  - No test ran in either attempt. Both are kept apart in `hold-load-timeout-b1a514f7/`.
  - The coordinator's ruling (19:45): run `state` first, which builds the same folder under
    `STATE_PACKAGE_TIMEOUT=3600`, then `hold` on the built folder. `hold` then passed,
    19:51–19:59.
- **Segment E stopped in `root`, 22:45.** `root` held the Swift slot while it waited on another
  process's `pnpm check` lock, and the Mac worker's diagnostic was queued behind it. I stopped it
  by hand. `root` passed later, on 93e82aaa.
- **The Mac worker's runs between gates.** By the coordinator's leave, the Mac worker used the slot
  between my gates:
  - the diagnostic, about 40 minutes;
  - the red control that found fb7581d5's hole (queued behind `sign-out-stream`, 23:13);
  - the proof runs of cf03a44e and 7f194391, 23:35 to 00:22.
  I stopped segments F (23:34) and G (23:57) by hand before their next gate. No gate waited in the
  queue behind those runs. Each later segment started only after the slot had been empty for 3
  minutes. Segment H never ran a gate; I stopped it at 00:22 for the merge.
- **The load window, 01:00 to 01:07.**
  - About 01:00, the Electron worker's pin renewal took the Swift slot for Discovery's Swift step,
    a `swift test` of about 6 minutes. Two recipe runners and several test runs were going at the
    same time. The 1-minute load reached 72 to 83.
  - `unsigned` (00:45–01:02) ran into that window: load 7.6 → 29.0, with a 5-minute average of
    37.4 at its end. It is an unsigned Release `xcodebuild` of the Mac app with no timed
    assertion. Load could only have pushed it toward its time limit, and it finished well inside
    it, so its pass does not depend on timing.
  - The runner then waited for the slot before `idle`. I stopped it by hand at 01:07:21.
  - I added a load guard (`SEGMENT_MAX_LOAD`): a gate starts only when the slot is free and the
    1-minute load is under the limit, both at the same moment.
  - Segment J started at 01:09:51, after 120 s under 20. `idle` began at load 6.1. The coordinator
    had asked the other workers to stop starting runs.

## Follow-up 106

A gate's time limit must not cover a cold build or a wait in the slot's queue. Two places do
today:
- `verify-client-diagnostics/scripts/verify.py:37` (`race`; its 2026-11-16 load failure waited in
  the queue);
- `apps/macos/scripts/verify-write-state.py:95` (`hold`'s 600 s for `swift build`; both attempts
  above).

The fix belongs with the next verification change. The build should be bounded on its own, or
excluded from the gate's limit.

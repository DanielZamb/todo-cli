# Candidate 15: candidate 14 with the CLI fixes and follow-up 90

2026-11-16, Claude Opus 5.5 (INTEG-STEP2), branch `integ/c15` from candidate
14 (f8cad9ef, `mac-c13`). **Final head 33c7e3c51265e23d38d381b6f97f4ea06c7b032b; gate cycle PASS, 20 gates.** Not pushed. `fix/cli-typed-time-zone`, `mac-c13` and
`integ/step2` are unchanged.

## For the owner: what changes in the CLI

- A `due:` label shows the date in the Task's own zone: 21:00 in Bogotá is no longer labelled the next day.
- A time you type for `--due` or `--scheduled` means that time on your Mac and is saved with your zone. A time with an offset or `Z` keeps its exact moment.
- A typed local time that a daylight-saving change skips or repeats is refused, and the message gives the exact times that exist, ready to paste.
- The weekly review lists a Task due today under Scheduled. This week is today through six days ahead, the same week `export --scope weekly` uses.
- The daily review lists a Task that is overdue and also scheduled today once, under Overdue.
- With `--require-server`, a time the CLI cannot read now exits 2 (`invalid_args`) before any server is asked, where it exited 1 (`server_command_unsupported`).

## The merges

| Commit | What |
| --- | --- |
| 1f7cc102 | Merge `fix/cli-typed-time-zone` at dea19a71 (Q10, follow-ups 86 and 88; server seat PASS, MERGE: SAFE). |
| 7535dcfd | Merge `mac-test-summary-line` at b0df5817 (follow-up 90; verification scripts only). |
| 18ee2d98 | Dependency renewal at 7535dcfd. |
| f8d0cb4a | This report's first version. |
| 532cd40f | Merge `mac-build-stamp` at 979a6426 (follow-up 91: a build folder made from another source tree is removed before a build). |
| 8067b976 | The owner-active override for one dated day (Q15; runner only, verification). |
| 1416d5b4 | Merge `mac-c13` at 4121de2f (follow-ups 94 and 95: MAC-C11-S1-19 and S1-18). |
| 33c7e3c5 | Merge `mac-c13` at c95cb5dd (follow-up 94's grace). **The candidate.** |
| (this commit) | This report, with the cycle. |

**1f7cc102, per file.** The two sides' common base is e01c1554. Of 1,602
files, 1,557 are the same on both parents. 27 are candidate 14's, and
`fix/cli-typed-time-zone` did not change them. 16 are the CLI branch's, and
candidate 14 did not change them. Three mapping files changed on both sides:
- `verify-dag-formal/public-coverage.json` and
  `verify-task-search-formal/coverage.json` keep every record of both sides
  (`macLineClientReviews` 6 → 8, plus `q10DueZone`, `fu86fu88` and
  `seatF1F2`; `renewalReviews` 12 → 17). Each files row takes the one side
  that changed it. No row was changed on both.
- `verify-dag-formal/public-pin.json` takes the CLI branch's commit
  (7fb9e005) and its three records. Candidate 14 had changed only its commit
  (9ea0c66a). Both pins move to the merge head in 18ee2d98.

**7535dcfd.** `mac-test-summary-line` branches from f8cad9ef. Its seven files
are the only ones it changes, and the first merge changed none of them
(1,603 files: seven from b0df5817, every other one 1f7cc102's).

## Each seat's sources: one parent's, by a diff you can check

- **Mac sources** are candidate 14's. `git diff f8cad9ef 18ee2d98 --
  apps/macos` shows only follow-up 90's three runner scripts
  (`state_package.py`, `verify-design.py`, `verify-write-state.py`). Those
  are byte-identical to b0df5817.
- **Server, CLI, domain, Electron and `scripts/`** are the CLI branch's:
  `git diff dea19a71 18ee2d98 -- packages apps/server apps/cli apps/electron
  scripts` is empty. Candidate 14 changed none of them since e01c1554.
- **Follow-up 90's files** are b0df5817's: `gates.py`,
  `verify-test-summary.py`, `check-swift.ts`, the verify-macos SKILL.md and
  the three runner scripts.
- **Everything else** in the head that is not candidate 14's is mapping
  records (the four Dependency files, the Task search coverage, the cache
  coverage) and two reports under `docs/decisions/ui-speed`.

A seat's verdict on candidate 14 carries to the Mac sources, and the server
seat's PASS on dea19a71 carries to the server, CLI and domain sources. What is
new to review is the merge of the mapping records and follow-up 90, which no
seat has reviewed yet.

## Checks on the merged head

- **Follow-up 90's control** (`verify-test-summary.py`) on 7535dcfd passes.
  Plain `swift test` on a test that calls `exit(0)` exits 0 with no summary
  line. `state_package.py` exits 7 on that run. A passing test exits 0.
  Load 4.7 → 2.8.
- **The full state package through the new path** passes: the same command
  `gates.py` runs, through `swift-slot`, with the Keychain guard receipt.
  394 tests in 80 suites passed, with the summary line. `keychainLinked`
  false. Load 2.9 → 2.3.
- **The Mac app** compiles unsigned (`xcodebuild`, Release,
  `CODE_SIGNING_ALLOWED=NO`): BUILD SUCCEEDED, load 3.1 → 3.2. The tests
  compile in the state package run above.
- **Task search formal** (`check.ts`), **cache** (`check.mjs`,
  generated-Xyf31r) and **hygiene** (hygiene-Rf17Sv) pass on 7535dcfd with
  no renewal, under the reference profile. No mapped hash moved in either
  merge. Load 2.5 → 6.7.
- **Dependency.** Both pins move to 7535dcfd and no row hash moves. Full
  default under the reference profile with the ps proxy: CONFORMANCE
  CHECKPOINT PASS (check-qkfPoe). 36 production controls broken 1 and
  restored 0 (conformance-Xcah7Z). 53 public mutants exit 1 and restore 0
  (public-960O2C). Clean recheck 19,784 states. Load 2.5 → 3.5.
- **Discovery** (`prepare-inputs.ts`, then `check.ts`, at 18ee2d98) passes
  with no renewal: final merged discovery mapping, bounded safety and real
  C/D sensitivity (check-N0JMw5; Swift swift-eaz0Oo, Keychain false, live
  source unchanged). Its Swift runs go through follow-up 90's `check-swift.ts`
  and each ends with a summary line (the failed ones are the sensitivity
  controls). The first attempt stopped on Bun compile leftovers from the
  prepare step. They were quarantined with the skill's script, and the rerun
  used the same prepared inputs. Load 2.9 → 3.2.
- **Premise** at 18ee2d98: nothing in either Dependency pin's scopes differs
  from 7535dcfd. **Pin audit** with main's ledger (identical to main's):
  filesScanned 536, occurrences 957, match 138, drift 0, unknown 0, no
  problems, no unused ledger entries.

## Candidate 15 changed shape (after f8d0cb4a)

- **The superseded cycle.** The cycle on f8d0cb4a was stopped twice. The first time, the
  candidate 14 incremental-build finding meant the folders it had built in were reused from
  another tree; those 12 gates were set apart and the cycle restarted from empty folders. The
  second time, candidate 15 changed shape after 8 more gates. No gate was killed either time.
  Both sets were labelled and then deleted.
- **532cd40f, follow-up 91.** Two files conflicted with follow-up 90, both because each side added
  a new section in the same place: `state_package.py` and the verify-macos SKILL.md. Both sections
  are kept, and every line of both sides is in the merge. `gates.py`, `verify-design.py` and
  `verify-write-state.py` merged without a conflict.
  - Both controls pass: the mechanics, and the sequence 14803682 → 532cd40f. The sequence's
    unstamped folder was removed and built clean, and a second run at the same head kept it.
  - The full state package then passed through the stamp: it removed StateProof (built at
    f8d0cb4a, no stamp) and built clean. 394 tests in 80 suites passed, with the summary line,
    `keychainLinked` false.
- **8067b976, the owner-active override (Q15).** `owner_guard.py` holds the guard, unchanged by
  default.
  - `GATES_OWNER_ACTIVE_OK=<today's date>` skips only the one-minute idle wait. The wait while
    a Todo app is frontmost stays.
  - Every gate records `idle_at_start_s` and `idle_at_end_s` beside its loads.
  - Under the override, a gate that fails while the owner is active stops the cycle as
    OWNER-ACTIVE-RERUN-OWED.
  - Control: `verify-owner-guard.py` passes; a copy that honours any date fails "yesterday holds".
- **1416d5b4 and 33c7e3c5, follow-ups 94 and 95.** The 11 Mac files (sources and tests) are the
  fix's own; only the Task search coverage changed on both sides, and it keeps every record
  (18 renewal reviews). No mapped row moved, and no file in either Dependency pin's scope changed
  since 7535dcfd. Pin audit at 33c7e3c5 with main's ledger: filesScanned 539, occurrences 961,
  match 138, drift 0, unknown 0.

## The gate cycle on 33c7e3c5: PASS, 20 gates

- **How it ran.** The runner was `gates.py` at this head, run as a segment copy. The copy's
  changes are each marked SEGMENT; the copy, its diff and its patch are kept in
  `docs/evidence/mac-perf/c4/segment-receipts-33c7e3c5/`.
  - It stops at a gate boundary after 85 minutes (no background command reaches two hours).
  - It resumes the same evidence folder and skips only gates that passed on this head.
  - It starts a gate only when no other job holds or waits on the Swift slot.
  - It runs the day-dependent gates first. state, design and root run on the real clock; hold
    passed in segment A.
- **Settings.** `GATES_OWNER_ACTIVE_OK=2026-11-16` and `STATE_PACKAGE_TIMEOUT=3600`.
- **Segments.** A: 13:50–15:28. B: 15:36–16:37.
- **race.** It failed once, in segment A: exit 1 after 20.1 minutes. `verify.py`'s 1,200 s limit
  on its swift-slot command expired while two other worktrees held or queued the Swift slot. Load
  went 7.8 → 37.5 and the owner was not active. Under the load rule that is a load failure, not a
  finding. It is kept apart as `race-slot-timeout-33c7e3c5`, with a label, and it passed on its one
  rerun.

| Gate | Exit | Time | Minutes | Load start → end | Owner idle s, start → end |
| --- | --- | --- | --- | --- | --- |
| hold | 0 | 13:50–14:18 | 27.2 | 6.8 → 8.2 | 2398 → 4028 |
| sign-out-stream | 0 | 14:18–14:39 | 21.7 | 8.2 → 34.4 | 4031 → 5333 |
| stress | 0 | 14:39–15:08 | 28.3 | 32.5 → 7.8 | 5337 → 1369 |
| race (first attempt, apart) | 1 | 15:08–15:28 | 20.1 | 7.8 → 37.5 | 1372 → 2579 |
| race | 0 | 15:36 | 0.3 | 5.4 → 5.7 | 3058 → 3073 |
| state | 0 | 15:36–15:41 | 4.5 | 5.7 → 5.7 | 3075 → 3343 |
| design | 0 | 15:41–15:58 | 17.3 | 5.6 → 2.7 | 3344 → 295 |
| root | 0 | 15:58–16:01 | 3.0 | 2.7 → 4.0 | 297 → 475 |
| connections | 0 | 16:01 | 0.2 | 4.0 → 4.0 | 477 → 488 |
| sockets | 0 | 16:01 | 0.2 | 3.9 → 4.1 | 489 → 504 |
| restart | 0 | 16:01–16:02 | 0.2 | 4.1 → 4.0 | 505 → 515 |
| diagnostics | 0 | 16:02 | 0.8 | 4.0 → 3.8 | 517 → 564 |
| unsigned | 0 | 16:02–16:10 | 7.5 | 3.8 → 5.1 | 565 → 1015 |
| idle | 0 | 16:10–16:15 | 5.3 | 5.1 → 2.5 | 1017 → 1334 |
| subscribers | 0 | 16:15–16:16 | 0.6 | 2.5 → 2.5 | 1336 → 1369 |
| discovery-prepare | 0 | 16:16 | 0.6 | 2.5 → 3.5 | 1371 → 2 (owner active) |
| discovery-quarantine-temporaries | 0 | 16:16 | 0.0 | 3.4 → 3.4 | 4 → 0 (owner active) |
| discovery-formal | 0 | 16:16–16:26 | 9.9 | 3.4 → 4.1 | 0 → 3 (owner active) |
| task-search-formal | 0 | 16:26–16:30 | 3.2 | 4.1 → 7.5 | 0 → 0 (owner active) |
| dag-public | 0 | 16:30–16:37 | 7.3 | 7.2 → 3.5 | 1 → 102 (owner active) |
| doc-links | 0 | 16:37 | 0.0 | 3.5 → 3.5 | 104 → 105 |

- **The owner was active** during five gates: discovery-prepare, discovery-quarantine-temporaries,
  discovery-formal, task-search-formal and dag-public. All five passed, so no rerun is owed.
- **Every Swift run has its summary line** (follow-up 90's scan, `summary-lines.json`): 28 of 28
  files that ran Swift tests, none unfinished.
- **No Keychain.** `keychain_linked.anyLinked` is false in all 13 guard receipts, the Discovery
  build's among them.
- **Isolation.** Every Mac runner's binaries ran under the reference profile.
- **Nothing was signed, launched or pushed.**
- **Every Swift build folder was empty, or stamped for this head, when this head first built in
  it** (follow-up 91, its receipts):
  - StateProof: hold removed it ("changed: sourceTree", built at an earlier head) and built clean.
    state and design kept it, stamped for this head.
  - SignOutStreamProof: sign-out-stream removed it ("no stamp") and built clean.
  - `apps/macos/.build` (the release build of the client-diagnostics gates): stress removed it
    ("changed: sourceTree") and built clean. race, connections, sockets, restart, diagnostics,
    idle and subscribers kept it, stamped for this head.
  - MacCandidate1 (unsigned): absent before the gate (deleted at 10:50), so it was stamped and
    built empty.
  - Discovery: built in its own new folder (`swift-GdIkuo`), from sources archived at this head.
- **Root check** through the shared lock, with TMPDIR outside the repository: the system
  temporary folder, under `/var/folders`.

**Verification follow-up (time limits that count the queue).**
`.agents/skills/verify-client-diagnostics/scripts/verify.py:37` gives its Swift command a 1,200 s
limit (3,600 s for the retirement stress). That limit runs from the call, so it counts the time
spent waiting in `scripts/swift-slot.sh`'s `lockf` queue. The limit should start when the slot is
acquired: `swift-slot.sh` already prints `SWIFT-SLOT-ACQUIRED`, which could start the clock.
Unchanged in this cycle. Instead, each gate started only when no other job held or waited on the
slot.

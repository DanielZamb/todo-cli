# Candidate 15: candidate 14 with the CLI fixes and follow-up 90

2026-11-16, Claude Opus 5.5 (INTEG-STEP2), branch `integ/c15` from candidate
14 (f8cad9ef, `mac-c13`). Not pushed. `fix/cli-typed-time-zone`, `mac-c13` and
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
| (this commit) | This report. |

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

## Not yet run

The whole Mac gate cycle on this head waits for the coordinator's word that
MAC-PERF's cycle on f8cad9ef has ended.

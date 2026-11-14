# Todo CLI storage distillation, 2026-11-13

Twenty-five worktrees under `~/.t3/worktrees/todo-cli` grew from 25.5 GB to 99.6 GB in one day, mostly per-worktree `docs/evidence` and `.scratch` build output. This record keeps what the finished units learned before their worktrees are released. It follows the form of `STORAGE-DISTILLATION-2026-10-30.md`.

Nothing in Git is lost by releasing a worktree: every worktree shares one repository, so branches and commits stay. What goes is each worktree's ignored files: raw evidence, scratch databases, compiled binaries and dependency installs.

These are conclusions from the units' reports and reviews, not new acceptance claims for today's heads. The binding design is `CONTEXT.md`, `docs/adr/README.md` and the numbered ADRs.

## Source and ownership

| Worktree | Branch and head kept | State | Disposition |
| --- | --- | --- | --- |
| `t3-ad8ef4b4`, `review-task-dag-clients` | `feat/task-dag` e69230f9 (PR #13), `review/task-dag-clients-integration-20261110` 3d4bcda0 | Contained in the installed line | Release |
| `pr-auth-clock-main` | `fix/auth-clock-main` 665c4758 | Merged to main as PR #14 | Release |
| `perf-server-reads`, `fix-purge-restore`, `review-purge-restore-s1`, `review-server-reads-s1` | `integ/server` 2a840b55, `fix/purge-restore` 8292b067 | Installed in candidate 8 | Release |
| `perf-stream-wake`, `review-stream-wake-s1` | `integ/c9-server` 675aab82 | Installed in candidate 9 | Release |
| `fix-durable-denial` | `fix/durable-denial` 366398fe | Installed in candidate 9 | Release |
| `feat-cli-through-server`, `review-cli-route-s1` | `feat/cli-through-server` 062e242f | Merged into `integ/contract` | Release |
| `feat-diag-core`, `review-diag-core-s1` | `feat/diag-core` 2538e94b, `integ/contract` 8028628d | Passed both seats; step 2 parked | Push the branch, release |
| `feat-diag-electron`, `review-diag-electron-s1` | `feat/diag-electron` 18632759 | Passed its seat; joins in step 2 | Release |
| `feat-mac-verification-a`, `review-mac-verify-s1` | `feat/mac-verification-app` 71d80343, `review/mac-verify-s1` eceedba4 | Parked; never fully run | Push the branch, release |
| `exp-sync-experiment` | `exp/sync-experiment` de3f0897 | Experiment finished | Push the branch, release |
| `install-c6` to `install-c9` | detached at 8b9be429, f1c3def5, 20d592d3, c334462b | Installed builds of 11 to 13 November | Release |
| `fix-mac-responsiveness`, `review-mac-c1-s1` | `mac-c10-wip`, detached at its head | In use: candidate 10 and its review | Keep |

## What each unit built, proved and found

### Task Dependencies (`feat/task-dag`, PR #13)

Built: Dependencies between Tasks as a loop-free graph in the CLI, HTTP, Electron and SwiftUI, with migration 0007 and a formal mapping (`verify-dag-formal`: a model with 38 configurations, 36 production and 53 public controls that each fail when broken and pass when restored).

Found after it "passed": the owner used the signed Mac app and found it barely usable (freezes of up to 15 seconds, Offline after every idle minute). It had passed 872 offscreen captures and 159 model tests, and nobody had run the real app. Ten Mac candidates followed. The installed line contains this branch, so PR #13 closes when that line reaches main.

### Server reads, strict read scopes and three data fixes (`integ/server`)

Built: reads no longer decode the whole History. An authority is valid only inside the lease that created it, and each stream pass takes a fresh checked lease.

Defects fixed, all found by running the compiled CLI on scratch data:
- A Snapshot that held a tagged Task could not be restored after that Task was Purged. Copies were opened without foreign keys on, so a cascade never ran and the restore's own check refused.
- `todo rm <task> --force --dry-run` deleted the Task's copied images.
- `--dry-run` on `edit`, `done`, `cancel` and `reopen` performed the real change.

Decisions: `--force` is refused on commands that never read it; a Purge blocked by a checksum answers `invalid_snapshot` (exit 2).

Found late: two formal mappings still certified an older product after both seats had passed, because nobody listed them and they do not fail on a newer checkout. See the lessons on pins.

### Stream wake (`integ/c9-server`)

Built: a commit made by the server wakes its open streams at once. One `StreamWake` (a version, a waiter, a 250 ms fallback) and a store decorator that signals at a decorated member's outermost exit, outside any transaction. A typed table classifies every public store member as a read or a write, so a new member fails the typecheck until it is classified.

Proved: 3,696 compiled compositions, 31 committing writer cases that each go red when the write is reclassified as a read, a pass-rate test, raw-store guard tests, 37 stream scenarios byte-identical before and after.

Result: from a write to its delivery on a stream, about 115 ms before and about 1 ms after.

Found in review: a synchronous write member that throws after it committed must still signal; the pass state must be built from explicit fields, never by spreading the previous one.

A consequence nobody planned: a Profile deletion followed at once by a restore now reaches clients as two separate batches. That exposed a defect in the Mac client's stream loop (below).

### Durable repeated-refusal rule (`fix/durable-denial`)

Built: a repeated refused authentication attempt is recorded once per minute across processes, decided from History itself. The decision is a read first and, on absence, is made again inside the write that appends. No schema change, no process memory. Events over 4 KB are never loaded; one large entry in every 257 is sampled so large entries cannot hide the bound.

Found in review: the first size gate let large entries stop the walk from ending; a brief sentence that was too loose ("rows stamped later than the attempt are skipped") made a worker skip matches too. ADR-0007 carries the dated sentence, accepted by the owner on 2026-11-13.

### CLI routing, slice 1 (`feat/cli-through-server`)

Built: the groundwork for the CLI writing through the running server (ADR-0023, accepted 2026-11-13). The server publishes a private record beside the database; the database's physical identity comes from a kept descriptor; a guard file allows one server per database; the CLI sends one nudge after every writing command that reached the store. Nothing is routed yet.

Proved: three review rounds on the start-up window, a full run of the Dependency mapping on the merged product, CLI output byte-identical in 28 cases.

Result: a CLI write reaches an open app before the CLI exits; without the record it waits for the 250 ms timer.

### Recordings store (`feat/diag-core`)

Built: Diagnostics recordings of interactions in a separate private SQLite file, written by a worker, apart from the Task database. Refusals are decided from descriptors; advice to remove files is given only for what the store has established; machinery failures answer `check_unavailable`, `store_busy` or `initialization_busy` and never advise removal.

Proved over nine reviews, each finding a real schedule: initialization decided before exclusive ownership, expired samples revived by a reply, a refusal that changed the main file. Stream delivery costs nothing measurable with recording on.

### Recordings and CLI routing on one line (`integ/contract`)

Built: one merge of the two units, one new contract id, and one fix found by the merge itself. Routing recognized a newly opened descriptor by its number; the recordings worker opens and closes files on its own thread, so a number can be reused and a genuine store was refused (3 of 200 starts under churn). The rule now recognizes a new open by identity as well.

Both seats passed it on 2026-11-13. Step 2 (the Mac line, the regenerated Swift client, the Electron recorder, the app panels and uploaders, the Discovery renewal with its Swift step) is not started.

### Electron recorder (`feat/diag-electron`)

Built: an input-to-result recorder in the Electron app. Its seat passed it on 2026-11-11 with no open finding (47 compiled fault controls, 14 of 14 recipes, two replay arms of 306 operations). It sits on an older recordings head and joins in step 2.

### Mac verification app (`feat/mac-verification-app`)

Built so far: a separate verification app target with its own bundle id and an in-memory Session store, so the real app can be driven without the Keychain. It is frozen on candidate 8, its full headless run has never been done, and its seat's re-check is owed. Resuming it means merging the current Mac line first.

### Sync experiment (`exp/sync-experiment`)

Measured the open choices of a Patch protocol on small samples: polling the database's data version every 10 to 50 ms delivers an external commit in 9 to 29 ms; watching the write-ahead log directly took 857 ms and was rejected; a loopback hint took 3 ms. That is why the wake and the nudge were built. Its correctness run also found the Snapshot restore defect above. Its report is on the branch.

### Installs

Candidates 6 to 9 were installed from clean detached checkouts with the same procedure: both apps closed and never killed, the database backed up by the script, the installed build checked by `scripts/check-installed.sh`, the copied signing file removed. The owner used candidate 9 for 28 minutes: "felt much better in time to interaction, and no beachballs" (median 119 ms per action against 179 on candidate 8).

### Still in use: the Mac line

Candidate 10 (`mac-c10-wip`) and its review are running. Its review found a defect that is also in the installed candidate 9: after a Profile is deleted and restored back to back, the Mac app's stream loop ends without a reconnect while the window still says live. The fix is in progress.

## Open follow-ups

Tasks in the `own-work` Profile, project `todo-cli`, external ids `ui-speed-followup-NN`.

| NN | Task id | What |
| --- | --- | --- |
| 51 | 6e54f163 | Mac: after a Profile is deleted and restored back to back, the app stops following changes (P1, fix in progress) |
| 07 | 2ea2a876 | A write decodes every Task to find one |
| 11 | 3626fa7a | Electron: one full refresh per event |
| 12 | 0fdaa73b | `Diagnostics.read` runs under a write lease |
| 28 | cbc4d692 | A repeated refusal walks recent History on the server's thread |
| 31 | 30f9e08c | Each stream pass holds the write lock |
| 39 | 7967d8f6 | Mac: one full refresh per stream operation |
| 42 | efed2b9b | A write's reply should carry its operation's seq |
| 43 | bde4ef69 | Without a routing record a CLI write waits for the 250 ms timer |
| 47 | c88fc392 | CLI import of 2,000 items reports an expired Session that is valid |
| 33 | efb23a7a | Electron: the Profile-return rule the Mac app has |
| 34 to 38 | 4f3ac1c8, 99d8d09e, 1f58e61d, 3649a74a, 66fb30cf | Mac candidate 10 items, done when it is installed |
| 08 | 4b52fc9a | `snapshot restore --dry-run` passes a damaged Snapshot |
| 17 | 74d4270e | Port the Snapshot, Purge and dry-run fixes to main (done by merging the installed line) |
| 01, 09, 10, 14, 15, 16, 18, 19, 29, 30, 32, 44, 48, 49 | a2342ac7, 0113668b, dc6ec076, ebb0dffe, d79db0c6, 4ac8ab53, 0138bea2, cfcf2d50, ea13ac80, bc1a7be8, 9b7e0577, 5f1b14ee, 154a54a2, ce9d78ee | Smaller items; each Task says what and where it was found |

## Lessons for future workers

**Evidence and disk**
- Do not copy `docs/evidence` into a new worktree. Carried receipts are history, never inputs. A check that needs an old input names that one file.
- Compiled binaries (about 90 MB each) are the real cost of a test run. Delete your own after each batch. The hidden `.bun-build` leftovers are clones and return nothing.
- Release a worker's worktree when its branch is merged, and a review worktree when its report is delivered.

**Proof**
- Captures and state tests do not show that an app is usable. Say for each item which of "looks right in a capture", "logic passes" and "used for real" has been shown.
- Rank performance work from the owner's real sessions in the app's journal, not from one symptom.
- A reviewer's premise can be wrong. One fix was specified around a hook that "every button passes"; 30 of 190 did. Check the premise before building on it.
- Paste hashes from a command's output. A hash typed from memory was wrong after its tenth character.

**Pins and formal mappings**
- Before accepting any unit, audit every file under `.agents/skills/verify-*` that pins a product path, not only `coverage.json`. Six Swift fences stayed stale through several candidates because each audit read one file.
- A check that builds its candidate from a pinned commit does not see later changes. Assert that nothing in the pin's scopes differs from the pin's commit before the check runs.
- Merge these lines with a merge commit. Pins name commits; a squash or rebase leaves them unreachable.

**Concurrency and long-lived tasks**
- A task that keeps a client current (a stream loop, a refresh) must never end silently. Each exit is a hand-over to a named successor, a reconnect, or a cancellation by its owner, and a test fails when a new exit appears.
- Identity is not a number. A file descriptor number is reused; a process, a thread or a second server in the same process can change what a number names.
- A rule stated loosely in a brief is implemented loosely. State what is skipped and what is not.

**Isolation**
- Every compiled Todo binary runs under the reference sandbox profile after its five controls, run with node. bun reports a sandbox denial as a refused connection, which looks like nothing listening. An allow rule for localhost once opened all outbound networking.
- The root check needs `TMPDIR` outside the repository.

**The CLI as a filing tool**
- A title that begins with a dash is read as a flag. `done` needs `--expected-version` from the add's reply. Pass `--external-id` so a rerun cannot create a duplicate.

## Raw evidence kept, and what is given up

Kept, in `.storage-preserved/2026-11-13/` of the canonical checkout (ignored by Git, 93 MB): the baseline CLI binary that the Dependency mapping's checks take as their "before" input (product e7170510, SHA-256 `dd1918fc…`), its provenance record, and the model checker's jar (SHA-256 `936a2620…`). Step 2 and every later renewal need these, and the baseline is not rebuilt by any script in one step.

Kept already, outside the worktrees: the two run stores under `.orchestrator/runs/` hold every brief, every seat's report with its probes, and the decision logs. The units' own reports are tracked under `docs/decisions/`.

Given up: every other ignored file in the released worktrees. That is compiled binaries, scratch databases, dependency installs, Swift build folders, and the raw output of test runs whose results are in the reports above. A test run can be repeated from its commit; its exact bytes cannot.

## Results, and what closed the same day

Released with `git worktree remove` (no `--force`), each rechecked clean, on a branch and unused, then `git worktree prune`: the 23 worktrees marked Release or Push above. Every branch is kept, and `integ/contract`, `feat/mac-verification-app` and `exp/sync-experiment` were pushed first. Kept: the Mac line's worktree and its review's. Free space went from 69.2 GiB to 106.4 GiB.

Later on 2026-11-13:
- The stream-loop defect was fixed and candidate 10 (`81387de3`) was installed after its correctness review passed. The delete-then-restore schedule that left 26 of 80 clients not following on candidate 9 leaves 0 of 80. Follow-ups 34 to 38 and 51 are done. One rare residual is open as follow-up 53 (Task 2c3e16c4): about once in 600 plain Profile deletions the Mac app does not leave the deleted Profile; cause unknown.
- The owner accepted ADR-0023 and the dated sentence in ADR-0007.
- A design for one read that returns counts, groups, one sort order and the History position it reflects (the Catalog) was built on `feat/catalog-contract` and is in review. It found that Today and Overdue use the UTC date, against ADR-0006: follow-up 52 (Task f091d2e8).


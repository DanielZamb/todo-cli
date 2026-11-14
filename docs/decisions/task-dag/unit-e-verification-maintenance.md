# Electron verification maintenance checkpoint

This is a verification-only checkpoint on `feat/task-dag-e-electron`, following
`868db38c0c56985d9b0a3cb7a1e6d9423c27a18e`. It excludes Electron UI WIP, shared
canonical resources, dependency changes and product changes. No domain files
were added. It is not final DAG delivery or either review seat's acceptance.

The durable local index is
`docs/evidence/task-dag/unit-e/baseline-classification/classification-index.json`.
Generation checked every referenced file exists inside the owned evidence tree.
It retains exact argv/exits, source hashes, source-purity/pin receipts and selected
before/after captures. The product subjects are clean exports of main
`cabf4866835a49f23dc0fe44694740f122855e33`, integration
`2c78a3263c196d870459b17bf647cfc23f421fdd` and E
`868db38c0c56985d9b0a3cb7a1e6d9423c27a18e`. Installed dependency reuse points all
workspace packages inside each export. Main's 237 product paths match main.
The original fourteen recipes retain all 663 assertion/scenario calls under the
explicit generic overlay. No branch switch or extra worktree was used.

PR #10 intentionally added these exit pairs. The maintained literals are:

| Git path | Original literal | Maintained literal | Product commit |
| --- | --- | --- | --- |
| `apps/electron/scripts/verify-attachment-batch-offscreen.ts` | `Task changed. Read its current Version and retry.` | Original plus newline `error 4 - Conflict`, in both occurrence and cleared-state assertions | `75052d51f52d04b3c44e128d88be2540cdfef0f5` |
| `apps/electron/scripts/verify-batch-edit-offscreen.ts` | `Conflict · Version 2. Reload Tasks.` | Original plus newline `error 4 - Conflict`, in both occurrence and cleared-state assertions | `75052d51f52d04b3c44e128d88be2540cdfef0f5` |
| `apps/electron/scripts/verify-transfer-regressions.ts` | `"Personal" already has a Task with external id "c11:move-clash". Choose another Profile.` | Original plus newline `error 2 - validation or usage` | `e5e11bcbc37354c6c82999eebeef4fcda7e3b614` |
| `apps/electron/scripts/verify-writes.ts` | `validation` | Original plus newline `error 2 - validation or usage` | `e5e11bcbc37354c6c82999eebeef4fcda7e3b614` |

The index maps each row to retained before/after files and the exact product
hunks. Original Attachment batch and batch-edit both exit 1 on all three subjects;
the maintained E recipes exit 0 through Reload and unchanged-result assertions.
Main and integration original Move assertions exit 1 with the approved human
copy and pair. Maintained main passes Move and generic 422 assertions. These are
verification maintenance results, not original-main passes. Full-window batch
captures show the pair. The Compact batch-edit captures clip its second line at
the footer; that limit was reported to the coordinator. The generic 422 after
screenshots caught a blank closing-dialog frame; its actual DOM assertion passed,
and its retained before-failure capture shows the same unchanged product copy.
No visual proof is inferred from that blank frame.

The clean-main full aggregate command was the guarded
`bun apps/electron/scripts/verify-design-all.ts .scratch/main-full-14-corrected`
with explicit existing Chromium and source-pinned cached binaries. Actual exit 1:
nine PASS, three FAIL, two MISSING, native HOLD. Its original Attachment/batch
failures are stale copy. The host-writes run first stopped at Compact sizing.
Three isolated original runs passed sizing and stopped at stale Move copy. A
later maintained run exposed sizing again. Those historical failures remain.

An observation-only main timeline proved a verification precondition race:
`isVisible()` returned false after Expand, no Compact request was sent and no
resize was called, then the recipe waited for an unrequested size. The shared
`requestCompact` now awaits visibility, fails with `Compact control not visible`
if absent and clicks once. The original 393×426 and 5,000 ms predicate are unchanged.
The corrected isolated step passed 30/30, with exactly 30 delivered requests and
30 content-size calls. The forced-absent control exits 1 at about 1,001 ms with no
request/resize. No product, visibility or deadline change was made.

`verify-presentation-correctness.ts` uses that same helper and retains its later
shell-class assertion. Transfer setup awaits its mode control and verifies
expanded/light postconditions. `verify-task-filters.ts` retains its idempotent
calendar condition and awaits the open calendar before reading geometry.
`conditional-actions-current.json` lists reviewed sites and reasons. Import-dev,
native verify and appearance branches remain unchanged.

The maintained ordinary main host drive remains exit 1 at the existing Import
regression: `apps/electron/scripts/verify-import.ts:129` expects at least four
whole rows and receives three; line 130 expects zero partial rows and receives
one. Summary height is 16, within its unchanged 18 maximum. Owner Task `5cdbdbd6`
owns this main product issue. Both assertions and product geometry remain intact.
Final E equivalence is pending; no whole-suite success is claimed.

The ONE permitted scratch diagnostic continuation exited 1 before Import at the
immediate Series Skip Retry status assertion. It recorded zero Import failures
and proves nothing beyond Import. In the separately authorized quiet loop, the
original assertion passed 10/10, with 1,000/1,000 authoritative samples cancelled
and twenty IPC/HTTP request/reply records. Outcome (iii) is accepted: intermittent
one prior occurrence, not reproduced in ten isolated observations. Skip/Retry
logic is unchanged by E; enclosing Dependency files differ and their diffs are
retained. No product or completion wait was changed.

Future failures of that original immediate assertion add a message containing
the stable original Occurrence id, Retry HTTP status/body and timestamped server
samples every 50 ms for five seconds. Sampling runs only in the catch branch;
the existing proxy passively snapshots Skip replies. A deterministic formatter
control exits 0, checks all 100 samples and the actual supplied status/body.
No extra native run was used to trigger this diagnostic. Electron typecheck exits
0. These checks are additional to the retained native loop, not a full driver pass.

The earlier Diagnostics timeout was a harness wrong-entry defect. The accepted
`868db38c` preflight resolves emitted paths and checks entry/runtime before spawn,
without the Electron auto-downloader. Three corrected clean-main runs exit
0/0/0 at the original 60,000 ms deadline; monotonic launches were 392.451,
163.933 and 175.553 ms. No benchmark or startup regression is claimed. Diagnostics
keeps its visible window; existing background recipes stay hidden. The owner modal,
three broken runs, downloaded 44.9.3 runtime manifest and hashes remain recorded.

Immediate Vite compiler guards were added separately from literal maintenance in
`verify-attachment-batch-offscreen.ts`, `verify-batch-edit-offscreen.ts` and
`verify-discovery-offscreen.ts`. The upcoming silent-success guard correction is
a separate checkpoint; this commit does not claim to fix that stream defect.

Owned hosts/servers from the bounded loops are absent, with no manual signals.
The latest Series host/server were 78557/78556. Scratch HOMEs/databases were
removed by owned finalizers. Exports and source-pinned caches remain for ongoing
unit verification. Nine owned hidden Bun temporaries, 797,947,776 bytes total,
were checked for open files and retired in earlier batches; their receipts remain.
Disk was 129.7 GB free for the Series loop. No unowned process/file was changed.
The permitted local no-comments audit found no new comments or suppressions.

The full final Electron aggregate, full Mac suite and exact baseline comparison,
final root check, complete DAG matrix, final-source provenance and both review
seats remain pending. Native safeStorage, Session restoration, clipboard,
VoiceOver/key dispatch and signed/native Todo remain outside this proof.

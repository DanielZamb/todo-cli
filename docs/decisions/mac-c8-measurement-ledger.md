# Candidate 8 measurement ledger: row frames, the picker, list decoding

Ordered by the coordinator on 2026-11-12. The measurement comes before any
product change in (c).

Source: the owner's session on candidate 5, read from the client journal by the
coordinator (report "owner-session-20261111-night" in the coordinator's run). In
it, 71 stalls (40 s) had no recorded event nearby
and the picker took 1,976 ms to open. This note plans how to find out which
suspect carries that time. It changes no product code.

## The suspects, read in code at b882483b

1. **Row frames.** Every Task list row publishes its global frame through a
   `GeometryReader` and a dictionary preference (`compactBounds("row-<id>")`,
   [AppViews.swift:845](../../apps/macos/Sources/AppViews.swift)). It does so in
   full mode too. `WholeTaskRows` reads the frames only when Compact and the All
   view are both on, and it returns early otherwise. SwiftUI still computes every
   row's global frame and merges the dictionary on each geometry change: every
   scroll frame, and every layout after a refresh.
2. **Picker candidate frames.** Each candidate in the Dependency picker
   publishes its frame in the same way (`compactBounds("dependency-choice-<id>")`,
   [DependencyViews.swift](../../apps/macos/Sources/DependencyViews.swift)).
3. **Picker eager stack.** The candidates sit in a plain `VStack` inside a
   `ScrollView`, so all of them are built and laid out when the picker opens.
   Each row is a full `TaskRow`, with a linear lookup of the Project in
   `model.projects` and resolution of its Tags.
   - `picker.rows` costs O(linked × candidates) and is evaluated more than once
     per body.
   - `checked` is a linear scan, called up to three times per row.
4. **Picker reads.**
   - Opening the picker issues `tasks.show` for the root, then one sequential
     `tasks.show` per linked Task, then a full `tasks.list` for the Profile. The
     list is requested even with empty search text, although the model already
     holds that catalog.
   - Every toggle repeats the whole reload, then `refreshAfterWrite` runs a full
     catalog refresh (about 8 reads). The stream echo of the write then triggers
     one more refresh.
5. **Main-actor decoding.** `searchDependencyCandidates` and the catalog
   refresh decode `tasks.list` replies with `TaskSnapshot.decode` on the main
   actor. At 178 Tasks, the descriptions total 222,312 characters.

## Method

### Harness and fixture

- **Harness.** The selection-press harness (`run.py --selection-press`, branch
  `mac-perf-harness-tip`):
  - a real `NSApplication` event loop with a visible key window;
  - the production model and views, built in Release;
  - a compiled scratch server behind the recording proxy;
  - the client Diagnostics recorder on;
  - no Todo.app, no Keychain (the SessionVault traps).
- **Fixture.** The owner fixture (`--owner-fixture`): the `work` Profile with
  178 Tasks (50 open, 126 done, 2 cancelled), 6 Projects, 39 Tags and 108
  Attachments, with the owner's description sizes. The `personal` Profile holds
  a root that depends on four Tasks, used for the picker.
- **View.** All, full window, 1440 × 900 pt. The list shows 178 rows. The
  Compact All case uses `--active-layout compact`.

### Variants

Variants are source patches applied only to the harness's copy of the sources
under `.scratch/mac-perf`; the product tree is never changed. One patch per
suspect, so each row below isolates one change:

| Variant | Change in the copy |
| --- | --- |
| `frames-off` | `compactBounds("row-<id>")` publishes only when `WholeTaskRows` is enabled (Compact and All). This is the candidate fix, not removal. |
| `picker-frames-off` | Candidates publish no frame outside the design harness. |
| `picker-lazy` | `LazyVStack` for the candidates. |
| `picker-rows-cached` | `rows` and `checked` computed once per picker change, with a `Set` of linked ids and a dictionary of Project names. |
| `picker-one-read` | Linked Tasks and candidates come from one `tasks.list` reply, or from the model's catalog when the text is empty and the catalog is current. A missing linked Task falls back to `tasks.show`. A toggle updates the root from its write reply and reloads no candidates. |
| `decode-off-main` | `tasks.list` replies are decoded in a detached task; only the publication runs on the main actor. |

### Repetition

- For each case: the baseline and its variant, alternated in forward and
  reverse order.
- Five sessions per cell, each with a fresh scratch HOME, server and database.
- Load is recorded at the start and throughout, with `--max-start-load 0` as
  before. A busy host is a workload dimension, not a reason to discard a run.

### Instruments

These are added to the harness copy only:

- **Main-thread time per frame.** A run-loop observer records the main
  thread's busy time between `afterWaiting` and `beforeWaiting`. Main-thread
  CPU comes from `thread_info`.
- **Body counts.** One atomic counter each in `TaskRow.body`, the list body and
  the picker body.
- **Stalls.** The recorder's `ui.stall` records, with candidate 8's attribution
  and `ui.observed` once that work lands. Before it lands, stalls are counted
  only.

## Ledger

- **"Should move"** is the expected effect if the suspect carries the time.
- **"Rejected if"** is the threshold below which the suspect is not the cause.

| # | Measurement (owner fixture, 178 rows) | Baseline vs variant | Numbers recorded | Should move | Rejected if | What the owner's journal should show after a fix |
| --- | --- | --- | --- | --- | --- | --- |
| i | **Scroll the list.** 600 posted scroll-wheel events at 60 a second (10 s), top to bottom and back, in full mode. | b882483b vs `frames-off` | Main-thread busy ms per run-loop turn (p50, p90, p99, max); turns over 16 ms and over 100 ms; `ui.stall` count and total; `TaskRow.body` and list body counts per second of scrolling; frame preference merges (reduce calls) | Busy time per turn and turns over 16 ms fall clearly. Stalls during scrolling fall to near 0. Row body counts are unchanged, because the frames do not invalidate rows; if they do change, that is a finding. | p50 busy time per turn moves less than 10%, and stalls do not fall | `ui.stall` records that have scroll events in their `ui.observed` window become rare. Stalls with no event (71, 40 s) shrink by the part scrolling explains. A stall's "in" label no longer names SwiftUI preference or geometry frames. |
| i-c | The same scroll in **Compact All**. | b882483b vs `frames-off` | As in i, plus Compact bounds receipts and captures | Nothing: the frames stay there | Any change in bounds receipts or captures, which blocks the fix | Compact All looks and behaves the same: whole rows only, no cut row |
| ii | **Apply a refresh.** A CLI edit on another Task arrives on the stream; the catalog refresh publishes. Twenty times. | b882483b vs `frames-off` | Publication to layout (ms, p50 and p90); main-thread busy ms from publication to layout; `TaskRow.body` count per refresh | Publication to layout falls; body count unchanged | Publication to layout moves less than 10% | Refresh-triggered actions (Add from quick-add, Toggle a Dependency, view and filter changes) show a smaller "Publication to layout". The 62 refreshes (median 393 ms) show less main-thread time after `refresh.finished`. |
| ii-3 | **The same refresh with three rows**: the owner's candidate 6 sample. A row click in a three-row list took 233 ms after release: release to handler 74 ms, handler 26 ms, publication to layout 132 ms, hold 111 ms. | b882483b vs `frames-off`, three-row Profile | As in ii | Nothing much. If publication to layout stays near 130 ms with three rows, the row frames are not what that phase pays for in that case. | — (a control: it keeps the row-frame suspect from being credited with time it does not carry) | Unchanged by a row-frame fix. Recorded so a fix is credited only with what row ii minus row ii-3 shows. |
| iii | **Open the picker** on the `personal` root with four linked Tasks. Twenty opens. | b882483b vs `picker-frames-off`, vs `picker-lazy`, vs `picker-rows-cached`, and the three together | Publication to layout (ms); picker body count; candidates built (row bodies); main-thread busy ms | Publication to layout falls from the owner's 1,301 ms scale. Each variant's share is reported separately. | A variant moves publication to layout less than 10%, which rejects that variant | "Open the Dependency picker" falls from a median of 1,976 ms. Its "Publication to layout" phase falls from 1,301 ms. |
| iii-a | Accessibility and keyboard traversal of the picker with `picker-lazy`. | b882483b vs `picker-lazy` | Rows reachable by Tab and by VoiceOver rotor in the harness accessibility tree; focus moved by arrow keys | Must not move | Any loss, which goes to the Opus Mac UI seat before it is adopted | No change for the person |
| iv | **One toggle** (add, then remove) on the same root. Twenty toggles. | b882483b vs `picker-one-read` | Requests by operation (`tasks.depend`, `tasks.undepend`, `tasks.show`, `tasks.list`, catalog reads) and their total ms; handler ms (start to publication); refreshes triggered (own write and stream echo) | Requests per toggle fall from 1 write + (1 + 4) shows + 1 list + about 8 refresh reads + the echo's refresh, to 1 write + at most 1 read. Handler time falls with them. | Handler time moves less than 10% | "Toggle a Dependency" falls from a median of 1,152 ms and p90 of 4,710 ms. Its handler (951 ms) and requests (661 ms) fall, with fewer `request.started` records under the toggle's action id. |
| v | **Decode the list reply.** Picker open with search text (one `tasks.list` of 178 Tasks), and the catalog refresh. | b882483b vs `decode-off-main` | `decode.finished` durations (already journalled); main-thread busy ms during decode; publication to layout | Main-thread time during decode falls to near 0; total decode time about unchanged | Main-thread decode time under 10 ms at p50: decoding is not the cause | `decode.finished` stays, but the stalls that coincide with replies (135 of 206, about 64 s) and that "reply" or "decode" records explain become rarer |
| v-3 | **Decode with three rows**: picker open and catalog refresh in a three-row Profile. | b882483b vs `decode-off-main` | As in v | Decode time near 0 in both arms | — (a control for row v's share) | None |

### Added from the owner's candidate 6 session (coordinator, 2026-11-12)

Publication to layout was 132 ms with three rows, so for selection the list's size is not the cost. Measured release-based in the owner's session:

- Open Dependencies: 768 ms after release (handler 371 ms with a 47 ms request; publication to layout 373 ms).
- Apply filters: 649 ms.
- Project filter: 726 ms.
- View change: 631 ms.

| # | Measurement | Baseline vs variant | Numbers recorded | Should move | Rejected if | What the owner's journal should show after a fix |
| --- | --- | --- | --- | --- | --- | --- |
| vi | **What a selection invalidates outside the list.** Select a row in three-row and 178-row Profiles, twenty times each. | b882483b vs, in the harness copy only: the inspector replaced by an empty view of the same size; then the inspector kept but the sidebar and toolbar bodies counted | Publication to layout (ms); body counts per selection for the inspector, editor sections, sidebar, toolbar and the list; main-thread busy ms | Publication to layout follows the inspector and whatever else a selection invalidates, not the row count | The three-row and 178-row cases differ by less than 10% and the empty inspector moves it less than 10%: then neither is the cause, and the next suspect is named from the body counts | "Select a Task" publication to layout falls from 132 ms at three rows |
| vii | **Open Dependencies, the filters and a view change.** Twenty each, on the owner fixture. | b882483b vs the row-frame and decode variants above | Handler, requests (count and total ms), publication to layout | Each phase's share, as for the picker | — (attribution only) | Open Dependencies falls from 768 ms (handler 371 ms, publication to layout 373 ms); filters from about 650–730 ms; view change from 631 ms |

## Reporting

- **For each row:** the medians and spread for both arms, five sessions each,
  with load. Also the share of the owner's lost time the row can explain at the
  owner's rates: 17 toggles, 5 picker opens, 62 refreshes and 206 stalls in
  161 minutes.
- **Ranking.** The suspects are ranked by measured time removed. Only the
  suspects that carry the time become product changes, each with its own
  failing-first control.
- **Two cautions.**
  - The frames exist for Compact All, where they keep whole rows only. The fix
    is to publish them only where they are used, and row i-c proves Compact All
    unchanged.
  - A lazy stack changes what accessibility and keyboard traversal can reach.
    Row iii-a goes to the Opus Mac UI seat before it is adopted.
- **Order.** These runs use the Swift slot. They start after the seat reports
  on b882483b and after the stall attribution Swift work has had its short
  runs.

## Result: the cost of stall attribution on selection (approved run b, 2026-11-12)

Accepted by the coordinator as measured: stall attribution costs a selection
nothing this run can resolve.

The candidate 8 head e484efc6 against the same head with the stall
attribution, observed events and both link-register commits reverted
(`measure/c8-observation-off`, 0ed0c30d, measurement only). Command:
`run.py <evidence> --selection-press --selection-variant offscreen --ref e484efc6
--ref measure/c8-observation-off --runs 5 --owner-fixture --owner-preflight`.
There were five pairs, and the order alternated within each pair. The owner
preflight admitted every cell; load was recorded per cell; each session had 21
clicks, the first one cold. The evidence is in
`docs/evidence/mac-perf/c8/selection-ab-e484efc6/` (local, with the harness
source it ran).

| Pair | Load at start, on / off | Press to layout, on / off (median ms) | Difference |
| --- | --- | --- | --- |
| 0 | 6.0 / 5.0 (off peaked at 13.6) | 98.7 / 184.9 | load spike in the off cell |
| 1 | 5.5 / 5.9 | 90.6 / 87.8 | +2.8 |
| 2 | 4.6 / 4.4 | 92.8 / 89.5 | +3.2 |
| 3 | 3.9 / 4.1 | 92.3 / 99.2 | −6.9 |
| 4 | 4.3 / 4.4 | 91.7 / 92.5 | −0.8 |

- **Press to layout.** Median of the pair differences: −0.8 ms. Pooled warm
  clicks without pair 0: 92.2 ms on, 91.5 ms off (+0.7 ms, n = 80 each). Both
  are under the 2 ms limit. Single pairs move by −6.9 to +3.2 ms, so the run
  resolves the cost to a few ms, not below 1.
- **Body counts.** List bodies were 2 per click in every session. Row bodies
  had a median of 26–30 per click in both arms; pair 0's on cell had 36, under
  the load spike.
- **Delivery.** Every click settled in both arms (21 of 21 in each of the ten
  sessions).
- **Idle.** No session recorded a stall, so the sampler took no sample. Idle
  with no sampling is proven by the state tests.

## Stall attribution: the link-register rule (coordinator ruling, 2026-11-12)

A stall's `in` label comes from the frame-pointer walk of each sample. A leaf
that has not pushed a frame record (for example `ProcessInfo.systemUptime`) has
its caller only in the link register (LR), so the walk begins at the caller's
caller. Commit 89f3aca3 inserted LR after the pc whenever the walk did not
already start with it. That also inserted LR in two cases where it is wrong.

**The rule.** LR is stripped of its pointer-authentication bits exactly as the
saved return addresses are (`todo_strip` in `ClientStallSampling.c`). It goes
after the pc only when both hold:

- (a) it differs from the first saved return address;
- (b) it does not resolve into the same function as the pc. The function start
  comes from `dladdr`'s `dli_saddr`, looked up at `LR - 1`, because a return
  address points just after its call.

Otherwise it is skipped. The code is `ClientStallStack.assemble` in
`apps/macos/API/Sources/TodoAPI/ClientStallAttribution.swift`.

**Proof.** Three state tests in `ClientStallAttributionTests` supply the
registers and a function table, so they do not depend on where a live sample
lands:

| Shape | Input | Result |
| --- | --- | --- |
| A leaf with no frame of its own: the caller is only in LR | pc in 0x1000's function, walk `[0x3040]`, LR 0x2020 | LR inserted: `[0x1010, 0x2020, 0x3040]` |
| A function mid-body after a call returned: LR points into itself | pc 0x2080, LR 0x2060 | skipped |
| LR equal to the first saved return address | walk `[0x2020, 0x3040]`, LR 0x2020 | skipped |

Mutation controls, kept in `.scratch/c8-mutations`:

- M3 removes (a) and (b), so LR is always inserted. The mid-body and equal-LR
  tests fail.
- M4 never inserts LR. The leaf test fails.

**What stays unprovable.** Once a function has saved LR in its frame, the
register is free. If it then holds a value that happens to resolve into a
function other than the pc's (used as a scratch register, or left stale), it
is inserted as a caller that is not on the stack. No sample can tell this apart from a true leaf. A label therefore
still needs the samples to agree, as `agreeing` reports, before it names the
stalling function.

## Stall sampler lifetime and cost (MAC-C1-S1-21, S1-22)

The seat found two defects in candidate 8's sampler and measured its cost under
stress.

**One queue, one lifetime (S1-21).** `ClientDiagnosticsMonitor.start` made a new
watchdog queue each time but kept one sampler. After a stop and a start, the
sampler's `tick` and `finish` could run on two queues at once, racing its
counters and its unsafe sample buffer. The seat's Thread Sanitizer probe
reported the race. The rule now:

- The monitor owns one serial `watchdogQueue` for its whole life. No sampler
  state is reachable from another queue.
- A watchdog generation lives on that queue. `start` sets it there. Every
  handler and every queued `finish` checks it there first.
- `stop` is complete when it returns. It ends the generation on the queue with a
  synchronous drain, after any handler already running there. It also abandons
  the stall in progress. No handler of the stopped generation touches the
  sampler afterwards. This is a drain on one queue, not timing.
- Every use of the sample buffer reads the count once and checks it against
  that one value. So does each sample's frame count.

**The hourly cap comes first (S1-22).** After one sampling failure, `finish`
returned a disabled record for every stall before checking the 120-an-hour
budget. The budget is now checked before every outcome, disabled ones
included.

**The cost of a sample, made as small and as visible as user space allows.**
The seat's stress run took 100,000 samples, all of which succeeded and resumed.
One window lasted 3,040 µs. The 1 ms window limit turns sampling off only after
the resume, so a single window has no hard maximum: the kernel can preempt the
sampling thread mid-window. Three changes:

- The watchdog queue runs at user-interactive QoS, so the thread holding the
  main thread suspended is not starved behind other work.
- Each stall has a 2 ms budget of suspended time, checked before each suspend.
  A sample starts only if a window as long as the limit still fits. One stall
  therefore holds the main thread at most 2 ms plus whatever its last window
  overran the limit by.
- Each sample's window is recorded in the stall's attribution
  (`suspendedMicroseconds`). Diagnostics shows it under the stall: "Sampled N
  times: main thread held X ms, longest Y ms".

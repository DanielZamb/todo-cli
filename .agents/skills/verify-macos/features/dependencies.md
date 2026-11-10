# Task Dependencies during HOLD

Use the generated HTTP client and production TodoModel with scratch SQLite.
The graph domain remains authoritative; native state projects its reports.
No native app, hosted XCTest, Keychain, notifications, signing or installation
is authorized by this recipe.

Read the current run's unit report before claiming completed coverage:
[SwiftUI unit report](../../../../docs/decisions/task-dag/unit-s-report.md).

Run all commands below from the repository root through `scripts/swift-slot.sh`.
Package resolution stays disabled. The helpers record the three Package.resolved
files and pnpm-lock.yaml and guard compiler invocations with disk-guard.sh.

- `swift test --package-path apps/macos --scratch-path apps/macos/DerivedData/StateProof --disable-automatic-resolution --filter 'DependencyStateTests|DependencyProtocolTests'`
  proves true-or-absent filters, calm badges, retained links, error projection,
  lifetime invalidation and the typed protocol codec without a native app.
- `apps/macos/scripts/verify-write-state.py "$PWD/docs/evidence/task-dag/unit-s/write-state-new"`
  adds compiled scratch HTTP, a production picker in both directions,
  dependent Version ownership, narrowed search retaining checks, dirty editor
  preservation and changed Delete preview requiring another confirmation.
  Reuse source-hashed compiled binaries through TODO_SERVER_BINARY,
  TODO_SEED_BINARY and TODO_CLI_BINARY; the helper creates and removes its own
  scratch HOME/database and stops only its recorded server.
- `env TODO_SNAPSHOT_DAG_CHECKPOINT1=1 apps/macos/scripts/verify-design.py "$PWD/docs/evidence/task-dag/unit-s/checkpoint1-new"`
  renders the production rows, filter sheet, order control, picker and Delete
  dialog at 393 by 426 in both appearances. Geometry checks fixed actions and
  scroll-to-last-row. The capture manifest marks behavior pending until an
  actual successful command receipt exists. A non-pending receipt must resolve
  inside capture evidence and name an existing log and successful command.

The checkpoint selector is additional evidence. At final delivery, unset every
TODO_SNAPSHOT_*_ONLY selector and TODO_SNAPSHOT_DAG_CHECKPOINT1 and run the full
Mac design suite, preserving its real exit and all twelve existing Compact import
failures. Compare exact fixtures and assertions with main. Every new DAG fixture
must pass. The unit also owes the complete Electron offscreen aggregate from E.
Neither focused suite substitutes for either complete client suite.

The coordinator reviews both Compact appearances before graph UI and again after
the Dependencies view. Native key dispatch, focus return, VoiceOver and glass
remain held. NSHostingView/WKWebView evidence does not establish native access.
The diagram consumes only L1's exact canonical graph-browser source/lock handoff;
there is no second renderer or tracked copy of emitted browser resources.

The final native inventory adds 394 DAG captures to the 346 existing default
captures and 116 discovery captures. The complete default manifest therefore
contains 856 PNGs. The original 346-count assertion and Compact import assertions
remain active before the additional fixtures render. The helper retains a
nonzero Swift Testing exit, validates the completed manifest even on failure,
and writes a failing result with the actual exit. It never converts the known
twelve failures to success.

`env TODO_SNAPSHOT_DAG_ONLY=1 apps/macos/scripts/verify-design.py <fresh-evidence>`
is a focused 394-image check, not final proof. At final proof every focused
selector, including TODO_SNAPSHOT_DAG_ONLY and both checkpoint selectors, is unset.
Graph geometry asserts tool bounds inside the diagram frame and viewport, a
Close-only footer that does not overlap the scrolling list, an in-bounds Compact
view toggle and no diagram controls in List or fallback. Both appearances assert
computed edge stroke against the current Mac muted-text token.

The graph's repeated-Task identity uses stable section tokens: shown, depends-on,
blocks, lightest-next, starts-at, ends-at, ancestors and descendants. The shown
section preserves `dependency-graph-task-<id>` and `dependency-graph-expand-<id>`.
Other sections use `dependency-graph-related-<section>-<id>` and
`dependency-graph-expand-related-<section>-<id>`. Menu triggers use
`dependency-graph-actions-<section>-<id>` at every section. The full Task id in
host messages is unchanged. The expanded Graph details fixture emits a selector
receipt for a repeated Task and checks unique simultaneous row/menu identities.
These are production SwiftUI identity preferences and literal state tests;
native VoiceOver and key dispatch are still held.

The correction matrix includes initial Dependencies with zero, two and thirteen
chosen Tasks. The existing main five-chip quick-add fixture supplies literal
baseline geometry. Dependency chips wrap inside scrolling metadata; the actions
frame and the existing metadata-to-actions gap stay unchanged. Native quick add
has no separate Preview component. Series proof drives `openSeries` and the
first-Occurrence picker through scratch HTTP before saving, then reads actual
offscreen content. The blank mixed-host fixture is kept as a failed receipt.
Filtered empty All Tasks uses the existing empty-state message and Clear filters;
unfiltered All Tasks keeps priority groups. Batch rows reuse relation text and
the structured Dependency projector. Both `conflict` and `occ_conflict` require
Reload before Apply. The current public HTTP case decodes `conflict`; the alternate
`occ_conflict` fixture is preparation, not public HTTP decoding proof. The later
L1-owned shared amendment replaces that public enum and removes its specific
dual-code tolerance. Task/Dependency count copy uses the shared TaskCount helper,
with literal zero, one and two cases.

After an actual successful committed-source state command, its receipt may be
passed as repo-relative `TODO_DAG_STATE_COMMAND` to the design helper. The receipt
contains `command`, actual `exit: 0`, repo-relative `log` and `state_proof`, and
the full source SHA. The capture validator checks the state result, every command
exit, successful Dependency suites and identical source SHAs/bytes before linking
the real state log. Without this input behavior stays pending. This link proves
production state/HTTP behavior; fixture assertions remain in render.log and native
dispatch/VoiceOver remain held. `test-capture-proof-link.py <fresh-repo-relative-dir>`
under the Swift slot exercises nine synthetic metadata controls without compiling
a binary or launching an app.

Delete previews retain the accepted request Version independently of the returned
simulated after-Task. `DependencyDeleteStateTests` records real scratch HTTP:
request1/preview-after2, then confirmation1/deleted2, with dry_run true then false.
Foreign and preview confirmation replies require Reload and cannot close the
inspector. A delayed older read cannot replace a newer reviewed preview.

`apps/macos/scripts/test-graph-resource-stop.py <fresh-evidence>` is a cheap
fake-guard control under the Swift slot. It proves the Mac copy helper retains
shared guard exit 3 and performs no compiler call or copy afterward. The real
builder runs through the exact shared guarded-run.sh checkpoint inside the
Electron output lock. Canonical browser bytes remain E-owned.

Final review checks visible whole Dependency chip rows, with a two-row cap that
yields before clipping validation, and main viewport Add geometry. It also checks
three whole loop-witness lines, two whole picker candidates, unchanged hover row
frames and conditional scope controls. The full-window `dependency-graph-shown`
disclosure contains the accessible diagram Task list; the repeated-Task fixture
expands it deliberately. Native key dispatch and glass remain held.

The batch Version regression uses a done root at Version 2, an open blocker that
the server refuses, then a cancelled blocker. The first preview's non-Conflict
facts inform only the next explicit Reload/Preview plan at the same loaded base
Version. No item is skipped and no command is resent automatically. The real
HTTP receipt must show the accepted second item from 2 to 3, with the root still
done and only the cancelled blocker linked.

S-C1 separates search notices from operation notices. `DependencySearchRecoveryTests`
drives valid public 422 search errors and 200 results through the generated client
and production TodoModel. It asserts narrower success and Clear in both picker
directions, graph success and offline Clear, and delivered older-error rejection.
A typed cycle refusal keeps its witness and attempted Task. A real generated HTTP
409 Conflict keeps Reload required; search success, failure and Clear also retain
the batch report. Refresh must not promote a stale search notice to an operation
notice. These are controlled transport tests, not a server search-threshold proof.

The eight S-C1 recovery fixtures are part of the full manifest, in both layouts
and appearances. `TODO_SNAPSHOT_SC1_ONLY=1` selects those eight as additional
proof. Unset it for the complete suite. They render a current result after a
valid broad-query refusal, using existing picker and graph views. The manifest
records both responses and leaves behavior pending until the same-source state
receipt is verified. No native UI behavior follows from these offscreen images.

The focused viewport recipe is
`scripts/swift-slot.sh env TODO_SNAPSHOT_GRAPH_RESIZE_ONLY=1 python3 apps/macos/scripts/verify-design.py "$PWD/docs/evidence/task-dag/viewport-resize-new"`.
It runs one offscreen production WKWebView test with a fresh evidence directory.
Automatic fit follows a settled frame change, including a burst of intermediate
widths, with one resolved viewport. A manual zoom stays unchanged through resize;
Reset fits again. `wk-resize-proof.json` records the actual geometry and replies.
This focused command does not replace the full design suite or prove native input.

The held-refresh recipe is
`scripts/swift-slot.sh env TODO_SNAPSHOT_GRAPH_REFRESH_ONLY=1 python3 apps/macos/scripts/verify-design.py "$PWD/docs/evidence/task-dag/graph-refresh-new"`.
It requires the current-head compiled CLI/server/seed receipt from
`sh apps/electron/scripts/guarded-run.sh bun apps/electron/scripts/prepare-dag-proof.ts`.
The test creates its own scratch server and isolated preferences home. A real
Task Delete arrives through the production SSE loop; a transport gate holds the
unchanged real graph response while the production graph view remains mounted.
Before, during and after the read, both layouts must keep identical WK frames,
viewport reply counts, stored and DOM viewports, selection, focus and expansion.
The native reply observer forwards every message unchanged and has wheel/Reset
positive controls. Setup first observes its actual History watermark, so queued
fixture events cannot race the camera controls. `wk-refresh-proof.json` retains
the SSE operation, graph response and measurements; cleanup receipts cover the
owned server, database and homes. This focused proof does not replace either
client's full design suite or establish native input behavior.

`DependencyDeleteReviewTests` uses the compiled scratch HTTP server and captures
the production changed-review status. Changed fingerprints, including a set that
became empty, return `has_dependencies` with exit 2. An unchanged fingerprint with
a stale Version returns HTTP 409 with exit 4. The test records decoded raw replies
and checks their actual pair in offscreen text, the refreshed Version/fingerprint,
no extra Reload, and deletion only after a second explicit confirmation. The
muted pair belongs to the review status and survives successful preview reload.
The message names the original cause: a Version Conflict says "This Task changed.
Confirm again to delete it." A Dependency-set refusal says "Dependencies changed.
Review the current list and confirm again." or, for the current empty set, "This
Task has no Dependencies now. Confirm again to delete it." The three live cases
assert these literal messages independently of the refreshed Task Version.

Drag metadata says "Will depend on ‹source title›" or "Already depends on
‹source title›". Its accessibility value keeps the full target/source sentence.
The state suite checks both values and offscreen production rows in Compact/full
and light/dark. It does not prove native drag dispatch or VoiceOver.
Rows with a metadata line replace that line during hover. Title-only rows overlay
the caption below the title in their existing bottom padding, adding no layout
space. The proof targets each of three adjacent title-only rows, including the
last row, for allowed and already-linked states. A separate metadata control row
makes the visible-text collision check non-vacuous. Every row frame must remain
unchanged, and the rendered status must fit its row and viewport without touching
any visible title or metadata text frame. Invisible empty containers do not count
as metadata text; their bounds are retained separately in the receipt.

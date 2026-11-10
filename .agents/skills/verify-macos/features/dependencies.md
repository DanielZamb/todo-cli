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

The final native inventory adds 374 DAG captures to the 346 existing default
captures and 116 discovery captures. The complete default manifest therefore
contains 836 PNGs. The original 346-count assertion and Compact import assertions
remain active before the additional fixtures render. The helper retains a
nonzero Swift Testing exit, validates the completed manifest even on failure,
and writes a failing result with the actual exit. It never converts the known
twelve failures to success.

`env TODO_SNAPSHOT_DAG_ONLY=1 apps/macos/scripts/verify-design.py <fresh-evidence>`
is a focused 374-image check, not final proof. At final proof every focused
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

# Diagnostics

## Sub-features

Owner-only metadata snapshots, live one-second polling, bounded request latency
and errors, operation throughput, storage/entity counts, SSE clients, credentials,
and scheduler state. Profile selection scopes entities, operations and clients.

## How to get to it (user POV)

Choose Window > Diagnostics or press Command-Shift-D. The native Window scene
opens a resizable monitoring window. Sign in to Todo with an owner Session first.
Use Profile to filter and Live to pause or resume with Command-Shift-L.
Manual Refresh is available while paused. Access Tokens cannot
read diagnostics. Diagnostics never opens the database in the client.

## Driving it with the headless Swift recipes

Run every Swift build/test/verification script through a shared Swift slot:

```sh
./scripts/swift-slot.sh apps/macos/scripts/verify-write-state.py "$PWD/docs/evidence/f12/swift-state-new"
TODO_DIAGNOSTICS_SNAPSHOT="$PWD/docs/evidence/f12/swift-state-new/diagnostics-live.json" ./scripts/swift-slot.sh apps/macos/scripts/verify-design.py "$PWD/docs/evidence/f12/swift-design-new"
```

The state recipe drives the production TodoModel through the regenerated client
against a compiled scratch server, adds and edits one Task and attempts a stale
Version. Literal deltas are 3 operations, 2 accepted and 1 rejected. A fresh model
must reload the same durable counts. Errors preserve the last snapshot and back
off through 2, 4, 8, 16 and 30 seconds; success resets to one second.
The generated contract tests cover nullable metadata, no-store and the SSE
client-kind/resume headers. The polling read is the diagnostics live contract;
there is no separate diagnostics SSE route.

The offscreen recipe renders the production DiagnosticsView in unordered
NSHostingView windows. It writes live-data, empty and error PNGs in light and
dark at full size and 393 × 426. Require exit 0, manifest.json and all 246 PNGs.
Run check-design-identifiers.py and an unsigned xcodebuild with
CODE_SIGNING_ALLOWED=NO. Do not launch Todo.app, hosted XCTest or Keychain flows.

## Gotchas

These safe proofs do not verify native Window menu activation, native keyboard
routing or actual Liquid Glass. Those stay held for the user's signed session.
A missing last-used timestamp means unknown. Request timings and last-use data
cover this server process; durable operation metadata includes external CLI
writes. Last Snapshot and restore generation come from the shared Snapshot API.

Compact mode uses a single header row, a small 2×2 KPI strip and eight native
DisclosureGroups. Only nonempty Errors starts expanded. Geometry preferences
record real production row, section, summary and control bounds. The offscreen
drive asserts four visible summaries at 393×426, 28pt controls and whole rows
inside each section. Tables show five whole rows and Show all. Profile labels
use display names. A headless unordered-window test mounts DiagnosticsView
against real HTTP, pauses it, checks a literal request-count delta of one for
the probe alone, manually refreshes, and resumes after a real Task creation.

The active Profile picker and entity list exclude tombstones. deleted_profiles
retains canonical names for historical operations, displayed with (deleted).
The headless diagnostics suite creates and deletes Archived Swift through the
compiled CLI and generated HTTP client, then reloads and checks the tombstone
count and deleted-name catalog.

The expanded Compact proof opens all eight sections and requires their content
and row leading edges to match the section title within one point.

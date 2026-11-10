# DAG-E Electron implementation report

Status: implementation in progress. Checkpoint 1 includes coordinator P1-P7. Graph UI remains gated on DAG-E's own coordinator answer. No final review,
complete-matrix result or whole-suite success is claimed.

Branch: `feat/task-dag-e-electron`. Qualified base:
`2c78a3263c196d870459b17bf647cfc23f421fdd`. Contract:
`858612b6feba4e359ee28749b70119a36b3909ad20459ef15f82286f1b80b829`.
No domain, server, CLI or Swift product files changed. No children were launched.

The current implementation extends validated Request/Reply and taskHttpClient,
keeps typed Dependency witnesses and actual exit pairs, and preserves read/write
metadata at IPC. One picker controller serves both directions, serializes by
dependent, keeps existing links under narrowed search, and blocks Conflict retry
until Reload. All Delete entries use the same server preview, Version and
fingerprint confirmation. Empty incident sets still require confirmation.
The existing row, filter draft/dialog, menu and editor flows are reused.

Local evidence root is `docs/evidence/task-dag/unit-e/`. Receipts are ignored.
The first package age check and frozen install exited 0. The Pele 1.13.0 locked
package age check exited 0 for 188 npm packages and ten Swift pins. All three
Package.resolved files remain unchanged. Pele is build tooling only.

`pnpm --filter @todo/electron typecheck` exited 0 after the transport/controllers
and current P1-P7 work. `pnpm --filter @todo/electron test` exited 0 with 78 passing
and one skipped package test at the first implementation checkpoint. The eight
new controller/presentation tests passed. More coverage remains required.

The production renderer drive uses a real compiled scratch server and CLI through
the shared client. The Playwright-matched browser was absent, so it uses an
explicit existing Chrome override. Failed earlier attempts remain in evidence.
The drive owns and stops its own server and browser and removes its own scratch
HOME/database. It never launches Todo or touches safeStorage/Keychain.

The shortcut inventory covers the entire Electron handwritten source and the
write host. Command/Control-Shift-K has no collision. Existing occupied bindings
are Shift-N quick add, Shift-M Compact, Shift-L appearance, Shift-D Diagnostics
and Command-F search. Plain Command-K stays free.

Pending: committed resource handoff; DAG-E checkpoint1 answer; all graph UI and checkpoint2; initial/follow-up,
list drag, batch, History and transfer recovery; full capture matrix; final locked root check; every complete Electron offscreen recipe; the complete Mac suite and exact
12-failure baseline comparison. Native VoiceOver, signed app launch, Session
restoration, signing, installation and Keychain remain held and unproven.

Disk observations and cleanup are separate from product proof. Initial compilation
observed 142.7 GB free. Two owned hidden Bun temporaries were checked with lsof,
then retired; exact paths/count/bytes are in `setup/compile-cleanup.json`. No
unowned process was signalled or file deleted. Runtime CLI/server binary hashes
and their actual `--version` output are in `.scratch/bin/build.json` and the
compile log. No binary or runtime copy is tracked.

No self-approval. L1 controls integration and review seats.

Canonical adapter source is `apps/electron/graph-browser`. Its build emits four
ignored local files and checks the tracked `graph-browser.lock.json`. The lock
SHA-256 is `603b5b168f3135b93e5e10c91f01c28d0923fe9fd91e536dca81e4e154354b65`.
The 1,934-byte Pele MIT plus Lucide ISC notice SHA-256 is
`311bccc30de6f7b9cbfb64232bb0c911ccb2191abe316550813ae25b2c7925b9`.
The shared browser script is 235,105 bytes. The README records exported types,
boot order, build and copy recipe. No browser output is tracked.

`verify-graph-browser.ts` exited 0 at `graph-browser-03/result.json`. It proves
offline Chromium identity echo, pointer activation after app-owned zoom, the
focus observer with an injected hiding Reset button, and lock mismatch rejection
then restored-clean verification. Native reset controls and WebKit remain pending.
A formatted CSS-byte mismatch was correctly refused before the reviewed lock
renewal. `pnpm --filter @todo/electron test` subsequently exited 0 with 81 passing
and one package skip, including protocol and missing/symlink receipt controls.

The current checkpoint1 capture manifest is
`docs/evidence/task-dag/unit-e/checkpoint1-10/manifest.json`, with 30 Compact
light/dark captures and existing per-capture JSON receipts. The command exited 0.
The receipts record DOM/geometry and actual checked/pending state; only explicit
assertions in the driver establish behavior. Final matrix and complete suites
remain pending.

The first root `pnpm check` exited 1 on an import-spacing lint error in the new
protocol test. The spacing was fixed without suppressions. The unchanged source
and receipt bounds are retained; this is a checkpoint, not a final full-suite run.
The permitted no-comments audit ran locally before committing. No new manual
comments or suppressions were added; the final correctness seat remains L1's.

The coordinator approved checkpoint1's pattern and accepted canonical source
965079cf. E1-E6 are included in checkpoint2: plain warning/muted metadata text,
visible ordered header and count, shorter picker chrome with shadcn Checkbox,
full-width dismissible refusal Alert with a whole-line scroll witness and two
whole candidate rows, no visible picker Versions, and one-line relation titles
with status/Project metadata. L1 was told to amend Phase 0's Version wording.

The new canonical source is 5c0beaeb3f97aea8cebf4fc0d3c3351bc5cfb2b6. The sole
resource delta sets the edge color from the semantic muted-text token. Its lock
SHA-256 is `799463f87110838ca404392a64cde5aaf084e9b1c4a117053c16b93aa2d84c1b`.
The browser bundle is 235,197 bytes, SHA-256
`ce8992ed515bd94f7fc20b6ba546585fc14f8db689c4377fa859674df19dec85`.
`graph-browser-dark-01/result.json` records exit 0, including the explicit dark
stroke assertion. L1, S and the coordinator received the fresh immutable SHA.
All other shared resource paths/protocol/dependencies and license hashes match
the prior checkpoint. No unrelated Electron UI was handed to S.

Checkpoint2's current manifest is
`docs/evidence/task-dag/unit-e/checkpoint2-06/manifest.json`. Its production
renderer/scratch-server command exited 0 and includes corrected Compact screens,
Compact list-first, explicit Compact Diagram, full window diagram/details and a
real Pele failure from a controlled malformed export. Retry obtains a fresh
report and renders successfully. Copy Mermaid submits the exact server text to
the validated host request. Native clipboard remains a separate proof boundary.
The refusal geometry initially failed with one whole row. The retained bounds
showed the footer hint wrapping and taking the missing space; the fixed footer
now leaves two whole rows under the Alert. Failed receipts remain unchanged.

The intermediate locked root check exited 0 at checkpoint source 965079cf:
385 domain, 69 CLI, 32 server and 81 Electron tests plus one package skip.
`setup/pnpm-check-02.log` is the receipt. After graph-state additions, the complete
Electron unit suite exited 0 with 85 tests and the same package skip. These are
intermediate results, not the required final full offscreen suites.

Root-check compilation left one additional owned hidden Bun runtime. It was
checked with lsof and retired; its path/count/bytes are recorded separately in
`setup/check-temporary-cleanup.json`. No unowned process or file was touched.

The coordinator approved checkpoint2's structure and prescribed V1-V11 plus the
remaining E3/E4 corrections. No further pattern gate precedes the final matrix.
Historical checkpoint2-06 receipts are preserved unchanged, including their
stale limits wording; they establish only the explicit partial assertions.

The canonical protocol now implements the coordinator's amendments 1-3: optional
node state/title, a required mapped root independent of selection, and an
optional stored viewport. Omitting the viewport fits and centres the visible
region at scale at most 1 and emits exactly one resolved reply. Supplied values
remain unchanged. Unknown states are ignored. No labels or identity fields are
read. `graph-browser-amendments-02/result.json` records Chromium exit 0 for the
computed borders, accessible names/title fallback, centred bounds, one initial
viewport reply, no extra reply for supplied values, and two invalid-root error
replies. The existing offline/workaround/lock controls also pass. Electron unit
tests exit 0 with 88 passing and one package skip; typecheck exits 0. This remains
intermediate proof. The full client suites and complete matrix are pending.

The renewed output lock SHA-256 is
`a5cbe706b2cd37ace4752427d4aa9e06e5dfa7736f1ec6a717559135807cdaca`.
The notice remains 1,934 bytes with SHA-256
`311bccc30de6f7b9cbfb64232bb0c911ccb2191abe316550813ae25b2c7925b9`.
Only six of the canonical eleven paths change: protocol, adapter, host, CSS,
README and lock. Build command and copy recipe remain unchanged. No generated
output is tracked. The permitted local no-comments audit found no new comments
or suppressions before this checkpoint commit.

The V1-V11 app changes now use the installed Base UI ToggleGroup with a semantic
selected segment, separate scope action/count, one menu per relation row, a
collapsed shadcn Collapsible for Graph details/export, and in-frame icon zoom
controls. Full window shows diagram/list together; Compact opens on List.
Layout changes refit without clearing focused Task identity. Profile-wide graph
search uses the shared Task search request and drops obsolete replies. E3/E4
now put Dismiss in the Alert corner, show up to three complete witness lines,
and retain two whole candidate rows with a fixed footer. The first visual drive
exposed a shrinking title; the fixed title and other chrome no longer shrink.

`view-rules-03/result.json` records exit 0 for 38 intermediate captures, actual
compiled scratch HTTP and real SSE forwarding. Its manifest validates only
existing files. `picker-last-bounds.json` records last-row bounds with a half
CSS-pixel tolerance for fractional scroll rounding. Historical receipts remain
untouched. The result's limits describe the actual partial scope and old cached
binary provenance; they make no final-source, clipboard or native storage claim.
The complete Electron unit suite exits 0 with 90 passing and one package skip.
The nested malformed Dependency error regression first failed by exposing outer
agent text, then passed after routing it through compatibility recovery.
Full end suites and the remaining DAG flows/matrix are still pending.

Initial Dependency selection now shares the existing add and new-Series flows,
with Profile-wide server search, retained checks, removable chips and atomic
Create payloads. The same structured recovery Alert handles complete/reopen/
Revert contexts. Create follow-up uses the returned DONE dependent id and keeps
the unsaved editor draft. Typed edge History/lifecycle v2 deltas and Move/Copy
Dependency reporting use captured authorized Tasks or full known ids. Series,
History, transfer and the full refusal matrix still need their final real-surface
proofs; implementation alone is not evidence of them.

Graph row identifiers now use explicit shared section tokens. Tasks shown keep
the canonical Task/expand identifiers; other rows, expand actions and every menu
are section-scoped. Host protocol ids remain full Task ids. The renderer driver
opens Graph details, asserts a repeated Task is uniquely addressable in every
section, and routes a section menu to that Task's fresh graph read. The owned
verification recipe and generated manifest selectors changed together.

`initial-and-sections-05/result.json` exits 0 with 50 intermediate captures and
real HTTP/SSE. Literal receipts prove atomic TaskCreated v2 at Version 1 with the
selected edge, follow-up selection of the returned DONE dependent, unchanged
resolved originals and preserved editor title, plus pending and successful
no-edge Delete. `initial-and-sections-04` retains the failing confirmation drive:
the client sent the simulated post-delete Version 2 rather than the accepted
preview request Version 1 and received Conflict. The client now stores a separate
fromVersion from that accepted preview request; the projected preview Task remains
unchanged. It sends that Version and the server fingerprint on confirmation.
The failing-before/fixed unit receipts are `setup/delete-preview-version-red.log`
and `setup/delete-preview-version-green.log`. Malformed/foreign confirmation
replies require Reload, repeated preview Conflicts stop for explicit Reload, and
a changed-to-empty state requires a second explicit confirmation. The complete
product-only unit run recorded 95 passing tests and one package skip. No shared
contract, domain or decision document changed for this client correction.
Canonical source e7902582 and its output lock remain unchanged.

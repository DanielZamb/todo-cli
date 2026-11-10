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

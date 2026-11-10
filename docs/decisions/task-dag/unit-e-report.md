# DAG-E Electron implementation report

Status: implementation and final proof in progress. Both coordinator UI checkpoints
are approved. V1-V11, E3/E4 and the latest parity corrections are being verified.
This report does not claim a complete matrix, full-suite success or final approval.

Branch: `feat/task-dag-e-electron`. Qualified base:
`2c78a3263c196d870459b17bf647cfc23f421fdd`. Current committed parent is
`5a94cffbe4068a93e36278624f7d9cdbee65e9ce`; the next product checkpoint includes
the current handwritten Electron changes and reusable renderer driver. Contract:
`858612b6feba4e359ee28749b70119a36b3909ad20459ef15f82286f1b80b829`.
No domain, CLI, server or Swift product files were added or changed by E. No
children were launched. L1 controls integration and the correctness review seat;
the coordinator is the sole UI reviewer. No self-approval is claimed.

The current checkpoint's Electron typecheck exits 0; its complete package unit
suite exits 0 with 136 passing tests and the existing one skip. Owned-file Biome
check and the permitted local no-comments audit exit 0. Their receipts and source
hashes are in `feature-matrix-setup/checkpoint-*`. These are intermediate checks,
not the root check or either full offscreen design suite.

## Product checkpoint

The validated Request/Reply and shared HttpApi client carry graph, candidate,
relation, batch and Delete-preview requests. The dynamic credential getter and
existing auth-generation fencing remain. Dependency errors retain typed witnesses
and actual public exit pairs; malformed pairs use compatibility recovery. Batch
preview/apply and nested Import errors use the same Dependency projector. Both
Conflict code spellings are prepared in the projector and Reload gate; the current
public batch decoder still accepts only `conflict`. L1 owns the postmerge amendment
to the single `occ_conflict` public value. No schema change is included here.

The immediate picker serves Depends on and Blocks, keeps checked links first,
serializes writes by dependent and requires explicit Reload after Conflict. Editor
drafts retain their original expected Version. All Task Delete paths share the
server preview, fingerprint and reviewed request Version, including no-edge Tasks.
Changed and changed-to-empty previews require a new explicit confirmation. The
postmerge `confirm_from_version` amendment remains L1-owned.

Initial Dependencies use the existing quick-add metadata area and editor form.
The quick-add preview stays directly above the fixed footer. Chosen chips wrap in
scrolling metadata. Atomic creation, initial Series selection and Create follow-up
reuse existing flows. Typed Dependency History and lifecycle reports reuse the
existing report cards. The batch controller performs a dry-run before per-item
Apply. Explicit Reload of a same-dependent batch does not assume that an earlier
refused item advanced its Version.

List drag uses the existing Task rows and writes TARGET depends on SOURCE. Hover
and pending text replace only the target metadata line. Visible N1 copy is
`Will depend on <source>` or `Already depends on <source>`; the accessible value
retains both Task titles. Self, foreign and existing links cannot write. Keyboard
and menu actions open the same picker. The whole-client accelerator inventory
found no Command/Control-Shift-K collision; Shift-L, Shift-D, Shift-N, Shift-M and
Command-F remain occupied, and plain Command-K stays free.

Graph UI uses the canonical local renderer and app-owned camera/selection/focus.
Compact opens List; full window shows the diagram and details beside it. Scope,
segmented mode, collapsed Graph details, in-frame tools and Close-only footer
follow V1-V11. Repeated Task rows use stable section-scoped identifiers; only
Tasks in diagram retain the canonical Task/expand identifiers. No label parsing,
second renderer or diagram drag-to-connect is introduced.

## Canonical shared adapter

The immutable shared source remains
`e7902582c3579d503ed9161278629e4899a92201`. Its exact eleven-path snapshot was
handed to S by L1. No later shared source or lock change is included here.

Source is `apps/electron/graph-browser`; no emitted output is tracked. The build
command and offline copy recipe are in its README. The four emitted files are
checked against `graph-browser.lock.json`, SHA-256
`a5cbe706b2cd37ace4752427d4aa9e06e5dfa7736f1ec6a717559135807cdaca`.
Bun is 1.4.4 and Pele is pinned to 1.13.0. The combined 1,934-byte MIT/ISC notice
hash is `311bccc30de6f7b9cbfb64232bb0c911ccb2191abe316550813ae25b2c7925b9`.
The approved opaque identity, root, optional title/state, optional stored viewport,
CSP and offline protocol remain unchanged. Chromium assertions for fit/centering,
state borders, identity echo, issue130 and issue131 passed at the canonical
checkpoint. Offscreen WebKit is S's proof, not an Electron claim.

## Intermediate behavior and capture evidence

Ignored evidence root: `docs/evidence/task-dag/unit-e/`. Capture-manifest generation
validates that every referenced receipt and PNG exists and stays inside the repo.
Only literal assertions establish behavior; screenshots do not create receipts.

- `checkpoint1-10/manifest.json` and `checkpoint2-06/manifest.json` are historical
  approved-pattern packets. Their original receipts remain unchanged, including
  checkpoint2's stale limits text. They are partial evidence.
- `feature-matrix-02/result.json` exits 0 with 134 intermediate PNGs. It includes
  initial creation/follow-up, batch, typed report projectors and real scratch HTTP.
  Quick-add none/two/many fixtures have footer top 366 at 393x426 and a 16 px
  preview/footer gap. Full matrix and final-source binary provenance are pending.
- `batch-version-before-01` retains the real-renderer failure; the fixed identical
  scenario in `batch-version-after-01` exits 0. An earlier unresolved blocker is
  refused; a later cancelled blocker is added after explicit Reload, and the done
  dependent changes from Version 2 to 3. No automatic resend or copied graph rule
  is used. Unit coverage for this controller has five passing tests.
- `projector-import-before-01` retains the visibly different outer-agent-text leak.
  `projector-import-after-01` exits 0 for six nested Dependency variants and both
  controlled Conflict spellings. These are typed UI fixtures, not alternate HTTP
  decode proof. Later case-scroll captures still require final verification.
- `drag-focused-02/result.json` exits 0 with N1 text, full accessible relation,
  target-title non-overlap and identical before/during bounds for every row in
  allowed, already-linked, self and foreign states. Real public HTTP separately
  proves changed, cycle/blocked/Conflict refusal and preserved editor drafts.
- `long-witness-focused-02/result.json` exits 0. Compact light/dark images were read.
  The returned five-Task closed loop has three whole visible lines in its own
  scroll region and two whole candidate rows. The attempted candidate returns to
  its previous unchecked state, the complete reason is visible, and the actual
  exit pair is last. Long titles remain available in tooltips and accessibility.
- `drag-scoped-conflict-before-01` exits 1 on the unexpected generic Retry notice
  beneath the scoped Conflict. The fixed identical drive at
  `drag-scoped-conflict-after-01` exits 0, with one Reload recovery and the actual
  exit pair. The corrected light/dark images were read. This removes duplicate
  generic reporting for scoped replies and also fences obsolete Conflict notices.

These drives build the production renderer from working source but reuse compiled
CLI/server cache source `868db38c0c56985d9b0a3cb7a1e6d9423c27a18e`, as each result
records. They are not final-source proof. Final binaries must be compiled once
from the final committed source before the end suites. Native key dispatch,
VoiceOver, clipboard, safeStorage and Session restoration are unproven.

## Verification maintenance and baseline

Scoped verification maintenance is committed at
`0ee8a15883de139a7ff23a8cf2810c8c2e28ede7`; silent-success compiler guards at
`5a94cffbe4068a93e36278624f7d9cdbee65e9ce`. The detailed literal table, source
identities, before/after captures, Compact precondition-race controls and Series
failure-only diagnostics are in `unit-e-verification-maintenance.md`. L1 handed
S immutable scoped packets, excluding unrelated E UI. Successful guards preserve
empty stdout/stderr; fake JSON, nested, trace, exit and hard3 controls passed.
The root check uses the plain order27 lock and a prior disk guard, without the
Electron wrapper. Mac Python helpers run plainly through the Swift slot.

The original clean-main fourteen-recipe Electron baseline remains exit 1:
9 PASS, 3 FAIL, 2 MISSING and named native HOLD. Maintained Attachment batch and
batch-edit exit 0 because their stale expectations now include approved PR #10
recovery and exit pairs. Original-main failures are not relabelled as passes.
Maintained Move and generic 422 literals pass before the unchanged host-writes
Import boundary. Main's known Compact Import regression is exactly wholeRows
>= 4 receiving 3 and partialRows === 0 receiving 1, owner Task `5cdbdbd6`.
Final E must compare both predicates and values before saying identical to main.

The main Compact-size failure was a verification precondition race, fixed without
a product or deadline change. Corrected Compact requests pass 30/30; a forced
absent control fails by name before any request. The one Series Skip Retry
intermittent was not reproduced in ten isolated runs and 1,000 status samples.
No product or wait change followed. The one diagnostic Import continuation failed
before Import and proves nothing beyond that point. All raw failures are retained.

Diagnostics' wrong-entry timeout was a harness defect. Root-independent entry and
runtime preflights now fail before spawning or downloading. Corrected clean-main
Diagnostics passed three quiet runs with the original 60 s deadline. Existing
visibility remains unchanged: Diagnostics is visible/front; background recipes
stay hidden. No safeStorage or native restoration claim follows.

## Remaining required proof

The complete capture matrix, final-source compiled behavior, root check, unsigned
package and both full offscreen client suites remain pending. The Electron
aggregate must enumerate every recipe and preserve failures/MISSING; the DAG drive
is still explicitly partial. The complete Mac suite must retain and compare the
exact twelve Compact Import baseline failures. No whole-suite success is claimed.
Final counterpart-native source is not integrated in E's branch. Integration
proof and final review seats remain L1/coordinator responsibilities.

## Operations

Latest disk preflight observed 126.8 GB free. Earlier owned hidden Bun temporaries
retired total 797,947,776 bytes, with lsof checks and receipts. Exported baseline
binaries and the current cache have not been retired while still needed as inputs.
Only recorded owned servers/browser processes are closed by each drive's finalizer.
No unowned/shared process was signalled. No archive includes binaries, databases,
runtime copies or scratch HOMEs. Final cleanup counts and end-proof commands/exits
will replace this intermediate operations status at handoff.

---
name: verify-discovery-formal
description: Check bounded discovery publication and Show provenance with TLA+, reviewed C/D source mapping, and independent real-code controls. Use after discovery credential, dialog, submission, prefix edit, Close, Retry, Show or authorization-epoch changes. Use the final merged immutable candidate for both discovery and TaskSearch; no mechanical refinement claim.
---

# Verify discovery publication

From the checkout root, run:

```sh
bun .agents/skills/verify-discovery-formal/check.ts
```

A pass checks bounded model safety, immutable reviewed source mapping, carried
root regressions and independent real-source sensitivity/restoration. Both
formal mappings now name f85aef6faf7d93be80feef930554206e09d61be3, product exact
36f9c56e200048aa2ca16186aaf713bea8d5454e, root proof integration 81c. The final
SEC handoff released the TaskSearch hold before its single semantic renewal.
SOURCE-MAPPING.md names actual awaits, guards, publication and UI dispatch.
REPORT.md records current and historical receipts without relabeling them.

Created using the create-formal-verification-skill workflow. TLA+ fits this
question because late replies can publish under a different credential or dialog.
The model reuses `requestedIdentity`, `generation` and `appliedSnapshot` from
TaskSearch.tla. It models authorization provenance, not Task matching or the
runtime authorization policy. B owns generated no-leak properties against the
real Authentication and discovery queries.

The command requires Java 11+, Bun, curl and the existing pnpm dependencies.
It downloads the pinned jar only when absent, after the run's disk guard, and
verifies its SHA-256 every time. tool.json pins TLA+ tools v1.7.4, TLC 2.19.
It installs no dependency and launches no native app. Client controls use copied
source, existing installed dependencies, fixed reviewed backend binaries and
fresh scratch databases. Swift controls substitute only the existing in-memory
SessionVault fixture. Keychain, signed apps, installed Todo and real data remain
under HOLD.

## Read the result

Each run prints an absolute ignored directory under
`docs/evidence/discovery-formal/check-*`. Read result.json, stages.json, the
individual command JSON receipts, stdout, stderr, and each stage's exact model
and config. Exit 0 requires both complete safety checks, every expected
behavioral counterexample, restored model bytes and the runner's strict
TypeScript check. A timeout, parser error, interrupted process or nonzero queue
on a clean run is incomplete proof. Expected broken runs stop early and retain
their actual nonzero queues. Their exit must be 12 with the intended violated
invariant and a state trace. A parser failure cannot satisfy sensitivity.

## Properties and harm

| Property | Harm if broken |
| --- | --- |
| CurrentCredentialProvenance | An owner reply exposes a Profile after replacement with a scoped credential, sign-out or same-scope credential replacement. |
| CurrentDialogProvenance | A reply from a closed or previous dialog appears in the current dialog. |
| LatestPublication | An obsolete success or error changes discovery state. The independent observation records whether the pre-publication guard actually held. |
| AppliedIsCurrent | Visible rows belong to an earlier submission or edited prefix. This reads the snapshot and current state independently of publicationOK. |
| ClosedIsEmpty | Closing discovery leaves visible discovery rows. |
| SignedOutIsEmpty | Sign-out leaves visible discovery rows or an opened Task. |
| ShowIsAuthorized | Show accepts an obsolete row, loses its captured source on Close, or opens a Task after credential invalidation. |

Rows abstract Profile provenance as `work` and `personal`. Owner can receive
both; Scoped can receive only work. A response may contain any subset, including
empty. These are assumptions about the server response, not a proof of the
server's filtering. Directory and Lookup have the same publication guard.
Only Lookup supplies Show. Titles, Projects, actual Task ids and prefix matching
are outside this model. One row represents a Task's authorized source Profile.

## Exact bounds and equality abstraction

There are two scopes, two dialog kinds, two prefixes, two source Profiles and
at most two outstanding replies total. Pending discovery replies and the pending
Show exact-id read both count against that limit. No limit caps lifetime requests,
credential replacements, dialog opens or retries. Request generations use four
reusable colors. A color cannot be reused while a pending reply, applied
snapshot, captured Show callback or pending exact-id read refers to it. Four
colors allow another issue whenever the reply bound permits it. Before an
issue there is at most one pending reply, including Show, plus the applied
snapshot and retained callback. At most three distinct colors are reserved.
This is a finite safety check, not an unbounded request theorem, counter-overflow proof or liveness guarantee.
GenerationSymmetry permutes only the four interchangeable generation colors.
Every model action and invariant is preserved by those permutations. No state
constraint or depth cutoff is used; receipts count symmetry-reduced states.

`credentialGeneration` and `dialogGeneration` are sets of request colors whose
captured epoch still equals the current epoch. Issuing marks its new color
current. Credential replacement/sign-out clears credentialGeneration. Open and
Close clear dialogGeneration. A cleared generation never becomes current
again while a reference reserves its color. These sets abstract epoch equality
without bounded numeric counters or epoch wraparound. Current credential scope
alone cannot distinguish same-scope replacement, so the epoch check is separate.

Input edits invalidate the latest generation and clear applied rows even if the
user later types the original prefix. CredentialChanged includes same-scope
replacement and signing in after SignOut. The old pending replies remain
possible; cancellation is not assumed to stop network completion.

## Events and atomicity

Open enters Editing with an empty snapshot. Submit issues explicitly, captures
requestedIdentity, enters Requesting, and disables duplicate Submit. Directory
uses the same abstract issue step after Open; its actual auto-load is a client
mapping obligation. EditPrefix while Requesting returns to Editing, allowing a
new submission while the earlier reply remains outstanding. No debounce is
modeled. ResponseOK and ResponseError discard obsolete replies without changing
visible state. A current failure keeps the submitted prefix and enables Retry.
Retry issues that exact identity. Close and SignOut clear rows immediately.

Show models the accepted existing draft-protection decision. Cancel is a visible
stutter. It requires the current authorized applied lookup snapshot, captures
its source, then closes and clears discovery. showCandidate represents an old
UI callback argument that may survive those clears privately; it exposes no
rows and grants no authority. ShowResponseOK models the later authorized exact-id
read. It uses the captured source after Close and checks credential generation
again before opening. Errors open nothing. The exact-id server authorization is
assumed, as is the indivisible synchronous check-and-publication boundary.
Profile selection, All tasks fallback, full-id filters, draft handling and
missing-Task errors need C/D production regressions and final mapping.

There is at most one retained Show callback and one pending Show exact-id read.
There is no fairness or eventual-response assumption. Offline UI, focus,
pixels, clipboard, SQLite read transactions and SSE are outside this safety
model. No unbounded, native UI or mechanical TypeScript/Swift refinement claim
is made.

## Sensitivity and maintenance

The command generates isolated configs that break credential, dialog, latest
submission, error publication, Close clearing, sign-out clearing, prefix edit
clearing, Show acceptance, Show source capture and post-Close Show credential
checks. It checks each intended invariant separately so one observation cannot
hide a semantic failure. It then exhausts the original full safety graph again.
It never edits the tracked model or product files.

Model sensitivity and real-source sensitivity are separate stages. The Electron
helper imports an independent git-archive copy of DiscoveryStateController,
the unchanged real regression suite and the additional literal controls in
electron-extra.ts.txt. Each of seven mutants must fail its named expectation,
then the entire copied suite must pass after byte restoration. Parser/compiler
errors, callback exceptions and timeouts cannot satisfy the named comparison.

The Swift helper captures actual TodoModel, Discovery, AppViews, DiscoveryView,
API and regression sources. Its proof-only manifest selects discovery/report
and authorization tests. The existing memory SessionVault replaces Keychain;
the original adapter bytes and both hashes are retained. The year-2100 U02
fixture remains in the captured source. The helper tests publication, per-attempt
UUID, presentation dismissal versus Cancel, and the shared authorization epoch.
Every mutant needs an actual Swift Testing expectation failure, byte restoration
and a fresh-database clean rerun. A final combined clean run follows. This is
headless execution, not native alert activation or hosted XCTest.

Before every Swift series and command, swift-command.sh checks its default
30GiB floor or the scoped E-final exception below
and runs disk-guard inside the shared swift-slot. Exit3 means stop and report;
never delete foreign files or override the floor. Every SwiftPM argv contains
--disable-automatic-resolution and is recorded with stdout/stderr/actual exit.
All three copied Package.resolved files have before/after hashes and actual
git diff --no-index exit receipts around each invocation. No resolution or pin
upgrade is authorized. Swift installed dependencies are copied from the root
integration cache; no C/D worktree path is used. An optional third argument to
check-swift.ts reuses only this E worktree's already restored independent source
and build cache. It validates every source against a new immutable archive first.

carried-inputs.json pins final merged root36f9/81c receipts and fixed B9
binary paths/hashes/build provenance. Original C/D/c488 text remains historical. check-inputs.ts
checks source equivalence and receipt hashes; it never reads a mutable cache
manifest. Historical canonical B and legacy Attachment cache labels use different
algorithms; the current merged source hash is separately named. Carried proofs keep their
original SHA and exit, including old red/setup/notification failures. They do
not become new c488 executions. Archives contain text and artifact hash metadata;
this skill does not require the removed C/D binaries or screenshots.

Before advancing covered source hashes, inspect every mapped await/publication
boundary, prove controls/restoration and retain production regression receipts.
On a changed candidate, fail closed and review the change before renewal.
TaskSearch coverage must name the same immutable merged candidate and rerun
its separate model/matcher command after semantic review. AtomicCAS remains
L1-owned and is not modified by this workflow.
Never weaken an invariant to accommodate a product defect.

The relative .claude/skills/verify-discovery-formal link enables filesystem
skill discovery. Fresh-session discovery is not established by that link alone.
The unit forbids children, so no-comments is audited locally. Independent audit
belongs to the permitted seat-1 review. No extra child is launched.

## E-final resource authorization

The default Swift soft floor remains 30 GiB. An explicit coordinator exception
for this E-final run permits 25 GiB (26,214,400KiB) only for remaining f85 controls,
the final discovery command and frozen proof/check steps. The wrapper accepts
TODO_E_FINAL_ORDER29_EXCEPTION=f85aef6faf7d93be80feef930554206e09d61be3 only in
this bound E worktree; unset it for unrelated/future work. The hard disk-guard
floor is unchanged. Authorization and preflight receipts are local under
final-order29-exception. Do not generalize this exception.

An explicit SOFT-DISK-HOLD file under docs/evidence/discovery-formal blocks the
wrapper regardless of free space. Clear that owned latch only after explicit
resume plus a fresh authorized preflight. Every command records its applicable
floor and disabled-resolution/pin receipts. Reuse the current E f85 cache with
TODO_DISCOVERY_SWIFT_REUSE pointing to its attempt directory; do not rebuild
unchanged producer/API dependencies. Adapter/manifest writes are content-checked
to avoid invalidating unchanged cached inputs. After each test/control the
helper records an order-30 Bun-temporary census and fails on unexpected files
requiring ownership/lsof review. It never deletes foreign temporaries.

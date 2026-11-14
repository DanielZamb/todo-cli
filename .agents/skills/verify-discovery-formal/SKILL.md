---
name: verify-discovery-formal
description: Check bounded discovery publication and Show provenance with TLA+, reviewed C/D source mapping, and independent real-code controls. Use after discovery credential, dialog, submission, prefix edit, Close, Retry, Show or authorization-epoch changes. Use the final merged immutable candidate for both discovery and TaskSearch; no mechanical refinement claim.
---

# Verify discovery publication

Read [the prerequisites](PREREQUISITES.md). Resolve the checkout with
`git rev-parse --show-toplevel`. No retired worktree or historical receipt is
required. After reviewing and committing the merged source, run:

```sh
candidate=$(git rev-parse HEAD)
bun .agents/skills/verify-discovery-formal/prepare-inputs.ts "$candidate"
bun .agents/skills/verify-discovery-formal/check.ts "$candidate"
```

Preparation runs fresh domain, scope-removal, compiled CLI/HTTP, authorization
boundary and enrichment-history checks. It builds or locates this checkout's
source-hash cache and freezes relative paths, whole-input hashes, binary hashes
and actual exit receipts in ignored `current-inputs.json`. The formal command
rechecks those inputs, the bounded model, source mapping and real client controls.
The candidate must name the reviewed immutable source; the final source hashes
are renewed only after inspecting covered functions and observing the controls.
SOURCE-MAPPING.md names the awaits, guards and publication boundaries.

HISTORICAL-INPUTS.json retains the old C/D and root provenance. No command opens
its paths. Those receipts are historical, not new merged-source executions.
Old offscreen UI, installed-session persistence, clipboard and native interaction
claims are not re-proven by this command. The fresh client tests below cover
only their stated behavior, and the final report names additional current drives.

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
source, existing installed dependencies, fresh source-hash-verified backend binaries and
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
| ClosedIsEmpty | Closing discovery, including at sign-out start, leaves visible discovery rows. |
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

Sign-out has three steps. SignOutStart closes discovery and clears rows, but
keeps credential provenance: the credential is still installed until the
server revokes it. SignOutFail models a failed or cancelled sign-out; it
changes nothing, so the still-current credential keeps owning its pending
replies, and the cleared dialog generation alone rejects them. SignOut is the
committed sign-out after revocation, or Session expiry, and is the only step
besides CredentialChanged that ends credential provenance. No credential
change starts while a sign-out is in flight.

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
clearing, sign-out start clearing, Show acceptance, Show source capture and
post-Close Show credential checks. It checks each intended invariant separately so one observation cannot
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
30 GiB floor
and runs disk-guard inside the shared swift-slot. Exit3 means stop and report;
never delete foreign files or override the floor. Every SwiftPM argv contains
--disable-automatic-resolution and is recorded with stdout/stderr/actual exit.
All three copied Package.resolved files have before/after hashes and actual
git diff --no-index exit receipts around each invocation. No resolution or pin
upgrade is authorized. Swift installed dependencies are copied from the root
integration cache; no C/D worktree path is used. An optional third argument to
check-swift.ts reuses only this checkout's already restored independent source
and build cache. It validates every source against a new immutable archive first.

The input gate accepts only repo-relative paths whose real targets stay within
the checkout. Both formal commands run path controls: an absolute input, a path
above the checkout and an escaping symlink fail; the restored input passes.
Discovery also rejects an absolute receipt path inside an otherwise valid manifest.
A missing prerequisite is a failed check, never a sensitivity counterexample.
Use `TODO_DISCOVERY_INPUTS` for a different repo-relative fresh manifest.
`TODO_DISCOVERY_SWIFT_SEED` defaults to `apps/macos/API/.build`; populate it
with the existing API-generation step, without changing dependency pins.

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

## Resource and reuse limits

The default Swift soft floor is 30 GiB. There is no inherited worktree-specific
exception. An owned SOFT-DISK-HOLD latch blocks Swift until the coordinator
releases it. Reuse is optional: set TODO_DISCOVERY_SWIFT_REUSE to a repo-relative
`docs/evidence/discovery-formal/swift-*` attempt containing restored source and
its build directory. Every source is checked against a fresh immutable archive;
every test still uses a fresh scratch database. Do not share a mutable build
cache between concurrent actors. Order-30 temporary inventories remain required.

For fixture maintenance, append `--repeat-clean=20` after the candidate and
owned reuse path passed to `check-swift.ts`. It runs DiscoveryStateTests and
DiscoveryReportStateTests twenty times consecutively, each on fresh scratch data.
The first failure stops the command. It does not retry or replace the full
control driver or state suite.

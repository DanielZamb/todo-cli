---
name: verify-discovery-formal
description: Check bounded discovery response publication and Show provenance with TLA+. Use after discovery credential, dialog, submission, prefix edit, Close, Retry or Show lifecycle changes. Model-ready only until C/D production mapping and real-code sensitivity are reviewed.
---

# Verify discovery publication

From the checkout root, run:

```sh
bun .agents/skills/verify-discovery-formal/check.ts
```

A pass currently proves the approved contract model within the exact bounds
below. Production conformance is unproven. C/D have not supplied their final
implementation. Do not renew existing Task search source hashes to bypass that
gate. [SOURCE-MAPPING.md](SOURCE-MAPPING.md) records the pending mapping and the
immutable contract commit. [REPORT.md](REPORT.md) records actual proof receipts.

Created using the create-formal-verification-skill workflow. TLA+ fits this
question because late replies can publish under a different credential or dialog.
The model reuses `requestedIdentity`, `generation` and `appliedSnapshot` from
TaskSearch.tla. It models authorization provenance, not Task matching or the
runtime authorization policy. B owns generated no-leak properties against the
real Authentication and discovery queries.

The command requires Java 11+, Bun, curl and the existing pnpm dependencies.
It downloads the pinned jar only when absent, after the run's disk guard, and
verifies its SHA-256 every time. tool.json pins TLA+ tools v1.7.4, TLC 2.19.
It installs no dependency, builds no app, opens no database, launches no native
app, and accesses no Keychain or installed Todo binary.

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

This proves model sensitivity. The create-formal-verification-skill real-code
scratch mutation requirement is still pending until C/D exist. Before production
conformance, review each actual function and its await/publication boundary,
add immutable covered file hashes, run C/D's production behavior checks and
isolated real-code mutations, restore the original source, and rerun clean.
Only then advance the source sync commit. Review Task search behavior in any
changed covered client file and rerun its required sensitivity before updating
verify-task-search-formal/coverage.json. Never weaken existing invariants.

The relative .claude/skills/verify-discovery-formal link enables filesystem
skill discovery. Fresh-session discovery is not established by that link alone.
The unit forbids children, so no-comments is audited locally. Independent audit
belongs to the permitted seat-1 review. No extra child is launched.

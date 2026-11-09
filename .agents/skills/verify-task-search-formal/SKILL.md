---
name: verify-task-search-formal
description: Check the approved Task search response-order design with TLA+ and generated properties against an immutable real matcher candidate. Use after matcher, debounce, generation, snapshot, rollback, Profile or view reset changes. Production source mapping is hash-guarded; this is bounded model checking, not a mechanical source refinement.
---

# Verify Task search response ordering

Run this command from the checkout root:

```sh
bun .agents/skills/verify-task-search-formal/check.ts
```

The command exits 0 only after the design model, real candidate matcher,
deliberate broken variants, restored checks, typechecks, and reviewed production
source hashes pass. The default matcher commit is the reviewed product-source
commit in matcher-candidate.json. For final integration, pass its exact full SHA.
The command checks the model, source mapping and matcher separately; client
behavior also requires the compiled verification recipes.

Prerequisites are Java 11 or newer, Bun, curl, and dependencies from the existing
pnpm lockfile. Follow the active run's disk guard before `pnpm install`.
The Git object named in `matcher-candidate.json` must exist locally. The command
captures it with `git archive` into its own ignored evidence directory. It never
merges the candidate or edits its worktree. The command does not install Bun,
add dependencies, build apps, start a server,
open SQLite, access Keychain, or use an installed Todo binary.

Created with the `create-formal-verification-skill` workflow. TLA+ fits this
question because the failure depends on event order, including responses that
arrive after input changes. The approved contract is in
[Task search Phase 0](../../../docs/decisions/task-search-phase-0.md).
[REPORT.md](REPORT.md) records the completed proof and remaining work.

## Read the result

Each run prints a fresh absolute directory under ignored
`docs/evidence/task-search-formal/check-*`. Read `result.json`, `stages.json`,
the stage command receipts, `.stdout`, and `.stderr` there. Each stage retains
its exact model and config. Failed and interrupted runs remain evidence.
An exit other than 0, a timeout, or a nonempty TLC queue is incomplete proof.

[tool.json](tool.json) pins TLA+ tools v1.7.4, TLC 2.19, by HTTPS URL and SHA-256.
The first run downloads the jar into the ignored `tool-cache` after the disk
guard passes. Every run checks its hash. Java uses one worker, fingerprint
polynomial 17, seed 1, a 2 GiB heap, one temporary directory per stage, and the bundled `MemFPSet1` implementation.
That fingerprint set avoids the disk-set reporting exception observed during
this unit and the quadratic final distance scan in `MemFPSet`. No symmetry
reduction or state constraint
removes reachable states. The runner records the generated successors, distinct
states, and final queue length. Generated successors include duplicate edges
and stuttering actions. They are not a count of distinct edges.

The normal command checks these properties separately:

| Property | User-visible harm if broken |
| --- | --- |
| `OneSnapshot` | Rows use one response while highlights use another response's strings or offsets. Both identity and response generation must agree. |
| `LatestPublication` | An obsolete success replaces current rows, or an obsolete error rolls filters back or replaces the current phase. |
| `ShowingIsCurrent` | Showing presents a response for an identity other than the current request. This invariant reads only phase and snapshot identity. |
| `ExactStale` | The UI presents old rows as current, or keeps current rows dimmed. `stale` must equal the complete identity inequality. |
| `Convergence` | Stable input remains stale forever despite fair debounce, recovery, and successful replies. |

`LatestPublication` uses `publicationOK` as an observation of the pre-response
guard. It does not make that guard true. Both response branches compute the
observation independently of their publish decision, so removing the decision
guard fails the invariant. Reset is a separate transition and never reports
a response publication. `ShowingIsCurrent` independently requires the applied
identity to equal the requested identity whenever phase is Showing. A separate
`BrokenLatest` run omits `LatestPublication` and must violate `ShowingIsCurrent`.

## Understand the model bounds

`TaskSearch.tla` describes the approved C1 design, not the rejected policy that
requires typed text to equal applied text while a request is pending.
`requestedIdentity` contains Profile, view, dialog filters, and typed text.
`appliedSnapshot` contains its applied identity, rows, and `search_matches`.
Rows and spans are abstract response provenance records, not Task values.
The model does not evaluate Unicode matching or offsets.

The runner splits the requested starting bounds to keep checks repeatable:

| Stage | Profiles | Views | Texts | Dialog filters | Concurrent requests |
| --- | --- | --- | --- | --- | --- |
| `safety-full` | 2 | 2 | 3 | 2 | 2 |
| `safety-three-requests` | 1 | 1 | 3 | 2 | 3 |
| `liveness` and controls | 1 | 1 | 2 | 2 | 2 |

The first stage retains all 24 requested identities and both reset dimensions.
The second checks three-response permutations with six identities. The liveness
stage retains independent text and filter changes, error rollback, and obsolete
responses. Its singleton Profile and view omit reset liveness. Safety of resets
belongs to `safety-full`. These finite checks do not prove unbounded concurrency
or their combined 24-identity, three-request state space.

`Slots` has one more color than the concurrent-request bound. Colors represent
generation equality, not a counter that stops at three. A color remains reserved
while a pending response or the applied snapshot refers to it. Each issue
captures the current identity and replaces `issuedGeneration`. Input and reset
immediately invalidate that pointer, even if the user later types the same text.
Colors become reusable only after those references disappear. Arbitrarily many
issues remain possible in the finite state graph. There is no lifetime request
limit, monotonically increasing bounded counter, or queue-exhaustion cutoff.

## Review events and assumptions

The request phase is `Idle`, `Showing`, `Debouncing`, `Requesting`, or `Error`.
Freshness is an independent Boolean. Input from Showing, Requesting, Debouncing,
or Error retains the applied snapshot, invalidates the current request, and
enters Debouncing. Esc uses the same input transition with empty text.
`DebounceFired` captures and issues the current identity in one step.
The model abstracts the 250 ms delay and timer replacement. It cannot prove
wall-clock responsiveness.

`ResponseOK` publishes only for the latest issued token with the current captured
identity. `ResponseError` uses the same guard. A current error retains typed text
and snapshot, restores only dialog filters to the applied filters, and enters
Error. Retry, a current-Profile SSE reconnection, or a current-Profile SSE op issues the requested identity. There is no timer-based automatic retry. An obsolete response removes its
private pending entry and leaves every visible variable unchanged. This is a
discard self-transition in the visible UI state, in every phase.

Dialog Open copies requested filters. Edit changes only its draft. Apply captures
that draft with the current toolbar text and issues immediately. Cancel leaves
the requested identity and snapshot unchanged. `SSEOp` abstracts an operation
notice for the current Profile and issues a refresh of the requested identity. `SSEReconnect` uses the same transition. In Error both remain enabled after input settles. Other Profiles' notices and Cmd+F are visible-state stutters. Focus itself is
outside the data-order model.

Profile and view reset invalidate requests, clear the applied selection snapshot
and dialog filters, close the filter draft, and reset selection. Reset retains
toolbar search text, as required by coordinator decision R3. Editor drafts are
outside this data-order model. `SelectTask` models only the presence of a selection.

`Settle` marks the point after which identity-changing input, dialog Apply,
Profile and view switches, and ordinary SSE refreshes stop. Recovery SSE events in Error remain enabled. All future replies succeed.
Every finite prefix may reach Settle, including one with obsolete requests or
Error. Weak fairness applies to initial request launch, debounce, each pending
successful reply, and the disjunction `Recovery = Retry or SSEReconnect or SSEOp` while in Error. Recovery fairness requires one of those events eventually, not each one separately. The approved design recovers on current-Profile SSE reconnection or an op and still offers manual Retry. There is no timer-based retry. `FairSpecWithoutRetry` retains its legacy name and omits fairness of the whole recovery disjunction. Its no-recovery Error stutter remains a documented failing case, checked by the command.

The temporal property is `stable ~> (appliedIdentity = requestedIdentity /\ ~stale)`.
It does not require the environment to stop typing, and does not claim arbitrary
network liveness. It checks every reachable stabilized suffix. There is no
assumption that success has already happened or that current rows already exist.
The disabled-debounce control must find a lasso with stable stale input.

## Keep the source mapping honest

[coverage.json](coverage.json) records the reviewed production commit, complete
file hashes and inspected functions. [CLIENT-MAPPING.md](CLIENT-MAPPING.md)
maps Input, launch, both response branches, rollback, resets, stale state and
SSE recovery to both implemented clients and their production regressions.
It also names the boundaries: selector dimensions, cached offline clear,
authentication, Snapshot reload, UI focus and pixels are not separate TLC
transitions. Read those limits before treating a pass as evidence.

The checker fails after any covered client or matcher source changes. Inspect
the affected functions, update the model or regressions where needed, and
repeat sensitivity before renewing hashes. Advancing hashes alone does not
establish a client refinement. Preserve the distinction between awaited reads
and the synchronous publication of one snapshot. No mechanical refinement from
TypeScript or Swift is claimed.

## Reproduce sensitivity and continue the unit

The one command generates isolated configs under its own ignored evidence path.
Each broken variant must reach a behavioral counterexample with TLC exit 12 for
invariants or exit 13 for temporal violations. A parser error, compiler failure,
source hash failure, timeout, or nonempty queue cannot satisfy sensitivity.
The unchanged model runs again afterward. The checked-in model is never edited
by sensitivity checks, and product files remain byte-identical.

`check-matcher.ts` captures the immutable candidate, copies
`matcher-properties.ts` beside its real `packages/domain/src`, and imports those
actual source modules. It checks normalization idempotence, monotonic AND,
closed-phrase subset, literal case-insensitive id `startsWith`, and ordered,
in-range original UTF-16 spans on grapheme boundaries. Every property has a
scratch production-code break, observed assertion failure, byte restoration,
and a clean rerun. Corpus, seed, bounds, hashes, and witnesses are preserved.
The driver typechecks in the captured source tree, where its relative imports
resolve. The runner has a separate strict TypeScript check.

After L1 integrates the reviewed implementation, repeat matcher checks against
the exact integration SHA:

```sh
bun .agents/skills/verify-task-search-formal/check-matcher.ts <full-integration-sha>
```

The argument must be a full immutable commit SHA. The command records it as an
explicit commit check. The caller establishes that it is the approved integration
tip. The main command accepts the same optional SHA after the production source
mapping is renewed. No branch name is resolved implicitly. Mutation anchors
that change fail closed and require a new source review. The domain worker owns
`verify-task-search`, the matcher, and all product edits.

The check launches no agents or native apps. Review launches follow the active
run's standing orders. The relative
`.claude/skills/verify-task-search-formal` link resolves to this skill. Fresh
session skill discovery is not proven by that filesystem check.

## Full and query refresh publication

The model now includes `catalogReady` and the latest pending `issuedFull` token.
Startup and current-Profile SSE request full scope. Query changes, dialog Apply
and Retry promote to full until a catalog has successfully published. A current
query success retains the catalog. Reset clears readiness. Obsolete success and
error branches publish no catalog side effects. The source mapping describes
why obsolete request scope can be forgotten after invalidation.

The command also checks `QueryHasCatalog`. Its `BrokenFallback` control removes
bootstrap promotion and must fail that invariant with TLC exit 12. The existing
five search safety and convergence properties and their sensitivity controls
remain required. Full/query metadata values, offline cache contents and literal
Task strings still require the compiled client recipes.

# Discovery-only integrated checkpoint

Discovery is mapped to the reviewed combined C/D source at
`c4882258d95bb8d8e80315d2f3d5f88fd5bd9901`. Bounded model checks, seven independent
Electron source controls and four independent Swift source controls pass with
byte restoration and clean reruns. This is a checkpoint for L1's later final SEC
base integration. TaskSearch semantic reproof and coverage renewal remain HOLD.
No final E merge/review readiness or future SEC coverage is claimed.

Only verify-discovery-formal proof/skill files change. Production, public API,
dependencies, runtime policy, all pins, TaskSearch proof files and Discovery.tla
remain byte-identical. No files are added under packages/domain. No native app,
signing, hosted XCTest, Keychain, installed Todo or real Todo data is used.
No Python workaround was introduced. No child or reviewer thread was launched.

## Source and claim boundaries

SOURCE-MAPPING.md names actual functions, each discovery/Show await, captured
identity check and synchronous publication. It maps Loading to Requesting,
Offline to ResponseError and Invalid to a no-request state outside publication.
Directory auto-load follows Open. The CLI credential selector chooses the key;
U5 projects structured human errors and prefills an unsubmitted Lookup. Neither
changes requestedIdentity, generation or appliedSnapshot semantics.

Electron Show rechecks the exact applied snapshot after preparation, captures
source before Close and checks credential plus the stricter showGeneration
after exact-id read. It checks returned Task id and Profile. The actual renderer
has prepare=true and preserves drafts in localStorage. It explicitly refreshes
an unchanged navigation key; changed navigation follows the normal refresh
path. Both clear Applying filters and reveal the full-id Task without relying
on SSE. Actual main and unsigned host Unauthorized branches separately guard
Session side effects with captured credential and epoch. C's real old-A401 to
new-B proof and current-A control retain their original source/build identities.

Swift has one discovery/app-wide credentialEpoch. Mapping traces all required
handleAuthorization/expireSession callers, SSE Unauthorized, metadata, parse,
History, Series and import invalidation. It maps the actual alert false setters
to dismissNavigationPrompt, queued Save/Discard target capture and explicit
Cancel before TodoModel's await guards. UUID equality prevents a cancelled
callback being reactivated by a new Show on the same row. Presentation-only
dismissal is an authorization stutter; explicit Cancel revokes the intent.
The rejected 281ec binding is not accepted. Swift's exact-id route returning its
requested Task is an explicit server-contract assumption, not a client id check.
RootView gates visible Task navigation on signedIn; private draft memory is not
claimed to be erased on every authentication change.

Claim classes remain separate: finite model safety; manual source mapping;
server authorized projection and one-read-snapshot properties owned by
verify-discovery; actual client regressions; real-code sensitivity; assumptions.
No mechanical refinement, unbounded request/counter theorem or discovery
liveness claim is made. Done planning reveal, drafts, same-Profile All refresh,
structured human report recovery and error pairs are production regressions
outside the finite model. Native alert dispatch, native focus/glass/VoiceOver,
Keychain/persistence, OS clipboard and notification delivery remain unproven.

## Model and fresh real-code checks

The tool/model pins and approved full safety graph are unchanged from 500cdc38.
Discovery.tla SHA-256 remains
`76ae9ac6c338dd206deea6bb71194b11916b5f3e794949b6db665f4f33246e24`.
Both safety and restored runs generate 4,001,603 successors, find 381,738 distinct
states and exhaust their queues. All ten intended controls exit 12 at their
named invariant. Those negative queues are expected counterexamples, not
exhaustive passes. Bounds and all assumptions remain in SKILL.md.

Fresh standalone model-plus-Electron command exits 0 at
`docs/evidence/discovery-formal/check-Vr8G4i`. Fresh standalone source-equivalence,
archive receipt and fixed-backend binding exits 0 at `inputs-dIsV27`.
Standalone strict runner TypeScript checks exit 0.

The combined one-command workflow is:

```sh
bun .agents/skills/verify-discovery-formal/check.ts
```

It checks pinned tools, current approved contract, immutable C/D source
comparison, carried text-receipt hashes, fixed backend hashes, current covered
source hashes, the complete model/ten controls/restored graph, runner types,
Electron real-source controls and Swift real-source controls. Its run ledger
is `docs/evidence/discovery-formal/check-WPcyyW`, actual exit 0. Its nested
Electron run is `electron-mLJB07` and Swift run is `swift-RTazaq`, both exit 0.
All ten Swift invocations preserve all three pins. Final local audit
`checkpoint-final-audit/audit.json` exits 0 and confirms 23 recorded server PIDs
across all E attempts are absent, product/TaskSearch/pin diffs are empty, skill
links resolve, and Bun temporaries remain zero. The checkpoint run sets
TODO_DISCOVERY_SWIFT_REUSE to this E worktree's closed, restored
`swift-ygUiVT` cache. The helper still captures a new immutable archive, checks
every reused source and uses fresh databases for each test. This avoids a
second unchanged dependency/model compile. The ordinary command creates its
own independent copy and build cache. All commands and actual exits remain in
that run's JSON/stdout/stderr files; a running process never counts as PASS.

Electron standalone `electron-dFlKmt` exits 0. Its copied production regression
suite plus literal fixtures has 26 passing tests. Every mutant exits 1 at the
named comparison and the full26-test suite exits 0 after *each* restoration.
Only installed dependency links are shared. Source files are extracted regular
files with different inodes from live source, never symlinks or hardlinks.

| Electron copied-code break | Actual assertion harm |
| --- | --- |
| Remove submit's publication guard | An old lookup publishes after prefix ABA; directory/late-error invalidation also fails. |
| Remove the post-prepare snapshot check | A replaced credential still issues the old exact read. |
| Remove the post-read current check | An obsolete exact Task or error publishes after replacement. |
| Remove the extra Show generation check | Close/reopen allows the old Show to open. |
| Reverse exact-id equality | A wrong-id reply opens. |
| Reverse exact-Profile equality | A wrong-Profile reply opens. |
| Keep state on Close | Discovery rows remain instead of Closed. |

Swift standalone `swift-yE8Kie` exits 0. The fresh combined baseline and final
clean each run seven discovery/report/auth tests in three suites with no
failures. Four mutants each exit 1 from actual Swift Testing expectations;
each restore reruns the affected regression against another fresh database
and exits 0. Live source and all captured source bytes are checked after each.
The only product-source substitution is the existing memory SessionVault;
original and adapter hashes are recorded. The proof-only package selects
existing discovery/report/auth regressions. It does not execute TaskSearch
semantic tests. The copied U02 fixture retains the 2100-10-28/29 pin.

| Swift copied-code break | Actual failures | Harm |
| --- | --- | --- |
| canPublishDiscovery returns true | 28 expectations, exit 1 | Obsolete directory/lookup success and error publish after reset. |
| Compare intent identity without UUID | 3 expectations, exit 1 | An old cancelled callback acts after another Show on the same row. |
| Dismissal clears showIntent | 17 expectations, exit 1 | Queued Save/Discard lose authority before dispatch; explicit Cancel remains distinct. |
| isCurrentCredential ignores epoch | 3 expectations, exit 1 | Old A401 signs out replacement B, clears its credential and publishes an obsolete notice. |

Each Swift invocation runs through the shared swift-slot and an inside-slot df
>=30GiB check plus disk-guard. Each SwiftPM argv has
--disable-automatic-resolution and --skip-update. Every invocation retains
argv, stdout, stderr, actual exit and before/after hashes and actual empty
`git diff --no-index` receipts for all three Package.resolved files. No
--show-bin-path or --skip-build command was issued by E. No direct swiftc or
Xcode command was issued by E. This is unhosted Swift Testing, not native Todo
or hosted XCTest. Each seed/server uses fixed root binaries and a fresh scratch
HOME/database. Readiness is 60 s. Every started server PID has a cleanup receipt;
only those recorded owned PIDs are stopped. Scratch databases are removed.

## Carried reviewed inputs and resource history

carried-inputs.json records the immutable C75052/D205/c4 input identities,
original text receipt hashes, C/D review verdicts and root fixed backend paths.
check-inputs.ts proves the relevant source trees equal c488 and checks actual
original exits and artifact hashes. It does not read a mutable build manifest.
Removed C/D worktrees are never dependencies. Their verified text archives are
`reports/agent-archive/feat-agent-discovery-{c,d}/<relative>` in the active run
store. PNGs/binaries are represented there by metadata, not copied artifacts.

C's original full renderer67/report24/host401/package/lockedcheck/comparison
all exited 0; its final short seat1 and coordinator verdicts passed. D's original
three full state suites each exited 0 with 107 Swift and 20 contract tests on
distinct databases; auth/design 116 exited 0. Original c4 unsigned/lockedcheck0
carry only by documented product-input equivalence. Their SHA is not relabeled.
D's old notification abort, red 17-assertion dismissal run and auth setup failure
remain historical failures. E adds no product notification sink.

Root `full-check-c488/result.json` records the actual combined locked check
exit 0 at c488 with source unchanged. This is the current *product* checkpoint
check, not a new check executed at E's proof commit. The final SEC integration
will require a fresh exact-source locked check and client drives before the
single TaskSearch renewal and final E review. The command policy remains
`VITEST_MAX_WORKERS=1 /usr/bin/lockf -k /tmp/todo-pnpm-check.lock pnpm check`.

Root reused binaries retain builtHead `fad74437992ffdfe9d914d774400836057feedba`.
Their source equivalence to c488 and fixed paths/SHA-256 values come from root
full-check-c488 running.json/runtime-equivalence.json/result.json, not a later
mutable cache manifest. Canonical B source hash
`e76674ad89a63dabb3e603beae0fc2333264c29e47a659d9be9070ece95fa973` and legacy
Attachment cache label
`7f8462c827387e08e48456e1819152d4e36c00a7509b130a1d4923f5d12972dd` use different
algorithms. They are separately named, never compared as the same hash.
No backend or Electron package was redundantly compiled by E.

Initial frozen/offline pnpm install exited 0 after disk-guard0, with no package
or lock changes. A later local df 31,018,880 KiB crossed the conservative 30 GiB
floor; E reported it to both parents and did no new client compile. The
coordinator authorized resumption after cleanup and C/D removal. E checked its
own df 36,931,444 KiB/guard 37.8 GB before starting Swift. Every subsequent Swift
command includes another inside-slot preflight.

Failed E harness receipts remain, with their actual outcomes:

- electron-otxDsv exited 1 because a callback exception was rejected as
  sensitivity. A dedicated comparison fixture was added; no exception became a pass.
- electron-0XFTq5 exited 1 because the expected test title was incomplete.
- electron-GKmj7B exited 1 because Bun serialized one expectation as
  `Error: expected ...` instead of AssertionError. Named failed comparison
  receipts now recognize both forms and exclude generic exceptions.
- swift-C7m9b7 exited 1 before Swift because the real seed refused a nonconforming
  scratch path. The fixture now uses its required tmpdir/todo-s01-verify prefix.
- swift-ygUiVT exited 1 after a real 28-assertion publication failure because the
  receipt matcher omitted Swift's expanded expression text. Source restored and
  the clean rerun exited 0. swift-yE8Kie then completed all controls.

These setup/receipt failures are not sensitivity passes. No parser, compiler,
hash-drift, interrupted run or timeout is counted as sensitivity.

## Handoff and remaining work

The checkpoint is proof-only and local. L1 may base-merge the final SEC candidate
at a quiet clean checkpoint; E must not merge/rebase itself. feat/task-search
is still c11f7ec9 at this candidate, and final SEC F1a/F1b are absent. No
TaskSearch source hash, matcher candidate or model was renewed here. AtomicCAS
source drift/renewal and A's additive schema gate stay separate and L1-owned.
After final integration, inspect the merged search functions once, run the
required TaskSearch model/matcher/real-source sensitivity, then renew hashes.
Final E needs same-SHA Solmax seat1 and coordinator seat2, parent-owned.

Local no-comments review covers all new proof code with no added narrative
comments or suppressions; independent audit belongs to the parent seat1.
Completion is yes for this discovery checkpoint and partial for final E.
Caller usability and function-led form are yes for the one-command proof;
the requested-identity/snapshot/intent abstraction remains simple, sound,
instructive and composable within its bounds. A future discovery dismissal
change reuses the same real copied-code control rather than another policy.
No product fix or weakened invariant was needed.

No new visual output is produced. Existing visual evidence remains in C/D's
hash metadata and original coordinator verdicts. Own Bun compile temporaries
created/retired/remaining are0/0/0; only the necessary E-owned Swift proof cache
is retained, with no C/D cache link. Final audit and handoff record the proof
commit, actual one-command exit, source/pin cleanliness and owned-PID cleanup.

## Historical model-ready report

The following is the original checkpoint report, preserved as history. Its
then-pending C/D mapping statements do not describe the current checkpoint.

# Discovery model-ready checkpoint

The bounded approved-contract model passes both exhaustive safety runs and all
ten behavioral sensitivity checks. Production conformance remains unproven
pending reviewed, integrated C/D immutable SHAs.
No product or domain file is changed. Existing Task search mappings are intact.

The one command is:

```sh
bun .agents/skills/verify-discovery-formal/check.ts
```

TLA+ checks event ordering because a late authorized reply can become unsafe
after its credential or dialog changes. B separately owns the real domain
no-leak properties and single SQLite read snapshot. The model assumes each
reply contains only rows authorized for its captured credential.

The exact scope, equality abstraction, assumptions, events and maintenance
obligations are in SKILL.md. SOURCE-MAPPING.md records the contract SHA and
production mapping gate. No unbounded, liveness, native UI, Task matching or
mechanical source refinement guarantee is claimed.

## Tool and graph

TLA+ tools v1.7.4, TLC 2.19, jar SHA-256
936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88.
Java uses MemFPSet1, one worker, 2 GiB, fingerprint polynomial 17 and seed 1.
The command checks the jar hash on every run.

Generation colors are model values. GenerationSymmetry permutes only those
four colors. All operations on colors are equality, membership and set
operations, and every invariant is unchanged under a color permutation.
No credential, dialog, prefix or Profile is permuted. No state constraint,
depth cutoff or lifetime request bound removes a reachable event order.
Counts are symmetry-reduced states. Generated successors include duplicates
and stutters, not distinct edges. A successful queue must be exactly zero.

## Development attempts

The initial unsymmetrized run check-qHAOyn was stopped through its recorded
Java PID 39433 after the graph grew. Java exited 143. It is incomplete proof.
check-Y3jPf3 exited 255 because TLC symmetry requires model values instead of
integer colors. That configuration error is not a sensitivity pass. Both
attempts remain under ignored docs/evidence/discovery-formal.
check-y61JEm was stopped through recorded PID 41560, Java exit 143, to count
the pending Show exact-id read toward the two-outstanding-reply limit.
It is incomplete proof. No invariant was weakened.

check-dpQt4p was stopped through recorded PID 43909, Java exit 143, before
splitting the latest-generation mutant from the identity guard.
check-6Ig24j was stopped through recorded PID 49121, Java exit 143, to use the
four colors sufficient for every reserved-reference equality pattern.
Neither attempt is a pass. The ignored attempt-census.json retains all results.

## Repository check

The initial pnpm check exited 1. Its existing CLI schema sweep timed out at
60 seconds while the proof was running. Domain, server and Electron tests passed.
The unchanged check will be repeated after model checking completes; no timeout
or product code is changed. The initial receipts are pnpm-check.json and
pnpm-check.log under docs/evidence/discovery-formal.

## Production gate

The user confirmed that C/D immutable source SHAs will arrive only after review
and integration. This checkpoint must not renew production mappings. The new
skill is proven as a model-only workflow. The formal skill creator's required
real-code break, restoration and clean rerun remain pending C/D. A model mutant
cannot stand in for that evidence. The unit adds no files under packages/domain.

## Completion and abstraction review

The model-ready interface is one command with pinned tooling, literal guard
controls, complete queue receipts and restored checking. Its concepts follow
requested identity, request generation and applied snapshot. The accepted Show
handoff retains one source while clearing discovery, then rechecks credential
provenance after the exact-id await. Mapping an actual client split across an
await remains a review obligation. Extending coverage to C/D should reuse these
steps and add source hashes, not create a second publication policy.

Completion is partial for the whole E unit until production mapping and
real-code sensitivity exist. Usability, form and the core abstraction receive
a code-level yes for this model-only checkpoint, subject to the actual command
receipts below. No extra child or independent review is claimed. The local
no-comments audit covers the new runner/model only; independent audit remains
with the permitted seat-1 reviewer. Existing Task search invariants and hashes
are unchanged.

The earlier check-c6YVkm exhausted the clean graph and eight controls, then was
stopped through recorded PID 58801, exit 143, during broken-show-source.
Its Show observation accidentally constrained the broken action instead of
recording the lost source. Parenthesizing the Boolean observation fixes that
model error without changing the invariants. The isolated preflight then fails
ShowIsAuthorized with exit 12 after Open, Submit, ResponseOK and Show. Its trace
is under docs/evidence/discovery-formal/preflight-show-source. The complete
corrected command is rerun from the beginning below.

## Completed model proof

The command exits 0. Evidence is

```text
/Users/zambamon/.t3/worktrees/todo-cli/feat-agent-discovery-e/docs/evidence/discovery-formal/check-4Y5igU
```

Both clean runs exhaust the full stated bounds together: two credential scopes,
two dialog kinds, two prefixes, two source Profiles, at most two outstanding
replies total, four generation colors, one retained callback and one Show read.
There is no lifetime request cutoff or fairness assumption. The complete
safety graph has depth 29.

| Stage | Exit | Generated successors | Distinct states | Final queue |
| --- | --- | --- | --- | --- |
| safety | 0 | 4001603 | 381738 | 0 |
| broken-credential | 12 | 130 | 55 | 33 |
| broken-dialog | 12 | 112 | 49 | 29 |
| broken-latest | 12 | 650 | 285 | 196 |
| broken-error | 12 | 115 | 48 | 28 |
| broken-close-clear | 12 | 89 | 45 | 29 |
| broken-signout-clear | 12 | 90 | 45 | 29 |
| broken-edit-clear | 12 | 169 | 68 | 40 |
| broken-show-guard | 12 | 517 | 202 | 133 |
| broken-show-source | 12 | 174 | 73 | 45 |
| broken-show-credential | 12 | 1706 | 609 | 394 |
| restored | 0 | 4001603 | 381738 | 0 |

The negative runs stop at their intended behavioral violation, so their nonzero
queues are expected counterexample receipts. They are not exhaustive passes.
The restored run repeats the original model with every guard enabled.

| Broken guard | Violated property | Behavioral counterexample |
| --- | --- | --- |
| credential | CurrentCredentialProvenance | Open, Submit, same-scope CredentialChanged, then the old ResponseOK publishes. |
| dialog | CurrentDialogProvenance | Open, Submit, Close, then the old ResponseOK publishes. |
| latest | AppliedIsCurrent | Submit prefix a, edit to b and back to a, then the invalidated ResponseOK publishes. |
| error | LatestPublication | Submit, Close, then the old ResponseError changes phase to Error. |
| close-clear | ClosedIsEmpty | Publish rows, then Close leaves rows visible. |
| signout-clear | SignedOutIsEmpty | Publish rows, then SignOut leaves rows visible. |
| edit-clear | AppliedIsCurrent | Publish rows, then EditPrefix leaves the earlier result visible. |
| show-guard | ShowIsAuthorized | Publish, edit the prefix, then an obsolete callback accepts Show. |
| show-source | ShowIsAuthorized | Publish, then Show closes discovery but loses the captured source. |
| show-credential | ShowIsAuthorized | Publish, Show, SignOut, then ShowResponseOK opens the old source. |

The runner typecheck exits 0. The tracked model remains byte-identical through
the controls. Its SHA-256 is
76ae9ac6c338dd206deea6bb71194b11916b5f3e794949b6db665f4f33246e24.
The approved contract is hash-checked at immutable commit
7c9d3b7d3f9fd5d06cf8cc533ee42f1811230efa. This is model sensitivity; real client
source mutation remains pending C/D. There is no covered production client SHA.

The relative skill link and frontmatter checks pass. The local no-comments
audit exits 0 with no comments, suppressions, deletions or refactor flags.
Fresh Claude discovery and independent seat-1 audit remain unproven here.
No files are added under packages/domain. No visual output is produced.

The final repository check runs after this checkpoint commit, using binaries
cached by product source hash in this worktree. Its actual command, immutable
HEAD, exit and log are retained under docs/evidence/discovery-formal as
pnpm-check-final.json, pnpm-check-final.log and binaries.json. The delivery
message reports that result. All tracked additions are proof or skill files.

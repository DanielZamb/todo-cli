## Current integrated mapping

Immutable product `7d947f917d1895df45c78f9f9df31638a9f3f2b8` includes both DAG clients, the two-part Delete/batch contract amendment and main PR #12 at `2c488fc72fe264741d5d8db8f90b441bf426af32`. The contract is `78a2be44ef613c16a8807eda28367fe07401cf6872b4124c360c67344dc68289`. Core graph and AtomicCAS source is unchanged. Pre-renewal compiled mutation, matcher, cache and Discovery controls passed with exact restores. The complete integrated qualification is still pending at this mapping commit. Model bounds and native holds are unchanged.

# Ready/retry fixture review

The original final-clean failure and the actual HTTP/SSE reproduction are kept.
A ready full refresh legitimately supersedes a held manual retry. The fixture
awaits the model connection becoming live after ready publication before keeping
its original .applied assertion. A named regression checks .superseded plus
newer rows, cleared error, preserved draft and a subsequent query-only read.
No product source or generation guard changed. The warm8-test run passed;
repeated and final immutable proofs remain required.

# Performance/main integration verification maintenance

The former carried receipts below are historical provenance only. Current commands
never open those paths. Fresh merged-source proofs are pending at this checkpoint;
no old C/D execution is relabeled. See the current skill prerequisites and the
integration report for fresh command exits and the explicitly unproved limits.

## Current merged-source review

The immutable product candidate is dc43db3f16e3e1591793bf13b18127acd2be939d.
DiscoveryStateController and Discovery.swift retain the reviewed credential,
dialog, generation, Show source and per-attempt guards. The combined renderer
keeps discovery errors scoped and list/search publication behind its shared
generation and identity guard. Sign-out and replacement invalidate discovery
and search before old callbacks can publish. Full/query catalog debt changes
only which list reads are needed; Show still issues an explicit full refresh
when its navigation key is unchanged.

TodoModel captures the shared credentialEpoch for authorization failures.
replaceCredential calls disconnect, increments the lifecycle generation and
invalidates search. Both refresh scopes retain canPublishSearch, and catalog
debt clears only on current full publication. The independent auth-epoch control
proves a stale unauthorized response cannot expire a replacement Session.

Fresh merged-source inputs come from prepare-JP0mLs, not the historical JSON.
Electron's seven real-controller controls passed at electron-LzUdLa; Swift's
four controls passed at swift-pb8ruR, including exact expected failures, restored
bytes and final clean. The earlier clean Swift attempt stopped at its temporary
file census after our other compile batches; that failure is retained. Closed
owned copies were removed with lsof receipts before the restored proof.
Swift112 state tests and the production Electron search drive passed. The
separate full offscreen run found twelve Compact Import geometry assertions
on unchanged main code and is reported without weakening expectations.
The full discovery model command remains required and retains the finite bounds
and non-refinement limits below. Native apps and Keychain remain untested.

## Historical record

# Final merged discovery mapping

Final source candidate `f85aef6faf7d93be80feef930554206e09d61be3` has product
bytes equal to reviewed merged `36f9c56e200048aa2ca16186aaf713bea8d5454e`.
Root81c adds only parent-owned AtomicCAS proof closure and one Electron test
literal. Both discovery and TaskSearch covered mappings now name this same candidate
after semantic review, current root regression receipts and real-source controls.

DiscoveryStateController, Discovery.swift, DiscoveryView, ClientErrors, Electron
main and unsigned write-host are byte-identical to c488. The manual mapping
below still names their actual awaits, epoch checks and synchronous publication.
In the changed whole renderer/TodoModel/AppViews files, SEC adds structured search
refusal state, applied-context presentation and Project/Tag forwarding. E reviewed
those complete search functions together with Show, auth invalidation and final
publication. No discovery acceptance, Close/Retry, per-attempt UUID, shared
credentialEpoch, stale401 side-effect guard or Save/Discard/Cancel guard changed.

Show's All/full-id refresh now also passes through taskSearchQuery or Swift's
name forwarding. Show clears Project/Tag, so no inferred name predicate can hide
its result. Same-navigation-key refresh remains explicit; changed navigation
uses the ordinary guarded refresh. Neither path relies on SSE to repair it.
Structured lookup errors and report recovery keep the same origin dismissal,
prefill and explicit Find boundary. SearchTooBroad carries the shared exit pair;
no new client exit registry or agent-message rewriting was added.

The domain's prefix-only discovery read still calls synchronous filterTaskRecords
inside one readSnapshot. SEC's Effect/yielding text path belongs outside that
transaction; no text query or await was introduced into directory/lookup. Server
scope and snapshot properties remain separate real-code properties, never client
TLC conclusions. Root's final compiled discovery, TaskSearch, renderer/report,
stale401, Swift110+21 state, unsigned and60+116 offscreen gates retain actual0
at their original36f9 source; the corrected Electron search drive is at81c with
unchanged product inputs. Their fixed receipt hashes and backend provenance are
in HISTORICAL-INPUTS.json. Historical C/D and c488 evidence is not relabeled.

All four fresh merged Swift controls passed with intended behavioral failures,
byte restoration, clean reruns and final combined clean in swift-nT6h4U. Fresh
Electron controls passed in electron-rr9Ojq. Old c488 receipts remain historical.
TaskSearch's single semantic renewal followed matcher-wrLTPA; its complete
model/matcher command check-4n4nBS passed on the same immutable candidate.
Native HOLD and all model bounds/assumptions below remain unchanged.

## Historical c488 checkpoint mapping

# Discovery source mapping

This is the discovery-only checkpoint at immutable integration
`c4882258d95bb8d8e80315d2f3d5f88fd5bd9901`. Electron inputs are reviewed C
`75052d51f52d04b3c44e128d88be2540cdfef0f5`; Swift inputs are reviewed D proof
`205dcbe9731baa0568f62a53a8488e8ff951979f`, with product
`c4c1a9709b14dc4440ffcf6a35361d4df61f0fea`. L1 merged without source resolution
edits. `HISTORICAL-INPUTS.json` binds original receipts and root backend binaries.
Carried runs retain their actual source SHA and exit. They are not new runs at
c488. Covered discovery production hashes and productionSyncCommit now bind c488
after both clients' real-code controls and restoration passed. This advances
only the discovery mapping; TaskSearch coverage is unchanged.

The approved model bytes, bounds and ten controls remain unchanged from the
500cdc38 model-ready checkpoint. The current Phase 0 contract incorporates the
CLI selector and U5 amendments. `--credential-profile` chooses a stored key
before invocation; it does not change requestedIdentity, generation or
appliedSnapshot. U5 changes presentation and opens a prefilled Editing lookup;
it does not issue a request. Neither amendment changes model transitions.

## Identity and visible state

| Model | Electron | SwiftUI |
| --- | --- | --- |
| requestedIdentity | `DiscoveryStateController.submit` captures credentialGeneration, dialogGeneration, generation, kind and prefix. | `requestDiscovery` captures credentialEpoch, generation, dialog and prefix in DiscoveryIdentity. |
| credentialGeneration | Controller credentialGeneration, incremented by credentialChanged. Main/write-host separately own the actual credential and credentialGeneration. These are different processes, not one shared counter. | `DiscoveryState.credentialEpoch` is also the app-wide authorization epoch. There is one epoch, not independent discovery/auth epochs. |
| dialogGeneration and latest generation | `close` increments dialogGeneration and generation; `open` calls close first. `editPrefix` increments generation immediately, including ABA. | `invalidate` increments generation, clears requestedIdentity, appliedSnapshot and showIntent. Open, Close and edits call it. The same counter covers dialog lifetime and submissions. |
| appliedSnapshot | `publish(Showing)` installs requestedIdentity and complete reply together; the dialog reads only that object. | `discovery.appliedSnapshot` installs a DiscoverySnapshot after decoding; phase is then assigned synchronously on MainActor. There is no await between guard and assignments. |
| Empty | A Showing snapshot with an empty reply renders the empty state. | `.empty` has an applied empty snapshot. |
| Loading | Requesting renders the spinner. | `.requesting` renders ProgressView. Loading is not another model phase. |
| Invalid | submit validates LookupQuery before any request, publishes Invalid and invalidates generation. | requestDiscovery validates validPrefix, invalidates and enters .invalid before any network call. Invalid issues no request and is outside response publication. |
| Offline | offline invalidates generation, replaces Showing/Requesting with ResponseError and retains the submitted identity for Retry. Editing/Invalid stay as they are. | discoveryWentOffline retains the submitted identity privately, calls invalidate, then enters .offline. Map to ResponseError, with no visible result rows. Connectivity is an extra client guard. |

Credential scope in the finite model is an abstract authorization class, not a
client-side scope check. Real credential equality/epochs distinguish replacement
even within one scope. Four model colors represent equality while referenced;
production counters/UUIDs are not bounded by those four colors. No overflow,
unbounded-concurrency or source-language refinement theorem follows.

## Electron requests, dismissal and Show

`renderer.tsx:openDiscovery` calls controller.open. Directory immediately calls
submit; Lookup waits for explicit form submit/Return in discovery-dialog.tsx.
The directory auto-load is Open followed by Submit, not a new atomic network
operation. Typing calls editPrefix, never the HTTP lookup. Retry uses the saved
ResponseError requestedIdentity's prefix/kind. Prefix edits leave ResponseError,
so an obsolete Retry cannot submit unsubmitted text.

`submit` publishes Requesting synchronously, then awaits the injected renderer
request. That request awaits desktop IPC and decodes Reply. `taskRequest` maps
directory to profiles(include_projects=true), lookup to reads.lookup(prefix),
and showTask to tasks.show(profile, task). Network/IPC/decoding are outside the
atomic model step. Thrown errors become an error reply. After the await,
`current(requestedIdentity)` checks non-Closed state and all three captured
counters before either Showing or ResponseError publication. `current` need not
compare the prefix separately because edits always invalidate generation.

The Close button and Dialog onOpenChange(false) both reach renderer onClose,
then controller.close. An obsolete callback may retain a snapshot argument;
it does not acquire authority from holding that object. CredentialChanged closes
and invalidates more aggressively than the model's optional Editing state.
Renderer request invalidates on signIn/signOut, signedIn notices invalidate,
and endAuthentication handles signedOut replies/notices, clears discovery and
editor/list state. A reload notice also invalidates discovery. Model SignOut is
the accepted authentication-invalidating event; native Session persistence and
server-side sign-out completion are outside it.

`show` checks the *same object* is the current applied snapshot, that it is a
lookup reply and that it contains the exact match object. It captures Profile/id
before awaiting actions.prepare. After that await it checks authorization again.
The actual renderer prepare returns true. There is no Save/Discard alert for
Electron Show. `draftForTask` stores the previous draft in localStorage before
activateEditor, as audited in C's final report. Durability of localStorage is an
assumption; the renderer regression checks the stored draft in that run.

After preparation, Show captures credentialGeneration, calls close, captures the
resulting generation and awaits exact-id showTask using the preserved source.
After the read, it checks credentialGeneration AND showGeneration before open
or error. The showGeneration check also rejects a subsequent Close/reopen with
an unchanged credential. It is stricter than the model. A task reply must match
both captured full Task id and Profile. The synchronous actions.open/error calls
are the publication boundary; no await occurs between final check and call.

Renderer show.open preserves the current editor draft, activates the exact Task,
invalidates list requests, selects `tasks` (All tasks), clears Project/Tag/text,
sets the full-id prefix, clears appliedSearch and sets Applying filters. When
Profile/view/Project/Tag navigation keys change, the ordinary refresh effect
runs for the new keys. When they stay equal, show.open explicitly calls refresh.
Both paths reach the normal generation/identity-guarded list publication and
clear Applying filters. The same-Profile no-SSE regression checks request count
1 to 2 and requested/applied identity equality. Done-Task reveal from Inbox,
draft preservation and list refresh are production regressions outside Discovery.tla.
SSE is not assumed to repair a missed refresh.

## Electron authorization side effects

Controller guards alone do not protect the main process Session. `main.ts`'s
IPC handler captures requestedCredential and requestedCredentialGeneration
before running handle. Its Unauthorized branch compares both with current
values, and requires a captured credential, before stopStream, Session-file
removal, clearing credential, emitting signedOut or returning signedOut.
An obsolete Unauthorized returns errorReply and has no authentication side
effect. signIn's Unauthorized is the separate incorrect-passphrase case.
`write-host.ts`'s unsigned IPC handler applies the equivalent guard around
its taskRequest Unauthorized branch, without encrypted storage or Keychain.
Credential installation/sign-out increments that process's counter.

C's actual delayed-401 proof holds A's request, invalidates A, signs B in,
then releases A's real 401. The reply is error; B restores signedIn and no
signedOut notice appears. Its separate current-credential401 control signs out.
This is a real host regression, carried by source equivalence. It is not a
TLC conclusion or proof of safeStorage. Main's checked branch is inspected;
the unsigned host executes its corresponding branch. They remain distinct claims.

## SwiftUI requests and Show

`Discovery.swift:openDiscovery` invalidates, installs dialog/Editing and awaits
requestDiscovery only for Directory. The actual sheet binding and Close button
call closeDiscovery, which clears pending Show navigation, invalidates and
closes the sheet. requestDiscovery captures one DiscoveryIdentity, publishes
Requesting, then awaits either generated reads.profiles(include_projects=true)
or reads.lookup(prefix). Encoding/decoding constructs a local snapshot. Both
success and catch call canPublishDiscovery before changing visible state.
That guard checks signedIn, live connection, cancellation, credentialEpoch,
generation, dialog, requestedIdentity and the current Lookup prefix. Success
assigns snapshot then phase without suspension. Catch assigns human error/phase
and passes the captured epoch to handleAuthorization without suspension.
Retry requires Error/Offline and the exact saved submitted identity/prefix;
an edit invalidates it. Directory Retry needs no prefix.

showDiscoveryMatch accepts only a current snapshot and a contained match. It
creates DiscoveryShowIntent with a fresh UUID and calls navigate. The UUID
prevents an old cancelled callback becoming valid after another Show on the
same row. This is stricter than the finite model. canShowDiscovery checks that
same intent, epoch, signedIn/live state and cancellation.

The actual `DiscoveryView.swift` alert and the fallback `AppViews.swift` alert
both use `presenting: model.pendingNavigation`. Their false isPresented setter
calls dismissNavigationPrompt, which clears only presentation pendingNavigation.
It preserves showIntent. `DraftNavigationActions` captures `[target]` in the
queued Save/Discard Tasks. Explicit Cancel calls cancelNavigation and also
clears showIntent. Presentation-only dismissal is an authorization stutter;
Cancel invalidates the attempt. The rejected 281ec binding called Cancel from
the false setter and is not mapped as conformant.

navigate checks canShowDiscovery before storing pending navigation or applying.
discardAndNavigate checks again before resetting the draft and calling
applyNavigation. saveAndNavigate checks before awaiting saveSeries/save and
again after those awaits. save can itself await the HTTP edit and
refreshAfterWrite. The captured intent remains the source of authority across
all these awaits; the newer UUID cannot reactivate the old target.
applyDiscoveryShow checks canShowDiscovery, captures sourceProfile/fullID,
closes discovery, restores the captured private intent and awaits generated
tasks.show with those exact path values. It then rechecks canShowDiscovery,
clears the intent/editor/conflict, activates Profile, clears text, selects All,
applies the full-id prefix and begins editing synchronously on MainActor.
Swift relies on the exact-id server route returning that Task; unlike Electron,
this function does not separately compare returned id/Profile. This server
contract is an assumption of this mapping, tested by real client regressions.
The final publication contains no await. Catch uses the same intent check and
captured authorization epoch before human error publication.

selectView issues a refresh even for the same All view; applyTaskFilters issues
the full-id query. The no-SSE same-Profile regression proves the final list
contains the exact Task and stops loading. Planning done reveal, Save Version2,
Discard Version1, retained Cancel draft and reload are separate real regressions.
The queued regression resets binding false before the Task runs and tests Save,
Discard and explicit Cancel. Headless model/Binding execution does not prove
native alert dispatch, which remains under HOLD.

## SwiftUI global epoch and recovery paths

replaceCredential calls discovery.credentialChanged, disconnects, increments
importGeneration, parseGeneration, historyGeneration and seriesGeneration,
clears structured errors, then installs the credential. disconnect increments
the Profile lifecycle generation and invalidates search. signedIn=false also
invalidates discovery. signOut invalidates before its network await and uses
its captured epoch before deleting the vault or clearing state afterward.
restore and signIn re-capture after installing their new credential and check
before final publication.

`isCurrentCredential` compares the one discovery credentialEpoch and Task
cancellation. `handleAuthorization(error, credentialEpoch:)` requires its caller's
captured epoch. `expireSession(credentialEpoch:)` checks it before disconnect,
vault deletion, signedIn=false, credential replacement or the Session-ended
notice. There is no epoch-less authorization overload. RootView displays TaskListView
only while signedIn; otherwise it displays SignInView. Model openedTask is
visible authorized navigation, not a claim that all private editor/draft memory
is erased when the authentication view changes.

| Asynchronous path | Guard before relevant late error/publication |
| --- | --- |
| followChanges | Captures epoch once; lifecycle/cancellation guards on stream and frames. SSE Unauthorized frame and thrown401 both pass that epoch to expireSession. Nested404-recovery and sleep catches also check it. |
| refresh | Captures epoch, guards catch before human error/authorization, then also checks lifecycle, latest request and complete search identity. Credential replacement invalidates lifecycle/search generations for success. The c488 checkpoint held TaskSearch renewal; the final merged renewal is recorded above. |
| discoverProfiles and refreshConflictDefinitions | Capture epoch before profiles or Project/Tag awaits; check before metadata publication and before error handling. |
| parseDraft | Captures parseGeneration before sleep/parse awaits; replacement increments it. Both parsed result and error check the captured generation and cancellation. It does not call expireSession. |
| loadHistory | Captures historyGeneration, lifecycle generation, Profile and editor id before the read; checks on both branches. Replacement increments both generations. It does not call expireSession. |
| openSeries | Captures epoch and seriesGeneration before Task/History traversal; final success uses lifecycle-related series/Profile/editor guards, catch checks epoch then those guards before handleAuthorization. |
| runImport | Captures epoch/importGeneration/Profile before HTTP; replacement increments importGeneration; success checks Profile/importGeneration, catch checks epoch as well before structured error/authorization. |
| create/save/write/transition/deleteTask/saveSeries/deleteProfile | Capture epoch before network operations; catches check it and pass it explicitly to handleAuthorization. The awaited Save-to-Show path additionally rechecks the exact Show intent after save. This mapping does not claim all unrelated write-success state is modeled. |
| AttachmentModel, BatchEdit, AttachmentBatch | Capture epoch before reads/writes; check it in publication/catch alongside Profile/editor/draft guards; pass it to handleAuthorization. |
| load/create/preview/confirm Snapshots | Capture epoch; check after network awaits and before error publication. Snapshot reload is outside the finite discovery model. |

The actual memory-SessionVault auth proof delays old A401 from metadata refresh,
installs B, releases A401 and proves B/credential/error state survive. A current
401 clears the credential and emits exactly the Session-ended notice. This is
real HTTP plus actual TodoModel, with only the named memory adapter. It does not
prove Keychain. Source inspection traces SSE and the other guards beyond this
particular dynamic regression.

`ClientErrors.findTaskAfterLookupError` dismisses batch/Attachment/import origin
presentation, captures the epoch, awaits Task.yield, rechecks signedIn/epoch,
opens Lookup and prefills only a valid id prefix. It issues no lookup request.
Electron import uses its origin dismissal callback before prefilled lookup;
batch/Attachment share onFindLookupTask and close their origin. Human status
uses structured Profile/id/details and the server's exit pair. Generic reports
retain one error N pair. Server/CLI agent recovery messages remain unchanged.
U5 is a production presentation/recovery regression, outside TLC publication.

## Claim classes and outstanding gates

- Bounded model safety: original complete graph, restored graph and ten TLC
  controls. Exact counts/bounds remain in SKILL.md and REPORT.md.
- Source mapping: the manual await/guard/publication review above, with immutable
  candidate equivalence and original receipt hashes. It is not mechanical refinement.
- Server properties: Authentication authorized projection, no foreign existence
  disclosure, whole-response failure and one readSnapshot belong to verify-discovery's
  generated/domain and compiled tests. Discovery.directory/lookup call auth.profiles,
  authenticated per-Profile reads and final auth.profiles inside readSnapshot.
  These are not conclusions of the client model.
- Real client regressions: carried C renderer/host401 and D headless/state/auth
  receipts, with original build/source identities. Native UI/Keychain/persistence,
  OS clipboard and notification delivery remain deliberately unproven.
- Real-code sensitivity: fresh independent copied Electron controller controls
  and clean restoration. Swift source-copy controls exercise publication, UUID, presentation dismissal
  and shared authorization epoch, with byte restoration and a final clean run.
  Every command records its own fresh disk/pin/slot receipts.
- Assumptions: authorized server rows, correct exact-id route, synchronous JS
  publication/MainActor assignment, and eventual environmental events only where
  another proof explicitly assumes them. Discovery has no liveness claim.

At this historical c488 checkpoint, TaskSearch model/matcher/coverage files were
unchanged and feat/task-search was c11f7ec9. SEC was absent, so renewal was held
for L1's final integration. That checkpoint made no future-SEC coverage claim.
The final merged review and single renewal are recorded at the top of this map
and in verify-task-search-formal. AtomicCAS closure at 81c remains parent-owned.
Final same-SHA E seats remain parent-owned after actual frozen checks.

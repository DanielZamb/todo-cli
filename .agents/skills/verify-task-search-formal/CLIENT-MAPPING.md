## Current integrated mapping

Immutable product `7d947f917d1895df45c78f9f9df31638a9f3f2b8` includes both DAG clients, the two-part Delete/batch contract amendment and main PR #12 at `2c488fc72fe264741d5d8db8f90b441bf426af32`. The contract is `78a2be44ef613c16a8807eda28367fe07401cf6872b4124c360c67344dc68289`. Core graph and AtomicCAS source is unchanged. Pre-renewal compiled mutation, matcher, cache and Discovery controls passed with exact restores. The complete integrated qualification is still pending at this mapping commit. Model bounds and native holds are unchanged.

# Performance/main integration verification maintenance

The former carried receipts below are historical provenance only. Current commands
never open those paths. Fresh merged-source controls and client drives are recorded below;
no old C/D execution is relabeled. See the current skill prerequisites and the
integration report for fresh command exits and the explicitly unproved limits.

## Current main4c composition review

The reviewed product source is dc43db3f16e3e1591793bf13b18127acd2be939d.
Electron retains catalogOwedRef across failed and superseded full requests,
promotes query scope while owed, and clears it only on guarded full publication.
Discovery request errors remain scoped to their controller. List/search replies
use the same generation and complete-identity guard. Sign-out, reload, Profile
selection and Show navigation invalidate that generation before old publication.
The Profile-keyed name definitions feed both full and query requests.

Swift captures discovery.credentialEpoch for authorization error handling.
replaceCredential calls disconnect, which increments the lifecycle generation
and invalidates search. Successful full and query publications still require
canPublishSearch's lifecycle, request generation, identity and cancellation
guards. catalogStale clears only inside that publication. Both read paths use
readSearchRows for inferred Project and trim-invariant Tag names. Show's explicit
same-navigation refresh remains full and participates in the catalog debt.

Fresh matcher-Lyo5Sz properties and real-code controls passed. The production
Electron search drive passed with 170 receipts and no page errors, including
obsolete full success/error and failed-full recovery. The Swift state drive
passed 112 tests, generated contracts and diagnostics against scratch HTTP,
including R1 and both F1 paths. Every Swift pin comparison exited zero.
The finite TaskSearch model is unchanged. Its separate current command and
limits remain required; these drives are not a mechanical source refinement.

## Historical record

# Final merged-source review

The final candidate is `f85aef6faf7d93be80feef930554206e09d61be3`, with product
source exactly `36f9c56e200048aa2ca16186aaf713bea8d5454e` and proof-only root
integration `81cdef8ec257a8ca7e1cbfb1ab2b3ff3afcbbf14`. Main `9de89345` includes
reviewed SEC `07750418`. This review occurs after the coordinator released the
TaskSearch hold and L1 updated E's bound worktree. E did not merge or rebase.
The c488 discovery checkpoint is separate historical evidence.

The mapping below remains valid on the merged code. E inspected the complete
search functions in the changed renderer, TodoModel, task-client, protocol,
AppViews, TaskSearch, task-search-results, task-filters, limits, presentation and
commands files, and the full matcher. Immutable real matcher checks at f85,
including all five behavioral mutations and a targeted clean rerun after each
restoration, passed in matcher-wrLTPA before the single coverage renewal.

| Merged path | Concrete review result |
| --- | --- |
| Electron refresh | Captures Profile/view/filters/Project/Tag/text, increments refreshGeneration, awaits IPC, then checks active Profile, identityKey and generation before either branch. Success installs catalog+identity together. Error retains the snapshot/text, restores applied dialog filters and enters Error. |
| Electron input/reset/recovery | changeSearch invalidates generation before debounce. activateProfile clears result/catalog definitions, while activateView retains Profile-keyed name definitions and toolbar text. Retry and current-Profile SSE changed/connected launch refresh. endAuthentication/reload invalidate generations and clear private catalogs. |
| Electron forwarding | taskSearchQuery uses explicit dialog names first; a missing catalog id adds no name predicate. Inferred Tag names must equal trim(); Project names remain exact. The metadata ref is keyed by Profile, updated from published snapshots, cleared on Profile/auth/reload and retained across view reset. Final id joins still intersect the same-response Tasks. |
| Swift refresh | Captures identity/lifecycle/request generation, awaits complete reads, then canPublishSearch checks lifecycle, request, complete identity and cancellation. The catch additionally checks the captured shared authorization epoch. Rows/spans derive from filteredResponse; planning contributes ids/order. Final snapshot and presentation assignments are synchronous on MainActor. |
| Swift forwarding | Project/Tag names narrow only the requested HTTP search. Explicit dialog names win. Tag edge scalars reject whitespace/newline/U+FEFF so unrepresentable names omit the inferred predicate. Selected id joins remain after the response. Metadata survives selectView, while Profile changes clear it. |
| Refusal/presentation | Both guarded error branches retain text/applied snapshot and restore dialog filters. search_too_broad hides Retry, retains the applied-context line and keeps Clear/edit/SSE recovery. The shared server pair adds the required newline `error 2 - validation or usage`; refusal and applied context remain distinct. There is no client code-to-exit registry. |
| Discovery/auth integration | Show clears selectors/text and explicitly refreshes the unchanged navigation key, or uses the normal changed-key refresh. Replacement/sign-out invalidates lifecycle/request generations; Unauthorized side effects use captured epochs. These authentication and Show protocols are separate from TaskSearch.tla. |
| Matcher/filters | SEC matcher bytes equal the reviewed c143 source. Pure/synchronous and Effect paths drain the same generator. Work is cumulative preparation plus weighted DP cells/clause visits; interruption closes suspended generators. Non-text filters, including literal prefix, narrow first. TaskIdPrefix is the same schema moved to limits. readTasks and TaskCommands.list retain Profile filtering/order; only text list uses cooperative yielding after auth.read. |

TaskSearch.tla and its bounds/tool pin are unchanged. A deterministic work
refusal maps to Error without partial publication. The conditional liveness
property assumes later affordable successful responses and a fair available
recovery source. It proves no CPU/heap/output bound, matcher completeness,
unbounded concurrency, native event delivery or mechanical refinement.

Root's final compiled client and domain regressions are pinned in the discovery
skill's HISTORICAL-INPUTS.json and checked by its one-command input gate. The root
full check and all discovery/search/state/unsigned/design drives retain their
actual product SHA 36f9. The corrected Electron TaskSearch drive retains its
actual proof SHA 81c, equal production input and fresh scratch database. Its
initial literal failure and two wrapper setup failures remain failures, not
sensitivity. No binary's builtHead is relabeled to f85 or E's proof commit.

The fixed backend source hash is
`b9ec2d8ebf6eed046577134dccdc4a4004a10d76a5409a44af4e2f8b62f19ced`, builtHead 36f9.
AtomicCAS's additive Attachment mapping and sensitivity closure are parent-owned
at 81c and untouched by E. Final E exact-SHA seats remain parent-owned.

## Earlier production mapping and reviewed amendments

# Production client mapping

The immutable source commit and whole-file hashes are in `coverage.json`.
The model checks a finite response-order design. This mapping and the compiled
client regressions connect that design to production code; they are not a
machine-checked refinement theorem for React, Swift or HTTP.

| Model | Electron production code | SwiftUI production code |
| --- | --- | --- |
| `requestedIdentity` | `App` builds Profile, view, `advancedFiltersRef`, Project, Tag and toolbar text; `identityKey` sorts filter keys. | `TodoModel.requestedIdentity` builds Profile, view, `requestedTaskFilters`, Project, Tag and toolbar text. |
| `Input`, `Esc` | `changeSearch` increments `refreshGeneration` and updates `activeQuery` and `searchTextRef` before setting the 250 ms timer. Escape calls it with empty text. | `setSearchText` calls `scheduleSearch`; `invalidateSearch` increments `refreshGeneration` and cancels the previous timer before the replacement task sleeps. |
| `DebounceFired`, `Launch` | The timer calls `refreshRef.current("query")`; `refresh` captures the complete identity and increments the request generation. | The debounce task checks generation, identity and cancellation, clears its own task handle, then calls `retrySearch` / `refresh(generation:scope: .query)`. |
| `Current(n)` | After awaited IPC, `refresh` requires current Profile, `identityKey(activeQuery.current)` and request generation. The same check precedes success and error. | `canPublishSearch` requires Profile lifecycle generation, request generation, complete requested identity and cancellation. Success and error both call it. |
| `ResponseOK`, `OneSnapshot` | One `setAppliedSearch` installs `{catalog, appliedIdentity}`. `TaskRead` crosses the HTTP and IPC decoders with original strings and spans together. `searchGroups` joins planning ids to matching-response Tasks, never to planning strings. | One `appliedSearchSnapshot` assignment installs identity, rows and groups. Planning contributes ids/order; rows come from `filteredResponse`. The remaining publication assignments have no await and run on MainActor. |
| `ResponseError` | A current error restores only dialog filter refs, retains text and applied snapshot, and enters Error. | A current error restores only dialog filters when needed, retains text and snapshot, and returns `.failed`. An obsolete result returns `.superseded` without publishing or rolling back. |
| `ExactStale` | `stale` compares requested identity with `appliedSearch.appliedIdentity`. | `searchStale` compares requested identity with `appliedSearchSnapshot.appliedIdentity`. |
| `ShowingIsCurrent` | Showing is entered by a guarded success for the captured current identity. Input immediately leaves Showing. | Showing is entered after `canPublishSearch`; input immediately enters Debouncing. |
| `Recovery` | Current-Profile `changed` notices refresh from any phase; `connection(connected)` refreshes from Error. Retry calls `refresh`. | `followChanges` refreshes on ready and committed operations for the current Profile. Retry calls `retrySearch`. A read failure stays on the healthy stream. |
| `Reset` | `activateProfile` and `activateView` invalidate requests, clear the applied catalog and dialog criteria, and retain toolbar text. | `activateProfile`, `disconnect` and `selectView` invalidate requests, clear the applied snapshot and dialog criteria, and retain toolbar text. View navigation preserves the editor draft and conflict. |
| Dialog draft | `TaskFilterDialog` owns its draft; Cancel leaves requested criteria alone, and Apply issues through the existing filter path. | `TaskFilterView` owns its draft; Cancel leaves requested criteria alone, and `applyTaskFilters` issues the requested criteria. |
| `CmdF` | Focus changes only. One search field remains in the active shell surface, including detail and Quick add. | Focus changes only. Compact search is above the list/editor/Quick add branches. Native keyboard delivery remains under HOLD. |

The publication object is the atomic boundary. Both clients await concurrent HTTP reads; no intermediate response replaces its
strings or spans. Presentation derives highlights and excerpts from that
object. Cropping an excerpt shifts those supplied spans for the displayed slice
and does not evaluate the query again.

## Full and query refreshes

`catalogReady` records a successful full publication for the current selection.
`issuedFull` records the scope of the latest pending request. `Launch` uses full
scope for startup and SSE, and promotes query scope to full when no catalog has
loaded or `catalogOwed` remains set. Full requests set that obligation before
awaiting reads. Input, failed full responses and obsolete responses preserve it.
Only a current full publication clears it. Retry, debounce and dialog Apply use
query scope only when the catalog is ready and no full publication is owed.
Reset clears readiness, sets the obligation and invalidates the scope token.
An input invalidation or completed current response releases that token.

The model keeps scope only for the latest token. An obsolete response's own
scope is no longer observable because `Current` rejects it before any publication.
Pending obsolete identities remain explicit, including ABA permutations. The
model does not distinguish individual discovery fields or catalog row values.
Compiled client tests delay full successes and errors, then type a query. Its
replacement request must fetch a full catalog and publish literal new Tasks,
Project/Tag names and counts before the old response is released. Releasing the
old response cannot overwrite that catalog. A current full failure followed by
a query must also fetch the owed catalog. Unfiltered rows keep absent spans.

Electron's `taskRequest` search branch fetches `tasks.list` and only the current
`reads.view` through `Effect.all`. Its list branch still loads the whole catalog
and all counts. `refresh` captures `catalogRef`, then installs the merged query
snapshot only after the complete identity and generation guard.
`catalogOwedRef` starts true, is set on full requests and resets, and clears only
inside guarded full publication. Connection-ready notices request a full
refresh. The same synchronous publication updates `catalogRef` so an immediate
query sees the published catalog. Only a full response updates
`unfilteredSearch` or restores the initial draft.

Swift's `readSearchCatalog` uses `async let` for the unfiltered Tasks, discovery
and all four planning views. `refresh(generation:scope:)` concurrently awaits
that catalog and any filtered Task list, or just the filtered Task list and the
current planning view. Every side effect follows `canPublishSearch`. Query
publication replaces the applied snapshot and current planning membership while
retaining `tasks`, discovery and `viewCounts`. Full publication sets catalog
readiness and clears `catalogStale` in that same synchronous MainActor section.
`catalogStale` starts true and is set synchronously on full requests, accepted
writes, SSE/reconnect, reload and selection/session resets. It survives every
superseded or failed full request.

`QueryHasCatalog` rejects a query launch without a loaded catalog. The new
`BrokenFallback` control must violate it after omitting bootstrap promotion.
`OneSnapshot`, `LatestPublication`, `ShowingIsCurrent`, `ExactStale` and conditional
`Convergence` retain their existing meanings and bounds.

`NoOwedQueryPublication` observes the pre-publication obligation and request
scope in `catalogPublicationOK`; a query-only publication while owed violates
this invariant. `CatalogOwedUntilPublish` observes the request transition
and legal full clear in `catalogOwedOK`. This separate check matters: a faulty
early clear must not hide the obligation from a predicate that only reads the
flag at publication. Neither observation forces the publication guard or flag
to be correct. `BrokenCatalogOwed` clears the flag on request and must fail
`CatalogOwedUntilPublish` with exit12. `BrokenCatalogPromotion` omits owed-scope
promotion and must fail `NoOwedQueryPublication` with exit12. Concrete metadata
values remain outside the model and are checked by both compiled drives.

## Production evidence

The verification recipes are
[Electron Task search](../verify-electron/features/task-search.md) and
[SwiftUI Task search](../verify-macos/features/task-search.md). The final L1
ledger under `docs/evidence/task-search/final` records the exact integration
commit, process exits, binaries, source hashes and retained evidence paths.

Electron's compiled driver holds actual HTTP replies and checks late success,
late error, ABA, clear, Profile/view reset, same-query SSE races and obsolete
filter rollback. It closes the real proxy SSE stream and commits a CLI operation
to test both recovery paths without Retry. Four layout/appearance combinations
check literal drafts, document focus, Esc, snapshot spans, prefix composition,
Copy and unchanged durable Version.

Swift's unhosted tests run the production `TodoModel` against a compiled scratch
server. They check the same ordering cases, plus the baseline late-error defect,
Project/Tag changes during a held reset load, explicit refresh outcomes and
draft/conflict preservation. Copy uses a named scratch pasteboard and a reload
with unchanged Version. Offscreen views check retained offline rows, recovery
actions, long-description trimming, both appearances and Compact first.

## Abstraction boundaries

- The finite identity grid enumerates Profile, view, toolbar text and abstract
  dialog filters. Project/Tag selector interleavings are covered by complete
  production guards and compiled regressions, not a separate TLC dimension.
- `selection` represents list selection. It does not represent editor drafts,
  conflict resolution, keyboard focus, window layout or clipboard state.
- The model concerns asynchronous search publication. Electron's existing
  blank-text Clear filters path can restore a separately cached unfiltered
  response snapshot, then refresh. That restoration is not `ResponseOK` in this
  model. Its complete identity and same-response strings/spans are checked by
  the compiled offline-clear regression. Authentication, server compatibility
  and owner Snapshot reload protocols also remain outside this model.
- Row provenance is abstract. TLC does not evaluate Task membership, ordering,
  Unicode, UTF-16 offsets or pixels. Real matcher properties and client literal
  checks cover those separate contracts within their stated bounds.
- Liveness requires stable input, settled ordinary refresh traffic, successful
  later responses, and weak fairness of an available Error recovery source.
  Offline UI hides search Retry and offers Reconnect; eventual server recovery
  is an environmental assumption, not a client guarantee.
- Finite generation colors preserve outstanding/applied equality relationships.
  They do not prove unbounded concurrency or counter overflow. No native app,
  signing, Keychain, VoiceOver or operating-system focus proof is claimed.

## SEC integration boundary

SEC owns the deterministic `search_too_broad` response and its recovery controls.
The integrated SEC base is `492d9453`. The merged source preserves its warning,
recovery text, applied context line, existing Clear action, retained text and
focus, SSE rerun and hidden search Retry. Both typed refusal paths run after the
same current-identity and generation guard. A refusal leaves catalog debt set;
a later affordable full publication clears it. The five combined client files
were inspected before renewing their hashes. Compiled integration checks remain
required on the merge commit.

Conditional convergence assumes later successful responses. It does not claim
that a deterministic broad-query refusal eventually succeeds with unchanged
input and data. Such a query needs an input or data change before that success
assumption applies.

## Search work refusal and cooperative execution (2026-11-09)

The SEC source review maps `search_too_broad` to the existing `ResponseError`
path. The server does not publish accumulated partial rows. The shared CLI core
throws the same error; its boundary returns exit 2, while HTTP returns 422 with
the shared code and recovery text. Literal tests cover integer-tenths checks,
positive/excluded word occurrences and phrase starts, memo hits, cumulative
non-text narrowing, and identical cold, stored/warm and uncached work totals and
refusal outcomes. The budget and weight are one shared domain policy.

`fieldWords` yields from one generator core after bounded grapheme/word work,
returning unchanged words, original offsets and exact folded `preparedUnits`.
Evaluation also yields and meters each field once, each computed banded DP cell,
and each visited occurrence/phrase start. The CLI drains that core through the
shared Effect runner.
`TaskCommands.list` uses the Effect driver for supplied text **after**
`store.auth.read` has returned its complete in-memory view. No SQLite read is open
across those matcher yields. The already-captured rows and ADR-0015 client
freshness rules are unchanged. No-text command reads stay synchronous for
transactional import/Attachment callers. Eager whole-Profile read/serialization
cost is a separate pre-existing residual, not a matcher-yield guarantee.

The cache integration at `41926044` captures its cache-local Profile generation
inside `Effect.suspend` before `auth.read`. The existing execution provider obtains
complete PreparedFields from the store memo; SEC's matcher still charges their
exact count after retrieval. SEC's matcher and filter/runner files are unchanged.
This adds no response-publication transition. Cache admission and revocation have
their separate TaskSearchCacheAdmission model and real-Effect controls.

`runTaskRecordSteps` checks at checkpoints and before return. Refusal is an
Effect failure; other thrown faults remain defects. Its completion flag makes
`steps.return([])` run exactly once on a suspended non-completion exit, including
interruption or runner failure, and never after completion or a throwing `next`.
The Bun HTTP adapter already interrupts the handler fiber from the request abort
signal; the next cooperative checkpoint stops work. Literal interruption and
finalizer tests and the compiled abort/CPU samples cover this boundary. The model
abstracts a reply; it does not model CPU scheduling, chunk duration, cancellation
latency, caching, work arithmetic, heap size or HTTP serialization.

Both clients preserve the same current-generation/current-identity guard before
handling this error. Electron preserves its code through `taskRequest` and `Reply`;
Swift uses `TaskSearchFailure.tooBroad`. Both retain typed text and the applied
snapshot, show the complete server message in the existing neutral search-error
status, and hide Retry for this code. Transient errors keep Retry. Search focus
structure and existing Clear search controls remain. The compiled Electron drive
and Swift production-model test require refusal, a real Task description shrink,
an SSE operation and successful results without Retry. Offscreen renders require
no Retry element in full/Compact and light/dark views. OS keyboard focus and
VoiceOver remain outside this bounded proof.

The finite model intentionally does not distinguish error codes. Its abstract
`Retry` is unavailable in the deterministic-refusal presentation; `SSEOp` and
`SSEReconnect` still implement `Recovery`. Convergence applies only when an
available recovery source is fair and later data/criteria admit a successful
reply. A query that remains over budget may remain in Error indefinitely; no
claim says it must succeed without input or data changing. This mapping renews
source hashes after review and successful real-matcher sensitivity. TLA+ is
unchanged because publication, rollback and SSE transitions are unchanged.

## V1 applied context display review (2026-11-09)

V1 adds display text only. It changes no state transition, publication guard,
generation, identity, rollback or recovery source. The current-response guards
still run before either error branch can publish. The existing applied snapshot
still owns the displayed rows and spans.

Electron's pure `appliedSearchContext` and Swift's
`TaskSearchPresentation.appliedContext` format that snapshot's text once per
client for both error kinds. Transient messages retain their literal wording.
For `search_too_broad`, the unchanged refusal sentence stays first; a secondary
line says `Showing results for "rent".` or `Showing tasks without search.`.
Swift's `TaskSearchFailure.tooBroad` stores the context captured from the applied
snapshot when the guarded error is handled. The typed query is not its source.
No search-error identifier, status role, Retry policy or focus structure changes.

Literal presentation tests and compiled client drives cover both contexts,
including typed `probe` over retained `rent` spans and later SSE recovery.
Pixels and status wording remain outside the model's state transitions. The
four existing changed source hashes were renewed after this diff review and
successful immutable matcher sensitivity at V1 product commit `064b2667`.
TLA+ remains unchanged.

## F1 request narrowing review (2026-11-09)

The PERF integration uses its existing `catalogRef` for F1 name lookup.
`taskSearchQuery` builds the filtered request before the shared full/query IPC
branch, so both scopes forward selected names. Explicit TaskFilters names keep
precedence and the existing response-id joins still select the exact Project
and Tag. Swift fills the same fields in `readSearchRows` when `filtered` is true;
that helper serves matching reads in both scopes. The full catalog's unfiltered
read builds an empty query. No extra request resolves a selected name.

The combined source is inspected and mapped, with compiled F1 recovery,
request-count and formal reproof pending the disk gate. Earlier 492/51711
receipts keep their historical scope and are not current F1 proof.

F1 resolves selected Project and Tag ids to catalog names for the existing
server TaskFilters. Explicit dialog names take precedence; an unresolved id
adds no name filter. Electron uses a pure query builder and a metadata-only
current catalog ref without adding refresh dependencies. Swift adds two guarded
nil-name assignments in its existing query construction. The client id joins
still intersect the same-response rows with the selected ids.

This changes request narrowing only: no state transition, publication guard,
generation, requested/applied identity, snapshot, unfiltered snapshot or SSE
recovery source changes. Project/Tag ids stay in the complete identity. The
same current-response guard still precedes success and error publication.
Real Projects retain their per-Profile unique-name invariant, so the id join is
defense in depth there. Labeled synthetic Project transport over scratch HTTP
checks a name superset; real raw-append keep/KEEP Tags check the server's
case-folded name superset. Both clients keep only the selected id and its spans.

Literal compiled-client checks cover refusal with three expanding descriptions,
recovery by either filter, and byte-identical ordinary rows/spans after the id
join. Immutable matcher properties and all five behavioral sensitivity mutations
passed at `5d42f32b0b3b5b84ca82df0a07af2d4fe0ae9887` in
`docs/evidence/task-search-formal/matcher-uo9W7V` before renewing the three changed
source hashes. TLA+ is unchanged because the publication design is unchanged.

## F1a and F1b review (2026-11-09)

SEC seat 1 found two gaps in F1 at `75614cff`.

F1a: Electron built its Project and Tag name catalog from the applied result
snapshot. `activateView` clears that snapshot, so sidebar or Compact Project
navigation sent its search without the selected Project and was refused. The
catalog is now a ref keyed by Profile. It is refreshed from each published
`appliedSearch`, cleared in `activateProfile`, `endAuthentication` and the reload
notice, and used only when its Profile equals the request's Profile. Swift keeps
`projects` and `tags` across `selectView`. A headless case that follows the
sidebar binding (`selectView("all")`, then the selection's debounced search)
publishes the narrowed result before and after the fix.

F1b: the server compares Project names exactly (`task-filters.ts:92`) but trims
only the Tag query (`task-filters.ts:99`). A stored Tag name with leading or
trailing whitespace therefore never matches itself. Both clients now infer a Tag
name only when trimming leaves it unchanged. Electron uses `name === name.trim()`.
Swift rejects a first or last scalar in `whitespacesAndNewlines` or U+FEFF, a
superset of the JavaScript trim set. Project names still pass through. Without an
inferred name, the request is unnarrowed and the id join keeps the selected rows.

This is request narrowing only: no state transition, publication guard,
generation, requested or applied identity, snapshot, unfiltered snapshot or SSE
recovery change. The red runs failed on F1a in Electron and on F1b in both
clients. Swift's navigation case passed before the fix. Immutable matcher
properties and all five behavioral sensitivity mutations passed at
`c14371075593a4a163f15797c495ac821510a449` in
`docs/evidence/task-search-formal/matcher-qRXiUP` before the three changed source
hashes were renewed. TLA+ is unchanged.

## Main9de refresh integration

The refresh unit keeps SEC's Profile-keyed `searchDefinitions` separately from
`catalogRef`. View reset clears the retained Task catalog and keeps only the
matching Profile's Project and Tag names. Profile switch, authentication end
and reload clear both. `taskSearchQuery` uses that same metadata before selecting
`list` or `search`, so full and query scopes preserve F1a/F1b. Swift applies the
reviewed Tag-edge check inside `readSearchRows`, shared by both filtered paths.
Unfiltered catalog reads remain unfiltered. Explicit dialog filters still win.
Catalog obligation, generation, complete identity and publication are unchanged.
The source review does not replace the compiled sidebar, padded Tag, full/query
and catalog-debt regressions, or the final finite model and real matcher checks.

## Mac quiet reconnect review, 2026-11-11

C2 wraps refresh measurement around `performRefresh`; the synchronous guarded
publication and full/query promotion remain in that function. Native action
wrappers preserve their existing mutations and async operations. They do not
change identity, generation guards, error rollback or the catalog obligation.

C3 maps a healthy reconnect to an allowed visible-state stutter. The concrete
predicate requires an applied catalog, no catalog debt, Showing, the current
complete identity, matching applied cursor and restore generation, no retained
search/load error and no loading state. The applied cursor advances only after
an applied operation refresh. A mismatched cursor or restore generation forces
a new full read. These server cursor/restore dimensions remain outside the
bounded response-order model, as Snapshot reload already did.

`SSEReconnect` continues to implement Recovery in Error, including
`search_too_broad`. The healthy stutter has no owed catalog and cannot erase an
obligation. `SSEOp`, full/query promotion, superseded response guards and error
rollback are unchanged. TaskSearch.tla therefore stays byte-identical. This is
a reviewed abstraction mapping, not a mechanical refinement.

`StreamIdleTests` checks unchanged availability/draft/dialog/picker/graph state
and zero new reads after healthy EOF, failed-reconnect Offline plus directory
and lookup recovery, cursor/generation drift, repeated-end backoff and both
retained search error kinds. `StreamIdleTransportTests` supplies a native
URLSession timeout control and a five-minute compiled-server idle observation.
The complete bounded command and its broken controls must pass after renewing
the two changed Mac source hashes. No independent review is claimed by this
worker; the coordinator owns the candidate review seats.

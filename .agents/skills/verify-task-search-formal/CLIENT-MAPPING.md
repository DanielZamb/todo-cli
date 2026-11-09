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
This unit does not add that policy independently. After L1 merges SEC, preserve
its warning, recovery text, existing Clear action, retained text and focus,
SSE rerun, and hidden search Retry. Renew this source mapping and the compiled
client checks on that integrated source.

Conditional convergence assumes later successful responses. It does not claim
that a deterministic broad-query refusal eventually succeeds with unchanged
input and data. Such a query needs an input or data change before that success
assumption applies.

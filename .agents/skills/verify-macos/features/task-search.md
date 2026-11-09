# Task search

`deterministicRefusalRetainsSnapshotAndRecoversFromSse` creates three maximum-size
U+FDFA descriptions on compiled scratch HTTP. It requires `search_too_broad`,
the server recovery text, retained typed text and applied rows, and `canRetry ==
false`. Shrinking one description must recover through a real SSE operation
without Retry. Search-only offscreen renders include `budget-error` in light/dark,
full/Compact; their bounds check requires no `search-retry` element. Existing
transient errors retain Retry and the search-error identifier stays unchanged.

Search the toolbar with title or description words, quoted phrases or exclusions.
Cmd+F focuses search and Esc clears it. The toolbar text survives Profile and view
switches. Filters adds Id starts with. Clear all in that dialog affects its draft;
Cancel leaves active filters alone. Apply composes the draft with toolbar text.
Task detail shows the full selectable id and Copy task id.

## Headless proof during HOLD

Regenerate the entire Swift API after contract changes:

```sh
/Users/zambamon/Work/todo-cli/scripts/swift-slot.sh apps/macos/scripts/generate-api.sh
```

Use the source-hash binary cache before the existing state helper. Set
`TODO_CLI_BINARY`, `TODO_SERVER_BINARY` and `TODO_SEED_BINARY` to the absolute
`cli`, `server` and `seed` paths in `.scratch/bin/build.json`. Run:

```sh
bun .agents/skills/verify-cli/scripts/cache-binaries.ts
/Users/zambamon/Work/todo-cli/scripts/swift-slot.sh apps/macos/scripts/verify-write-state.py "$PWD/docs/evidence/task-search-swift/state-new"
```

The helper runs unhosted GeneratedContractTests and production TodoModel state
checks against compiled scratch HTTP. Tests run serially because their shared
scratch database and sign-in limiter are real. Require exit 0, `result.json`,
`task-search-http.json`, `state-tests.log`, `commands.json` and `cleanup.json`.
The search test creates a separate scratch Profile through the compiled CLI.
It covers literal rows/spans, both TaskListView layouts, prefix combined with
Priority/Energy/Estimate, retained pending rows, late error with changed dialog
fields and no rollback, late success, ABA, clear, Profile/view races, reload,
manual Retry, a real SSE disconnect/reconnect and current-Profile operation
recovery without Retry. It checks Copy with a named scratch NSPasteboard and
requires the same Task Version after the write and feedback timeout.
It also holds a view-reset request, changes Project and Tag before the reply,
and requires a replacement response to finish loading. An unsaved editor draft
and conflict survive view/Project/Tag navigation. Initial blank-text read failure
returns an explicit failed outcome, keeps the error visible, and succeeds on Retry.
With blank applied text, a later search failure says "Couldn't search. Showing
tasks without search." Active text omits empty priority groups in both layouts.
Project and Tag filters remain identity fields and filter the same-response
rows by their ids. Planning responses supply only membership and order.

`appliedSearchSnapshot` owns rows, original strings, spans and `appliedIdentity`.
`requestedIdentity` includes Profile, view, dialog filters, toolbar text,
Project and Tag. `searchStale` is their inequality. `setSearchText` invalidates
before its 250 ms debounce. `canPublishSearch` guards both success and error
with complete identity, latest request, generation and cancellation. Obsolete
errors cannot roll requested fields back. `followChanges` refreshes the current
requested identity on ready and operation. Search errors stay on the stream;
there is no search retry timer. Without Retry or SSE activity, Error can persist.

## Offscreen proof

Run Compact first in both appearances, then full-window:

```sh
TODO_SNAPSHOT_SEARCH_ONLY=1 /Users/zambamon/Work/todo-cli/scripts/swift-slot.sh apps/macos/scripts/verify-design.py "$PWD/docs/evidence/task-search-swift/design-new"
```

Require 56 PNGs and exit 0. Inspect every `search-compact-*-light.png`, then
`search-compact-*-dark.png`, followed by the full-window captures. States are
ready with title highlights and a description-only excerpt, typing, requesting,
empty with one Clear search action, Error with Retry and retained highlights,
valid and invalid prefix Filters, detail id, Quick add, Copied and Copy failure,
initial load failure with Retry, and offline search with retained highlights.
Geometry assertions require the shared Compact search field within the viewport
in every state, including detail and Quick add. Offline retains a visible Task
row; initial failure renders the error and recovery action in both layouts.
Offline search offers only Reconnect; its search Retry appears while live.
Detail places the secondary monospace id and icon-only Copy below the title.
Both appearances resolve the shared search-highlight token to literal sRGB
values, and geometry assertions require the id below the title.
The excerpt-trimmed state starts its long description at a whole word with a
leading ellipsis, and retains the original highlighted Canción span. Its literal
compiled regression also checks the complete displayed excerpt.
The full-window fixture uses
the production search-field content because unordered NSHostingView cannot
capture native `.searchable` toolbar chrome. Compact retains `compact-search`.
New identifiers include `filter-prefix`, `retry-search`, `search-error`,
`search-excerpt-<id>`, `task-load-error`, `task-full-id`, `copy-task-id` and `copy-task-id-feedback`.
The existing design identifier checker must still pass.

Use the parent skill's unsigned build helper through the shared Swift slot.
The headless package includes every source automatically; the Xcode project
also includes TaskSearch.swift. No native app, hosted XCTest, Keychain, signing,
installed binary or real owner database is used. Native toolbar focus, Cmd+F,
Esc, native glass and VoiceOver remain under HOLD. Offscreen fixture failure
feedback does not prove an operating-system clipboard failure.

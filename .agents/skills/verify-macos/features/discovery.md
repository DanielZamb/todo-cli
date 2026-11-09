# Authorized discovery

Open Profiles and Projects or Find Task by id from the sidebar's Discover Profiles
menu or Compact Navigate tasks menu. Discovery alone preserves navigation, toolbar
text and editor drafts. The directory groups full selectable Profile and Project
ids, including No Projects. Find uses explicit submission or Return. Invalid
prefixes send no request. Results offer full Task ids, Copy feedback and explicit
Show in the source Profile.

Run every Swift command through the active run's shared swift-slot.sh. Native
HOLD remains in force. No Todo.app, signing, hosted XCTest or Keychain is needed.

## Production state and contract

Build the source-hash CLI/server/seed cache with the existing verify-cli helper.
Set TODO_CLI_BINARY, TODO_SERVER_BINARY and TODO_SEED_BINARY from its build.json,
then run apps/macos/scripts/verify-write-state.py with a fresh absolute evidence
path. Require actual exit 0, discovery-http.json, state-tests.log, result.json
and cleanup.json. GeneratedContractTests retains the required server error pair
in batch, import and InvalidTask fixtures, and round-trips discovery payloads.

DiscoveryStateTests drives the production TodoModel and generated client against
compiled scratch HTTP. It asserts directory metadata, unchanged draft/navigation,
zero invalid requests, explicit Show from Today to a completed Task in All tasks
with its full-id prefix, exact editor id and rows through reload, Copy, draft
Cancel/Discard, late success and failure under prefix ABA, Close/reopen,
same-scope credential replacement, sign-out and offline. It also holds the
exact-id read after the dialog closes and the draft save before Show, then changes
the credential epoch and rejects navigation. The assertions use literal outcomes.

## Offscreen sheets

Run TODO_SNAPSHOT_DISCOVERY_ONLY=1 with apps/macos/scripts/verify-design.py and a
fresh absolute evidence path. Require exit 0, 88 PNGs, manifest.json,
discovery-layout.json and accessibility.json. Inspect Compact 393 by 426 first,
light and dark, then full. Both dialogs cover ready, empty, loading, error,
offline and dense scrolling content. Lookup adds Editing, Invalid, Copied and
Copy failure. Production controls render in unordered NSHostingView windows.
Geometry requires Close, Find and the prefix field inside the viewport.

Identifiers are discovery-directory, discovery-directory-list,
discovery-directory-retry, discovery-lookup, discovery-prefix, discovery-find,
discovery-results, discovery-copy-<task-id>, discovery-show-<task-id>,
discovery-error and discovery-close. Preserve compact-search and every existing
identifier expression. Run check-design-identifiers.py and an unsigned Xcode
build with CODE_SIGNING_ALLOWED=NO. Coordinator visual approval is a separate gate.

These checks do not prove native sheet focus return, Return/Escape routing,
VoiceOver, glass, actual clipboard denial or Keychain. The integrated discovery
formal skill is model-ready only until its owner maps and proves the final
production functions and await/publication boundaries. Do not renew Task search
source hashes without semantic review and proof.

Contextual Task misses use structured Profile and Task details to show
"Task not found in <Profile name>." and the actual server exit pair, plus one
Find Task by id action. Opening recovery prefills a valid id prefix and sends no
request until Find. The 24 additional U5 captures render the shared production
error notice for Show, editor, History, batch edit, import and Attachments in both
layouts and appearances. They prove the notice content, not native placement.
Agent message/recovery commands and HTTP routes never enter this notice. The
production HTTP drive also removes a found Task before Show, rejects Save for a missing Task, preserves its draft and proves recovery opens
without a request. Deleted Task History stays readable; its contextual error
notice is a typed UI fixture. A cancelled Show callback stays rejected even after another Show on
the same applied row, because each intent has a distinct id.

The same-Profile All tasks proof suppresses SSE entirely. It starts with zero
Tasks, creates a Task through compiled scratch HTTP, performs explicit Show, then
requires count 1, that exact full-id applied identity and visible row, and no
Applying state. selectView("all") explicitly refreshes even when navigation keys
already match.

The report proof selects real batch edit and Attachment targets, deletes them
through the compiled scratch CLI before Preview, and requires contextual
not-found rows and prefilled Find without another lookup request. A Deleted import
Task is refused as task_deleted. After a scratch CLI Purge, the same stale id
and Version are refused as Conflict. The import not-found screenshot
is explicitly a typed UI fixture; it proves shared notice rendering, not a live
import not-found path. Raw row details survive decoding and re-encoding, while
agent message/recovery commands and routes stay out of the human notice. Opening
Find dismisses the originating report sheet and preserves the editor/import draft.
Deleted Task History remains readable and is asserted as such.

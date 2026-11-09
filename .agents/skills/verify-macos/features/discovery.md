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
fresh absolute evidence path. Require exit 0, 64 PNGs, manifest.json,
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

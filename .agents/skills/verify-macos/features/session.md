# Session

## Sub-features

Owner passphrase sign-in, fixed Session in Keychain, restore and sign-out.

## How to get to it (user POV)

Open Todo. Enter the owner passphrase; use Settings to inspect the Session.

## Driving it with native CUA

Use passphrase and sign-in. Relaunch the compiled app and require real Task content without another sign-in.

## Gotchas

Use an isolated Keychain service per run. Never read the owner Session.
Authentication is serialized; restoration can retry after server unavailability.
Expiry returns to sign-in. Native and Keychain proof is on HOLD. Stop at the
first interaction-unavailable or cancelled status, with no retry or relaunch.

## Version guardrails

TodoModel checks the generated health endpoint before restore, before and after sign-in, and before each SSE connection or reconnect. BearerMiddleware recognizes old health bodies before generated decoding. A missing or different contract blocks Task reads and writes and replaces RootView with "Todo server is out of date". It displays the server build, the app build and Settings → Update server or scripts/upgrade-local.sh. ServerCompatibilityTests asserts literal health-only transport calls for old health and a fake contract, including a reconnect, with no SessionVault access. The same StateTests host the production filter form in unordered windows and inspect the native Status menu and its enabled state in All tasks and planning modes. TaskFilterTests uses real scratch HTTP with done and cancelled fixtures to assert exact Open and Closed titles. The existing headless state recipe runs these cases. The offscreen design recipe adds outdated and planning-status in Compact and full, light and dark, for 278 total PNGs. Native interaction, focus, glass and Keychain remain on HOLD.

## Credential epochs during HOLD

Run the active shared swift-slot wrapper around
`.agents/skills/verify-macos/scripts/verify-auth-epoch.py` with a fresh absolute
evidence directory and an immutable source commit. This standalone Swift Testing
package copies the production TodoModel and other app sources from that Git
commit. Only SessionVault is replaced with the checked-in in-memory adapter.
The generated API, transport, sign-in/sign-out methods and compiled scratch HTTP
server remain real. No Todo.app, hosted XCTest, signing or Keychain runs.

The driver starts an A metadata request, signs A out, obtains and holds its real
401, signs in B, then releases A's 401. Literal assertions require B to remain
signed in with B's outbound credential and no old notice. A separate current
credential 401 must clear the Session and show the existing Session-ended notice.
The control stops SSE first to isolate the metadata error handler. Require
actual exit 0, receipt.json, tests.log, source-provenance.json and cleanup.json.
The source receipt hashes the copied production files and the memory adapter.
Failure receipts and their actual exits remain separate from passing proof.

Network error handling and Session expiry require the captured credentialEpoch,
without a default-current value. Replacing a credential disconnects old streams
and invalidates request generations. refreshConflictDefinitions checks its epoch
before publishing success or failure. SessionVault itself remains unchanged and
its native behavior remains under HOLD.

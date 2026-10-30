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

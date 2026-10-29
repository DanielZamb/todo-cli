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

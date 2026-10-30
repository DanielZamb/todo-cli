# Installed CLI and HTTP behavior

## Sub-features

- Run every CLI acceptance case through the default installed executable.
- Run authenticated HTTP actions through the custom installed server.
- Preserve all five golden files byte for byte at their CLI-owned path.

## How to get to it (user POV)

Run the installed `todo` commands and start the installed `todo-server` with an
explicit `TODO_DB` and loopback port.

## Driving it with the shell

The helper passes absolute installed paths to verify-cli and verify-server-api.
Their existing assertions drive real compiled commands and curl requests, including
Version conflicts and Profile isolation. The golden files must match both original
Git blobs and the compiled CLI's normalized outputs.

## Gotchas

The server seed helper still compiles to provision scratch credentials. Neither
production executable is replaced with a verification build. The HTTP driver owns
and terminates only its own server process. No launchd command runs.

## Version guardrails

check-installed.sh reads binary --version output, the LaunchAgent executable and live health, the macOS bundled server, and Electron identity.json without launching an app or accessing Keychain. All destinations and expected identities accept flags or TODO_CHECK_* overrides. --require names cli, server-bin, managed-server, macos-app and electron-app. Absent optional components show not installed. Optional mismatches print WARNING and scripts/upgrade-local.sh with exit 0. Required components must exist and match. --require-present additionally requires every present component to match. The scratch drive proves a CLI-only pass, a matching bundled helper, a different compiled server build with required failure, optional warning and strict upgrade failure. Evidence includes cli-only.txt, matching-scratch.txt, required-mismatch.txt, optional-mismatch.txt and upgrade-mismatch.txt. Version reads must preserve the database directory, including the first-run marker.

The copied contract-generation fixture passes when both constants match, then fails separately for a changed TypeScript hash and a changed Swift hash. all-components-match.txt covers both binaries, the agent executable, real loopback health, the macOS helper and the Electron identity file. electron-optional-mismatch.txt and electron-required-mismatch.txt prove the Electron contract uses the same optional and required policy.

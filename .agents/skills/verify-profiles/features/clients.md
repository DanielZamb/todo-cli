# Credentials and clients

## Sub-features

Require an owner Session. Revoke scoped Access Tokens. Keep owner-wide Sessions
and unscoped Tokens. Notify connected clients and switch away from deletion.

## How to get to it (user POV)

Choose Delete Profile in Electron's Profile area or SwiftUI Settings. A second
step offers Delete Tasks too only when visible Tasks block deletion.

## Driving it with the compiled driver

The parent Launch recipe checks a real SSE ProfileDeleted frame and credentials.
The compiled-host Electron recipe checks both confirmations and an external CLI
deletion. SwiftUI's headless write-state recipe drives TodoModel against HTTP.

## Gotchas

Native app, Keychain and signing verification remain on HOLD. Offscreen views
and the unsigned Electron host use scratch credentials and no native storage.

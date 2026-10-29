# Helper signing and client destinations

## Sub-features

Unsigned helper execution and app packaging,
absolute HTTP/HTTPS destinations and fail-closed explicit overrides.

## How to get to it (user POV)

Build Todo with the existing bundle phase. Launch with `--server URL` to choose
a destination, or supply the existing `TODO_MACOS_CONFIG` client file. Installation
still requires an explicit database in Settings.

## Driving it with Foundation and compiled server commands

Run verify.sh. The unsigned scratch helper answers real HTTP through the
lifecycle proof. Signed helper entitlements remain a separate check against
user-built artifacts. ConfigurationDriver.swift
loads the same ClientConfiguration used before TodoApp creates its model.
regressions.json requires rejection of relative, credential-bearing, malformed,
missing and repeated destinations, both with and without a valid config file.
A valid config retains precedence and the ordinary default remains unchanged.

Run unsigned-build.sh separately for compile-only packaging. Require one helper
at Contents/Resources/Server/todo-server, no CodeSign action, no hardened-runtime
helper signature, and successful app compilation. The script never runs Todo.

## Gotchas

Certificate signing, notarization, native UI, XCTest and Keychain remain held.
Unsigned helper execution does not prove signed app distribution. The raw TCP
availability check is a preflight; another process can claim a port afterward.

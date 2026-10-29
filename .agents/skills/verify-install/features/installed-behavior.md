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

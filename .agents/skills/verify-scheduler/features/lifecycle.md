# LaunchAgent lifecycle

## Sub-features

Install, atomic plist replacement, reinstall, status and idempotent uninstall.

## How to get to it (user POV)

Run the compiled todo-server install with absolute TODO_DB and optional TODO_PORT.
Run todo-server status or uninstall without database configuration.

## Driving it with compiled server and launchctl

The helper uses a scratch HOME and unique app-owned TODO_SERVICE_LABEL, invokes
the real lifecycle commands, verifies /health from the launchd-started process,
saves the plist and proves uninstall removes the job and its plist. Logs and
the database remain until the verification scratch directory is cleaned.

## Gotchas

macOS GUI login is required. Install requires a compiled binary. Foreign plists
are errors. The normal label is com.todo-cli.server; never use it for this proof.

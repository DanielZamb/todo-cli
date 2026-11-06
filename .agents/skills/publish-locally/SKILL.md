---
name: publish-locally
description: >-
  Signs and installs the Todo Electron app, SwiftUI app, server, and todo CLI
  from this checkout by running scripts/sign-and-install.sh. Use when the user
  says $publish-locally or asks to publish locally.
---

# Publish locally

Run `scripts/sign-and-install.sh` from the repository root. `scripts/upgrade-local.sh` is the same command.

That script updates all four installed pieces from this checkout:

- `/Applications/Todo Electron.app`
- `/Applications/Todo.app`
- the todo CLI at `~/.local/bin/todo`
- the server at `~/.local/bin/todo-server` and the managed LaunchAgent server

Quit Todo and Todo Electron first. If the script says they are still open, stop and ask for ⌘Q. Do not kill them.

The script signs with ignored `signing.local.mk`. Do not print the team id, certificate identity, or the owner email.

Verification builds stay unsigned (`CODE_SIGNING_ALLOWED=NO`). This skill is the local publish path.

After it exits 0, report the installed build from the script's check and the commit. Do not launch either app.

# A separate Mac verification app

Status: accepted by the owner on 2026-11-12.

Build a separate, unsigned application named Todo Verification, with bundle
identifier `local.todo.verification`. It uses the production screens,
TodoModel, generated HTTP client and resources. Its only production source
change is an optional Session-storage injection seam. The production default
continues to use SessionVault and Keychain. Verification uses an in-memory
Session store and never installs in Applications.

Before constructing a window or model, require a private launch manifest with
a run-owned scratch HOME, explicit loopback URL, expected compiled server and
CLI hashes, database path, server PID and server contract/build. Reject missing
or wrong HOME, paths outside scratch, symbolic links, non-loopback URLs,
modified binaries, an unrelated listener, and a server with another HOME or
database. Provision synthetic Profiles and Tasks through the compiled CLI and
public HTTP. Never use the owner's store or managed server.

Keep verification startup and credential adapters out of the production target.
The verification project excludes TodoApp, production SessionVault,
ServerLifecycle and ServerSettingsView. It bundles no server executable and
contains no install, update or launchd implementation. The verification Server
page states that managed-server controls are unavailable. A credential trap
must fail the run before any Security credential function executes, and the
built artifact must be audited for credential references and forbidden paths.

A visible run requires the owner to have been idle for at least one minute
and neither installed Todo app to be frontmost. Stop immediately when owner
input resumes. Every Swift job uses the shared Swift slot. No developer
signature, Keychain prompt, production app launch or real data access is
permitted. V01 delivers the app, guards and a proven verify-macos-real-app
skill. Correctness review, the standing Opus UI seat and a hands-on first
launch precede V02 input automation and measurement.

This narrowly amends the native verification HOLD for this separate app.
Existing hidden recipes stay hidden and existing visible recipes stay visible.
It gives no authority to launch, sign or install Todo.app. State tests and
offscreen renders remain required but cannot establish input delivery, focus,
visible layout or input-to-render latency. The verification app cannot prove
production Keychain or startup behavior. Production integration still needs
the coordinator-arranged Terra pass.

We rejected running automated input against the installed app because it can
reach owner credentials, owner data and managed lifecycle actions. Headless
state tests alone cannot prove that a click reaches a row or that its result
renders. A second renderer would measure different screens. A separate app
shares the production interactions while giving startup and credential storage
a test-only boundary. No new dependency or HTTP protocol is needed.

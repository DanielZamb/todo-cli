# A separate Mac verification app

Status: accepted by the owner on 2026-11-12.

Build a separate application without a developer signature named Todo Verification, with bundle
identifier `local.todo.verification`. It uses the production screens,
TodoModel, generated HTTP client and resources. Its only production source
change is an optional Session-storage injection seam. The production default
continues to use SessionVault and Keychain. Verification uses an in-memory
Session store and never installs in Applications.

Before constructing a window or model, require a private launch manifest with
a run-owned scratch HOME, explicit loopback URL, expected compiled server and
CLI hashes, database path and server contract/build. The manifest server PID is
zero: the guard starts the checked compiled server itself with a fresh exact
scratch environment and retains its child handle. Attaching to an existing
server is forbidden. Check the child's open database inode, parent/start
identity and literal-loopback listener independently of health text. Reject missing
or wrong HOME, paths outside scratch, symbolic links, non-loopback URLs,
modified binaries, an unrelated listener, and a server with another HOME or
database. Open accepted files and directories without following any symlink,
retain their descriptors, require regular files to have one link, the current
UID and the root's device, and prevent replacement between check and use. Hash
the opened code descriptor against build-pinned expectations. Provision synthetic Profiles and Tasks through the compiled CLI and
public HTTP. Never use the owner's store or managed server.

Keep verification startup and credential adapters out of the production target.
The verification project excludes TodoApp, production SessionVault,
ServerLifecycle and ServerSettingsView. It bundles no server executable and
contains no install, update or launchd implementation. The verification Server
page states that managed-server controls are unavailable. A credential trap
must fail the run before any Security credential function executes, and the
built artifact must be audited for credential references and forbidden paths.
Use ephemeral HTTP sessions without credential/cookie/cache/proxy stores or
redirect following. Start the sandbox before compiled-server execution and health.
The profile allows reading the root directory's entry list through exactly
`(allow file-read-data (literal "/"))` because native executable startup opens
that public directory, and this rule grants no descendant access.
Deny credential brokers, including framework-mediated credential and cloud
services; enumerate actual linked credential imports and trap each before use.
Do not parse process listings or execute curl for validation.

Frontmost identity is read by a separate, build-pinned native metadata child
owned by the app before the app installs its profile. That child installs its
own restrictive profile before its fixed read-only LaunchServices query, denies
all networking and further execution, returns only bounded JSON through an
owned pipe and exits. It passes no broker handle to the app. The app and server
keep LaunchServices and TCC denied. Fresh metadata and live session/HID checks
are required before a window. The child is not a server supervisor.

A visible run requires the owner to have been idle for at least one minute
and neither installed Todo app to be frontmost. Stop immediately when owner
input resumes. Every Swift job uses the shared Swift slot. No developer
signature, Keychain prompt, production app launch or real data access is
permitted. V01 delivers the app, guards and a proven verify-macos-real-app
skill. Correctness review, the standing Opus UI seat and a hands-on first
launch precede V02 input automation and measurement.
Use both local and global input monitoring where permitted, plus an independent
background HID idle signal. Missing monitoring refuses a visible run before a
window. Claim each root on a checked lock descriptor and claim a machine-wide
visible lock. A partial receipt lists actual completed stages and cannot say
the complete visible recipe passed.

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

The verification build disables Xcode signing. An ad hoc bundle seal is allowed
when required for its own runtime bundle identity: the linker-only signature
reported no Info.plist binding and NSRunningApplication returned nil for the
owned process. Sealing only TodoVerification.app with its test identifier made
bundle-ID lookup succeed. The seal has no Team ID or developer authority,
installs nothing, and grants no permission to sign the production app.

The independent review rejected the initial isolation implementation. The
correction and its qualification gaps are recorded in the
[guard design](../decisions/ui-speed/mac-verification-guard-design.md) and
[implementation report](../decisions/ui-speed/mac-verification-app-report.md).
The earlier visible readback remains historical UI evidence; it does not prove
the corrected boundary. The current verification skill is draft until its own
corrected recipe passes end to end and the coordinator releases the reviews.

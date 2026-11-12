---
name: verify-macos-real-app
description: Qualify the separate Todo Verification Mac app's scratch guards and credential boundary. Visible execution is held pending coordinator release under ADR-0021.
---

# Verify the separate Mac app

Created with create-verification-skill. Read [the feature map](features/README.md).
Status: draft safety correction. The earlier ab989410 visible recipe read both
seeded Tasks, but the independent review disproved its isolation. It does not
qualify this revision. All seven review findings remain open until the new
frozen-head controls and required reviews pass. V02 and visible launches are held.

The coordinator has also held the Swift slot for candidate 7's correctness
seat. Until that hold is released, do not invoke this helper, build Swift,
run a Swift probe or regenerate the Xcode project. Node-only policy and receipt
tests may run. Elapsed time does not release either hold.

## Launch

After the Swift-slot release, from a clean committed checkout, choose a fresh
absolute evidence directory and run:

```sh
node .agents/skills/verify-macos-real-app/scripts/verify.mjs "$PWD/docs/evidence/mac-verification-app/new" --fresh-build
```

The current helper is headless only. It builds the separate verification app,
seals only that bundle ad hoc, audits it and runs --check-manifest. Its generated
build bindings set visibleAllowed=false. No current helper option releases that
gate. A headless success is PASS_HEADLESS with completeRecipe=false.
--guards-only also remains incomplete. --development permits a dirty diagnostic;
--focus-regressions requires it and cannot qualify any frozen implementation.

Every Swift action runs inside scripts/swift-slot.sh. The helper compiles the
CLI and server from the recorded committed head, pins their hashes in the test
build, and uses fresh scratch fixtures. No inherited environment is forwarded.
It never installs or launches the production app, invokes launchd or calls an
original credential function. No dependency or tracked Swift pin may change.

## Startup and isolation

The guard opens the root and each component without following symlinks. It
checks descriptors for type, ownership, device, exact resolved path and one
regular-file link. It retains descriptors, hashes them, seals immutable inputs
and protects existing directory entries. Scratch HOME, Foundation HOME and both
temporary-directory APIs must agree. The manifest, CLI/server, database, WAL,
shared memory, journal directory and instance locks use this boundary.

serverPID must be zero. The guard starts the pinned compiled server itself,
inside its sandbox, with exactly HOME, CFFIXED_USER_HOME, TMPDIR, TODO_DB,
TODO_PORT, LANG and LC_ALL. It retains the child and checks its parent/start
identity, open database inode and literal-loopback listening socket with
libproc. No ps parsing or attach path remains. The existing health endpoint has
no per-instance nonce; static build/contract health supplements the independent
kernel descriptor proof. No endpoint is invented.

Health and application sessions are ephemeral, with no credentials, cookies,
cache, proxy, redirect following or default challenge handling. The existing
clientFactory seam selects the verification transport; the generated client,
SSE parser, shared views and real Diagnostics recorder remain in use. Production
transport factories remain unchanged and are not selected by this entrypoint.
The sandbox denies unlisted Mach brokers, including credential, autofill,
Passkey, CloudKit, ubiquity, preferences and LaunchServices brokers. These
restrictions may make broker-backed UI unavailable; a held visible stage cannot
establish that every screen works under the stricter policy.

## Doctor

Read result.json, commands.json, binary-provenance.json, guard-matrix.json,
guard-reds.json, class-reds.json, node-reds.json, traps.json, trap-reds.json and
credential-import-audit.json. Every command records real exits and its explicit
environment. Refusals are 78, credential traps 79 and owner-input stops 80.
Matching positive assertions must fail at exit 1 for each scratch mutation.
An absent receipt or missing stage is unproved, never implicitly passed.

The source-and-runtime Security export census generates the trap bindings.
Audit the actual binary's imports against it, including Authorization and SOS
families. TrapProbe checks the expected handler pointer before calling it;
a missing trap returns 1 without executing the original API. Safe sandbox
queries inspect broker policy without looking up a service.

The redesign and counterfactual controls are in
[the guard design](../../../docs/decisions/ui-speed/mac-verification-guard-design.md).
Use the [implementation report](../../../docs/decisions/ui-speed/mac-verification-app-report.md)
for actual qualification state and pending work. Do not substitute older receipts.

## Visible readback and interruption (held)

After explicit release and a green guard matrix, every visible launch needs
neither installed Todo app frontmost and both session and HID idle signals of
at least 60 seconds. Monitoring permissions must already exist; no prompt is
requested. Install local/global monitors and the background HID watch before
creating a window. Unavailable monitoring refuses startup.

Read only the verification app resolved by local.todo.verification and the owned
PID. AXRead.swift must independently find V01 seeded Task alpha and V01 seeded
Task beta in that application's own window, and save its window capture locally.
Never enumerate or read the production app's windows. The currently held helper
does not perform this stage; it needs requalification after release.

The local monitor includes every exposed keyboard, mouse, gesture and tablet
event type. A separate background timer samples session-any-event and HID idle
at 50 ms intervals even when the main thread is busy. Posted keyDown and
flagsChanged controls are explicitly in-process test input, not physical input
or WindowServer delivery. A global NSEvent monitor cannot see events macOS
withholds, secure input or every event consumed by another process; the HID
signal is independent but sampled. This is bounded detection, not a hard
real-time guarantee. A process that the OS stops entirely cannot run a monitor.
Never retry automatically after owner input.

## Cleanup

The guard retains only its own child's identity and cleans that child and its
registered kernel flags on normal/trap exit. The helper tracks its own children;
an uncertain live child or cleanup retains scratch and fails. Never delete
existing evidence. Before retiring superseded build outputs, require lsof to
show no open file, preserve required symbol inputs by hash and record free disk
before/after. Keep at least the 30 GiB soft floor.

The former production-proofs wrapper is disabled because it forwarded ambient
configuration and DYLD injection. Do not run it. The required production state
and offscreen reruns need an explicitly linked, isolated replacement; historical
receipts retain their original source-head attribution. Do not silently claim
those suites were rerun on this correction.

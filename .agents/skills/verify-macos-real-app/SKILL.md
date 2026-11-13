---
name: verify-macos-real-app
description: Qualify the separate Todo Verification Mac app's scratch guards and credential boundary. Visible execution is held pending coordinator release under ADR-0021.
---

# Verify the separate Mac app

Created with create-verification-skill. Read [the feature map](features/README.md).
Status: draft safety correction. Frozen 3b53bbcf (run r3) passed guards,
red controls, 1,637 credential traps and removals, input, locks, parent death,
the fresh app build, ad hoc identity, the audit and the unguarded production
comparison (298 tests each side, same outcomes). It stopped at the deny-only
arm, which SwiftPM's nested manifest sandbox cannot run under (ruling B: arm
dropped, refusal recorded). The branch now merges installed candidate 8
(20d592d3), the production base and its Keychain link guard. A new frozen full
run is owed.
No full or visible recipe is qualified for this correction.

The earlier ab989410 visible recipe read both
seeded Tasks, but the independent review disproved its isolation. It does not
qualify this revision. All seven review findings remain open until the new
frozen-head controls and required reviews pass. V02 and visible launches are held.

Honor the coordinator's current Swift-slot hold. Finish an existing Swift job
and start none until released. The coordinator accepted exactly
`(allow file-read-data (literal "/"))` for native executable startup and rejected
the supervisor proposal. Do not widen that rule. The same protected-path and
network controls must pass inside both the app and its inherited server child.
Read the [report](../../../docs/decisions/ui-speed/mac-verification-app-report.md)
and [guard design](../../../docs/decisions/ui-speed/mac-verification-guard-design.md)
for the current evidence. The frozen 00a16176 attempt stopped at a queue-sensitive
interactive-control cleanup failure before an app build. File/server controls
now hold one Swift slot around both participants and await closure before
deleting scratch; the development controls passed, and a new frozen run is owed.
The frozen 99f6ec69 headless run passed the compiled
guards, trap/removal sweep and built-app manifest check, but failed in the
production recipe. The coordinator then separated production preservation
from the app's strict profile. The new alternating comparison and corrected
names-only import audit still need qualification from a clean head. No full or
visible helper run is qualified for this correction.

## Launch

After the Swift-slot release, from a clean committed checkout, choose a fresh
absolute evidence directory and run:

```sh
node .agents/skills/verify-macos-real-app/scripts/verify.mjs "$PWD/docs/evidence/mac-verification-app/new" --fresh-build --headless
```

The visible phase is written but remains unqualified. Before a full run, prove
the abrupt-parent-exit cleanup control, regenerate the project after the Swift
hold and freeze the implementation. The helper keeps visibleAllowed=false
during native controls, then permits a visible artifact only after a clean
frozen head and the whole guard matrix pass. It builds the separate app once,
seals it ad hoc, audits it and runs --check-manifest before any visible phase.
--headless completes only the headless scope when every headless stage passes
and the run succeeds. It reports completeVisibleRecipe=false and lists the four
visible stages in owedStages. --guards-only always remains incomplete. A failed
run cannot report completion even if its earlier stages passed. --development permits a dirty
diagnostic; --focus-regressions requires it and cannot qualify a frozen head.

Every Swift action runs inside scripts/swift-slot.sh. The driver allows a
60-minute outer budget for commands queued through that script, including the
expected-exit wrappers. Probe readiness, input and HTTP deadlines stay separate.
A queue timeout fails qualification and never excludes a predicate. The helper compiles the
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

Frontmost identity comes from a separate, hash-pinned native child before the
app installs its own profile. That child's policy denies networking, further
execution, credential brokers and owner files; only its fixed read-only query
can use LaunchServices. It exits after bounded JSON through an owned pipe and
passes no broker handle. The app and server keep LaunchServices/TCC denied.
Check a fresh handoff, then keep the background HID watch running during server
startup and recheck live idle signals before a window.

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
guard-reds.json, class-reds.json, node-reds.json, credentials/result.json,
credentials/commands.json, networking-analytics/result.json and
credential-import-audit.json. The credential result contains the actual traps
and removals arrays. Every command records real exits and its explicit
environment. Refusals are 78, credential traps 79 and owner-input stops 80.
Matching positive assertions must fail at exit 1 for each scratch mutation.
An absent receipt or missing stage is unproved, never implicitly passed.

The source-and-runtime Security export census generates the trap bindings.
The networking-only SecTrustReportNetworkingAnalytics entry has a local denial
that ignores both arguments and returns false without calling the original.
Audit its compiled body for calls/system calls before loading its probe, then
check the binding and false result. Binding removal and result inversion must
fail. Every other credential candidate remains a fail-fast trap. This hook
grants no broker or network permission and does not change app transport policy.
Audit the actual binary's imports against it, including Authorization and SOS
families. TrapProbe checks the expected handler pointer before calling it;
a missing trap returns 1 without executing the original API. Safe sandbox
queries inspect broker policy without looking up a service.

The redesign and counterfactual controls are in
[the guard design](../../../docs/decisions/ui-speed/mac-verification-guard-design.md).
Use the [implementation report](../../../docs/decisions/ui-speed/mac-verification-app-report.md)
for actual qualification state and pending work. Do not substitute older receipts.

## Visible readback and interruption (held)

The coordinator has authorized visible V01 once the whole guard matrix is
green. That condition is currently unmet. Every visible launch then needs
neither installed Todo app frontmost and both session and HID idle signals of
at least 60 seconds. Accessibility readback permission must already exist for
the driver; no prompt is requested. Install local/global monitors and the
background HID watch before creating a window. Missing monitor registration or
an unavailable HID signal refuses or stops the run. The app keeps TCC denied,
so registration does not establish delivery of every global keyboard event.
The independent HID signal remains required.

Read only the verification app resolved by local.todo.verification and the owned
PID. AXRead.swift must independently find V01 seeded Task alpha and V01 seeded
Task beta in that application's own window, and save its window capture locally.
Never enumerate or read the production app's windows. The new reader/capture
phase has not been compiled or executed yet. It requires the existing readback
permissions, a compiled fixed app-bundle path and the owned app PID. Its capture
command accepts only the window ID returned by that application's AX window.

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
existing evidence. Interactive native controls acquire one Swift slot around both participants;
readiness starts after acquisition. Release and await the child before disposal.
Before deleting a fixture or its outside sentinel, require supported lsof +D
to return 1 with empty stdout and stderr for both.
Before retiring superseded build outputs, require lsof to
show no open file, preserve required symbol inputs by hash and record free disk
before/after. Keep at least the 30 GiB soft floor.

The strict profile governs the verification app and its server child. Production
state/offscreen suites run outside it, using the original scratch-HOME recipes
through swift-slot.sh. production-proofs runs base 20d592d3 (installed
candidate 8, merged into this branch), then the frozen candidate, without a
suite sandbox. Both use candidate 8's recipes: a mirrored package with the
in-memory Session vault, and a link guard that stops the recipe if any built
test product links a Keychain call. The deny-only profile is not retained
(ruling B, 2026-11-13): SwiftPM applies its own manifest sandbox and macOS
refuses sandbox_apply inside a sandbox, which every run re-records in
deny-only-nesting.json. Every test must
have the same identity and outcome. Whole-recipe exits are compared too.
A recipe failure without a corresponding recorded test failure is unqualified;
matching partial Swift results cannot hide a failed artifact validator.
Production scratch is private under the canonical worktree .scratch directory.
Recipe output is physical under that recipe's checkout so relative artifact
validation works; the primary evidence folder links to it. Record load and shared failures; a failure
only on the candidate is a finding. production-qualification.mjs records
denyOnlyRetained=false only with that refusal, true only with guarded arms that
ran, and fails on a missing descriptor audit or a Keychain guard receipt that
is missing, checked nothing or says linked. If nesting ever
succeeds, stop for a ruling. No broker or app/server permission is added.

The production library audits descriptors only, without Security imports or
replacing defaults, temporary storage or production sources. It samples at a
nominal 10 ms interval; scheduling can delay it and short-lived opens can be
missed, as can descriptor-less path operations, child processes and IPC.
Require a completed audit for every host. The kernel query is not run for
unguarded arms: it sees only sandbox-issued denials, and the stand-in control
(kernel-query-controls.json) shows an unsandboxed touch logs nothing. It stays
required only for a guarded arm. The Keychain is covered by the link guard.
Production hosts have no API-entry attestation. The withdrawn
originalCredentialCalls field remains withdrawn. DYLD startup settings remain
excluded. The verification app/server keeps its traps, import audit and strict
sandbox boundary. The corrected comparison still needs its frozen-head proof.
The adapter substitutes the verified local resource copier for the recipe's
resource command and records the expanded arguments, environment and exits.
Historical receipts retain their original source-head attribution.

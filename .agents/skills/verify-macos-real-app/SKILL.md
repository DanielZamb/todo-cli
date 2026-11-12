---
name: verify-macos-real-app
description: Build and drive the separate Todo Verification Mac app on a compiled scratch server, test startup guards and credential traps, and read seeded Tasks through accessibility. Use for isolated real Mac UI verification under ADR-0021.
---

# Verify the separate Mac app

Created with create-verification-skill. Read [the feature map](features/README.md).
Status: draft pending the fresh committed-head recipe, production state/offscreen
proofs and linked-symbol comparison. Development readback alone does not qualify.
This recipe never launches the production Todo app. V01 covers startup and
readback only. Input automation and latency measurement belong to V02 and
require the coordinator's review release.

## Launch

From the checkout root, resolve `$PWD` and choose a fresh absolute evidence path:

```sh
node .agents/skills/verify-macos-real-app/scripts/verify.mjs "$PWD/docs/evidence/mac-verification-app/new"
```

The helper uses the compiled CLI to initialize a synthetic Profile and two
Tasks, then starts a compiled server with scratch HOME and database. Readiness
requires its loopback health within 60 seconds. It builds only the separate
TodoVerification scheme with Xcode signing and package resolution disabled. It then applies an ad hoc
bundle seal with the test identifier, no Team ID and no developer authority.
The unsealed linker-signed artifact has no runtime bundle identifier on this Mac;
the seal is required for bundle-ID-qualified accessibility. Every
Swift command goes through scripts/swift-slot.sh. It never installs an app.

The app refuses before a window unless its manifest, scratch paths, binary
hashes, listener PID, server environment and health identity all agree. The
visible run also requires neither installed Todo app to be frontmost and the
owner to have supplied no keyboard or pointer input for a minute. Owner input
ends the run. Never defeat that guard or schedule repeated launch attempts.

For a headless guard run, append `--guards-only`. This starts only the scratch
server and Foundation guard probe. It creates no app window and does not grant
permission for V02.

## Doctor

Read result.json, commands.json, guards.json, guard-reds.json, sandbox-reds.json,
trap-reds.json and local-input-red.json. Require the valid manifest to
exit 0 and every refused case to exit 78 with its literal reason. Require the
compiled hashes and PID to match the owned scratch listener before any HTTP
probe from the app. A missing prerequisite, owner activity, trap failure,
missing accessibility permission or unexpected app exit is a failed or blocked
run, never a passing empty screen.

## Drive

The visible V01 helper launches the app's own executable, restores a scratch
Session from memory and reads the accessibility tree only after resolving that owned PID by
`local.todo.verification`. Require both
literal titles `V01 seeded Task alpha` and `V01 seeded Task beta`. No setter or
fixture-only UI supplies these rows. The Tasks come from compiled CLI writes,
public HTTP, the generated client and production TodoModel/RootView.

AXRead.swift performs read-only accessibility queries. It never requests a
permission prompt. Do not use it to read the owner's apps. The helper's current
status and proof gaps are recorded in the [implementation report](../../../../docs/decisions/ui-speed/mac-verification-app-report.md).

## Evidence

Keep commands.json with real exits, result.json, guard receipts, server/app
logs, binary identities, symbol audits and accessibility.json under the named
evidence directory. Keep manifests and credentials in scratch only. A screenshot
cannot replace the two independently read Task titles or prove a mutation.
After capture, a run-owned scratch request makes the verification process post
a marked F20 event into its own NSApplication queue. Its local monitor must
exit 80. This proves the stop mechanism, not WindowServer or physical delivery.
The full recipe includes an offscreen event-queue control with that monitor
removed; the same expected-exit assertion must fail.

V01 supplies no input-to-render timings and makes no performance claim.

## Cleanup

Stop only the app and server PIDs created by this invocation. Wait for exit,
escalating TERM to KILL only for those children, then remove its newly created
scratch root. Evidence survives outside scratch. An uncertain cleanup must
retain scratch and fail. Never stop the managed server, call launchd, read
Keychain or delete an existing evidence directory.

## Helpers

- `scripts/verify.mjs <new-absolute-evidence-directory> [--fresh-build] [--guards-only]` builds,
  provisions, checks guards, optionally opens the app, reads accessibility and
  cleans its own scratch data. Qualification requires a clean committed head;
  use `--fresh-build` for the frozen-head run. `--development --visible-only`
  is a focused diagnostic and cannot qualify the complete recipe.
- `scripts/production-proofs.mjs <new-evidence> <native-evidence>` reruns the
  original state and offscreen recipes from the same clean head and compiled
  scratch binaries, with a fatal credential interposer.
- `scripts/compare-production.mjs <production-executable> <candidate6-executable> <evidence>`
  compares credential imports, SessionVault source and storage symbols.
- `scripts/GuardProbe.swift` runs the same startup validation without SwiftUI.
- `scripts/AXRead.swift <owned-app-pid>` reads that app's accessibility tree.
- `scripts/TrapProbe.c <credential-symbol>` calls a trap only after proving the
  symbol address is the fatal handler. It never calls the original credential
  function when interception is absent.
- `scripts/MemoryProbe.swift` checks memory load/save/delete and independent
  instances. The main helper compiles it with the production protocol and
  verification adapter.
- `scripts/SandboxProbe.swift <owned-sentinel-path> <other-scratch-port>` checks
  scratch file access and denied file/network/process operations. The main
  helper provisions its inputs and compiles it through the Swift slot.
- `scripts/audit.mjs <verification-app> <evidence> [production-executable]`
  checks imports, embedded trap, resources, bundle identity and optional
  production symbol exclusion without running either app.

The checkout-local Claude link resolves here. Fresh Claude discovery is a
coordinator check because this worker cannot launch children or threads.
Use maintain-verification-skill when the app boundary or coverage changes.

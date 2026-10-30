---
name: verify-macos-lifecycle
description: Prove the shared Swift macOS server lifecycle client headlessly through Foundation, compiled Bun server commands and real isolated launchd. Use after Settings lifecycle, server bundling or lifecycle client changes. Never launches Todo or accesses Keychain.
---

# Verify the macOS lifecycle client headlessly

Generated using `create-verification-skill`.
Read the [feature map](features/README.md). This is headless proof only.
Native UI, XCTest, certificate signing and Keychain remain on HOLD; this recipe grants no
permission for them. A separate unsigned compile-only build passed with
signing disabled. Its command and artifact observation are recorded in
[unsigned-build.json](../../../docs/evidence/w03/unsigned-build/unsigned-build.json).
That compile did not launch Todo and does not prove signed runtime behavior.

## Launch

Resolve the checkout with `git rev-parse --show-toplevel`, then run:

```sh
.agents/skills/verify-macos-lifecycle/scripts/verify.sh "$PWD/docs/evidence/w03/headless-new"
```

Choose a new absolute evidence directory. Require macOS, a GUI launchd domain,
Swift 6, Python 3, Bun and pnpm-installed dependencies. Never install Bun.
The helper checks the 10 GB disk floor before each compilation. It compiles
the production server through the actual bundling script with
`CODE_SIGNING_ALLOWED=NO`. Agents never sign, including ad hoc signing.
The unsigned helper runs every lifecycle and HTTP check. Helper entitlements
and hardened signing require the user's `make sign-desktop` artifacts and are
a separate unproven check. It compiles
`ServerLifecycle.swift` and `TaskSnapshot.swift` with Foundation-only drivers.
No native app is built by verify.sh. The recipe also compiles the pre-W02 S03 lifecycle
source from commit `7cfb2418351446119c992c6a257238114f9ec101`, relocating only
imports to installed dependencies and the current server. This proves
repair accepts its older JSON response and replaces that executable with the bundle.
Readiness is the real loopback `/health` returning exactly
`{service:"todo-server",contract,build}`. Exit 0 and `PASS; headless lifecycle only; evidence
survived cleanup` finish the proof.
The configuration driver includes the production `ClientReads.swift`,
`Recurrence.swift` and `AttachmentSnapshot.swift` dependencies of `TaskSnapshot.swift`. The unsigned
bundle retains `THIRD_PARTY_NOTICES.txt`, which is copied into the evidence.

## Doctor

Read `actions.json`: the initial Swift `status` command must exit 0 with
installed=false, loaded=false and no configuration. Its HOME must be under
`todo-w02-verify-*`; its label must be `com.todo-cli.server.verify-<pid>-<nonce>`.
No database exists before Install. The driver requires an existing resolved
HOME named `home` directly inside its `todo-w02-verify-*` temporary root.
Database and executable paths, including installed repair configuration, must
resolve within that root. Symlink paths, including dangling links, are rejected. Any launchctl error is a failed prerequisite,
never permission to manage the owner's agent. Every lifecycle process strips
inherited TODO_* variables and receives the scratch HOME and unique label.

## Drive

The helper invokes `scripts/Driver.swift` compiled with the same implementation
used by Settings. Separate driver processes exercise status, explicit install,
repair/restart and uninstall; no setter, database fixture or domain writer exists
in the Swift proof. Real S03 commands own the LaunchAgent and SQLite writes.

It first rejects malformed, missing and repeated explicit `--server` overrides,
including with a valid config file present. Configured destinations use the same
absolute HTTP/HTTPS validation. A valid config retains its existing precedence.
The configuration driver imports no Session, Keychain, UI or managed startup code.
Before credential setup, TodoApp loads that same configuration.

A raw TCP listener blocks fresh Install before any helper copy, database or agent
write. It also blocks Repair of an unloaded installation. The proof compares
executable, database and plist bytes, confirms the agent stays unloaded and
connects again to the unrelated listener. The production probe is nonblocking
and polls for at most 250 ms. Port zero remains a dynamic-port repair.

It rejects invalid database input and repair without configuration, installs
at an explicit database and loopback port, checks repeated status and rejects
a second install without changing its plist. Sending SIGKILL through launchctl to the unique
run-owned service target proves KeepAlive recovery without a PID reuse race. Repair restarts and preserves
configuration, including after a manual bootout. Repeated uninstall removes
the job and plist while retaining the database. A separately installed server
with another executable, database and port proves existing configuration and
configuration survives repair while the executable refreshes. Read `actions.json` for exact commands and exits.

## Evidence

Keep `commands.log`, `actions.json`, `installed.plist`, `supervision.json`,
`preserved.json`, `path-isolation.json`, `cleanup.json`, `regressions.json`,
`regression-actions.json`, `regression-cleanup.json`, launchd logs and `result.json` in the named
evidence directory. Command inputs and observed JSON/exit codes are paired.
Literal assertions check configuration, filesystem side effects and health;
PID changes prove a restart rather than merely accepting a success response.
No UI screenshot can replace the held native Settings proof.

The relative `.claude/skills/verify-macos-lifecycle` link resolves here.
Fresh Claude discovery is untested; link resolution alone is not discovery.

## Cleanup

The Python finalizer always uninstalls only its unique label, confirms both
installed and loaded are false, and waits for its loopback ports to close.
Commands run in separate process groups. Timeout and cancellation census every process group in the owned session,
freeze them until the census stabilizes, then stop and reap them before any
final uninstall. TERM escalates to KILL and a final session census must be empty. Cancellation during that cleanup is deferred, then reported.
A `command-unsafe` marker blocks uninstall and scratch deletion whenever
descendant termination is uncertain. It saves logs before teardown. The shell removes only its newly created scratch
directory, binaries, database, WAL and HOME. Evidence survives outside scratch.
Either an active-agent marker or command-unsafe marker retains scratch if teardown fails. Use the recorded binary,
HOME and TODO_SERVICE_LABEL from `actions.json` for a focused uninstall;
never use the default agent, owner HOME/database or kill by process name.

## Helpers

- `scripts/verify.sh <new-absolute-evidence-directory>` builds, drives and cleans.
- `scripts/verify.sh <new-absolute-evidence-directory> regressions` runs only
  the configuration and raw-TCP regressions with an unsigned helper.
- `scripts/unsigned-build.sh <new-absolute-evidence-directory>` compiles Todo
  with signing disabled, even with an explicit ad hoc identity. It never runs
  the app, checks there is one helper at Resources/Server, and removes DerivedData.
- `scripts/check-signature.py <helper> <evidence>` reads an existing signature
  and exact helper entitlements without running the helper.
- `scripts/regressions.py <scratch> <evidence>` uses the compiled Foundation
  drivers to exercise configuration rejection and raw-TCP preservation.
- `ConfigurationDriver.swift` loads the production client configuration
  and prints its destination, with no Session or Keychain dependency.
- `scripts/drive.py <scratch> <evidence>` runs all mapped headless features.
- `scripts/test_headless_safety.py -v` proves timeout/cancellation descendant
  cleanup and uncertain-cleanup retention using disposable Python processes.
- `scripts/owned_process.py` is the shared owned-command runner imported by
  the drive and synthetic checks.
- `scripts/legacy-source.py <root> <scratch> <evidence>` extracts the pinned
  production lifecycle/main sources and retains provenance hashes.
- `Driver.swift` accepts `bundle home label status|install|repair|uninstall`
  with `database port` for Install. Its scratch, resolved path and label guards apply before mutation.

Use `/maintain-verification-skill` when lifecycle behavior changes.

## Version guardrails

The isolated launchd drive compiles a different build, then proves Update and Repair replace it, preserve configuration and restart the agent. See [the feature recipe](features/repair.md) for commands and expected evidence.

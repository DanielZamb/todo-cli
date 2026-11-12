# Todo Verification

This separate, uninstalled Xcode project shares the production Mac screens and
model through a memory Session adapter and existing clientFactory injection.
Its identifier is local.todo.verification. Production startup, SessionVault,
managed-server lifecycle and the server bundle are excluded.

Status: safety correction in progress. Visible runs and V02 are held. The
coordinator also currently holds Swift builds/tests/generation for another
correctness seat. Do not invoke a Swift helper until that hold is released.
The current generated build explicitly refuses a visible invocation.

Read [the verification skill](../../../.agents/skills/verify-macos-real-app/SKILL.md),
[the guard design](../../../docs/decisions/ui-speed/mac-verification-guard-design.md)
and [the report](../../../docs/decisions/ui-speed/mac-verification-app-report.md).
They distinguish executed controls from pending work and historical receipts.
No new frozen-head/end-to-end qualification has passed for this correction.

The launch manifest names only a canonical private scratch root, HOME, temp,
compiled binaries, database and literal loopback destination. serverPID is zero:
the guard starts and retains its own compiled child. It checks the child's open
database inode/listening socket through libproc. Descriptor ownership, device,
link count, no-symlink traversal and kernel replacement protections apply to
accepted inputs. Hashes are pinned into the build independently of the manifest.

Health and ordinary/stream sessions use a verification-only ephemeral policy.
Unlisted Mach brokers, including securityd.xpc, preferences, LaunchServices,
credential providers and cloud services, are denied before requests. Memory
UserDefaults and descriptor-bound Foundation temporary directories avoid ambient
storage. The broader read-denial policy currently needs startup qualification;
broker-backed UI compatibility is unproved while visible runs remain held.

CredentialSymbols.inc is generated from the SDK export/runtime census. The
artifact audit enumerates actual imported credential functions. Each binding
has a unique fatal interposer; TrapProbe verifies the pointer before invoking
it. A missing binding returns without calling the original function. No test
is allowed to fall through into a credential API.

The project generator is add-target.rb. Regenerate only after the hold is
released, then audit source membership and pins. Swift compilation must run
through scripts/swift-slot.sh, with signing and package resolution disabled.
Only the verification bundle may receive an ad hoc seal, required by the prior
runtime bundle-ID experiment. No developer identity or installed app is used.

A future released visible run must claim its checked machine lock, identify
the frontmost application without reading its windows, establish both idle
signals and install input monitors before a window. Accessibility reads must
resolve this bundle identifier and the owned PID. No physical input or latency
claim follows from the in-process marked-event stop controls.

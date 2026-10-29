# W01 handoff: native verification on HOLD

2026-10-27, branch `clients/w01-finish`, base `527b12b`. Local commits only.

The user stopped native app, XCTest and Keychain verification after repeated
prompts. The coordinator killed r9 driver 28456 and its descendants. The
subsequent worktree-scoped check found no Todo app, UI runner or xcodebuild
left. No native flow was relaunched after the stop. No further attempt is
authorized without explicit current user consent.

## Current fixes and retained proof

The first max correctness review required four fixes. Authentication now
serializes restore and sign-in; a valid Session has an explicit restore retry
after an outage; quick-add controls freeze during submission and snapshot
metadata before awaiting; History ignores old editor, Profile and request
completions. Five deterministic regressions were added. All 18 XCTest tests
passed in r9 before the hold. The final CUA drive repeated create/edit,
complete/reopen, a real rejected Conflict and explicit resolution, History,
Keychain restoration, planning views, Profile isolation and MenuBarExtra.

The same final binary handled a killed server read-only, then replayed a
compiled CLI Task created while offline. Observed Settings values were
cursor 20, live 22, reconnects 4. Scratch state confirms TaskCreated 21 and
ReminderFired 22. Native notification approval was absent and no OS delivery
receipt appeared. That delivery remains blocked. The r9 focused light
XCTest run was interrupted; r9 is not a complete passing driver result.

Earlier r7 completed the full driver with exit 0, a 13-test suite and one
passing light and dark UI case each. Its clean screenshots are retained for
design review, but they predate the four review fixes and MenuBarExtra accent
correction. `evidence/w01-finish-r9` keeps newer behavioral captures and the
user-stop receipt. The required final max review and guard proofs are
recorded there. Do not present r7 captures as proof of the final binary.

Independent HTTP read proof passed 36 requests; compiled CLI/SSE proof passed
ordered replay, Profile filtering and revoked-stream closure. API generation
and its repeat were byte-identical. `pnpm typecheck` passed. No domain module,
canonical API contract, server source or shared-domain source was changed.
This W01 note is superseded by W06 below. Move, Revert and Series now use S05.

## Why the harness must change before another attempt

The old focused helper rebuilt an ad hoc app and automatically relaunched
the original service after each run, including failure. UI modes also changed
hardened-runtime settings. Separate test services did not prevent that older
Session restoration, and both hosted unit tests and UI cases wrote Keychain.
Those paths can request trust again after identity changes or unavailable
Keychain interaction. The exact OS cause of each prompt was not classified;
no new Keychain probe was attempted after the user stopped the run.

Both native shell entry points now default to exit 78 unless
`TODO_VERIFY_NATIVE_UI=1` accompanies current consent. All direct macOS helpers
have the same guard. Denial occurs before evidence, scratch or helper commands.
The non-interactive Python suite proves the guards and one-process fail-fast
handling of a cancellation receipt. Neither app was run for these tests.

The macOS verification environment disables Keychain interaction before model
creation, records OSStatus only, and stops on a failure receipt or cancellation.
There is no automatic retry, relaunch, hardened-runtime override or Keychain
cleanup command. Secure production queries, accessibility and ACLs stay as
before. All Swift sources typecheck without execution. The verification-only
Security interaction API is deprecated; its behavior remains runtime-unproven.
The new guard and cancellation path have static and Python proof only.

The W01 final max validation at `914fbc0` required two P2 cleanup fixes.
N01 fixes them from parent HEAD `7511896`. `run_once` decides its exit after
cleanup, returns 130 for deferred cancellation, and restores the prior signal
handlers even when spawn or cleanup fails. Focused cleanup waits one second
after TERM and one second after KILL, then aborts on a survivor. Signals use
macOS audit tokens, including the PID version, rather than a bare PID.
App ownership must match its captured token and exact executable path.
Driver command validation is bound to matching tokens before and after the
check. The outcome marker is published before resuming the captured driver,
including when cleanup fails. Deferred TERM/INT revokes a published finish
marker through resumption. The helper requires SIGSTOP to reach the captured
driver before terminating the app or starting native work.
A failed cleanup, timeout, cancelled run or failed export cannot finish the
core proof. The focused entry restores its original handlers on every exit.

N01 used disposable Python processes only. No Todo, Electron, XCTest or
Keychain operation ran. Production secure storage and ACLs are unchanged.
The native-process access path is fail-closed but remains unproven against
hardened native binaries. Apple documents the audit-token PID-version check
in [XNU process lookup](https://github.com/apple-oss-distributions/xnu/blob/main/bsd/kern/kern_proc.c).

Synthetic regression receipts, each test invocation preceded by
`design/macos/scripts/disk-guard.sh` with exit 0:

```sh
PYTHONDONTWRITEBYTECODE=1 python3 .agents/skills/verify-macos/scripts/test_native_guard.py NativeGuardTests.test_cancellation_during_successful_cleanup_blocks_next_launch -v
# Before: exit 1, both TERM and INT preserved code 0. After: exit 0, code 130 and no launch/finish marker.
PYTHONDONTWRITEBYTECODE=1 python3 .agents/skills/verify-macos/scripts/test_native_guard.py NativeGuardTests.test_focused_cleanup_escalates_detached_child_and_resumes_driver -v
# Before: exit 1, detached TERM-ignoring Python child still running. After: exit 0, child stopped, unrelated process alive, driver resumed.
PYTHONDONTWRITEBYTECODE=1 python3 .agents/skills/verify-macos/scripts/test_native_guard.py -v
# After: exit 0, all 12 tests pass, including the six existing guards.
PYTHONDONTWRITEBYTECODE=1 python3 .agents/skills/verify-macos/scripts/test_native_guard.py NativeGuardTests.test_focused_cleanup_escalates_detached_child_and_resumes_driver NativeGuardTests.test_stored_process_reuse_is_rejected_before_pause_or_build -v
# Review round 1 before: exit 1, no marker on SIGCONT and both reused identities accepted. After: exit 0.
PYTHONDONTWRITEBYTECODE=1 python3 .agents/skills/verify-macos/scripts/test_native_guard.py NativeGuardTests.test_focused_failures_abort_and_resume_driver NativeGuardTests.test_stored_process_reuse_is_rejected_before_pause_or_build -v
# Review round 2 before: exit 1, late TERM/INT exposed finish on SIGCONT and missing driver allowed build. After: exit 0.
git diff --check
# Exit 0.
```

The suite also covers stale PID-version rejection without signalling a live
process, restored signal handlers, and focused timeout, export, cancellation
and surviving-child failures. N01 uses one read-only Codex `gpt-6.1-sol` max seat with a bundled comment
pass, at most two rounds. Round 1, client request
`todo-n01-solmax-correctness-r1-20261027`, returned CHANGES REQUIRED for
publication after SIGCONT and unvalidated fresh app/driver tokens. Both
findings were reproduced and fixed as recorded above. No comment deletion
was proposed. Round 2, client request
`todo-n01-solmax-correctness-r2-20261027`, included the original brief, prior
findings and responses. It confirmed both first-round fixes, then returned
CHANGES REQUIRED for late cancellation before SIGCONT leaving a finish marker
and silent ESRCH allowing native work without a paused driver. Both second-round
findings were reproduced and fixed locally with the receipts above. The final
suite passed all 12 tests after those fixes. Both rounds proposed no comment
changes, with zero deletions, restorations or MUST KILL flags.

Both allowed review rounds are used. The last independent verdict remains
CHANGES REQUIRED; the subsequent local fixes have Python proof but have not
received another correctness review. No third review or native attempt was
started. N01 does not grant native runtime approval.

Before requesting another native attempt:

1. Resolve stable signing and UI-runner loading with unchanged hardened runtime.
2. Have the user confirm an available, approved Keychain path once. Do not
   broaden ACLs or substitute plaintext. Review any recorded failure first.
3. Obtain fresh consent for one bounded attempt. Do not export the opt-in
   globally, automatically retry or reuse earlier consent.
4. Check that Keychain interaction fails closed without prompts, then re-prove
   the full compiled flow and refresh light and dark design captures.

Run-owned Keychain entries may remain after the interrupted run. No cleanup
access was attempted during the hold. Service identifiers are non-secret
run metadata; cleanup needs a later approved non-prompting path.

## Required follow-up: ADR-0001 server lifecycle

This scope is required and is not waived. The current app connects to a
configured server; SwiftUI must install and supervise the server LaunchAgent
before complete native delivery. The user directed this as separate follow-up
work after the current fixes and bounded code review.

Bundle the compiled S03 server without introducing a second domain writer.
Provide install, status, repair/restart and uninstall through its lifecycle
interface. Decide bundle location, stable code signing, loopback port discovery
and ownership before wiring Settings. Preserve existing owner installations.

Prerequisites: read ADR-0001, S03 lifecycle code and verify-scheduler; define
an isolated LaunchAgent label and scratch HOME/database for proof so testing
cannot replace the owner's agent or open the real database. Obtain explicit
approval before any interactive native verification. Prove first install,
relaunch supervision, server restart, status and uninstall on that isolated
agent. Update verify-macos and run its full compiled flow afterward.

Coordinator visual approval, final guarded native proof, actual notification
delivery and fresh Claude skill discovery remain open. The relative skill
link resolves correctly. Do not mark W01 complete or L1/L3 delivery approved.

## W02: native server lifecycle implementation, headless proof only

2026-10-27, branch `t3/macos-server-lifecycle`, base `7cfb241` on effect-port.
Settings now reads managed status and exposes explicit Install, Repair / restart
and confirmed Uninstall. Nothing installs on app launch or Settings appearance.
A new install requires the database path and port, copies the bundled server
to a stable per-user Application Support location, then invokes compiled S03.
Repair uses the installed executable, database and port, including pre-W02 S03
binaries. It does not silently upgrade them. The configured HTTP address remains
unchanged; Settings displays a different managed address separately.

The only server change extends read-only lifecycle status with validated plist
configuration. No auth, HttpApi, domain or database opening logic changed.
The app target and project generator include a server resource phase backed by
`apps/macos/scripts/bundle-server.sh`. Standalone bundling was exercised more
than once. The default Ruby lacks xcodeproj, so generator execution was not
completed; the checked-in project references, plist syntax and generator Ruby
syntax were checked without Xcode. No gem or Bun installation was attempted.

The new create-verification-skill-generated recipe is
`.agents/skills/verify-macos-lifecycle`, with a relative Claude link. It compiles
the shared Foundation source and production server, uses unique verify labels,
scratch HOME/database and loopback, and retains commands/exits in
`docs/evidence/w02`. Headless proof covers explicit install, repeated status,
refused duplicate install, server death/KeepAlive recovery, restart, repeated
repair, repair after bootout, pre-W02 executable/configuration preservation,
idempotent uninstall, retained data and final job/port/scratch cleanup.

All Swift app sources passed compile-only checking using the existing W01
local dependency modules. Server tests passed 15 cases across 3 files, including
configuration round-trip, port zero and malformed configuration preservation.
Server typecheck, scoped Biome, project plist and shell/Ruby syntax passed.
The historical headless-r2 attempt failed during legacy import relocation,
before any driver/agent launch; its scratch directory was removed. The corrected
legacy compilation and complete proof passed in headless-r3.

Native UI and full app build, XCTest, Keychain, notification delivery, stable
signing/notarization, distribution architecture coverage and coordinator visual
approval remain held/unproven. No Todo or Electron process ran for W02. The
headless helper explicitly clears any inherited signing identity. Fresh Claude
skill discovery has not been run; relative link resolution passed. This work
does not claim complete native delivery or lift the W01/N01 HOLD.

The final headless receipt is `docs/evidence/w02/headless-final/receipt.json`,
exit 0. Its random-suffixed verify label and service-targeted launchctl SIGKILL
avoid collisions and PID-based signalling. Cleanup confirmed agent and plist
absence, closed ports and removed scratch while preserving evidence.

W02 review round 1 (client request `todo-w02-solmax-correctness-r1-20261027`)
returned CHANGES REQUIRED for two harness safety gaps: timeout/cancellation
could leave the server-command descendant running, and standalone driver paths
could name outside databases or accept a substring/symlink HOME. Both were
fixed. Commands now own separate process groups, stop/reap descendants before
uninstall, defer cancellation while stopping and retain scratch on uncertain
termination. The driver resolves paths with POSIX realpath and validates the
scratch HOME, install database and repair database/executable before mutation.
The full corrected proof is `docs/evidence/w02/review-fixes-final/receipt.json`,
exit 0, including three synthetic timeout/cancellation/uncertainty checks and
eight outside/symlink path checks. The outside sentinel was itself run-owned;
no real owner data or service was used. Round 1's bundled comment audit found
zero deletion candidates, MUST KILL flags or suppressions. Round 2 also returned CHANGES REQUIRED; see the final disposition below.

W02 round 2 (client request `todo-w02-solmax-correctness-r2-20261027`) confirmed
path isolation resolved, but found the cleanup fix incomplete: Foundation
commands can occupy separate process groups in the same command session.
The first Python fixture inherited its parent's group, hiding that topology.
The runner now takes a session-wide census, freezes every owned group until
stable, sends TERM/CONT then KILL as needed, reaps and requires no session
members before clearing command-unsafe. Timeout and cancellation fixtures now
spawn a TERM-ignoring child in its own group with stdout/stderr redirected.
Both pass; uncertain cleanup still retains its marker and unrelated processes
survive. The final full recipe was rerun at `docs/evidence/w02/post-review-final`.

Both allowed W02 review rounds are used. The last independent verdict remains
CHANGES REQUIRED. The subsequent session-wide cleanup correction has local
headless proof only and has not received another independent review. No third
review or native attempt was started. Round 2's bundled comment audit covered
14 source/build files: zero deletion candidates, MUST KILL flags or suppressions;
it skipped five shebangs and fourteen generated Xcode annotations. Raw review
results, including task IDs and exact findings, are retained in review-r1.json
and review-r2.json under docs/evidence/w02.

W03 retains W02's ServerLifecycle, ServerSettingsView, explicit database selection
and single Resources/Server helper path. It ports only W01's helper entitlements,
bounded TCP occupancy refusal and fail-closed destination validation. No
LocalServer controller, default database selection or verify-macos-service skill
was added. TodoApp validates configuration before credential setup.

The extended headless recipe uses an ad hoc hardened scratch helper with the
five official Bun entitlements. Native UI, XCTest, Keychain, certificate signing
and owner data remain held. See `docs/evidence/w03/README.md` for regression
receipts, full lifecycle/HTTP proof, unsigned compile-only build and review.

W03's full-r3 headless proof passed all 56 configuration/raw-TCP regressions,
three cleanup checks and the existing lifecycle/HTTP preservation checks. The
unsigned compile-only app build passed with signing disabled and one helper.
One Sol max read-only review with bundled comments passed in round 1 with no
findings, deletions or MUST KILL flags. No second review was needed. Exact
commands, signatures, cleanup and review reports are in `docs/evidence/w03/`.

W05 registers the running bundle with LaunchServices before creating the
notification center and preserves NSError domain, code and description in
Settings and app.log. The project generator now supplies bundle versions.
`docs/evidence/w05-notifications/README.md` records the stale-record hypothesis,
headless permission proof, pnpm check, matching regeneration and passing unsigned
Debug compile. One Sol max read-only correctness review passed with no findings.
The comment audit found no handwritten comments or MUST KILLs; generated filename
annotations remain to preserve exact regeneration.

W05 remains BLOCKED on signed Debug. Its owned bundled-server codesign process
waited in Keychain ACL access and was terminated without a retry or prompt
interaction. The build returned 65. The unsigned artifact is compile proof only;
do not use it to restore a Session. No app or XCTest was launched. Native
notification permission, delivery and steps 5-10 remain unproven. After signing
is resolved outside this held attempt and new consent is given, use the revised
verify-macos step 5: request once, pause for the user's Allow, and preserve the
actual domain and code if authorization throws. Original error details were
lost by the old catch block, so the injected unit-test error is not native evidence.

## W06 implementation and headless proof

The [W06 report](../../docs/evidence/w06/REPORT.md) maps all ten W01 findings
and D02 polish to the changes. Move to Profile, History Revert, and Series
create/edit/skip use the generated client. Thirteen headless Swift Testing tests
and compiled scratch HTTP writes passed, with durable Version and History checks.
The macOS verification skill now includes the repeatable headless write recipe.

The unsigned Debug build, pnpm check, API regeneration and byte-identical project
regeneration pass. Signing settings are unchanged. Agents never sign; every
xcodebuild uses CODE_SIGNING_ALLOWED=NO. Signed builds come only from
make sign-desktop in the user's Terminal. This order supersedes older signing
authorizations recorded above.

No native app, hosted XCTest, Keychain or notification permission flow ran for
W06. The coordinator still owns native screenshots, focus and sizing checks,
and visual acceptance in the final supervised session.

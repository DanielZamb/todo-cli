# Mac verification app V01

Status: V01 complete; ready for review. V02 remains held for coordinator review.
Branch: `feat/mac-verification-app`.
Frozen implementation head: `ab989410cef89b5670fc2a6101698441753b5ec5`.
The initial checkout matched candidate 6,
`8b9be429751165d4ecef11f3f23d1844384e54b4`, exactly.

All final runtime qualification receipts below belong to the frozen head.
The later handoff commit changes only this report and the skill documentation.
It does not restamp binaries with the handoff SHA. Earlier development receipts
identify their own source head and are excluded from final qualification.

## App boundary and production diff

The separate TodoVerification project builds production RootView, TodoModel,
generated API, resources, Diagnostics, Quick add and Settings. Its own name is
Todo Verification and its bundle identifier is `local.todo.verification`.
It excludes TodoApp, production SessionVault, ServerLifecycle and
ServerSettingsView, has no bundled server or lifecycle implementation, and is
absent from production target membership, installation and packaging paths.
Its Server page says managed controls are unavailable.

The only production source edit is the Session storage injection seam in
TodoModel: a MainActor protocol, production SessionVault conformance, optional
constructor injection and an immutable storage property. The default constructs
the original SessionVault with the same service and account. SessionVault source,
production Xcode project, installers and packaging checks are unchanged.
MainActor isolation also preserves compatibility with the existing memory-vault
auth-epoch fixture; its literal typecheck passes. No production behavior fix
or test-source substitution is included in this branch.

Verification injects MemorySessionVault; an accidentally used verification
fallback SessionVault fails immediately. Entry validation precedes SwiftUI App,
AppStorage, model and window construction. The private canonical manifest binds
scratch HOME/CFFIXED_USER_HOME, all scratch paths, CLI/server hashes, loopback
listener ownership, server HOME/database and exact health build/contract.

The verification-only sandbox denies writes outside scratch, owner-home reads
except the app bundle, execution of other processes, securityd lookup and
outbound connections except its scratch server port. Its negative controls use
run-owned sentinel files and live scratch listeners. They never probe the
owner's Todo data or managed server. The securityd control queries sandbox
policy without contacting the service.

The embedded interposer covers 240 credential-family exports plus
SecCopyErrorMessageString. The app imports no Security function directly.
TrapProbe proves direct and dlsym pointer identity before calling a fatal
handler. A missing binding returns without invoking the original function.
Every binding is tested both present and individually removed.

## Identity and first successful visible launch

The initial visible-launch gate correctly refused while the owner's Todo app
was frontmost. The coordinator then authorized resumption after bringing Finder
forward. Every later visible attempt had its own frontmost/idle preflight; the
production app was left alone in the background.

A linker-only unsigned build had valid Info.plist identity but returned nil for
its owned PID's NSRunningApplication bundle identifier. The census checked
only the recorded owned PID and the test bundle ID from both scratch and normal
reader environments. Own-bundle LSRegisterURL, scratch cwd and removal of the
parent's inherited CF bundle ID did not correct it. The local receipts are
`identity-premise.md`, `identity-signature-before.log`, `resume-development-6`
and `identity-clean-parent` under the evidence root.

An explicit ad hoc seal of only TodoVerification.app restored runtime bundle-ID
lookup and AX readback. The recipe therefore builds with CODE_SIGNING_ALLOWED=NO
and then runs `codesign --force --sign - --identifier local.todo.verification
--timestamp=none <verification-app>`. Its receipt requires adhoc, no Team ID
and no Authority. No developer signing identity is used. The before/after
control is `identity-adhoc-control`; its screenshot was visually inspected and
shows the production All tasks screen, Profile verify, two Tasks and the two
literal seeded titles.

The frozen-head launch passed preflight with Finder frontmost and combined
session idle 38343.429 seconds (HID idle 38343.429 seconds). Its capture was
visually inspected: All tasks, Profile verify, exactly two P3 Tasks titled
V01 seeded Task alpha and V01 seeded Task beta, with no load-error banner.
The local capture is frozen-ab989410/window.png; the independent read is
frozen-ab989410/accessibility.json and the stop receipt is interruption.json.
The recipe returned 0 with completeRecipe true, development false, cleaned
true and 1077 recorded commands. Artifact hashes are in artifact-sha256.json. AX resolves the test bundle
identifier, requires its owned PID, and reads only its own main window.
Its window number comes from that AX window through _AXUIElementGetWindow;
there is no global window enumeration or fallback to another application's
windows. Captures remain ignored local evidence.

## Input interruption proof

The first CGEvent.postToPid diagnostic exited 0 but produced no receiver
receipt and did not stop the app. It is retained as a failed delivery attempt,
not a passing input proof. V01 supplies no general input driver.

After successful AX readback and capture, a file in the accepted private
scratch root requests one marked F20 event. The verification process posts it
into its own NSApplication event queue. The ordinary local monitor observes
the V01 marker and exits 80. This proves in-process event handling and the stop
mechanism; it does not establish physical input or WindowServer delivery.

An unmarked event in that window takes the same monitor path and exits 80 as
owner input. Input elsewhere updates the session idle clock, checked every
100 ms. Quiet/recent-input literal fixtures and an inverted clock-predicate
control prove that decision. The offscreen local-event probe runs the same
monitor; removing it makes the expected-exit-80 assertion fail with exit 1.
No owner key content or pointer coordinate is logged.

The first frozen attempt at d31510af60acbb765a168ef6674baf536463e0fa
passed every headless/red control and built the app, then its decoy listener
raised an unhandled ECONNRESET before AX readback. It exited 1 without a
complete recipe result. Its app and server were absent at recovery; lsof
confirmed scratch was closed before removal. Recovery and logs remain in
frozen-d31510af. The helper now records expected decoy resets and fails on
unexpected errors. That helper-only fix is included in the final frozen head;
the fresh qualification repeats all controls.

## Commands and actual exits

Evidence root: `docs/evidence/mac-verification-app` (ignored, local only).
Exact argv and real child exits are preserved in each commands.json, including
expected nonzero guard/trap/red-test exits. All Swift builds, tests and scripts
run inside scripts/swift-slot.sh. The native helper owns that lock for its
whole recipe and verifies the lockf parent; production suites each own it for
the whole original recipe. Xcode package resolution and updates are disabled;
SPM resolution is disabled and tracked pins remain unchanged.

| Command | Actual exit/result | Local receipt |
| --- | --- | --- |
| `sh scripts/disk-guard.sh`, then `/usr/bin/lockf -k /tmp/todo-pnpm-check.lock pnpm check` | 0, then 0 | root-check-frozen-ab989410.json and .log |
| `node .agents/skills/verify-macos-real-app/scripts/verify.mjs "$PWD/docs/evidence/mac-verification-app/frozen-ab989410" --fresh-build` | 0; full recipe PASS, 1077 command receipts | frozen-ab989410/result.json and commands.json |
| Fresh production Release compile through the Swift slot (exact command below) | 0; clean build, source unchanged | production-build-ab989410/result.json and build.log |
| `node .agents/skills/verify-macos-real-app/scripts/production-proofs.mjs "$PWD/docs/evidence/mac-verification-app/production-ab989410" "$PWD/docs/evidence/mac-verification-app/frozen-ab989410"` | 0; both original recipes PASS; scratch removed | production-ab989410/commands.json and result.json |
| `scripts/swift-slot.sh apps/macos/scripts/verify-write-state.py <production-evidence>/state` | 0; 238 tests/45 suites, 3 Diagnostics state tests, 2 contract tests | production-ab989410/state.log and state/commands.json |
| `scripts/swift-slot.sh apps/macos/scripts/verify-design.py <production-evidence>/offscreen` | 0; 10 tests/10 suites; 872-image production manifest | production-ab989410/offscreen.log and offscreen/commands.json |
| `node .agents/skills/verify-macos-real-app/scripts/compare-production.mjs <production-executable> <candidate6-executable> <symbol-evidence>` | 0; six imports unchanged; 26 storage symbols added, none removed | symbols-ab989410/comparison.json |
| `node .agents/skills/verify-macos-real-app/scripts/audit.mjs <verification-app> <symbol-evidence> <production-executable>` | 0; verification exclusion and production storage present | symbols-ab989410/audit.json |

Fresh production compile command (build only):

```sh
scripts/swift-slot.sh xcodebuild -project apps/macos/Todo.xcodeproj -scheme Todo -configuration Release -destination platform=macOS -derivedDataPath .scratch/mac-production-symbols/DerivedData -clonedSourcePackagesDirPath .scratch/mac-verification/DerivedData/SourcePackages -disableAutomaticPackageResolution -skipPackageUpdates clean build CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO ONLY_ACTIVE_ARCH=YES
```

The verification app is at
`.scratch/mac-verification/DerivedData/Build/Products/Release/TodoVerification.app`.
The production executable for the last two commands is
`.scratch/mac-production-symbols/DerivedData/Build/Products/Release/Todo.app/Contents/MacOS/Todo`.
The immutable candidate-6 executable is
`.scratch/candidate6-symbols/DerivedData/Build/Products/Release/Todo.app/Contents/MacOS/Todo`.
It was built from a git source archive at 8b9be429751165d4ecef11f3f23d1844384e54b4,
never the performance worker's live checkout. That compile exited 0; the
receipt is candidate6-symbol-build.log. The symbol evidence directory is
`docs/evidence/mac-verification-app/symbols-ab989410`.

The root check uses the separately authorized clock-fix merge
`391592593f9ea40aa1fac02b7c010ca0018f8953`, containing exactly reviewed commit
`6b167266fc34c3304e30ed220bb652b4d17c05ab`. Its earlier pre-merge failure is
retained in root-check-first.log. The frozen-head check passed 387 domain,
69 CLI, 32 server and 168 Electron tests, plus one existing Electron skip.
The closed Bun temporary left by the root check was removed after lsof showed
no open descriptor; its retirement receipt is root-check-retired-ab989410.json.

## Guard matrix and red controls

The Foundation bad-manifest matrix has 15 cases: valid is 0, every bad case
is 78 with its literal reason. Built-app --check-manifest runs valid at 0 and
eight bad cases at 78 before creating a window: missing manifest, wrong HOME,
missing HOME, non-loopback URL, server hash, CLI hash, unrelated listener and
wrong contract. Frontmost/idle fixtures accept Finder at 120 seconds and
reject unknown frontmost, either Todo app and active owner input at 78.

Each row below has an isolated source copy with the matching predicate
inverted. The unchanged valid-launch assertion passes for baseline (0), then
fails for that mutant (real test exit 1; guard probe 78). Guard source and
replacement are retained in frozen-ab989410/guard-reds.json.

| Control | Guard | Matching red test exit | Mutant probe exit |
| --- | --- | --- | --- |
| 0 | Manifest location under private tmp | 1 | 78 |
| 1 | Manifest/root lstat and non-symlink | 1 | 78 |
| 2 | Manifest/root owner and private mode | 1 | 78 |
| 3 | Canonical manifest path | 1 | 78 |
| 4 | Generated client contract | 1 | 78 |
| 5 | Canonical run root | 1 | 78 |
| 6 | All launch paths within scratch | 1 | 78 |
| 7 | HOME, CFFIXED_USER_HOME and effective home | 1 | 78 |
| 8 | Compiled CLI/server hashes | 1 | 78 |
| 9 | Server PID greater than one | 1 | 78 |
| 10 | PID executable equals compiled server | 1 | 78 |
| 11 | Exclusive loopback listener PID and address | 1 | 78 |
| 12 | Server HOME/database environment | 1 | 78 |
| 13 | Exact health identity | 1 | 78 |
| 14 | Session prefix and nonempty Profile | 1 | 78 |
| 15 | Ownership/health subprocess success | 1 | 78 |
| 16 | Manifest presence | 1 | 78 |
| 17 | Explicit loopback URL | 1 | 78 |
| 18 | Known frontmost application | 1 | 78 |
| 19 | Neither Todo app frontmost | 1 | 78 |
| 20 | At least one minute idle | 1 | 78 |
| 21 | Session input clock decision | 1 | 78 |
| 22 | Own-bundle registration success | 1 | 78 |

All nine sandbox literal observations are true: scratch read/write, bundle
read, scratch-server connect, denied owner-path read/write, denied global
write, denied other-port connect, denied process execution and denied
security-service lookup. Ten isolated sandbox controls remove each of its
eight allow/deny rules or invert its install-result/owner-lookup guards.
Every matching behavior assertion fails with real test exit 1 (underlying
behavior probe 1 or refusal 78); the unmodified baseline exits 0.

| Sandbox control | Removed rule or inverted guard | Red test exit | Probe exit |
| --- | --- | --- | --- |
| 0 | Global file-write denial | 1 | 1 |
| 1 | Owner-home read/write denial | 1 | 1 |
| 2 | App-bundle read allowance | 1 | 1 |
| 3 | Scratch read/write allowance | 1 | 78 |
| 4 | Outbound-network denial | 1 | 1 |
| 5 | Scratch-server port allowance | 1 | 1 |
| 6 | Process-execution denial | 1 | 1 |
| 7 | securityd lookup denial | 1 | 1 |
| 8 | Successful sandbox-install result | 1 | 78 |
| 9 | Owner-home lookup availability | 1 | 78 |

The 241 individual credential-binding removals each make the matching
expected-exit-79 test fail with exit 1. The underlying probe exits 1 without
calling an original Security function. With all bindings present, all 241
handlers exit 79. The app's embedded trap also exits 79. The memory-save
assignment removal fails its unchanged load/save/delete assertion, test exit 1.
The local-monitor removal fails the required exit-80 assertion, test exit 1.
Receipts: trap-reds.json, traps.json, sandbox-reds.json, sandbox.json,
memory-red.json and local-input-red.json in frozen-ab989410.

## Production preservation and limits

The production Release build completed at the frozen head with sourceUnchanged
true and no Xcode CodeSign action. It was never launched. Against the immutable
candidate-6 build, the six credential-function imports are exactly unchanged:
SecCopyErrorMessageString, SecItemAdd, SecItemCopyMatching, SecItemDelete,
SecItemUpdate and SecKeychainSetUserInteractionAllowed. The storage-symbol
subset adds 26 symbols and removes none. The comparison covers credential imports
and storage-related symbols. SessionVault
source SHA-256 remains
101ad59877b3446eb95db6766f91590b4e31985558a9fc9ba3f2b07d390f60c5.
The verification artifact has no direct Security function imports, embeds its
trap and contains its memory adapter. Production retains SessionVault and has
none of VerificationManifest, MemorySessionVault, ScratchSandbox or the test
entrypoint. Receipts: symbols-ab989410/comparison.json, audit.json and
commands.json.

The original production state recipe passed without a Session adapter or
test-source substitution: 238 Swift Testing tests in 45 suites, the separate
3-test Diagnostics state pass, and two contract tests with no failures. It
used the same frozen-head CLI/server/seed binaries, scratch homes and database,
and a fatal credential interposer. Its original durable SQLite/HTTP assertions
also passed. state/result.json reports nativeAppLaunched false,
keychainAccessed false and scratchRemoved true.

The full original offscreen recipe passed with 10 tests in 10 suites and an
872-image production manifest. All 872 renders settled in exactly two captures;
over-limit, late-change and stale-on-first-layout lists are empty. The images
are scale 2, exported as sRGB independently of the host display. An extra
attachment-preview fixture PNG is outside the production manifest. The compact priority
and full planning-filter captures were visually inspected. The recipe's build,
presentation checks, app-source typecheck, assets, graph resources and
accessibility identifier check all exited 0. This remains an offscreen proof;
its result explicitly records nativeGlassVerified false. See
production-ab989410/offscreen/result.json and commands.json.

The production helper returned 0 at the same frozen head and removed its scratch
home. Native and production binary hashes, per-file source hashes and build
metadata are retained in their provenance receipts. The scratch server health
reported build ab989410. No source changed during either qualification.

No production app executable was launched. The installed Todo app was never
activated or quit, and its windows and data were never inspected.
No original Keychain credential function, developer identity, real Todo store,
managed-server operation or launchd action was used. The only frontmost-app
metadata came from the required preflight. No child agent or thread was
launched. The no-comments delegated pass and fresh Claude skill discovery
remain coordinator checks under the explicit no-children order.

The verify-macos-real-app skill is now proven end to end by the complete
committed-head recipe and is no longer draft. Development --visible-only runs
explicitly set completeRecipe false. There are no input-to-render measurements, latency
claims or V02 interaction controls here. Correctness review, the Opus Mac UI
seat and the coordinator-arranged hands-on launch still precede V02.

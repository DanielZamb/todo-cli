# Mac verification app V01

Status: BLOCKED at the first visible-launch gate. V02 has not started.
Branch: `feat/mac-verification-app`.
V01 implementation commit: `ed04175c0aa34d713a5d527d49306d26b7a8d6fb`.
The checkout initially matched `8b9be429751165d4ecef11f3f23d1844384e54b4` exactly.

The complete recipe passed its headless controls and built-app startup guards,
then the app exited 78 with `Todo Verification refused: The owner's Todo app
is frontmost.` No verification window appeared. The helper stopped its scratch
server and removed its scratch root. No visible retry was attempted. The owner
must be away, with neither installed Todo app frontmost, before the coordinator
resumes this proof. The verify-macos-real-app skill is explicitly marked draft
because seeded Tasks have not yet been read through a visible app's accessibility
tree. No first-window capture exists.

## Implemented boundary

The separate TodoVerification Xcode project uses bundle identifier
`local.todo.verification`. It builds production RootView, TodoModel, generated
API and resources, and uses the production Task, Diagnostics, Quick add and
Settings views. It excludes production TodoApp, SessionVault, ServerLifecycle
and ServerSettingsView. Its Server page states that managed controls are
unavailable. It contains no bundled server or lifecycle implementation.
The production project, production SessionVault source, installer and packaging
check are byte-identical to the base.

The only production source edit is the optional SessionStorage injection seam.
The default constructs the original immutable Keychain-backed SessionVault with
the same service and account. Verification injects MemorySessionVault. Its
fallback SessionVault fails immediately if injection is accidentally omitted.
Production linked symbols retain SessionVault and contain no VerificationManifest,
MemorySessionVault, ScratchSandbox or verification entrypoint.

VerificationEntry checks the manifest before constructing the SwiftUI App,
AppStorage properties, model or windows. A private manifest binds scratch HOME,
CFFIXED_USER_HOME, canonical scratch paths, loopback URL, compiled CLI/server
hashes, listener PID, server HOME/database and health build/contract. The app
also requires the generated client's contract. Manifest location and privacy
are checked before its content is read. POSIX realpath avoids Foundation's
special temporary-path normalization.

The verification-only runtime sandbox allows scratch file writes, denies
owner-home file access except the app bundle, denies process execution, and
limits outbound networking to the scratch loopback port. Negative file controls
use only a sentinel created by this run outside its scratch root. They never
probe the owner's Todo store.

The separately embedded credential-interposer library covers 240 exported
Security credential symbols plus SecCopyErrorMessageString. The app executable
imports no Security credential API. TrapProbe checks both direct-import and
dynamic-lookup pointer identity before invoking the fatal handler. A missing
interception exits without calling an original Security function. All 241
checks exited 79, and the separately built app's embedded library also trapped
SecItemCopyMatching with exit 79.

## Commands and actual outcomes

Local evidence root: `docs/evidence/mac-verification-app`.
The complete argv, exits and individual logs are in `full-1/commands.json`.
Evidence is ignored by Git and survives scratch cleanup.

| Command or check | Actual result | Receipt |
| --- | --- | --- |
| `pnpm install --frozen-lockfile --offline --ignore-scripts` | 0; pins unchanged | `install.log` |
| Canonical disk guard, then `/usr/bin/lockf -k /tmp/todo-pnpm-check.lock pnpm check` | First run 1 at the known expired-authentication clock failure; 384 domain tests passed | `root-check-first.log` |
| Authorized merge of exactly `6b167266fc34c3304e30ed220bb652b4d17c05ab` | Merge commit `391592593f9ea40aa1fac02b7c010ca0018f8953` | Git history |
| Same disk guard and locked root check after that merge | 0; domain 387, CLI 69, server 32, Electron 168 plus 1 existing skip | `root-check-clock.log` |
| Unsigned Release TodoVerification build through `scripts/swift-slot.sh`, automatic resolution/package updates disabled | 0; no CodeSign action | `full-1/build-app.log` |
| Unsigned Release production Todo compile through the Swift slot, same resolution/signing limits | 0; never launched | `build-production-symbols.log` |
| `audit.mjs <verification-app> <evidence> <production-executable>` | 0; credential imports, resources and production exclusion pass | `audit.json`, `production-symbols.txt`, `verification-imports.txt` |
| Foundation manifest matrix | 15 literal outcomes pass | `full-1/guards.json` |
| Built application manifest checks with `--check-manifest` | Valid case 0, eight bad cases 78; no window constructed | `full-1/app-guards.json` |
| Credential trap checks | 241 expected exits 79 | `full-1/traps.json` |
| Memory Session load/save/delete and separate-instance control | 0 | `full-1/memory-session.log` |
| Scratch sandbox control | 0; all five literal booleans true | `full-1/sandbox.json` |
| Embedded app credential trap | Expected 79 | `full-1/embedded-trap.log` |
| Accessibility reader compilation | 0 | `full-1/build-ax.log` |
| Full skill helper | 1 because the app's frontmost-owner guard refused the visible launch with 78 | `full-1/result.json`, `full-1/app.log` |

The unsigned build commands use `-configuration Release -destination
platform=macOS -disableAutomaticPackageResolution -skipPackageUpdates build
CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO ONLY_ACTIVE_ARCH=YES`.
The production compile additionally shares the verification SourcePackages
cache and uses its own DerivedData. No developer identity was used.

## Guard matrix

| Input | Foundation probe | Built app |
| --- | --- | --- |
| Valid owned scratch manifest | 0 | 0 with no window |
| Missing manifest | 78 | 78 |
| Manifest symbolic link | 78 | Not separately driven |
| Public manifest permissions | 78 | Not separately driven |
| Wrong HOME | 78 | 78 |
| Missing HOME | 78 | 78 |
| Non-loopback URL | 78 | 78 |
| Unrelated listener at the selected port | 78 | 78 |
| Wrong server PID/executable | 78 | Not separately driven |
| Server hash mismatch | 78 | 78 |
| CLI hash mismatch | 78 | 78 |
| Database outside scratch | 78 | Not separately driven |
| Different scratch database in the manifest | 78 | Not separately driven |
| Health build mismatch | 78 | Not separately driven |
| Contract mismatch | 78 | 78 before health |
| Owner's Todo app frontmost | Not applicable | 78 before any window |

An unrelated scratch listener substitutes for the managed-server-port case.
No request, read or lifecycle operation targeted the owner's managed service.
The sandbox probe proved scratch read/write, denied read and write of the
run-owned sentinel under the owner-home tree, denied execution of true, and
EPERM for another live scratch loopback port. The sentinel bytes stayed intact.

## Failed attempts retained

The missing-manifest stub first returned 0 instead of 78, producing a real
failing assertion. The first credential probe rejected interception without
calling Security because the compiler folded a comparison of distinct extern
functions. A volatile pointer comparison fixed that probe, after which all
241 checks trapped. Per-guard deliberately broken builds have not been shown;
the red-first receipt covers the missing-manifest behavior, not every guard.

The first unsigned verification build exited 65 at a verification-only actor
isolation error, fixed by isolating the build-label property. The first guard
fixture rejected a valid temporary path, corrected with POSIX realpath. A
wrong-database fixture initially lacked the alternate file and reached path
rejection instead of the intended server-environment check; that fixture now
creates its own alternate file. The first sandbox probe rejected the policy's
numeric-host spelling. macOS requires `localhost` in that policy expression;
the corrected five-control proof passes. All failed attempt directories remain.

## Provenance, cleanup and remaining work

The successful working-source proofs preceded the implementation commit above.
Compiled CLI/server metadata reports source head
`391592593f9ea40aa1fac02b7c010ca0018f8953`; exact hashes and source-input digest
are in `full-1/binary-provenance.json`. They are not claimed as binaries stamped
with the later implementation or report commit. A resumed qualification must
build from the frozen implementation head and use fresh scratch data.

The full helper reports `cleaned: true`. Its owned listener was PID 93562 and
its run root no longer exists. Cleanup retired one own closed Bun temporary
of 88,660,864 bytes and two initial Foundation probe binaries of 196,880 bytes
combined, after lsof checks. Receipts are in `retired.json`. Build caches remain
local for review. No runtime artifact is committed. No package pin changed.
No files were added under packages/domain; the only domain changes are the
explicitly authorized reviewed clock-fix merge.

No production app, installed app, original Keychain function, developer signing
identity, managed-server operation, launchd action or real Todo store was used.
Every Swift build/test/script command used scripts/swift-slot.sh. No child agent
or thread was launched. The no-comments skill's delegated pass and fresh Claude
skill discovery were not run under the explicit no-children instruction.

V01 remains incomplete. Required next proofs are the visible seeded-Task AX
readback and capture, owner-input interruption, a fresh compiled run from the
frozen head, and complete per-guard red controls. The production state/offscreen
suites were not rerun; the new memory and startup controls and both compile-only
builds are recorded above. Correctness review, the standing Opus UI seat and
the coordinator-arranged hands-on first launch remain gates. No V02 input driver,
latency measurement or performance claim is included.

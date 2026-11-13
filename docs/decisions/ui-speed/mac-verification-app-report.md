# Mac verification app V01 safety correction

Disk stop on frozen qualification head de9ee85309176faed0e310c563f6df686305bbb1. The helper's
--fresh-build --headless command exited 1 after shared free disk crossed the
30 GiB floor at 29.9236 GiB. An operator-disk-stop receipt and swift-hold marker
prevented another Swift job. The current stale-metadata control finished at
78, fixture/tool closure checks passed, and cleanup completed. The raw error
uses the helper's generic coordinator-hold wording; the marker came from the
coordinator's standing disk floor, not a new review-seat hold. completeRecipe
and completeVisibleRecipe are false. No app was built or launched at this head.
All seven findings remain open for final qualification and review.

Receipts: docs/evidence/mac-verification-app/frozen-de9ee853/. result.json,
commands.json and binary-provenance.json name the frozen head. receipt-index.json
links the component receipts by hash to that invocation; original receipts were
not restamped. No visible preflight was attempted. The fixed metadata component
runs headlessly and grants no idle or visible-run authority.

| Frozen command/control | Actual result |
| --- | --- |
| Clean source check; scratch CLI and both server builds; native probe builds | 0 |
| In-memory Session control and compiled bootstrap | 0 |
| App-role literal-root baseline | 0; matching test 0 |
| App-role literal removed / widened subpath / widened file-read* | 78 each; matching tests 1 each |
| Server-child literal baseline | Accepted; matching test 0; intentional owned-server termination 130 |
| Server-child literal removed | SIGABRT; matching test 1 |
| Server-child widened subpath / widened file-read* | 78 each; matching tests 1 each |
| Owned metadata helper baseline / three removals | 0 / 78 each; matching tests 0 / 1 each |
| Owned-server guard; seeded Tasks through its public API; metadata-child validation | 0 each |
| Stale metadata-child validation | 78 |
| Full helper --fresh-build --headless | 1; disk stop; cleanup true; completeRecipe false |

| Review finding | Qualification at this frozen head |
| --- | --- |
| MV-S1-1 ambient configuration / network reach | Strict app/server root-boundary controls pass; full hostile-environment and class-red controls pending |
| MV-S1-2 file identity / hard links | Native code compiled; full file matrix and class/predicate reds pending |
| MV-S1-3 server ownership | Owned-server and seeded API readback pass; foreign-server/replacement and class-red sweep pending |
| MV-S1-4 credential boundary | Native boundary library compiled; complete trap/removal sweep, fresh app and corrected import audit pending |
| MV-S1-5 all owner input | Input probes compiled; full delivered-event and red controls pending |
| MV-S1-6 instance exclusion | Probe compiled; explicit-release instance controls and reds pending |
| MV-S1-7 completion receipt | Node development controls pass with matching mutants failing; frozen full recipe remains incomplete |

The full guard/class/predicate/trap sweeps, including predicate 18 with no
exclusion, remain owed at this frozen head. Then the fresh app/audit, alternating
8b9be429/candidate production comparison and final standing-order-27 root check
remain owed. The latter did not run because the prerequisites were incomplete.
The production comparison continues to use deny-only protection, zero observed
protected denial attempts and the nominal 10 ms descriptor audit, as recorded
in ADR-0021. No production API-entry claim or startup-loading setting was added.
The four visible stages and V02 remain held.

After the stopped job settled, supported lsof +D checks returned 1 with empty
stdout and stderr for each retired root. Hashes were preserved before removing
all own compiled caches and the retained base Swift build. This retired
1,714,531,870 logical bytes. Immediate free-space samples were 30.1368 and
31.7899 GiB; other units' activity explains the later pre-cleanup sample being
above the original floor-crossing sample. post-stop-retirement.json records
the exact bytes, closure commands and hashes. No own Swift job remains running.
The base source clone remains, but its build tree and both arms' compiled
binaries have been retired. A resumed qualification will need those artifacts
built again; no new verification app build has occurred on this head.

The implementation commit below this report freezes the queue-safe interactive
controls. The focused dirty-driver controls used native probes compiled from
00a16176 and retain that attribution. The earlier no-comments instruction's
child review was not launched because this worker's explicit no-children rule
wins; the local changed-code scan found no added comments or suppressions.

The frozen 00a16176125e872d36a10590a58ffc0466fdaa86 attempt failed before
completing the guard matrix. Its interactive server-replacement readiness timer
included the shared Swift-slot queue. Cleanup then removed the synthetic
outside sentinel while that native job was starting. The child refused because
the sentinel was absent; this is a test-driver failure, not a sandbox escape.
The receipt remains FAIL with completeRecipe=false. No app was built and no
production comparison or final root check ran in that attempt.

Interactive file/replacement controls now acquire the slot once around both
participants. Readiness starts after acquisition, and the driver releases and
awaits the native child before cleanup. Instance controls use an explicit
release file instead of a two-second hold. Disposal requires a supported lsof
+D result of exit 1 with empty stdout and stderr before removing either the
fixture or its outside sentinel. Asynchronous records settle on close, so a
late child cannot append evidence after the final receipt.

Development controls reused the probes compiled from 00a16176. The protected
file swap passed at 0, the unprotected replacement was detected at 78, and the
corrected server replacement was refused at 78 with zero replacement requests.
The first server-driver attempt used the wrong mode name and failed its
readiness assertion; that receipt is retained too. These are development
controls, not a new frozen qualification. Receipts are interaction-recovery-
00a16176 and interaction-recovery-00a16176-server-fixed. Closed recovery trees
and superseded 00a binaries were hashed and retired, totaling 734,209,248
logical bytes. Immediate free space rose from 36.04 to 36.48 GiB. Receipt:
frozen-00a16176/closed-recovery-retirement.json. Shared-volume changes affect
the physical difference. The visible recipe and V02 remain held.

Resumed under the coordinator's 6892b2a1 ruling: no startup loader setting and
no production-test API-entry attestation. The production audit now links only
the descriptor sampler. Its C startup, late-load and synthetic-descriptor
controls pass; the deny-only policy baseline passes and both removals fail.
The app/server trap and strict-profile boundary is unchanged. Production
preservation requires matching base/head outcomes, a guard that changes no
base outcome, zero observed protected-path/Keychain-service denials in the
whole-run own-PID kernel query, and the nominal 10 ms descriptor audit.
Any guard-induced change or protected denial stops with evidence; no widening
or silent fallback is allowed. originalCredentialCalls remains withdrawn.

A new result-parser regression first failed at exit 1: surplus Swift Testing
cases concealed an omitted XCTest case under the old combined-count check.
Coverage is now checked separately for both frameworks. Literal tests pass at
0; the removal must fail at 1. The parser handles Swift Testing's companion XML
and serial XCTest's complete per-test console records, preserving identities
and outcomes. These remain development receipts until the next frozen run.

Previous stop: production credential instrumentation was unproved in SwiftPM's
late-loaded test hosts. No new frozen full recipe or visible launch is qualified.
The app and its server profiles are unchanged. No broker was introduced.

The production-boundary ruling is encoded in ADR-0021, the architecture and
skill. The alternating comparison records exact XML identities/outcomes and
load, and rejects differing results even if totals agree. Its literal tests
pass; the accept-differences mutation fails at 1. The deny-only C policy control
passes at 0; removing its file or service denial fails at 1. The descriptor
auditor's ordinary control passes at 0; holding an unread synthetic protected
file exits 78; removing that detector makes the matching test fail at 1.
These are development component receipts, not production preservation.

The base 8b9be429 test package compiled successfully at exit 0 after the shared
Swift wait. Its two test-host processes then refused in the new binding check
before any test ran, leaving no XML results. The original state command and
outer diagnostic exit 1. A small C dlopen reproduction exits 79 on the missing
AuthorizationCopyInfo binding; the literal expected-zero test fails at 1.
It does not invoke the original API. The same audit linked at executable
startup verifies all 1,638 bindings and passes. The audit library loading is
therefore not equivalent in the two hosts. Receipts:
production-comparison-probe-e32843ac-v2,
production-comparison-controls-e32843ac and production-late-binding-red-e32843ac.
All name the development tooling head e32843ac, the committed base and the
actual native-cache source head 99f6ec69. Nothing is restamped.

The earlier strict production-development receipt's
originalCredentialCalls=false field did not verify late interposition and is
withdrawn as API-entry evidence. Its strict file/broker denial was independent;
this correction does not disprove the standalone verification-app/native
controls. No production preservation claim is made from those old state runs.

Dropping the nonworking trap library would leave the required no-credential-
binding attestation unsupported for the unguarded base comparison. A fixed,
hash-pinned startup-loading setting from a fresh environment is a possible
next step, but the earlier class-A subprocess instruction excludes DYLD
variables. No such setting or startup launcher has been implemented or tried.
The coordinator must rule before that step. No test service boundary is
proposed. Dynamic rebinding is not selected: Apple's
[dyld header](https://github.com/apple-oss-distributions/dyld/blob/main/include/mach-o/dyld_priv.h)
explains that it cannot repair pointers a running program already copied, so it
would not establish startup coverage by itself.

Pending: that instrumentation ruling, the unguarded/deny-only base and candidate
comparison, a clean frozen full headless pass with the corrected import audit,
and the final root check. The visible recipe and V02 remain held. The baseline
build/cache is retained for resumption so the same source need not be rebuilt.
Superseded e32843ac candidate binaries were retired only after supported lsof
+D returned 1 with empty stdout/stderr. Hashes were kept for 361,659,272 logical
bytes. Immediate free-space samples were 50,620,669,952 / 51,022,979,072 bytes,
or 47.14 / 47.52 GiB. Shared-volume activity can affect that difference.
Receipt: production-superseded-cache-retirement-e32843ac.json. No own Swift
job remains running.

Resumed under the coordinator's production-suite ruling. The strict profile
continues to govern only the verification app and its server child. Production
state/offscreen preservation runs outside it, alternating base 8b9be429 and
the candidate. A narrow deny-only guard for real Todo/Keychain paths and
Keychain services is kept only if it changes no base outcome. No broker is
introduced. The revised harness keeps the production sources, defaults and
temporary-directory behavior, links credential traps and samples descriptors.
Its exact-test-list comparison has passing literal tests; a mutation that
accepts differing outcomes fails at exit 1. New frozen qualification is pending.
The earlier block and all earlier receipts below retain their attribution.

Previous blocked handoff at e32843ac: production-suite confinement compatibility, not
qualified. The runtime artifacts and frozen controls belong to
`99f6ec69f098aa22964adf9df6deacbea99e641b`. Subsequent audit/launcher corrections
are diagnostic changes and must qualify from a new clean head. All seven
findings remain open for final closure. completeRecipe is false. The owner-use
hold was honored: no visible preflight or visible launch occurred, and V02 is held.

The corrected development launcher reached the original state suite. Its
command exited 1, with Package.resolved unchanged. All 26 XCTest contract tests
passed; Swift Testing ran 238 tests in 45 suites and reported 17 issues. The
issues include file-type classification, offscreen bitmap rendering, two
private named-pasteboard paths, the process-resource sampler and a search
timeout. This is not a passing production preservation receipt. The subsequent
diagnostics commands and offscreen recipe did not run because the state command
failed. Evidence: production-development-99f6ec69-queue-budget, including its
state/state-tests.log, expanded-commands.json and result.json. Its scratch
server exited and the enclosing root was removed only after lsof returned 1
with empty stdout and stderr.

Own-PID kernel evidence identifies denied LaunchServices map/modify queries,
CARenderServer, Metal compiler, window manager, pasteboard and /dev/fd access,
among other framework requests. File-type classification uses Foundation
contentType values; the copy tests use UUID-named NSPasteboards; the sampler
opens /dev/fd. These observations identify the compatibility classes, but do
not isolate each rendering failure to one broker. The filtered kernel query
exited 0 and is retained in production-99f6ec69-filtered-suite-denials*.json.
The preceding unfiltered capture exhausted its buffer and is explicitly partial,
not a complete denial inventory.

No broker or file permission was added. ADR-0021 requires the app and server
to keep LaunchServices/TCC denied, and the coordinator's ruling permits only
literal system-file reads supported by kernel evidence. A broad broker grant
cannot demonstrate that delegated work stays in scratch, particularly a
LaunchServices modify query. The coordinator must decide the separate
production-test boundary before further qualification. A possible direction
is a test-only service boundary for fixed offscreen rendering, system type
queries and UUID-named pasteboards, with credential services still denied and
no general pasteboard or owner-file capability. Its safety and compatibility
are unproved; it is not implemented or selected as an app-profile exception.

Still owed: that decision and the production-suite pass, one clean frozen-head
full headless recipe using the corrected audit/launcher, and its final root
check. The helper now places the root check after production reruns, using one
disk guard followed by the standing-order lock command. The earlier root exit
0 belongs to 99f6ec69 and is not restamped. The visible recipe, skill promotion
and coordinator-arranged reviews also remain pending.

The failed state build tree was retired after supported lsof +D returned 1
with empty stdout and stderr. Hashes for 6,996 entries were retained, totaling
1,075,609,221 logical file bytes. Free space sampled immediately before/after
was 67,230,113,792 / 68,354,613,248 bytes, or 62.61 / 63.66 GiB. Concurrent
workers can change the shared volume, so the observed increase is not claimed
as this worker's exclusive physical reclamation. Receipt:
production-development-99f6ec69-queue-budget/retire-build.json and its hashes.
No Swift job remains running. The latest built verification app and its pinned
runtime cache remain available for artifact review; closed temporary server
roots and superseded build trees have been removed.

The frozen 99f6ec69 attempt passed the 102 native cases, 15 class reds, all
63 predicate inversions, the 1,637 trap/removal pairs and the separate analytics
binding/result controls. Predicate 18 ran and no predicate was excluded. Its
fresh app built, sealed ad hoc and accepted its manifest at exit 0. The locked
root check also exited 0. The attempt remains FAIL because the production
recipe could not start its scratch server. No visible phase was attempted.
Receipts: frozen-99f6ec69. These results retain their original head attribution.

The artifact audit then exposed a false-pass risk in the audit itself. Darwin's
nm emitted bare undefined names; the parser expected a U column and counted
zero library imports. That count is withdrawn. A literal parser test failed
first, and the corrected audit explicitly requests names-only output, rejects
unexpected columns and requires every generated binding to appear. Independent
enumeration found 1,638 Security imports in the trap library, all accounted for,
and none in the app executable. The corrected development audit passed on the
same built app. Receipts: frozen-99f6ec69/import-parser-red-and-independent-check.json
and import-audit-green-development-99f6ec69. A scratch empty-parser mutation
fails its matching test. This tooling correction still needs a new frozen run.

The production adapter's server exec allowance named a symlink, while Seatbelt
checked its resolved target. Resolving the owned binary before constructing
the literal allowance removed exit 71. The next server failed on a denied
read of the checkout working directory. Running it in its scratch database
directory restored readiness without adding a permission. Own-PID kernel
evidence is in production-canonical-exec-denials.json. Both failed development
attempts are retained. The state recipe then exhausted its ten-minute budget
after waiting for the shared Swift slot; the adapter now adds the prescribed
twenty-minute queue allowance. A source-hashed stable isolation-library path
avoids rebuilding Swift sources solely because a temporary link path changed.
Development libraries must be rebuilt from a clean committed head before
qualification. The production sources and their recipes are unchanged.

Latest correction before refreezing: 8806ba09 passed 102 native cases, 15 class
reds, all 63 predicate inversions with no exclusions, all 1,638 fail-fast
bindings and all 1,638 removals. The fresh app built and passed its artifact
audit, but --check-manifest exited 79 on SecTrustReportNetworkingAnalytics.
That attempt remains FAIL with completeRecipe=false. Production suites and
the root check had not started. Receipts: frozen-8806ba09.

[Apple's Security header](https://github.com/apple-oss-distributions/Security/blob/main/trust/headers/SecTrustPriv.h)
declares this as a networking analytics entry. The correction does not execute
it: one local denial ignores both arguments and returns false. All other
credential candidates remain fail-fast traps, and all broker denials remain.
The census accounts for 1,637 fail-fast bindings and one locally denied
analytics entry. The built-artifact audit checks that entry's disassembly for
calls or system calls before checking its binding and false result.

The initial compiled analytics probe exited 79 and its expected-zero assertion
failed at 1. The corrected component passed at 0; binding removal and a
true-result mutation each failed at 1 without calling an original function.
Its optimized denial consists of mov w0, #0 followed by ret. Scratch copies of
the built verification app, labelled as development overlays, passed the
manifest check at 0 with that library alone. No transport exception or sandbox
allowance is added. Metadata-only variants with the original library still
trapped at 79. Evidence: analytics-red-8806ba09,
analytics-green-development-8806ba09 and ats-diagnostic-8806ba09-v2/-v3/-v4.
The original failed attempt's closed build tree was retired after an empty
supported lsof check; hashes for 2,945 files and 840,411,958 logical bytes are
preserved. A new committed head must qualify this changed library.

Current attempt: resumed after the coordinator reported 44.9 GiB free. The
checkout sample was 43.9 GiB. The coordinator now requires completion of the
headless scope, with visible work explicitly owed. The new receipt test failed
first at exit 1 because headless completion was always false. After the change,
the scope tests passed at 0, and both completion removals failed their matching
tests at 1. A failed run and guards-only still cannot complete. Headless
completion leaves completeVisibleRecipe=false and the four visible stages in
owedStages. Receipts: receipt-scope-red-e4a276da.json,
receipt-scope-green-e4a276da.json and receipt-scope-removals.json. These are
development receipts; the next full recipe will run from a new committed head.
Visible verification remains held while the owner uses the Mac; V02 is held.

## Previous disk stop

Status: blocked again on the disk budget. The frozen runtime head is
`ad79fe3a3456f5bd34574669e36ca27b7b1e53f0`. Its 102 native guard cases passed,
as did the app-profile and inherited compiled-server literal-root baselines
and both widening controls. All seven findings remain open pending the full
qualification. No fresh app build, production rerun or visible launch occurred.

Before class reds, available space was 32,315,027,456 bytes (30.096 GiB), below
the 30 GiB floor plus that step's 0.5 GiB budget. The helper exited 1 and kept
completeRecipe=false. The completed native cases and 133 command receipts
are in `docs/evidence/mac-verification-app/frozen-ad79fe3a/`. The native guard
matrix includes hard links/symlinks/swaps, foreign server markers and replacement,
isolated HTTP, credential-broker denial, posted key/modifier stops at 80,
background HID detection and the root/machine instance locks.

The current cache and retained metadata helper were then retired only after
supported lsof +D checks returned 1 with empty stdout and stderr. Their hashes
and before/after samples are in retired-on-disk-stop.json. Available space after
pruning was 32,719,163,392 bytes (30.472 GiB); no own .scratch, DerivedData or
compiled helper remained. No subsequent build or test was started. The final
report-only commit does not change the runtime sources; these receipts belong
to the frozen runtime head above, not to that later documentation commit.

Pending: frozen class reds, predicate inversions, the full 1,638-binding and
individual-removal sweep, one fresh verification app and artifact audit,
production suites and the final root check. Visible verification remains pending
under the owner-use hold. Its final preflight was not run because the complete
guard matrix is not green. V02 remains held and the skill remains draft.

The helper now records available bytes and a step budget above the 30 GiB floor
before every large step; the credential sweep checks before each rebuild.
The generated verification Xcode project was refreshed successfully with the
installed Homebrew Ruby, through the Swift slot and a clean environment. The
initial system-Ruby attempt exited 1 because xcodeproj was unavailable there;
the explicit Homebrew-Ruby retry exited 0. No dependency was added.

| Frozen head / command | Real exit and result | Local evidence |
| --- | --- | --- |
| 40c37232: verify.mjs --fresh-build --headless | 1; 102 cases and 15 class reds passed, predicate 18 excluded after a lock-wait timeout | frozen-40c37232/result.json, class-reds.json and red-guard-18.log |
| faba5b2c: verify.mjs --fresh-build --headless | 1; worker checkpoint for the readiness-floor correction | frozen-faba5b2c/result.json and swift-hold |
| ad79fe3a: verify.mjs --fresh-build --headless | 1; 102 native cases passed, disk budget refused class-red compilation | frozen-ad79fe3a/result.json, guard-matrix.json, commands.json and disk-stages.json |
| ad79fe3a: app-profile and compiled-server root controls | Baseline assertion 0; removed/subpath/read-star assertions 1; negative exits 78 or the expected startup SIGABRT | frozen-ad79fe3a/root-boundary-profiles and server-boundary-profiles |
| ad79fe3a: posted key and modifier controls | 80 and 80; both matching marked input messages | frozen-ad79fe3a/delivered-key.log and delivered-modifier.log |

The first frozen attempt at 40c372320289b790a8d95fe7d3fbbc1b3bfc3ffe passed
102 native cases, 15 class removals, both root-rule widening controls and the
parent-death check. Predicate control 18 then hit the matching helper's
30-second timeout while waiting for the shared Swift lock (SIGTERM, no output).
That row is excluded, and the attempt is incomplete. The helper now uses the
same 20-minute queue allowance as the qualification runner. No app was built
or launched in that attempt. Receipts: frozen-40c37232.

The faba5b2c attempt was then stopped at a worker-requested checkpoint after
finding a six-second owned-server readiness loop, shorter than standing order
18's sixty-second minimum. Its literal-root controls and compiled bootstrap
receipts are retained, but it is not a completed qualification. The runtime and
compiled-server control loops now permit at least sixty seconds. The stop
marker was worker-requested; the runner's generic coordinator-hold error text
does not describe a new coordinator instruction. Receipts: frozen-faba5b2c.

Previous stop: blocked on disk preflight, qualification incomplete. After the latest
Swift-slot release, the small Bun configuration and parent-exit controls were
completed without a Swift job. Available space then fell from about 30.4 GiB
to 29.93 GiB, below the required 30 GiB floor. No retained own .scratch/DerivedData
or compiled helper remained to prune. A larger app/state/offscreen build was not
started. The exact sample is in
disk-block-qualification.json. All seven findings remain open pending the
single frozen-head qualification; visible readback is explicitly pending while
the owner is active and V02 remains held.

The coordinator accepted
exactly `(allow file-read-data (literal "/"))` and rejected the supervisor
proposal. The profile now contains that literal rule. The coordinator released
the latest Swift-slot hold after its seat reported. No Swift job was running
when that hold arrived, and none started until the release. Visible
V01 still requires a green guard matrix and fresh idle preflight; V02 remains
held. All seven findings await final closure. No corrected frozen-head or
end-to-end safety pass is claimed.
Branch: feat/mac-verification-app. Previous reviewed head:
`eceedba4589717ff0615614ce283841bab378638`.

The initial candidate-6 checkout matched
`8b9be429751165d4ecef11f3f23d1844384e54b4`. The prior implementation/readback
receipts belong to `ab989410cef89b5670fc2a6101698441753b5ec5`; the later
review rejected its isolation. Neither those receipts nor dirty development
runs qualify the correction. The final corrected runtime head has not yet been
frozen. The current report remains an intermediate draft.

## Work during the current Swift hold

The source census now traps 1,638 runtime-present SDK Security exports, including
the CMS certificate-import family. A pure-C development component passed all
1,638 exact-handler positive checks and nine individual binding removals. The
full individual-removal sweep remains pending on the frozen head. Apple's
implementation of
[SecCmsSignedDataImportCerts](https://github.com/apple-oss-distributions/Security/blob/main/OSX/libsecurity_smime/lib/cmssigdata.c#L670)
takes a Keychain reference and imports certificates, so the narrower family list
was insufficient. The old library's missing CMS trap first failed its matching
test at exit 1, without calling the original API. An earlier proposed probe,
SecCopyMatchingCertificates, proved absent on this OS and is withdrawn as gap
evidence. The runtime-presence correction is preserved locally.

The literal-root C boundary component records kernel EPERM for protected-path
opens and confines negative UDP-connect tests to lo0 without sending a packet.
Widening the rule to subpath "/" or to file-read* fails the same expected-zero
test. The same component is compiled into the app and the test server wrapper,
which runs it before importing the unchanged production server entrypoint.
Frozen-head app/child execution still needs qualification.

A C-only preflight diagnosis found denied Mach lookups for
com.apple.coreservices.launchservicesd and com.apple.tccd.system. Under the
strict profile frontmost identity is unknown and monitoring permission checks
return false. In diagnostic copies, allowing only TCC restores the permission
queries; allowing TCC and LaunchServices also restores frontmost identity.
Owner preference-file reads remain denied in both copies. Neither allowance
has been added to the app profile and no visible launch followed these probes.
The boundary of any preflight replacement remains an open design decision.

Local component evidence is under docs/evidence/mac-verification-app:
credential-development-1638-complete, credential-CMS-extra-red,
credential-class-extra-red/presence-correction.json, preflight-broker-diagnosis,
preflight-broker-candidates and production-isolation-component. These runs are
dirty development evidence, completeRecipe=false, and used no Swift.

After the slot release, CacheProbe reproduced four retained-descriptor bugs:
cached directory reused as a regular file, mutable reused as immutable, public
reused as private, and a private file made public after opening. Each probe and
matching test exited 1 before the correction, then both exited 0 after retained
constraints and privacy rechecks were added. Evidence: cache-red-first and
cache-after. Both compilations and all native executions used swift-slot.sh.
The broader ruling-development-3 run finished with PASS_DIAGNOSTIC, 152 command
receipts, 79 guard observations, posted key/modifier stops at 80 and both lock
groups passing. It is not frozen qualification. Its 13 class-control receipts
include one insufficient control: the server-exec denial returned 79 at
SecTranslocateIsTranslocatedURL while the underlying error was being formatted.
The exact expected-78 assertion fails at 1, recorded in
exec-refusal-exact-red.json. That row is withdrawn as an exec-denial proof.
The guard now turns unexpected errors into its own plain domain/code refusal
before external error formatting. The conservative trap remains installed.
The class runner requires both exit 78 and the matching refusal message.
Ruling-development-4 stopped at a Swift compiler diagnostic in the new optional
closure expression. The explicit branch correction compiles in
ruling-development-5; that run finished at exit 0 with 182 command receipts,
102 guard observations and 15 matching class removals. The exec denial now
returns 78 with the intended domain/code refusal. The owned metadata handoff
passes headlessly; stale metadata and a missing validator refuse 78.

The current compiled server independently passed all protected-path, broker and
literal-loopback checks before reaching readiness. Removing the root rule
aborted at SIGABRT. Widening it to subpath "/" or file-read* exited 78 at the
matching boundary row. The same expected-ready test exits were 0/1/1/1.
Evidence: server-boundary-current-1638. Baseline shutdown 130 was intentional,
after readiness. The reusable server-boundary module now joins the full recipe.
All of this remains development evidence, not a fresh app qualification.

The C global monitor registers under the strict profile, but this does not prove
that TCC permits every keyboard event. GetFrontProcess also fails, at -600, so
it does not provide an in-process frontmost fallback. The guard design records a
short-lived metadata-reader prototype, isolated separately from the app and
passing no broker handles. Its LS-only version needs no TCC allowance. It passes
its fixed-query component at 0; removing LaunchServices, network denial or
broker denial each exits 78 and makes the same expected-zero test fail at 1.
Evidence: preflight-helper-LS-only. The proposed integration makes the app own
this checked child before parent confinement, then consume only JSON from its
owned pipe. The server remains owned inside the unchanged app profile.
The app integration is written: both the helper and its rpath library are
descriptor-opened, sealed and hash-checked against build bindings. The app
starts it with an empty argument list and exactly HOME, CFFIXED_USER_HOME,
TMPDIR, LANG and LC_ALL. Its owned output pipe has a 64 KiB/five-second bound and
must contain exactly one snapshot from a successful child. The app checks its
freshness, starts its independent HID watch before server startup and rechecks
both live idle signals before a window. No manifest field claims frontmost
identity. The compiled headless handoff passes in ruling-development-5. The
fresh frozen-head app/AX/capture phases still need qualification.

The compiled owner-policy probe demonstrated that a production bundle renamed
to another filename bypassed the filename-only frontmost rule. Both production
bundle IDs are now rejected too. The old compiled cases returned 0 and their
literal expected-78 tests failed at 1; valid/recent/unknown and all freshness
cases already matched their expected 0/78 exits. Evidence: owner-policy-red.
Their corrected rerun refuses both at 78 in ruling-development-5.

The next seat hold arrived after that job had already completed. No new Swift
job started. The visible driver, its restricted AX reader and an abrupt-parent
cleanup control are written but not run. The server's parent-death mechanism
must first reproduce its missing behavior with parent-death-driver --before,
then pass after implementation. The visible gate explicitly requires that
proof, so this source draft cannot produce a complete visible receipt yet.

The no-build audit during the hold found another MV-S1-1 case to qualify.
Local Bun help reports that standalone .env and bunfig.toml autoloading default
to true, matching [Bun's documented standalone configuration behavior](https://bun.sh/docs/compiler/executables).
The inherited environment alone did not establish the configuration boundary.
After release, all four synthetic runtime/compiler .env/bunfig probes failed
their literal safety assertions at 1 before the correction. They then passed
at 0 with explicit no-config/no-env/no-macro and no-compile-autoload options.
The shared process-policy boundary now supplies those flags for every named
Bun compile; the production recipe adapter supplies the same flags. Its unit
test failed first at 1, then passed at 0. The Node inheritance-removal control
still fails for inheritance, with its newly required policy module copied into
the scratch control. Evidence: bun-config-red, bun-config-green,
bun-policy-unit-red.json and bun-policy-node-reds.json. These controls use only
scratch markers; no credential, network or owner-data probe is involved.

The compiled parent-death control also failed first: killing its owned relay
left the compiled scratch server's inherited pipe open, and the matching test
failed at 1. The test-only server wrapper now installs an in-process kqueue
NOTE_EXIT watcher for its actual kernel parent before production server code.
The C thread exits that server on parent death independently of its JS loop.
The corrected test closes the pipe and matches the explicit parent-exit marker
at exit 0. Evidence: parent-death-red and parent-death-green-2. The initial
green attempt stopped at a missing stdio declaration; that failed receipt is
retained at parent-death-green and excluded. All helpers and fixtures were
closed and removed. These receipts belong to dirty development from
a67fbe731b044a2635d40377dcecddd3ee4e6973, not a qualified frozen runtime head.

## Seven findings and current evidence

The full independent review and urgent probes were read. Each original reviewer
probe was copied unchanged and rerun against the reviewed implementation before
correction, using synthetic files/listeners only. The seven matching safety
assertions each failed at exit 1. The original helper processes often exit 0
when they successfully record an unsafe result; that is not a safety pass.
MV-S1-7's first failure is an evaluation of the unchanged source assignment,
matching the seat's inspected probe, not an invented full guards-only rerun.

Local baseline evidence: docs/evidence/mac-verification-app/review-red-before.
It includes assertions.json, p1, p2 and partial-receipt-red.json. No original
Security function was called; no visible window was opened for these probes.

| Finding | Correction in the draft | Executed after-fix evidence / outstanding qualification |
| --- | --- | --- |
| MV-S1-1: curl/config/file exfiltration | No curl. In-process ephemeral GET under the sandbox; no credentials/cookies/cache/proxy/redirects. Skill subprocesses use explicit paths and fresh environments. | Dirty diagnostic accepted healthy owned child with poisoned CURL/proxy/netrc/SSL settings and zero unrelated requests/bytes; redirect and 401 refused 78. Environment-inheritance red fails 1. Built app still needs fresh qualification. |
| MV-S1-2: hard-linked database | Descriptor traversal/checks for manifest, HOME/tmp, code, DB/WAL/SHM, outputs and locks; one link/current UID/root device; descriptor hashing and kernel pins. | Six hard links and six symlinks refused 78; eight pinned replacements denied by kernel; unprotected replacement independently refused 78. Final matrix/red sweep, creation/rotation and abrupt cleanup still pending. |
| MV-S1-3: ps substring spoof | No ps/attach path. Start pinned compiled child with exact seven-key environment; retain child; require kernel parent/start, actual database inode and listening socket before requests. | Healthy owned child and public seeded-Task readback exited 0. Four actual foreign compiled servers with wrong HOME/DB and markers in environment/argv0/cwd/executable path refused 78. Foreign listener and child replacement refused without HTTP to the impostor. Frozen/built-app rerun pending. |
| MV-S1-4: missing credential APIs/brokers/stores | SDK/runtime census expands bindings to 1,638; unique trap handlers and imported-symbol audit. Deny unlisted Mach brokers. Memory standard defaults and isolated HTTP including streams use existing clientFactory injection. | The C development sweep passed 1,638 exact positives and nine removals. Full frozen removals, built imports and stricter-policy compatibility remain pending. |
| MV-S1-5: modifier-only/busy-main input | Full exposed input masks; local/global monitor installation before window; independent background session-any-event and IOKit HID sampling every 50 ms. | Posted event types 10 and 12 stop at 80; literal input-mask and busy-main injected-HID controls pass. New removal controls are written, not run. Pre-window monitor refactor and global/visible behavior remain unqualified. |
| MV-S1-6: duplicate instances | Descriptor-checked root flock plus consumed marker, machine visible lock plus protected directory entries. | Concurrent first/second root checks return 0/78; reuse 78. Machine first/second lock checks return 0/78 without opening windows. Latest directory protection change needs rerun. |
| MV-S1-7: partial receipt says complete | Explicit actual stage vector. Complete requires visible scope and every required stage true. | Node tests and restored-old-logic red pass/fail at 0/1. Actual dirty headless diagnostic has completeRecipe=false. Frozen guards-only/built artifact receipts pending. |

These are partial observations, not closed findings. The
[guard design](mac-verification-guard-design.md) lists the counterfactual for
each check, exact process classes/environments and matching controls. The skill
has been returned to draft until its corrected recipe passes end to end.

## Current commands and real exits

All paths below are relative to this checkout. Local evidence is ignored by Git.
Every Swift build/probe before the hold ran through scripts/swift-slot.sh.
After the earlier hold message no Swift job was running, and none was started.
The resumed startup investigation also used no Swift jobs.

| Command | Exit/result | Evidence |
| --- | --- | --- |
| Unchanged six reviewer scripts through scripts/swift-slot.sh on reviewed source | Outer 0; each unsafe observation reproduced; seven matching safety assertions 1 | review-red-before/assertions.json and p1/p2 logs |
| node .agents/skills/verify-macos-real-app/scripts/verify.mjs <safety-development-6> --development --focus-regressions | 0; PASS_DIAGNOSTIC, 66 observations, 90 command receipts, completeRecipe=false | safety-development-6/result.json, commands.json, guard-matrix.json |
| node .agents/skills/verify-macos-real-app/scripts/verify.mjs <safety-development-7> --development --guards-only | 1; 66 observations recorded, then stricter read-denial sandbox caused compiled server to stop before mutant baseline readiness; 94 receipts; cleanup true | safety-development-7/result.json and mutant-baseline.log |
| node .agents/skills/verify-macos-real-app/scripts/process-policy.test.mjs | 0; every named hostile parent variable dropped | slot-hold-cleanup/node-reds.json records repeated baseline |
| node .agents/skills/verify-macos-real-app/scripts/receipt-stages.test.mjs | 0; partial scopes and each missing required stage incomplete | slot-hold-cleanup/node-reds.json records repeated baseline |
| node .agents/skills/verify-macos-real-app/scripts/node-reds.mjs <receipt> | 0; both baseline tests 0, each matching mutation test 1 | slot-hold-cleanup/node-reds.json |
| sh scripts/disk-guard.sh; /usr/bin/lockf -k /tmp/todo-pnpm-check.lock pnpm check | 0; 0 at draft 1b82126459351a328ced63f5843b47a9cb68b9ca; domain 387, CLI 69, server 32, Electron 168 plus one existing skip; no Swift | slot-hold-cleanup/root-check.json and root-check.log |
| node --check on changed Node helpers; git diff --check | 0 when last run; repeat before handoff | local tool execution |
| verify.mjs <ruling-development-3> --development --focus-regressions | 0; 79 observations/152 receipts; one class exec control later disqualified for unrelated exit 79 | ruling-development-3 plus exec-refusal-exact-red.json |
| verify.mjs <ruling-development-4> --development --focus-regressions | 1; new optional closure produced a compiler diagnostic; no app built/launched, cleanup true | ruling-development-4/result.json |
| verify.mjs <ruling-development-5> --development --focus-regressions | 0; 102 observations, 15 matching class removals, 182 receipts, completeRecipe=false | ruling-development-5/result.json, guard-matrix.json, class-reds.json |
| production-source-preservation.mjs <hold-production-source-continuity> <symbols-ab989410> | 0; production source continuity, reviewed 26-symbol baseline retained; explicitly no fresh production binary claim | hold-production-source-continuity/result.json |

Development receipts record eceedba4 as their parent head and development=true;
their code was dirty and is not claimed byte-equal to that commit. In the seventh
run the guard/mutant builds also straddled the stricter sandbox edit. This is
explicitly disqualified diagnostic evidence. The added server log descriptor
will expose the child startup reason on the next permitted run. No hidden
retry, relaxed broker rule or visible launch followed that failure. The root
check exercises TypeScript packages, not the pending native qualification.
After that draft check, additional unrun native controls cover the claim/log
files and require matching refusal reasons, so an unrelated crash cannot count
as a successful red control. The sandbox permits reading the harmless true
executable solely so its process-execution denial can be tested independently.

## Remaining work after the holds

1. Qualify the accepted literal root-directory rule inside both app and server
   child, including its widening controls. Keep the rejected supervisor out of
   the implementation. Resolve the preflight broker compatibility issue without
   allowing owner-file reads. Qualify SQLite side-file/Diagnostics creation and
   cleanup under directory pins.
2. Compile/run the latest class controls (input/defaults/sandbox), guard predicate
   sweep, full 1,638 binding positives and individual removals, and current app
   source/project generation. The generator script is changed but the tracked
   Xcode project has not yet been regenerated; it must not be treated as current.
3. Run production state/offscreen execution through the new explicitly linked
   safety boundary and launcher adapter with a fresh minimal environment. Its C
   component passed; historical Swift-suite passes cannot replace reruns.
4. Freeze one clean implementation head. Rebuild CLI/server, bindings, native
   proofs and verification app from it with clean build; rerun all controls and
   root check, then source/symbol comparisons. No working-tree SHA restamping.
5. Only after a green guard matrix under the coordinator's conditional release,
   requalify bundle-ID/owned-PID accessibility readback/capture and interruption.
   The current build's visibleAllowed=false gate must stay held until then.
   Keep completeRecipe=false until every actual visible stage passes.

No V02 input driver or measurements were started. The coordinator's requested
correctness, UI and hands-on review releases still apply.

## Production preservation

No new production Mac source change was made during this correction. The sole
existing seam remains TodoModel's MainActor SessionStorage, SessionVault
conformance, optional constructor injection and immutable existential property.
SessionVault.swift is byte-identical to candidate 6, SHA-256
`101ad59877b3446eb95db6766f91590b4e31985558a9fc9ba3f2b07d390f60c5`.
The existing clientFactory parameter supplies verification-only HTTP policy;
no additional production seam was introduced. The generated API and production
transport implementation remain unchanged; its default-session factories are
not selected by this entrypoint. Ordinary/stream behavior of the new safety
adapter still requires compiled/runtime qualification.

The independent seat confirmed prior production source/symbol preservation.
Those artifacts were built, never launched. Their hashes are production
`fbb3082170522b277bf8c2e736cd4462075401c4ab86f87d5a952788931db7b9`,
candidate 6
`39856a0c0ad85d22d309cdbca1e8a1faaf32540d81d74984d38e8cc7c2930a7c`.
Both were preserved by hash before removing superseded DerivedData, then the
binaries were retired under the later instruction to remove all idle artifacts.
Their hashes, demangled symbol lists and reviewed comparison remain local. The six
Security imports remain SecCopyErrorMessageString, SecItemAdd,
SecItemCopyMatching, SecItemDelete, SecItemUpdate and
SecKeychainSetUserInteractionAllowed. No storage symbol was removed.

The exact 26 added production symbols are below. They are in the production
binary because the allowed stored existential needs metadata, value copying,
protocol dispatch/conformance and the model field offset. They are not
verification-code leakage. Original comparison: symbols-ab989410/comparison.json.

```text
_symbolic Todo.SessionStorage
_symbolic _____ 4Todo12SessionVaultV
_symbolic ______p 4Todo14SessionStorageP
_symbolic ______pSg 4Todo14SessionStorageP
assignWithCopy value witness for Todo.SessionVault
assignWithTake value witness for Todo.SessionVault
demangling cache variable for type metadata for Todo.SessionStorage?
destroy value witness for Todo.SessionVault
direct field offset for Todo.TodoModel.(vault in _277A8AEC59CD413B5F17A239A8575E79) : Todo.SessionStorage
full type metadata for Todo.SessionVault
getEnumTagSinglePayload value witness for Todo.SessionVault
initializeBufferWithCopyOfBuffer value witness for Todo.SessionVault
initializeWithCopy value witness for Todo.SessionVault
mangled name ref for type metadata for Todo.SessionStorage?
nominal type descriptor for Todo.SessionVault
protocol conformance descriptor for Todo.SessionVault : Todo.SessionStorage in Todo
protocol descriptor for Todo.SessionStorage
protocol requirements base descriptor for Todo.SessionStorage
protocol witness for Todo.SessionStorage.delete() throws -> () in conformance Todo.SessionVault : Todo.SessionStorage in Todo
protocol witness table for Todo.SessionVault : Todo.SessionStorage in Todo
reflection metadata field descriptor Todo.SessionStorage
reflection metadata field descriptor Todo.SessionVault
storeEnumTagSinglePayload value witness for Todo.SessionVault
type metadata accessor for Todo.SessionVault
type metadata for Todo.SessionVault
value witness table for Todo.SessionVault
```

The original state recipe reported 238 tests/45 suites, three Diagnostics tests
and two contract tests; offscreen reported ten tests/872 renders, all at
ab989410. This correction has not rerun them. Neither the installed app nor a
production executable has been launched. Production project, API, resource,
installer, packaging, lock and Swift-pin files remain unchanged.

## Historical first launch and limits

The ab989410 visible receipt independently read V01 seeded Task alpha and
V01 seeded Task beta from the verification app's own window after resolving
local.todo.verification and its owned PID. The local frozen-ab989410 capture
showed All tasks, Profile verify and two P3 Tasks. A marked event posted inside
that app stopped it at 80. These are historical UI observations; the later
safety escapes prevent using them as proof of isolation. No new visible launch
has been attempted during the correction.

The current input design covers the exposed NSEvent types locally/globally
where macOS allows, plus independent background HID sampling. macOS can withhold
secure input/gestures or consume events, and a suspended process cannot execute
a monitor. Sampling and scheduling impose detection delay; there is no hard
real-time or physical-delivery claim. Denying brokers may disable native file
panels, URL opening, preferences or cloud/autofill features. These flows remain
unproven, and no permission is requested by this draft.

## Disk and cleanup during the Swift hold

Correction: the historical lsof -Di +D commands returned exit 1 because this
Mac's lsof does not support -D. Their stderr logs contain the usage error. Those
receipts do not prove the removed directories were closed, and the earlier
closed-directory claim is withdrawn. Only this worker's superseded
verification/production/candidate DerivedData and compiled caches were removed. Preserved all evidence plus hash-verified production
and candidate-6 symbol inputs at .scratch/preserved-symbol-inputs. Free disk
before was 40,383,459,328 bytes (37.610 GiB); after was 45,082,894,336 bytes
(41.987 GiB), reclaiming 4,699,435,008 bytes (4.377 GiB). Receipt:
slot-hold-cleanup/receipt.json. Shared disk usage can change independently.
No other worker's cache, production app, server or launchd state was touched.

A later supported retirement removed only the superseded
todo-mac-verify-tools-nrL1Im directory. An exact held-file lookup first returned
0 with this worker's descriptor, then directory lookup returned 1 with empty
stdout and stderr after closing it. The old 1,099-binding library was preserved
by hash. Free space rose from 31,226,552,320 to 31,410,466,816 bytes, a measured
183,914,496-byte increase. Receipt: retire-superseded-tools.json. Other workers
continue to change shared free space independently.

At the next seat's hold, all idle build/helper artifacts in this checkout were
retired, including .scratch, empty DerivedData and the five older owned smoke
roots. The removals followed supported empty/no-stderr lsof directory checks;
all file hashes and receipts were kept. Logical files removed totaled
1,701,960,007 bytes. Available disk was 35,041,681,408 bytes after the second
interval. Shared usage changed between intervals, so that number is not an
exclusive measurement of this worker's reclaimed physical blocks. Receipts:
seat-hold-cleanup-2.json and seat-hold-smoke-cleanup.json. One absent /bin/chflags
attempt stopped before deletion; the recovery receipt records the corrected
/usr/bin/chflags command and does not treat that error as a closed file.
The coordinator received the requested one-line operating cleanup update.
No Swift job was running at this hold and none has started since it arrived.

The apps/macos/DerivedData/V01Proof retirement used the same unsupported
lsof option, so its historical closed-file claim is also withdrawn. This reclaimed 1,095,606,272 bytes
(1.020 GiB); free disk immediately before/after was 50.019/51.040 GiB. The
other free-space increase was concurrent shared-disk activity, not attributed
to this worker. Receipt: slot-hold-cleanup/state-proof-cleanup.json. Total
reclaimed by these two recorded cleanups was 5,795,041,280 bytes (5.397 GiB).

## Resumed startup investigation

The profile and production server inputs remain those of committed bdc45efa.
Only new diagnostic inputs/documentation were added. No app target, Swift job,
installed application, original credential API, real Todo directory or managed
server was used. All children used newly owned scratch HOME/database and a
chosen literal-loopback port; they exited before scratch retirement.

The exact denied operation is `file-read-data /`. Own-PID kernel evidence is
retained locally. Ancestor metadata allowances alone still abort the server.
The single diagnostic-only addition
`(allow file-read-data (literal "/"))` lets the same compiled server answer
health. This grants root-directory data access outside scratch, so it has not
been applied to the application or selected as a correction.

The deterministic C control installs the strict profile in-process, opens the
root directory and gets errno 1/exit 78. Its literal-root mutation exits 0. It
reads no directory entry. A minimal C executable launched under the strict
profile also aborted; this is a native startup issue rather than evidence of
a bad server database.

Reusable command, with no Swift job:

```sh
node .agents/skills/verify-macos-real-app/scripts/diagnose-server-sandbox.mjs "$PWD/docs/evidence/mac-verification-app/denial-committed"
```

The earlier completed diagnostic receipt is denial-bdc45efa-final/result.json:
outer exit 0, PASS_DIAGNOSTIC_ONLY, strict/ancestor-metadata server SIGABRT,
baseline/literal-root diagnostic health 200 followed by intentional shutdown
at 130, C root-open control 78 and mutation 0, and supported lsof cleanup exit 1
with empty stdout/stderr. Before that pass, one run failed because kernel logs
were rate-limited; another demonstrated the C executable startup abort. Both
failed receipts remain local and are excluded from qualification.

The committed diagnostic adds an actual held-file positive control to the
cleanup probe. Supported lsof -Fpcn with the exact held file must report the owned descriptor
at exit 0. The +D selector must independently include that descriptor while
held; this Mac returns 1 with fields for a partial directory match. After close,
+D must return 1 with no output or error. A nonempty directory result never
means closed, regardless of exit code.
Any other result retains scratch and fails. The initial manual diagnostic root
was retired with these supported arguments and empty output/error; its receipt
is denial-bdc45efa-final/manual-scratch-retirement.json. Deleted historical
build directories cannot be retrospectively rechecked.

The [supervisor proposal](mac-verification-supervisor-proposal.md) is not
implemented. It does not claim that moving an unrestricted server outside the
app sandbox preserves confinement. The proposed bootstrap must prove strict
server confinement after runtime startup and reject retained outside descriptors
before production server code or HTTP starts. If that cannot be proved, this
unit remains blocked rather than relaxing file/network reach.

The first committed diagnostic at 9bcad0bb correctly retained scratch because
its newly added positive cleanup control assumed +D would return 0 when any
file was open. This Mac returns 1 with the matching descriptor fields when
other directory entries have no match. That failed receipt is retained at
denial-committed/result.json, with lsof-selector-controls.json demonstrating
the exact-file selector at 0 and directory selector at 1 with identical owned
FD evidence. The revised control requires both selectors to identify the held
FD and then requires the directory result to be empty after close. It never
treats nonempty output or unsupported-option stderr as a closed directory.

The final committed diagnostic implementation is
`ea8647bee54e5abd2f0efdf04b4c58e9969acffd`. Its fresh receipt is
denial-committed-final/result.json with commands.json: outer exit 0,
PASS_DIAGNOSTIC_ONLY, completeRecipe=false and qualification=false. Server
inputs match that committed head. The C strict-root control exits 78 and its
matching assertion exits 0; the literal-root mutation exits 0 and makes that
same assertion fail at 1. Strict and ancestor-metadata server starts end in
SIGABRT. Baseline and literal-root diagnostic starts reach health 200, then
their owned shutdowns exit 130. Kernel reports in this repeat were rate-limited;
the earlier own-PID report and deterministic C operation remain separate
evidence. Exact-file held-FD lookup exits 0, directory lookup exits 1 with
that FD present, and the closed directory lookup exits 1 with no output/error.
Scratch was removed. The prior deliberately retained diagnostic root was also
closed/rechecked/retired with supported arguments; its receipt is
denial-committed-final/prior-retained-scratch-retirement.json.

This later handoff changes documentation only and does not restamp the
diagnostic binaries or qualify any Mac implementation. The coordinator has
authorized visible V01 conditionally after the whole guard matrix is green and
a fresh preflight. That condition is unmet. V02 is still held.

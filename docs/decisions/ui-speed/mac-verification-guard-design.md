# Verification guard correction design

Status: implementation draft; qualification is in progress after the
coordinator accepted the literal root-directory rule and rejected a supervisor.
Visible V01 requires the whole matrix green and a fresh idle preflight; V02 is held. This describes the intended
boundary and its counterexamples, not a claim that all controls have passed.
The authoritative results are in the implementation report.

The profile allows reading the root directory's entry list through exactly
`(allow file-read-data (literal "/"))` because native executable startup opens
that public directory, and this rule grants no descendant access.

## Ownership and request order

The helper builds the CLI/server from one committed head and records their
content hashes. It generates those expected hashes into the verification
build. A manifest cannot bless a replacement binary by supplying its new hash.
Provisioning uses the compiled CLI with a private HOME and synthetic database.
Every accepted object is opened through a retained directory descriptor with
O_NOFOLLOW. No real Todo data is read or enumerated; protected-path probes first require
a kernel policy denial and then require the attempted open to return EPERM. An accepted regular
file has exactly one link, belongs to this UID and shares the scratch root's
device; therefore it cannot already be a second name for a real file. Cross-device
objects are refused. Hard links to directories are prohibited by the OS.

The guard claims the root before reading the manifest, validates all inputs,
seals immutable inputs and protects existing directory entries. It installs
its sandbox before starting the compiled server or making health requests.
It starts exactly the checked executable, with no arguments and a fresh seven-key
environment, retains its Process handle and records its kernel start identity.
It requires that same child to hold the accepted database inode and its selected
literal-loopback TCP listener before and after health, and before application
requests. It never attaches to another PID or parses ps.

The current health response contains service, contract and build only. There
is no existing per-instance nonce endpoint. No new endpoint or server contract
is introduced in this unit. The independent instance check is the kernel's
parent/start-time, database-descriptor and socket identity, rather than text
that another server can echo. A stopped/replaced child fails before a request.

Readonly code/manifest inputs use UF_IMMUTABLE while held; accepted directories
use UF_APPEND to prevent replacing existing entries. These flags are registered
for cleanup before application. The same open descriptor is used for hashing,
identity checks and retained use. Exec and SQLite necessarily take a pathname;
the kernel protections plus immediate identity rechecks cover that boundary.
The flags do not defeat a same-UID actor deliberately clearing flags or changing
this running process. The test boundary assumes intact launched code and no
hostile same-UID process injection. It does not claim an adversarial OS sandbox.
New SQLite files are confined by the inherited sandbox and audited; existing
database/WAL/shared-memory entries are descriptor-pinned. Whether directory
append protection interferes with SQLite checkpoint deletion or journal
rotation must be exercised, not inferred from a successful read.

## What could make a check pass falsely?

Every row asks that question for the named check. A named test below is a
reusable input/control, not evidence of execution unless its receipt exists.

| Check | How it could pass while its intended claim is false | Control or independent evidence |
| --- | --- | --- |
| Private manifest | Metadata is checked on one file, JSON read from another | Open once, seal, descriptor read; manifest replacement and hard-link cases |
| Canonical root | Prefix text hides symlink, dot, parent or duplicate separators | Root and nested-component symlink cases; relative/dotdot inputs |
| Every path component | Only the final basename is checked | openat/O_NOFOLLOW at each component; HOME/tmp/nested-link fixtures |
| File type | FIFO/device/directory occupies a permitted filename | O_NONBLOCK plus descriptor type check; directory-instead-of-database fixture |
| Cached descriptor constraints | A previous weak open bypasses a later type, privacy or immutable-input request | CacheProbe's type/immutable/private fixtures failed first, then pass with retained constraints checked on reuse |
| Retained privacy | Mode is private initially but another user gains access later | Retain privateMode and recheck fstat permissions; changed-private fixture failed first and passes after correction |
| Link count | In-root filename aliases another database or executable | One-link requirement on every regular input; six independent hard-link cases |
| Ownership/device | Permitted text names another UID's or mounted file | fstat current UID and root device; predicate inversion; no real-file probe |
| Exact open path | A directory is renamed after opening | F_GETPATH and named inode checks; protected directory replacement cases |
| Named identity | Path is replaced after metadata/hash check | Retained FD plus dev/ino comparison; unprotected swap detector and pinned swaps |
| Immutable contents | Same inode's code is modified after hashing | Seal before descriptor hash; size/mtime/seal recheck; kernel mutation refusal |
| Seal cleanup | A failure leaves permanent flags and is called success | Registered FD cleanup, cleanup stage and retained-scratch failure; abrupt-exit coverage pending |
| Manifest hash | Attacker changes code and writes a matching manifest hash | Build-pinned hashes independent of JSON; changed-binary/self-declared-hash case |
| HOME | Environment merely contains the expected text | Fresh exact child environment, Foundation HOME equality; wrong-HOME and actual foreign-server fixtures |
| Temporary storage | TMPDIR is right but Foundation uses a system temp path | Descriptor-bound NSTemporaryDirectory plus FileManager getter; wrong-TMPDIR/config controls |
| Mutable file creation | SQLite or Diagnostics creates a linked/escaped side file | Existing sidecar FD checks, directory pins, sandbox inheritance and recursive audit; rotation exercise pending |
| Scratch run claim | Two processes read the same unclaimed state | FD flock before manifest read, consumed marker, immutable claim; concurrent and reused-root controls |
| Machine visible claim | A different root bypasses the first lock | Fixed private machine lock, same FD checks, directory protection; two-root headless lock control |
| Server ownership | ps strings describe something other than the actual environment | No attach path; manifest PID must be zero; four running foreign-server marker placements |
| Actual database | Correct environment is passed but server opens another file | Own-child proc_pidfdinfo compares database dev/ino/UID/link count |
| Listener | Owned PID has no listener, binds wildcard or another process owns the port | Own-child socket FD requires one IPv4 loopback listener at chosen port; occupied listener control |
| PID reuse | An unrelated process acquires the former PID | Retained Process plus kernel parent, UID and microsecond start time |
| Between requests | Server dies after initial validation and another answers | Recheck before/after health and before API send; replacement-before-first-request control |
| Health identity | Another server repeats static service/build/contract | Static identity is supplemental; child/database/socket proof is required independently; no nonce claim |
| Health network | curl reads .curlrc/.netrc or proxy configuration | No curl; in-process ephemeral GET under sandbox; unchanged exfil probe before fix and poisoned-environment regression |
| Literal origin | URL userinfo, implicit port, path or redirect changes destination | Strict manifest components and per-request origin check; URL and redirect cases |
| Redirects | Final response is rejected after an off-origin transfer already happened | Delegate refuses before redirect; listener asserts no outside-manifest request; redirect red control pending |
| HTTP credentials | 401 silently selects persistent/default credentials | nil credential storage, cancellation delegate, nil cookies/cache and explicit proxy disable; 401/config controls |
| Generated client | Default shared session is reached through another factory | Existing nonnil clientFactory always supplies verification transport; source/import audit; built-client runtime coverage pending |
| Streaming HTTP | SSE silently constructs an ordinary default session | Verification stream session uses the same ephemeral policy and preserves per-stream cancellation; runtime qualification pending |
| Credential symbols | A handwritten list omits a linked entry point | SDK export/runtime census plus built-binary import enumeration; every present binding pointer-tested and individually removed |
| Pointer test | Removing a trap calls the real credential API | Compare expected unique handler before invocation; missing binding exits 1 without calling original |
| Framework credentials | A framework bypasses direct Sec imports via a broker | Deny all unlisted Mach lookup, Keychain paths; safe policy queries include securityd.xpc, autofill, Passkeys, CloudKit and ubiquity |
| Defaults | Separate bundle ID still reads ambient global defaults | Process-only memory standard defaults, no persistent domains/suites; cfprefsd denied; memory-default removal control |
| File panels/open URLs | A broker reads/writes or launches something on the app's behalf | LaunchServices and unlisted brokers denied; broker-backed features may be unavailable; visible compatibility unproved |
| Direct file reads | Correct manifest coexists with arbitrary path reads by a shared screen | Deny general file reads except scratch, own bundle and system resources; synthetic outside-file control |
| Outbound sockets | Health is safe but later generated calls reach another port | Same sandbox inherited for lifetime, origin check and unrelated live listener; network-rule red control |
| Subprocesses | A checked path is resolved through inherited PATH/config | Absolute immediate executable paths and environments built from scratch; policy test and inheritance red |
| Compiled Bun configuration | The binary reintroduces environment/configuration from its working directory despite a fresh inherited environment | Four scratch runtime/compiler .env/bunfig controls each failed first at exit 1 and passed at exit 0 after the explicit no-autoload/no-config compile flags were wired into both recipe paths; frozen-head qualification remains pending |
| Local owner input | Modifier/key-up/drag type is absent from the mask | Literal full exposed NSEvent type list; delivered type 10/12 controls and modifier-mask removal |
| Global owner input | Local monitor cannot see another application's events | Global monitor installed before a window; unavailable permission/registration refuses; independent HID watch |
| Busy UI thread | Main-thread timers cannot run to notice owner activity | 50 ms background Dispatch timer samples combined-session-any-event and IOKit HID idle; busy-main injected-HID control/red |
| Event visibility | macOS withholds secure input, gesture or consumed events | Disclosed OS limitation; independent sampled HID signal; no physical delivery or hard-real-time claim |
| Idle preflight | Recent owner input is missed by a short per-event list | Any-event session plus HID idle must both be at least 60 seconds; no launch on unknown signal/frontmost identity |
| Frontmost app identity | A production app has a different bundle filename | Reject both production bundle IDs as well; renamed-bundle cases failed first at compiled exit 0 against literal expected 78 |
| Metadata authority | An environment/manifest merely claims frontmost identity | Own a build-pinned metadata child and its exclusive output pipe; no manifest frontmost field; helper/library path, hash, symlink, hard-link and swap controls |
| Metadata freshness | A valid old snapshot is replayed after the owner returns | Two-second handoff and ten-second pre-window age; live session/HID rechecks; stale/future/expired fixtures and freshness removal |
| Error reporting | An unrelated conservative API trap is called the intended denial | Numeric domain/code normalization; server-exec control requires its message and exit 78; the old exit-79 row is excluded |
| Partial receipt | guards-only or a failed run still says complete; headless completion implies visible proof | Complete requires a successful run and every stage for its explicit scope; guards-only never completes, headless lists its four visible stages owed and completeVisibleRecipe stays false; each-missing-stage and completion/removal controls |
| Frozen provenance | Dirty sources are compiled but stamped with an older head | Dirty qualification refused, source/binary/bindings hashes and head recheck; development receipts remain diagnostic |
| Cleanup | A child survives while its scratch data is removed | Track owned child handles and kernel identity; active-child/uncertain cleanup retains scratch and fails |

Predicate inversions establish that a positive check is exercised; malicious
fixtures establish refusal behavior. Neither replaces the other. The generated predicate controls and class removals are being rerun with the
accepted root rule, an IPv4-only loopback filter and boundary checks executed
in both the app and the inherited compiled server child. No green matrix is claimed for this draft.

## Processes and ambient configuration

All skill-owned immediate subprocesses use absolute executables. The Node helper
builds HOME, CFFIXED_USER_HOME, TMPDIR, LANG, LC_ALL, a fixed trusted tool PATH,
GIT_CONFIG_GLOBAL=/dev/null and GIT_CONFIG_NOSYSTEM=1 from scratch. It copies no
parent environment. Git additionally disables fsmonitor, hooks, excludes and
credential helpers. No inherited CURL_HOME, proxy, netrc override, DYLD, SSL key
log, Node/Bun/Ruby/Python startup option or developer-directory override survives.
The fixed tool PATH supports toolchain-internal execution and existing pnpm's
node shebang; the guard/app never perform a PATH lookup. Toolchain descendants
are not claimed to have been independently syscall-traced.

| Process | Arguments and environment |
| --- | --- |
| /bin/sh | Absolute scripts/swift-slot.sh, then absolute node and helper argv; clean helper environment above |
| /usr/bin/id, /usr/bin/lockf | Shared Swift wrapper's UID and lock command; explicit inherited clean helper environment |
| Absolute Bun | build --compile, committed entry, explicit build ID and output; clean helper environment |
| /usr/bin/xcrun | clang/swiftc, exact source/object/link arguments; clean helper environment; no package update |
| /usr/bin/xcodebuild | Separate project/scheme, Release, explicit derived path, disabled resolution/updates/signing; clean helper environment |
| /usr/bin/codesign | --force --sign - --identifier local.todo.verification --timestamp=none, test bundle only; clean helper environment |
| /usr/bin/git | Head/status/source reads with disabled ambient Git helpers; clean helper environment |
| Absolute node | Guard assertion, audit, census, recipe and receipt modules with exact argv; clean helper environment |
| Census C binary | No arguments; only LANG, LC_ALL and owned TMPDIR; dlsym presence checks, no credential calls |
| Native safety probes | Literal test mode and own paths; clean helper environment plus a private manifest where required |
| Compiled bootstrap CLI | init/login/add fixed argv plus Profile verify/JSON; exactly HOME, CFFIXED_USER_HOME, TMPDIR, TODO_DB, LANG, LC_ALL; password on stdin only |
| Compiled owned server | No arguments; exactly HOME, CFFIXED_USER_HOME, TMPDIR, TODO_DB, TODO_PORT, LANG, LC_ALL; already sandboxed |
| Native metadata child | No arguments; exactly HOME, CFFIXED_USER_HOME, TMPDIR, LANG, LC_ALL; fixed private manifest, own restrictive profile, one read-only frontmost query and bounded JSON |
| AX reader | --permission-only, --idle-only or the owned verification PID; clean scratch environment; fixed compiled app-bundle path, separate restrictive profile; app/reader share one Swift-slot group |
| /usr/sbin/screencapture | Through absolute sandbox-exec with a restricted profile; -x -o and exactly one owned AX window ID, scratch PNG output; clean scratch environment; never a display capture |
| /usr/bin/true | Only the safe exec-denial control, explicit path, empty environment, no shell/configuration |
| Verification executable | --check-manifest only while held; clean clean helper environment plus private manifest |
| Foreign scratch server controls | Explicit compiled path, known wrong scratch HOME/database; intentional marker in env/argv0/cwd/path, fully recorded; never an owner process |
| Hostile-environment controls | Only native safety probes receive deliberate scratch CURL/proxy/netrc/SSL settings; isolated synthetic listeners/files; production executables never receive them |

Exact argv, environments and exits belong in commands.json; this inventory does
not replace those receipts. SandboxPolicyCheck only asks policy questions and
does not contact a credential broker. No unsandboxed HTTP request reads a file
for its body. Health is GET-only; generated app bodies come from the shared
client against the bound scratch origin. Node listeners and health readiness
checks address only their own literal-loopback ports. Raw external app
invocations with hostile loader injection are outside an intact-process trust
boundary; the supported helper removes those settings before exec.

The production-proof replacement explicitly links its isolation library and
runs the original recipes through a launcher adapter. It uses memory defaults,
scratch temporary storage, credential traps and sandboxed scratch servers.
The adapter substitutes the verified local resource copier for the original
resource command. Its C component passed; the actual Swift suites remain
unqualified until their frozen-head receipts exist.

The widened-root controls replace the literal rule with subpath "/" or widen
file-read-data to file-read*. The same expected-zero boundary test must fail.
Protected real paths are never opened when a mutant policy permits them. The
subpath mutant is caught by the protected-path decisions; the read-star mutant
is caught by root extended-attribute access. Every actual denied open records
its kernel errno and a literal EPERM expectation. Safe Mach queries never look
up a service. IPv4 aliases and off-loopback addresses use datagram connect with
no send, with the socket bound to lo0 and its binding independently read back.
The native boundary uses no TCP negative probe and sends no datagram. The compiler
requires the host token localhost; its ip4 form is proven to select 127.0.0.1
and the chosen port while rejecting IPv6 and other IPv4 loopback addresses.

## Remaining preflight compatibility check

The C preflight diagnostic found that the strict profile denies
`com.apple.coreservices.launchservicesd` for frontmost identity and
`com.apple.tccd.system` for permission checks. Frontmost identity becomes unknown
and both monitoring permission checks become false. The diagnostic also records
denied owner preference-file reads. None of those files is allowed by this
design. No additional broker allowance has been selected for the app, and no
visible run is authorized by this component result. Keep the frontmost-identity
check separate from a successful HID-idle query; the latter cannot substitute
for the former.

The C diagnostic registers a global monitor under the strict profile, but
registration alone does not prove keyboard delivery while TCC is unavailable.
The deprecated GetFrontProcess alternative also fails with status -600 and
does not provide a broker-free fallback. The existing app gate therefore
continues to refuse before a window.

The narrower prototype is OwnerPreflightHelper.m. The app would start that
hashed, descriptor-checked executable as its own child before installing its
profile. The child installs its own restrictive policy before querying metadata.
It denies all networking, further execution, owner-file access and unlisted
brokers. Only its fixed frontmost query needs the additional literal
com.apple.coreservices.launchservicesd broker. TCC stays denied. It returns JSON
over an owned pipe and exits; no broker handle passes to the app or server.
The app's own profile stays unchanged and still starts and owns the server.
This is not a supervisor outside the sandbox or a manifest's unverified
frontmost claim. The skill can use the same fixed executable for its check
before starting the app.

The LS-only C prototype passed its protected-path, credential-broker and network
denials and returned actual frontmost metadata. Removing LaunchServices,
removing network denial or removing broker denial each failed the matching
expected-zero test at exit 1. The app integration now pins the helper and its
rpath library through sealed descriptors, starts its owned child with five
explicit environment keys and bounds its pipe to 64 KiB and five seconds.
It consumes exactly one successful snapshot, requires a two-second handoff and
rechecks age and live idle signals after server startup. The independent HID
watch starts before the server. Global/local monitors are installed before any
window. The compiled and frozen-head gates remain pending. OS-withheld
global events would be disclosed and covered by the independent HID signal.
Registration alone is not claimed as delivered global keyboard input.

## Abrupt-parent cleanup gate

The written visible runner also needs to handle a verification app that crashes
or is terminated outside its normal exit path. An atexit handler alone cannot
establish that its server child exits or that scratch flags were restored.
ParentRelay.c and parent-death-driver.mjs are the failing-first input for that
class: kill only an owned relay parent, require the compiled server's inherited
pipe to close, and clean a baseline orphan only through the dedicated process
group created by that test. The original compiled server stayed alive after its
relay parent was killed, producing the matching failing test at exit 1. The
server now starts an in-process kqueue parent-exit watcher before importing the
production entry point. Its detached thread exits independently of the JavaScript
loop. The repeated control observed the explicit parent-exit marker and pipe
closure, and passed at exit 0. These component receipts belong to a dirty
a67fbe73 development tree; frozen-head qualification remains pending. The full
recipe and visible runner require parentDeathCleanup; neither can claim a
complete recipe without it. No external supervisor is selected.

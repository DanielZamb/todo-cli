# Verification guard correction design

Status: implementation draft; qualification blocked by the coordinator's Swift
slot hold. Visible launches and V02 remain held. This describes the intended
boundary and its counterexamples, not a claim that all controls have passed.
The authoritative results are in the implementation report.

## Ownership and request order

The helper builds the CLI/server from one committed head and records their
content hashes. It generates those expected hashes into the verification
build. A manifest cannot bless a replacement binary by supplying its new hash.
Provisioning uses the compiled CLI with a private HOME and synthetic database.
Every accepted object is opened through a retained directory descriptor with
O_NOFOLLOW. No real Todo file is opened, read or enumerated. An accepted regular
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
| Local owner input | Modifier/key-up/drag type is absent from the mask | Literal full exposed NSEvent type list; delivered type 10/12 controls and modifier-mask removal |
| Global owner input | Local monitor cannot see another application's events | Global monitor installed before a window; unavailable permission/registration refuses; independent HID watch |
| Busy UI thread | Main-thread timers cannot run to notice owner activity | 50 ms background Dispatch timer samples combined-session-any-event and IOKit HID idle; busy-main injected-HID control/red |
| Event visibility | macOS withholds secure input, gesture or consumed events | Disclosed OS limitation; independent sampled HID signal; no physical delivery or hard-real-time claim |
| Idle preflight | Recent owner input is missed by a short per-event list | Any-event session plus HID idle must both be at least 60 seconds; no launch on unknown signal/frontmost identity |
| Partial receipt | guards-only omits UI but still says complete | Explicit actual stage vector; visible scope and every required stage must be true; partial/each-missing-stage tests and old-logic red |
| Frozen provenance | Dirty sources are compiled but stamped with an older head | Dirty qualification refused, source/binary/bindings hashes and head recheck; development receipts remain diagnostic |
| Cleanup | A child survives while its scratch data is removed | Track owned child handles and kernel identity; active-child/uncertain cleanup retains scratch and fails |

Predicate inversions establish that a positive check is exercised; malicious
fixtures establish refusal behavior. Neither replaces the other. The 44 generated
predicate controls and class removals need to be rerun after the current sandbox
startup failure is resolved. No green matrix is claimed for this draft.

## Processes and ambient configuration

All skill-owned immediate subprocesses use absolute executables. The supervisor
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
| /bin/sh | Absolute scripts/swift-slot.sh, then absolute node and helper argv; supervisor environment above |
| /usr/bin/id, /usr/bin/lockf | Shared Swift wrapper's UID and lock command; explicit inherited supervisor environment |
| Absolute Bun | build --compile, committed entry, explicit build ID and output; supervisor environment |
| /usr/bin/xcrun | clang/swiftc, exact source/object/link arguments; supervisor environment; no package update |
| /usr/bin/xcodebuild | Separate project/scheme, Release, explicit derived path, disabled resolution/updates/signing; supervisor environment |
| /usr/bin/codesign | --force --sign - --identifier local.todo.verification --timestamp=none, test bundle only; supervisor environment |
| /usr/bin/git | Head/status/source reads with disabled ambient Git helpers; supervisor environment |
| Absolute node | Guard assertion, audit, census, recipe and receipt modules with exact argv; supervisor environment |
| Census C binary | No arguments; only LANG, LC_ALL and owned TMPDIR; dlsym presence checks, no credential calls |
| Native safety probes | Literal test mode and own paths; supervisor environment plus a private manifest where required |
| Compiled bootstrap CLI | init/login/add fixed argv plus Profile verify/JSON; exactly HOME, CFFIXED_USER_HOME, TMPDIR, TODO_DB, LANG, LC_ALL; password on stdin only |
| Compiled owned server | No arguments; exactly HOME, CFFIXED_USER_HOME, TMPDIR, TODO_DB, TODO_PORT, LANG, LC_ALL; already sandboxed |
| /usr/bin/true | Only the safe exec-denial control, explicit path, empty environment, no shell/configuration |
| Verification executable | --check-manifest only while held; clean supervisor environment plus private manifest |
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

The former production-proof wrapper is disabled rather than retaining DYLD
injection. Replacing it with explicitly linked safety boundaries while preserving
the original state/offscreen suites remains required. This unresolved item and
the stricter sandbox's child-startup failure prevent final qualification.

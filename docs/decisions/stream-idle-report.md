# Mac idle stream and quiet recovery

The Mac transport used a 60-second URLSession request timeout for the event
stream as well as ordinary requests. Foundation defines that timeout as time
without transmitted data. The server deliberately sends no idle bytes and
sets idleTimeout to zero. This client policy explains the observed idle-minute
drop. It predates the old/new responsiveness comparison and does not explain
a 15-second main-thread block.

The stream now creates its own session lazily, with an idle timer that cannot
expire before the existing 24-hour absolute resource budget.
Ordinary requests retain their 60-second timeout. Session reuse is not part of
this change. The production timeout seam is internal and keeps those defaults.

A stream end first attempts a quiet resume with the saved cursor. A healthy
applied catalog at the same identity, cursor and restore generation skips
catalog and Dependency reads. It leaves availability, notices and open state
alone. Repeated immediate clean endings back off without disabling writes.
A failed reconnect enters Offline. Recovery automatically retries an open
directory or the lookup's retained submitted prefix. Missing, stale, transient
and too-broad search results still refresh. Reload, authorization, deletion and
contract-mismatch branches retain their existing priority. The accepted rule
is recorded in [ADR-0015](../adr/0015-search-text-retention-and-recovery.md).

The meaningful failing state control produced seven issues before the fix.
A reachable clean EOF briefly disabled writes, performed another catalog read,
cleared the directory result, invalidated picker state and cleared a notice.
The directory also stayed Offline after recovery. The generated-client control
validates every reply shape used by that drive. Earlier fixture errors are
retained separately and do not count as a product reproduction.

The native short-timeout control uses the production generated client and a
compiled scratch server. With an ordinary request timeout shortened to 100 ms,
the old shared stream session timed out during 1,500 ms of silence and received
no next operation. The new stream received the next real committed operation
on the same connection. A separately delayed ordinary request still timed out.
The old receipt's ready flag was unavailable after its reader failed; it is not
evidence that the server omitted ready.

The release production-model drive then used the owner-shaped 178-Task Profile
with a current saved cursor and restore generation. Across 300 real idle seconds
it recorded zero requests, zero full refreshes and zero reconnects, remained
writable and never reported loading. A separate initial control on a one-Task
Profile also stayed live for five minutes. These are headless state and network
proofs. They do not prove a physical frame, native pointer selection or an
on-screen dialog. No Todo.app, hosted XCTest, Keychain, signing or installation
was used. Electron was not changed in this Mac unit; its parity gate remains
coordinator-owned.

The repeatable command is:

```sh
.agents/skills/verify-client-diagnostics/scripts/verify.py docs/evidence/mac-idle-new --stream-only --long-idle
```

The helper records source and binary hashes, real exits, fixture counts and
cleanup. It builds unhosted release tests through swift-slot. Pure model cases
cover retained draft/dialog/picker/graph state, healthy zero-read reconnect,
failed reconnect plus directory and lookup recovery, cursor/generation drift,
repeated-end backoff and transient/too-broad recovery. The native control keeps
its ready observation independently of reader success and waits for ready
before the idle interval.

The real compiled HTTP [SSE verification](../../.agents/skills/verify-sse/SKILL.md)
passed, including ordered resumable operations, concurrent CLI writes and
authorization/revocation. The full root check passed. The unchanged search TLA+
model, real matcher properties, all broken controls and restored model passed
with renewed source mapping. Healthy quiet reconnect is an allowed stutter;
Error recovery and the catalog obligation remain mapped transitions. Cursor,
restore generation, UI pixels and authentication remain explicit model limits.
This is not a mechanical client refinement or an independent review.

Final Mac state, full design, generated History union and unsigned app-build
receipts are recorded in the [candidate summary](../evidence/mac-perf/stream-idle-summary.json). Package pins must remain
unchanged. Raw output stays in the run store; only compact summaries are tracked.

The candidate gates use these commands, all from the checkout root:

```sh
scripts/swift-slot.sh apps/macos/scripts/verify-design.py .scratch/proofs/mac-candidate-1-design
scripts/swift-slot.sh swift test --package-path apps/macos --scratch-path apps/macos/DerivedData/StateProof --disable-automatic-resolution --jobs 2 --filter 'WriteStateTests|GeneratedContractTests'
scripts/swift-slot.sh xcodebuild -project apps/macos/Todo.xcodeproj -scheme Todo -configuration Release -destination platform=macOS -derivedDataPath apps/macos/DerivedData/MacCandidate1 -disableAutomaticPackageResolution -onlyUsePackageVersionsFromResolvedFile CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO ONLY_ACTIVE_ARCH=YES ARCHS=arm64 build
scripts/swift-slot.sh apps/macos/scripts/verify-history-unions.sh docs/evidence/mac-perf/c3/history-unions
/usr/bin/lockf -k /tmp/todo-pnpm-check.lock pnpm check
bun .agents/skills/verify-task-search-formal/check.ts
```

The unsigned build receives TODO_SERVER_BINARY from the source-hashed compiled
scratch cache. The union check receives the matching TODO_CLI_BINARY and
TODO_SERVER_BINARY and sets TODO_DAG_CONTRACT_TESTS=1. The real HTTP SSE helper
receives those cached server, seed and CLI artifacts as documented in its skill.
The command receipts keep their hashes and exits. No package pin changed.

The three tracked Mac performance JSON summaries total 30,457 bytes. Bulk
compiler output, failed controls and native receipts are retained locally in
the run store. The complete design capture remains in checkout-local scratch.

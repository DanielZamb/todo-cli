# Cache erasure and CLI boundary verification

The review-fix product keeps the exact-text PreparedField provider and SEC
matching contract. It adds a cache-wide epoch captured before auth/SQLite reads.
Any Purge and actual Snapshot restore clears every retained/pending slot and
fences every old Read, including reads with no slot yet. Local Profile deletion
can remain Profile-scoped. The server's external Profile-delete observer clears
all Profiles. Purge no longer scans History for cache eviction; its redaction has
one History read. A rare owner Purge deliberately costs an uncached refill.

The server captures max seq before serving and polls every 250 ms. A domain
query returns only new committed seq/kind/original_kind fields. It recognizes
redacted TaskPurged rows. Restore generation change clears first and resets to
current max, covering restore then external Purge before polling at a reused
sequence below the old cursor. Canonical NULL Profile/snapshot-restore actor
headers make the existing generation query use op_log_profile_seq before JSON
extraction. Supported DatabaseRestored writes come only from Snapshots.restore;
Task append cannot construct one. No schema migration or coherence protocol is
added. This server may see its own Purge and clear again harmlessly.

The CLI list boundary maps unexpected preparation/matching defects into the
existing runtime_error JSON envelope and real exit 1. SearchTooBroad remains the
same typed exit 2 and HTTP 422. The narrow Effect.catchDefect does not convert
interruptions. SEC's runner finalizer remains required for pending cleanup.

The peer cc5777 report exposed three real failures. Fresh reproductions before
fixing are preserved under docs/evidence/perf-cache/fix-round-before. The retained
compiled memo failed a literal 1000 ms moved-Task erasure witness and the normal
CLI JSON-envelope assertion. The old local Move/Purge and suspended late-field
assertions also failed. These are behavior failures, not compiler/hash failures.

Current candidate evidence under docs/evidence/perf-cache:

| Evidence | Behavior |
| --- | --- |
| admission-s2Ahb9 | Two keys/preparations/Reads, capacity two, one/two Profiles; seven model mutants TLC exit 12 and restored exit 0. ClearAll invalidates epoch equality. |
| admission-code-upMphO | Eleven real-Effect controls fail literal witnesses, restore bytes and pass clean/strict. Includes pending and slotless old Reads across ClearAll. |
| generated-3Ue4aS | Full Unicode PreparedFields, ordered JSON/spans, cold/partial/warm/uncached exact budget/refusal, seven store controls/restoration/strict, local Move/Purge and late description. |
| hygiene-NqPs1w | Real production observer and two stores: removed hook, ignored generation, rejected-row controls fail and restore. |
| fix-round-compiled-erasure | Compiled CLI/server moved-Task Purge and Profile-delete zero retention within literal 1000 ms, including CLI startup; owned server joined. |
| fix-round-compiled-defect | Retained compiled CLI with selective Segmenter fault returns exactly one runtime_error envelope and real exit 1. |
| fix-round-before/generation-query-plan.json | Actual migrated scratch query plan: old SCAN op_log, fixed indexed Profile header search. |

The final exact committed one-command, AtomicCAS sensitivity/clean, operation-log,
Profile, Snapshot, server/SSE/scheduler and locked full-check receipts are recorded
in the ignored final delivery report. Candidate evidence above is identified by
actual source hashes; it is not mislabeled as a clean cc5777 product proof.
coverage.json and admission/MAPPING.md record the reviewed functions and bounds.

One command is `bun .agents/skills/verify-task-search-cache/verify.mjs <full-SHA>`.
The command includes generated/model/code/hygiene controls and compiled lifecycle,
erasure and defect assertions. No native app, signed binary, Keychain or real
HOME/database is used. Literal goldens and the shared refusal contract remain.
All child processes must exit before a pass receipt. Preserve failed receipts.

Completion and caller usability depend on the final checks and L1's two review
seats. Form follows the existing CLI/HTTP Task-list flow. Read, PreparedField,
own-token cleanup and ClearAll describe one store-owned abstraction; callers
supply no cache metadata. Move and Snapshot restore compose through global
retention fencing rather than historical Profile lookup. Matching correctness
still follows current exact text and the same shared work meter.

No retiming is authorized. Frozen HTTP measurements are measured cc5777/source 2eb2,
not the later erasure-fixed SHA: lower on long descriptions, overlapping/neutral
elsewhere, source attribution incomplete. The helper hit cost is separate from
HTTP latency. The new epoch guard itself is not remeasured. Charged storage is
not RSS; the finite admission model is not an unbounded refinement theorem. First
preparation of expanding text remains expensive and V3 remains nonretained.

The confirmed immutable fixed code is 65033c86ec00889f84642fb76289094a23762ebb, aggregate source fingerprint
8fe6361c476a5c81182491dacd3588021b206e08b6fc5d8acc8e0c6c7e1f69c7. Its cache
one-command receipt verify-2pGXUu passed with all controls and compiled assertions.
Official matcher/formal, CLI/goldens, search, operation-log, Profile, Snapshot,
HTTP, SSE, scheduler and AtomicCAS recipes all exited 0 under fix-65033c86.
The final mapping-only delivery commit preserves these source bytes. Its exact
locked full-check exit and review SHA are in the ignored final delivery receipt.
Frozen timings remain measured cc5777/source 2eb2, not this fixed product.

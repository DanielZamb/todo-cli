# Admission model mapping

The reviewed fix replaces per-text Purge hygiene with a whole-cache epoch fence.
The measured cc5777 product is historical. Exact current file hashes are in
../coverage.json; candidate and immutable committed proofs name their inputs in
receipts. SEC's matcher, budget, evaluator and runner remain byte-identical to
2077c802. This bounded model is not a mechanical source-refinement theorem.

An old or interrupted preparation must not insert after revocation, erase a
newer token or leave charged pending state. Any Purge or Snapshot restore clears
all Profiles, including a moved Task's old Profile and reads without slots yet.

| Action/property | Real code | Meaning |
| --- | --- | --- |
| ReadStart | task-search-cache.ts:28; commands.ts:287; CLI main.ts:698 | Capture epoch and Profile generation before auth/SQLite Task read. Every later field uses the same Read. |
| Miss | task-search-cache.ts:73 prepare, :96 register | Later token wins. Failed slot/byte registration computes without retention. |
| PrepareStep | yield* fieldWords through SEC runTaskRecordSteps | Yielding partial preparation is not a hit. Ready is the complete result before synchronous admission. |
| Complete/Admit | task-search-cache.ts:88 guard, :112 retain | Current token ownership, epoch, Profile generation and open cache are all required. No runtime yield separates final preparation, admission and finally. |
| Interrupt/failure | SEC task-filters.ts:183 ensuring, cache :92 finally/:143 dropPending | Iterator closure reaches the delegated generator. Only the invocation's still-current slot is removed. |
| Evict | task-search-cache.ts:155 | Exact-key eviction remains a cache operation; it is no longer the Purge path. |
| ClearAll | task-search-cache.ts:170 | Increment global epoch; drop all retained/pending maps and zero their charges. All old Reads lose admission even with no registered slot. |
| Purge | store/store.ts:1044 calls clearAll | After applyEvent and before redaction, inside the transaction. No cache History scan remains. Rollback can only lose retention. |
| Snapshot restore | store/snapshots.ts:538 afterRestore; store/store.ts:175 callback | Successful actual restore clears before returning. Dry-run does not clear. |
| DeleteProfile | task-search-cache.ts:162 evictProfile; store deleteProfileSync | Local deletion can revoke only its Profile. The external observer deliberately clears all Profiles. |
| External erasure | server task-search-cache-hygiene.ts:4; server.ts:229 | Capture max seq before serving, poll every 250 ms, clearAll on committed redacted TaskPurged/ProfileDeleted, clear and reset max on generation change. |
| Narrow query | store/search-cache-events.ts; store.ts:570 | Only new committed seq/kind/original_kind fields. SQL stays in the domain. No event payload decoding in the server. |
| Restore metadata | store/snapshots.ts:281 | Canonical NULL Profile/snapshot-restore actor/committed headers use op_log_profile_seq before the unchanged JSON kind/generation check. |
| LruEvict | reserve/dropEntry | Retained entries make room for cocharged pending/retained bounds; no shared in-flight results. |
| Hit | prepare entry branch | Complete PreparedField, no preparation yield/refold. A stale Read may use a newer legitimate result but cannot refresh LRU. |
| Close | task-search-cache.ts:178 | Permanent closed fence, clearAll, then drop generation metadata. |
| NoInsertAfterEvict | independent insertionAllowed provenance | An old A may not overwrite a newer legitimate B result. |
| NoStaleReadRetention | independent insertionFresh observation | Both epoch equality and Profile-generation equality hold at insertion. |
| NoPendingLeak / OwnSlotCleanup | pending/admitted and ownCleanupOK observations | Cleared/interrupted work leaves no dead current slot; A cleanup cannot erase B. |
| CacheBound / HitIsComplete | abstract slots / complete bit | Capacity two and no incomplete cache publication. Real charged bytes/counts are separate literal code checks. |

The model bounds two keys, two preparations, two active Reads and capacity two,
with one and two Profiles. Profile generation has four colors, never reused
while an active Read refers to one. readEpoch is an equality bit for each Read,
not a wrapping integer counter: ReadStart sets it true and every ClearAll sets
all bits false. Repeated clears remain false until a new ReadStart. This is a
relational abstraction of Read.epoch === cache.epoch and covers late slotless
reads without a request registry. Real counters are assumed to remain exact
JavaScript integers during a store lifetime. No fairness, arbitrary concurrency,
SQLite, Unicode, query/budget or RSS theorem is claimed.

Purge is the ClearAll action; local Profile deletion retains its generation
transition. HasReady makes final admission/finally indivisible just as the real
code's synchronous stack is. Seven model controls include BrokenEpoch ignoring
epoch equality. Each fails its named invariant at TLC exit 12, then restored
safety passes with queue zero. Eleven real-Effect controls include ignored epoch
and retained pending slots across ClearAll. Controls mutate isolated source,
reach literal assertions, restore bytes, and pass clean plus strict TypeScript.

Run the parent skill's one command. check-hygiene.mjs adds three isolated real
observer/query controls: missing clear hook, ignored generation and rejected-row
admission. Compiled erase-lifecycle.mjs warms work, Moves to personal, warms,
Purges from a separate CLI and requires literal zero retention within 1000 ms,
including CLI startup. It also proves external Profile deletion. A native Map
preload in that isolated scratch process observes counts; no public hook or
cache diagnostics endpoint is shipped. The real-code restore witness is restore,
external Purge at or below the old cursor, then poll. A generation change must
clear before resetting max, not try to infer which old seq was missed.

Current control receipts include admission-s2Ahb9, admission-code-upMphO,
hygiene-NqPs1w and generated-3Ue4aS. They do not replace the final committed-input
one-command receipt. Earlier cc and synchronous findings remain historical.
The CLI selective Segmenter defect reproduction now requires runtime_error JSON
and exit 1; typed refusal remains exit 2. Effect.catchDefect is only at that list
boundary and leaves interruption/finalization semantics intact.

Pending plus retained state shares 16 MiB, with separate 4,096 caps and a 4 MiB
completed-entry bypass. Active buffers, superseded local tokens, generation
metadata, backing stores, allocator capacity and GC remain outside that charge.
V3 prepares 1.8M units and accounts for 32,000,308 bytes, so it stays uncached.
A rare owner Purge deliberately costs one uncached refill of the whole memo.
Own server writes may be observed and cleared again harmlessly. Content keys
preserve output correctness; these erasure rules are memory hygiene, not database
coherence. No new timing window is authorized. Frozen measurements remain
cc5777/source 2eb2, separate from the later fixed review SHA.

The confirmed immutable fixed code is 65033c86ec00889f84642fb76289094a23762ebb, aggregate source fingerprint
8fe6361c476a5c81182491dacd3588021b206e08b6fc5d8acc8e0c6c7e1f69c7. Its cache
one-command receipt verify-2pGXUu passed with all controls and compiled assertions.
Official matcher/formal, CLI/goldens, search, operation-log, Profile, Snapshot,
HTTP, SSE, scheduler and AtomicCAS recipes all exited 0 under fix-65033c86.
The final mapping-only delivery commit preserves these source bytes. Its exact
locked full-check exit and review SHA are in the ignored final delivery receipt.
Frozen timings remain measured cc5777/source 2eb2, not this fixed product.

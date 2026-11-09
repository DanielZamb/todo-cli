# Admission model mapping

The integrated production cache at `41926044` is byte-identical to the prepared
candidate, SHA-256 ef36b5bd4a18be466930234cbf984f5618cc288dfb13b493faed8fd37b67cb86.
SEC's task-search.ts and task-filters.ts remain byte-identical to `2077c802`.
The integrated model, real-Effect controls, generated meter and SQLite lifecycle
checks passed. Exact whole-file hashes are in ../coverage.json. The model is not
a mechanical refinement proof. Earlier synchronous/development receipts are
preliminary and do not replace this integrated proof.

## Property and harm

An old or interrupted preparation must not insert after its admission is
revoked, erase a newer pending token, or leave pending storage behind. Otherwise
Purge or Profile deletion could be followed by retention of erased text, or a
canceled HTTP search could consume retained cache capacity indefinitely.

| Action/property | Candidate or SEC code | Boundary |
| --- | --- | --- |
| ReadStart | task-search-cache.ts:23; commands.ts:287; CLI main.ts:698 | Copy the current Profile generation before auth.read/readTasks. Each later field uses that captured value. |
| Miss | prepare/register | Register a unique token in pending before the first yielding preparation step. Replacing a token refunds its current pending charge. Failed registration prepares without retention. |
| PrepareStep | yield* fieldWords | Partial checkpoints are abstract stutters. Ready represents the final prepared result immediately before admission. |
| Complete/Admit | prepare guard, retain, finally/dropPending | Token ownership and captured generation must still match. No runtime yield separates the final preparation return, admission and cleanup. HasReady forces the model to finish this stack before any other actor runs. |
| Interrupt/failure | runTaskRecordSteps ensuring -> delegated generator return -> cache finally | SEC closes a suspended iterator exactly once. Cache removes only its own still-current slot. Both the SEC runner and cache finalizer are required. |
| Evict | evict | Drop retained entry and current pending token for one exact Profile/text key. |
| Purge | store/store.ts:1035 revoke then evictSearchTask | After applyEvent, before historical eviction/redaction, synchronously inside the transaction. A later rollback can lose retention only. |
| DeleteProfile | evictProfile | Revoke the Profile generation and remove retained and pending keys for that Profile. |
| LruEvict | reserve/dropEntry | Retained entries are evicted before storage reservation. Pending slots do not become shared in-flight results. |
| Hit | prepare's entry branch | Return a complete PreparedField without preparation yields or refolding. A stale read may use a legitimately newer complete entry but cannot refresh its LRU position. |
| Close | close | Empty maps and zero charges; closed permanently fences later admissions, including fields that have not started yet. |
| NoInsertAfterEvict | insertionAllowed provenance observation | Inspect actual insertions, not mere key presence. A newer legitimate B result may remain after A finishes. |
| NoStaleReadRetention | insertionFresh observation | The captured read generation equals the current Profile generation at every insertion. |
| NoPendingLeak | pending -> active, nonrevoked preparation | Eviction/interrupt cannot leave a current dead slot. |
| CacheBound | retained plus pending unit slots | Abstract unit capacity is two. Actual entry counts, key/container/Word charges and 16 MiB bounds are checked against code separately. |
| HitIsComplete | cache complete bit | Incomplete preparation is never a usable entry. |
| OwnSlotCleanup | ownCleanupOK observation | Old completion/interruption preserves a newer slot. This protects B's ability to finish; no eventual-progress theorem is claimed. |

## Bounds and assumptions

Two exact content keys, two preparation identities, two active read identities,
and capacity two are checked with one Profile and with two Profiles. Four
Profile-generation colors preserve equality: a color is not reused while an
active read refers to it. Preparations keep their read active until completion
or interruption. This avoids counter wrap and a lifetime-request cutoff in the
finite abstraction. Real code uses a per-Profile numeric counter; the mapping
assumes increments remain exact JavaScript integers during a store lifetime.

ReadEnd models the point where a request no longer has preparations or future
fields. Profile restore, query matching, budgets, HTTP authorization, Unicode,
SQLite, native clients, arbitrary concurrency and actual RSS are outside this
model. Generated properties and compiled lifecycle recipes cover those contracts
separately. No fairness or unbounded safety theorem is claimed.

The scalar insertion observations are computed independently of the insertion
guard, so removing the guard fails them. The pending-revocation observation is
independent of whether a broken eviction actually removes the slot. Earlier
failed draft runs remain evidence. One draft missed parentheses around a TLA+
Boolean assignment; the resulting unconstrained observation was corrected,
without changing the intended property.

## Reproduce

Run `bun .agents/skills/verify-task-search-cache/admission/check.mjs` for the
pinned model and six isolated fault configurations. Each control must reach its
named invariant and TLC exit 12; baseline/restored runs require exit 0 and queue
zero. The tool is tla2tools 1.7.4, pinned by SHA-256 in tool.json.

The real-code command is
`bun .agents/skills/verify-task-search-cache/admission/check-candidate.mjs <full-product-SHA>`.
It archives that immutable product, including the memo and SEC runner, and runs
real Effect checkpoints through SEC runTaskRecordSteps. No memo generator is
manually drained. It checks late B after Purge, stale Profile reads, close,
concurrent misses, interruption, checkpoint failure, and the exact
A -> Evict -> B -> CompleteB -> CompleteA reference-provenance witness.

The real-code controls omit admission, pending eviction, interrupt cleanup,
generation, ownership cleanup, completion, text key, Profile key, or LRU
reservation. Each must fail a literal assertion, not compilation or hashes.
Every source restoration is byte-checked, followed by a clean run and strict
TypeScript checking.

Complete PreparedField equality uses the existing matcher atom corpus and seed
0x5ea2c001, 2,048 random inputs, and adversarial Unicode. Literal storage cases
include 4,096 entries at 1,388,200 bytes, 4,096 pending slots at 4,831,060 bytes,
and pending-byte saturation at 83 slots and 16,610,936 bytes. Failed slot/byte
registration stays uncached even after space becomes free. The V3 fixture has
1,800,000 preparation units, 300,001 Words and a 32,000,308-byte accounted entry,
so it bypasses the 4 MiB retention limit.

Pending keys/tokens and retained entries share the charged 16 MiB budget.
PreparedField's container is charged 64 bytes in addition to the 128-byte entry
or token estimate and the existing key/Word formula. Profile generation metadata
is reported separately. Active preparation buffers, superseded invocation-local
tokens, string backing stores, allocator capacity and GC can increase actual RSS.
Known key oversize bypasses admission before hashing; actual Word-array oversize
is known after preparation and never retained. No negative/oversize memo exists.

The exact real-code mapping is prepare/register at 62/85, admission at 77,
finally at 80, retain at 101, own-slot cleanup at 132, revoke at 139, evict at 144,
Profile delete at 151 and close at 159 in task-search-cache.ts. Store close calls
the fence at 299; deleteProfileSync calls evictProfile at 500. SEC's
runTaskRecordSteps ensuring delegates return through the matcher to cache finally.
No runtime yield separates final preparation, admission and cleanup.

Integrated receipts are admission-g16wXV, admission-code-tkF5X4 and
generated-DnwTQA under docs/evidence/perf-cache. The last includes same-source
ordered JSON/lifecycle controls and exact meter equality across cold, both partial
warm states, warm and uncached inputs. The compiled integrated-fixed-search,
CLI, op-log, Profiles, Snapshots and HTTP drives passed. The first compiled search
attempt exposed a CLI refusal adapter regression; the narrow CommandError mapping
fixed it and the complete compiled drive passed. This does not change admission
actions or protected SEC bodies. The final locked check and measurement receipts
are reported separately at the worker's delivery head.

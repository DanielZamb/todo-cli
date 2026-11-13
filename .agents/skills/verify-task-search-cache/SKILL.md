---
name: verify-task-search-cache
description: Verify the store-owned PreparedField memo with same-source generated Unicode/meter properties, real Effect cancellation, bounded admission TLA+, mutation controls and compiled scratch lifecycle operations.
---

# Verify folded-word memo

Created with create-verification-skill and create-formal-verification-skill.
Read [the feature map](features/README.md), [admission mapping](admission/MAPPING.md)
and [source coverage](coverage.json).

From the checkout root, run:

```sh
bun .agents/skills/verify-task-search-cache/verify.mjs <full-product-SHA>
```

Require the existing pnpm dependencies, Bun 1.4.4, Java and the pinned
tla2tools 1.7.4 jar provisioned by verify-task-search-formal. The command captures
the named domain source with git archive, runs generated properties, the admission
model and its controls, real-Effect controls, current source-hash compiled binaries,
and authenticated HTTP competing with a separate compiled CLI process. Final
proof requires a clean committed product source matching those binaries.

Prepare the uncached baseline first with
`bun .agents/skills/verify-task-search-cache/build-baseline.mjs <full-base-SHA>`.
The optional second SHA overlays only the reviewed Tag projection from that
immutable commit. For the Agent-discovery integration, use main
`4c904d96277853c60692c685c6d4ea3b3e655bc4` and Tag product
`d83d61863b95d2482ca9281a34d5db4494abffbb`. The manifest records both origins.
The earlier 2077c802 baseline remains historical. This oracle preparation is
verification; it does not repeat the frozen performance measurements.
The helper archives that immutable SEC+Tag source and links workspace packages
inside the capture. It never creates or changes a checkout. The one-command
checker requires the baseline manifest and identical protected matcher, runner
and Tag projection hashes. It never falls back to a cached binary as its oracle.
Follow the run's disk guard, batch floor and runtime-copy cleanup orders.

## Recordings and CLI routing integration renewal

Candidate: product 29927cb04cc49bb706be602127557f43602ed5b2 on integ/contract.
Only the hygiene rows apps/server/src/server.ts and apps/cli/src/main.ts change;
the seven protected domain files and the hygiene observer are byte-identical to
63f9b6c8. Hygiene still receives the raw store and is forked before the
scheduler. Before renewal check.mjs passed (no protected file changed) and
check-hygiene.mjs ran its clean, three observer controls, restored and typecheck
stages, then stopped only at the server.ts hash. Exits of the uncached oracle and
the full verify.mjs are in docs/decisions/ui-speed/recordings-cli-routing-contract.md.
Candidate until the seats accept it.

## Behavior and controls

The generated drive reuses the matcher atoms and seed 0x5ea2c001. It compares
complete PreparedFields for 2,048 generated inputs plus adversarial Unicode,
including punctuation, expansion seams, unpaired surrogates and 100k fields.
Six queries per input compare full ordered Task JSON, original strings and UTF-16
spans with the uncached implementation from that same captured source.

meter-properties.ts checks exact preparation, Damerau-cell, clause-visit and
total counters for cold, title-only warm, description-only warm, fully warm and
uncached states. It checks 256 generated inputs at three nearby budgets each,
literal 17.5/17.6 acceptance/refusal, early title/description refusal, exact 22-unit
U+FDFA plus whitespace/punctuation preparation, and default 5M volume cases.
All preparation and matching use SEC's shared meter and Effect runner.

The real SQLite drive calls production TaskCommands.list. It checks literal
titles and same-source ordered results after edit, rejected edit, Delete, Revert,
full/checkpoint rebuild, Snapshot restore with Version reuse, local Purge,
Profile deletion and close. Seven isolated source controls remove text/Profile
keys, LRU reservation, Purge clear, restore clear, Profile eviction or close cleanup.
Each must fail its named literal assertion before a strict typecheck or hash gate.
Every source restoration is byte-checked, then the clean drive and strict check run.

The admission driver captures the same immutable product source. Eleven real-code
controls test complete-hit publication, ownership, generation, cancellation,
pending eviction and bounds. Deterministic checkpoints drive Purge during a miss,
late field B after revocation, stale Profile reads, close, concurrent misses,
interrupt and checkpoint failure. The named A/Evict/B/CompleteB/CompleteA witness
retains B's object. No memo generator is manually drained. The small TLA+ model
checks 2 keys, 2 preparations, 2 reads and capacity 2 with one and two Profiles,
seven failing mutants and restored safety. It is not a source-refinement theorem.

The compiled lifecycle drive warms HTTP search, edits through the second-process
CLI, Reverts over authenticated HTTP, restores Version 1, writes different text at
Version 2, Deletes, Purges and restores again. Every query compares full ordered
public Task JSON with the immutable uncached CLI. Revert is exercised through authenticated HTTP here; verify-dag also covers
the CLI revert command. The final restore requires no surviving Task. The owned server must exit
before the PASS receipt is written.

## Storage and mapping

Current pending slots and retained entries share 16 MiB of charged storage.
Retained entries and pending slots each have a 4,096-count bound; a completed
entry over 4 MiB is never retained. Accounting includes 128 bytes per key/token,
exact key and Profile UTF-16 storage, 64 per PreparedField container, and 96 plus
twice text length per Word. The V3 field prepares 1.8M units and 300,001 Words,
charging 32,000,308 bytes, so it bypasses retention. No oversize/negative memo exists.

Temporary preparation buffers, superseded invocation-local tokens, allocator/GC
overhead and separately reported per-Profile generation metadata are outside the
charged bound. These are deterministic storage limits, not RSS guarantees.
Every local or external Purge and every Snapshot restore/generation change clears
all retained and pending entries and advances the cache epoch. Read captures that
epoch before auth/SQLite access, including reads with no pending slot yet. Local
Profile delete may revoke only its Profile; the server observer clears all on an
external ProfileDeleted. Purge no longer reads History for cache eviction. Own
server writes can cause a second harmless clear. The next search pays one uncached
refill after a rare owner Purge. Exact current text preserves output correctness;
the event observer is memory hygiene, not database coherence.

coverage.json records actual reviewed source hashes. Renew them only after
reviewing changed bodies, observing behavioral controls and restoring clean runs.
The existing response-order mapping is separate. Both clients use this same HTTP
capability; no client state, public schema, selector or API contract changes here.

## Measurements

Measurements run separately after own checks settle, through measure-series.sh
under `/usr/bin/lockf -k /tmp/todo-perf-measure.lock`. Notify L1 before the slot.
Compile both inputs and the seed first. Preserve the fixture/queries, warmup,
25 measured requests per scenario and five alternating pairs. Precompute all five
uncached CLI oracle strings outside HTTP intervals, regenerate all affected
oracles after each mixed write, and compare every full HTTP response exactly.
Compressed text oracles, validation hashes, errors/work counts, load including
the 1-minute value, process CPU/RSS and separate oracle/validation costs survive.
Freeze the driver and fixture hashes before either side runs. Old synchronous
and unlocked pilot receipts are preliminary and excluded.

The series records df before entry and after every complete A/B pair. Below
30 GB it finishes that pair, writes last-complete-pair and disk-hold.txt, then
exits 75. Stop, prune only superseded owned binaries and report; never divide a
batch to evade the floor. check-series-floor.mjs proves literal no-start,
whole-pair stop and five-pair completion with isolated command fixtures.

Run micro.ts in a coordinated locked slot for actual 100k hit cost. It uses fresh
equal input strings, awaits the real Effect runner, validates complete payloads
outside intervals and labels oversized dense fields uncached. counts.mjs instruments
an isolated real source copy to prove 6,000 lookups, 2,000 folds and 4,000 hits. This is
separate from HTTP latency. Overlapping paired ranges support no latency verdict.

Every full pnpm check uses
`/usr/bin/lockf -k /tmp/todo-pnpm-check.lock pnpm check`.
Evidence remains ignored under docs/evidence/perf-cache. Helpers remove only their
scratch data and stop only recorded owned servers. Preserve every evidence
directory. clean-runtime.mjs records closed own .*.bun-build removal and skips
files lsof reports open. No installed app, real HOME/database, Keychain or native
UI is used. The relative .claude/skills link supports filesystem discovery;
fresh coordinator discovery remains a separate check.

## Review-fix erasure proof

check-hygiene.mjs runs the production observer and narrow store query against two
stores on one scratch database. Its removed-hook, ignored-generation and rejected-
row controls must fail literal assertions, restore bytes and pass. The observer
captures max seq before HTTP starts and polls every 250 ms. It reads only new
committed seq/kind/original_kind fields. Restore generation uses indexed canonical
NULL Profile/snapshot-restore actor headers before JSON extraction. The observer
recognizes TaskHistoryRedacted.original_kind TaskPurged and ProfileDeleted. On a
generation change it clears first and resets to current max, covering restore,
external Purge and poll with a reused seq below the previous cursor.

erase-lifecycle.mjs uses the compiled CLI and server with a verification-only
native Map preload in its isolated scratch process. Warm work, Move to personal,
warm, then external CLI Purge must leave zero entries in both Profiles within
literal 1000 ms, including CLI startup. External Profile deletion has the same
bound. No public diagnostics or test hook is added. cli-defect.mjs reuses the
selective Intl.Segmenter fault to require exactly runtime_error JSON and exit 1.
Typed refusal remains exit 2; the narrow Effect.catchDefect preserves interruption.
The production runner finalizer and real-Effect interrupted cache checks remain.

ClearAll in TaskSearchCacheAdmission.tla invalidates read-epoch equality for every
read, clears slots and prevents late admission. An epoch-ignoring guard must fail
NoStaleReadRetention at TLC exit 12 and the analogous real Effect literal. The
finite model tracks epoch equality bits rather than integer lifetime counters.
It is not an unbounded source-refinement theorem. Frozen latency evidence remains
measured cc5777/source2eb2, never relabeled as the later fixed source. No retiming
is authorized for this review-fix round.

## DAG merge oracle

When a merged candidate adds graph-aware Task filtering, prepare its uncached
oracle with `build-baseline.mjs <full-merged-SHA> --uncached`. The capture changes
only the two preparation callbacks in shared list/readTasks to the existing
uncached taskSearchExecution preparation. Its manifest records both original
and instrumented hashes and refuses a different number of sites. Matching,
budget charging, yielding, graph ordering, Tag projection and schemas retain
the exact merged source. No performance measurement or timing claim is made.
The legacy SEC-plus-Tag preparation mode remains available for historical checks.

The cabf4866/DAG merge renews only reviewed graph-aware read and observer
composition after the seven cache and three observer source controls fail their
literal assertions and restored copies pass. CLI defect classification is
separately driven through the compiled artifact. Historical cache timing results
remain on their original inputs and are not remeasured or relabelled here.

The SERVER-READS authorization revision retains epoch capture before auth in
both list helpers. Their preparation token is now named `search`; the immutable
uncached oracle bypass recognizes exactly those same two callbacks. Caller
Profile/filter ownership changes around the token do not change the matcher,
runner, admission model, accounting or erasure/observer bodies. Fresh generated
and observer controls plus strict restoration precede the reviewed source-map
renewal; the complete command must then pass for the named product.

The full immutable 219749f2 command exited 0; its receipt is
`docs/evidence/perf-cache/verify-Xh1k3D/result.json`. This includes the finite
admission model and real-code controls, compiled lifecycle, erasure and CLI
defect/refusal drives. It makes no new native or unbounded-safety claim.

## Stream wake integration renewal

Immutable merged product a45ddeaa6d00b1fc62560f70be48c2e0e1202495 renews only the
two hygiene rows. server.ts adds the wake: cache hygiene still receives the
undecorated store and is still forked before the scheduler. The hygiene
observer's parameter narrows to CacheHygieneReads; its body is byte-identical.
Before renewal, check-hygiene.mjs on a74f66c0 (same product bytes) passed clean,
failed all three observer controls with their witnesses, restored, typechecked
and stopped only at the stale hash. The uncached oracle is rebuilt for this
product. The complete command's exit is in
docs/decisions/ui-speed/stream-wake-integration.md.

## c9 server integration renewal

Immutable merged product 0bd8476df7d7147ea355b418346b57d33f403aee. No covered or
hygiene file changed from a45ddeaa: the durable refusal touches only auth.ts and
the new rejection-history.ts, neither mapped here. The uncached oracle is rebuilt
for this product, and the complete command's exit is in
docs/decisions/ui-speed/c9-server-integration.md.

## CLI routing integration renewal

Candidate: immutable product 0733af4afcaac34774333ab019b29f05c7ebea9e (`feat/cli-through-server` with
integ/c9-server merged). Only the hygiene row for apps/server/src/server.ts
changes: endpoint acquisition before the store, verifyStore right after it,
then the one StreamWake and its decorator. Hygiene still receives the raw store
and is forked before the scheduler. main.ts equals its pin. Before renewal the
seven cache controls and three observer controls failed at their witnesses,
restores and typecheck passed, and hygiene stopped only at the server.ts hash.
The full command's exit is in docs/decisions/ui-speed/cli-through-server-c9-merge.md.

## Diagnostics merge candidate, 2026-11-13

Candidate product 34edaba72fd5f1e8a6c41a0bd6340e424da8ee3c. No matcher, runner, admission, epoch, preparation,
observer or erasure body changed: task-search-cache.ts, task-search.ts,
commands.ts, store/snapshots.ts and store/search-cache-events.ts are
byte-identical to 5f46e7b3. task-filters.ts gains an outer span on
filterTaskRecordsEffect; store.ts gains caller-side spans; the CLI and server
hygiene files gain the Diagnostics commands and routes. Pre-renewal, the seven
cache controls and three observer controls failed and restored, and both
commands stopped only on those hashes. The uncached oracle was built for the
product, and the full `verify.mjs 34edaba72fd5f1e8a6c41a0bd6340e424da8ee3c` passed all nine stages. Candidate until
the seat accepts it.

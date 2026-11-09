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
For this integration the base is 2077c80248dc0879ae0d14fcc10e74be848256b2.
The helper archives that immutable SEC+Tag source and links workspace packages
inside the capture. It never creates or changes a checkout. The one-command
checker requires the baseline manifest and identical protected matcher, runner
and Tag projection hashes. It never falls back to a cached binary as its oracle.
Follow the run's disk guard, batch floor and runtime-copy cleanup orders.

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
keys, LRU reservation, Purge eviction/generation, Profile eviction or close cleanup.
Each must fail its named literal assertion before a strict typecheck or hash gate.
Every source restoration is byte-checked, then the clean drive and strict check run.

The admission driver captures the same immutable product source. Nine real-code
controls test complete-hit publication, ownership, generation, cancellation,
pending eviction and bounds. Deterministic checkpoints drive Purge during a miss,
late field B after revocation, stale Profile reads, close, concurrent misses,
interrupt and checkpoint failure. The named A/Evict/B/CompleteB/CompleteA witness
retains B's object. No memo generator is manually drained. The small TLA+ model
checks 2 keys, 2 preparations, 2 reads and capacity 2 with one and two Profiles,
six failing mutants and restored safety. It is not a source-refinement theorem.

The compiled lifecycle drive warms HTTP search, edits through the second-process
CLI, Reverts over authenticated HTTP, restores Version 1, writes different text at
Version 2, Deletes, Purges and restores again. Every query compares full ordered
public Task JSON with the immutable uncached CLI. The current CLI has no Revert
command. The final restore requires no surviving Task. The owned server must exit
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
Local Purge and Profile deletion revoke admission and evict matching state for
hygiene. External Purge entries age out through LRU. Exact current text preserves
correctness after other writers and restore without database coherence tracking.

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

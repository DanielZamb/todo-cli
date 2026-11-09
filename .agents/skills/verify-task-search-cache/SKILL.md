---
name: verify-task-search-cache
description: Verify Todo's store-owned folded-word memo through generated Unicode properties, real-code mutation controls, scratch SQLite lifecycle operations, compiled CLI writes and authenticated HTTP search.
---

# Verify folded-word memo

Created with create-verification-skill and create-formal-verification-skill.
Read [the feature map](features/README.md).

## Launch

From the checkout root, run `bun .agents/skills/verify-task-search-cache/verify.mjs`.
Pass an optional full immutable commit SHA to verify that candidate. Without an
argument the generated property stage captures the current worktree sources.
The compiled stage always uses this checkout's source-hash binary manifest, so
run from the named commit for final proof. The helper runs the disk guard before
compilation. It never installs packages, opens an installed app, uses Keychain,
or reads the owner's HOME or database.

## Doctor

Require pnpm's locked dependencies and Bun 1.4.4. Check `binary-provenance.json`
and each command receipt. The compiled server must print its loopback URL within
60 seconds. Its HTTP requests require a scratch owner Session. Failure receipts
keep stdout, stderr and the real process exit code.

## Drive

The one command captures immutable source inputs, reuses the matcher generator's
Unicode atoms and seed 0x5ea2c001, and compares complete Word arrays for 2,048
generated strings plus adversarial Unicode and 100,000-character inputs. Six
queries per string compare acceptance and all original UTF-16 spans. It checks
4,096 entries, deterministic charged storage at most 16 MiB, a 4 MiB retention
bypass, Profile isolation and LRU recency.

The real-store drive checks edits, rejected edits, Delete, Revert, full and
checkpoint rebuild, Snapshot restore with Version reuse, Purge, Profile deletion
and close. Four isolated real-source mutations must reach their named literal
behavior assertion: key without text, key without Profile, no eviction, and
Purge without eviction. Exact original bytes are restored before a clean rerun.
Compiler errors and hash failures cannot satisfy sensitivity.

The compiled lifecycle driver warms authenticated HTTP search, competes through
a second-process CLI edit, Delete, Purge and Snapshot restore, and compares full
ordered Task JSON after presentation against the unchanged uncached binary.
The current CLI has no Revert command. That step uses authenticated HTTP and
is recorded as such, rather than claiming a compiled CLI Revert proof.

## Evidence

Each run preserves source hashes, immutable candidate archive when a SHA is
supplied, concrete mutation witnesses, per-command exits, lifecycle responses,
server logs and binary provenance under ignored `docs/evidence/perf-cache/`.
Only PASS with exit 0 after cleanup is proof. Seeds, fixtures and drivers stay
tracked here. This is bounded generated checking over real TypeScript, not a
formal theorem for unbounded inputs, SQLite, ICU, memory safety or process RSS.

Accounting charges 128 bytes per entry, 96 per Word, twice each folded word's
UTF-16 length, twice the exact key length and twice the retained Profile length.
It deliberately charges retained strings even if the runtime shares them. Map
bookkeeping, allocation capacity, temporary normalization buffers, GC and runtime
overhead mean RSS differs. External Purge entries age out through LRU. Only
local Purge and Profile deletion synchronously evict for physical hygiene.

## Cleanup

Property drivers remove only their scratch databases. Source copies, logs and
witnesses survive. The compiled lifecycle helper stops only its recorded server,
waits for exit and removes its own scratch HOME, database and Attachments.
The helper never kills by name or removes another run's data.

## Helpers

`check.mjs [full-SHA]` runs generated properties and mutations.
`lifecycle.mjs <manifest> <evidence> [uncached-CLI]` drives the compiled artifacts.
`micro.ts <output.json>` records fold and exact-string lookup cost and heap
observations. `measure.mjs <manifest> <evidence> <label>` runs frozen HTTP
measurements. Set CACHE_SEED to the compiled seed.ts helper and CACHE_ORACLE_CLI
to the unchanged baseline binary. Measurements are separate from the one command
proof and must alternate five runs per side. Keep the driver/fixture hashes,
medians, p95, run-median ranges, workload/error counts and separate profiler.
Overlapping ranges support no timing improvement claim.

Coverage maps fieldWords and matchTaskSearch in task-search.ts, the entire
new task-search-cache.ts, filterTaskRecords, TaskCommands.list, CLI list,
OperationStore.close/deleteProfileSync/appendSync/evictSearchTask. Update this
mapping only after inspecting changed functions, rerunning the clean proof and
observing the four mutations fail. The source receipts identify the exact
candidate checked. No client response-order transition changes here; the
existing TaskSearch model remains owned by verify-task-search-formal.
The relative `.claude/skills/verify-task-search-cache` link supports discovery.
Fresh Claude registration must be checked separately by the coordinator.

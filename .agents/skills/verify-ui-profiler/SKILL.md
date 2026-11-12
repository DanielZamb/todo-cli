---
name: verify-ui-profiler
description: Verify private SQLite recording ingestion, bounded worker storage, owner-only runs, import, export and comparison through compiled Todo HTTP and CLI on scratch data.
---

# Verify shared recordings

Read [the feature map](features/README.md). The current storage decision is a
separate SQLite database in a worker, outside the Task database. The earlier
manifest recipes are historical and removed. No Swift, native app or Keychain
is used. Every helper creates its own scratch HOME and Task database and stops
only its own server. Evidence remains ignored and survives failures.

## Launch and drive

```sh
sh scripts/disk-guard.sh
bun apps/server/scripts/scratch-diagnostics.ts build
TODO_PROFILER_STRESS=1 bun .agents/skills/verify-ui-profiler/scripts/verify.ts "$PWD/docs/evidence/ui-speed/recordings-sql-new"
bun .agents/skills/verify-ui-profiler/scripts/completeness.ts "$PWD/docs/evidence/ui-speed/recordings-complete-new"
bun .agents/skills/verify-ui-profiler/scripts/corrections.ts "$PWD/docs/evidence/ui-speed/recordings-corrections-new"
bun .agents/skills/verify-ui-profiler/scripts/admission-fault.ts "$PWD/docs/evidence/ui-speed/recordings-fault-new"
bun .agents/skills/verify-ui-profiler/scripts/sqlite-wire.ts "$PWD/docs/evidence/ui-speed/recordings-wire-new"
```

The real owner producer, CLI JSON/NDJSON, import preview/apply, refusal,
comparison, permissions, allowlist and Task-isolation expectations are unchanged.
The storage-failure input now uses an aborting SQL trigger: chmod on a directory
does not prevent writes to SQLite's already-open WAL. HTTP/CLI expected results
stay literal. A storage failure must not fail or duplicate Task creation.

## Constraints and crash boundaries

```sh
pnpm --filter @todo/domain test recordings-sqlite.test.ts recording-admission.test.ts recording-run-isolation.test.ts diagnostic-recording-store.test.ts diagnostic-recording-corrections.test.ts
bun build --compile .agents/skills/verify-ui-profiler/scripts/sqlite-crash.ts --outfile .scratch/bin/sqlite-crash
.scratch/bin/sqlite-crash "$PWD/docs/evidence/ui-speed/recordings-crash-new"
```

The real SQL controls cover C1 through C10's behavioral rules: whole refusal
marks, null fractions, retry after failure, two-run reducers, cross-run association
constraints, alias-safe public cursors, counted expiry/eviction, every transaction
boundary and continuous admission under its unchanged five-second timeout.
The compiled child is SIGKILLed before/after BEGIN and COMMIT for ingestion,
marked import, refusal, expiry and eviction. Reopening must see the last committed transaction;
retry and duplicate retry must converge without losing or doubling facts.
There is no application repair/reconstruction oracle. No kernel-write or
power-loss claim is made.

Additional real controls, after building sqlite-clock-server:

```sh
bun --bun node_modules/typescript/bin/tsc -p .agents/skills/verify-ui-profiler/tsconfig.json
bun build --compile .agents/skills/verify-ui-profiler/scripts/sqlite-continuous.ts --outfile .scratch/bin/sqlite-continuous
.scratch/bin/sqlite-continuous "$PWD/docs/evidence/ui-speed/recordings-continuous-new"
bun .agents/skills/verify-ui-profiler/scripts/sqlite-identity.ts "$PWD/docs/evidence/ui-speed/recordings-identity-new"
bun .agents/skills/verify-ui-profiler/scripts/sqlite-writers.ts "$PWD/docs/evidence/ui-speed/recordings-writers-new"
bun .agents/skills/verify-ui-profiler/scripts/sqlite-startup.ts "$PWD/docs/evidence/ui-speed/recordings-startup-new"
bun .agents/skills/verify-ui-profiler/scripts/sqlite-expiry.ts "$PWD/docs/evidence/ui-speed/recordings-expiry-new"
.agents/skills/verify-ui-profiler/scripts/sqlite-full.sh "$PWD/docs/evidence/ui-speed/recordings-full-new"
bun build --compile .agents/skills/verify-ui-profiler/scripts/sqlite-auth-server.ts --outfile .scratch/bin/sqlite-auth-server
bun .agents/skills/verify-ui-profiler/scripts/sqlite-auth.ts "$PWD/docs/evidence/ui-speed/recordings-revoked-new"
bun .agents/skills/verify-ui-profiler/scripts/sqlite-auth.ts "$PWD/docs/evidence/ui-speed/recordings-revoked-read-new" read
```

The original continuous fixture has one event per admission and its unchanged
5000 ms timeout. The compiled stronger control admits three events per batch
1001 times and retrieves all 3003 facts. The full-volume helper creates only an
owned 10 MiB scratch HFS+ volume and removes it after the real ENOSPC / Task /
scheduler assertions. The expiry helper takes about 65 seconds to prove the
minute retry floor with a persistently failing SQL trigger.

## Cost

```sh
bun build --compile .agents/skills/verify-ui-profiler/scripts/sqlite-clock-server.ts --outfile .scratch/bin/sqlite-clock-server
/usr/bin/lockf -k /tmp/todo-ui-profiler-benchmark.lock bun .agents/skills/verify-ui-profiler/scripts/sqlite-cost.ts "$PWD/docs/evidence/ui-speed/recordings-sql-cost-new"
```

Use TODO_RECORDING_COST_REQUESTS=20 for the bounded busy-host comparison; the
default remains 100 checked reads and writes per cell. The flood has 32
independent runs/sequences and rotates submission order. Record server CPU
across all threads separately from driver CPU.

Ten alternating pairs each compare 16 events, 128 events, a 32-producer flood,
full-store expiry and full-store eviction, with 100 checked Task reads and writes
per cell. Record loads at both boundaries, all durations, producer outcomes,
worker transaction samples, medians/ranges and paired differences. Anything
inside pair variation is inconclusive. There is no imposed CPU pressure. The
existing quiet collection-cost recipe and its ceiling remain unchanged; quiet
integration confirmation is still owed. Transactions exceeding 2 ms belong in
the worker, never on the Task request thread.

After the comparison, reduce its raw cells with
`bun .agents/skills/verify-ui-profiler/scripts/sqlite-report.ts <evidence-directory>`.
It emits medians/ranges, every paired difference, server/driver CPU and a
self-contained HTML chart. Preserve source-frozen.json and the raw cells.

## Doctor and cleanup

Contract generation --check, domain/server tests, the 47 compiled recorder fault
controls, verify-diagnostics with its explicit no-Swift option, verify-server-api,
verify-auth and the exact locked root check remain required. Terminal PNGs are
owed to a unit holding the Swift slot. Remove only closed owned compile
temporaries after lsof checks. Never touch real ~/.todo-cli or another unit's
processes, binaries or data. Keep every red receipt and report changed fixture
inputs separately from unchanged HTTP/CLI assertions.

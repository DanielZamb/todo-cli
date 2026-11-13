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
boundary and continuous admission under its authorized 30-second worker-fixture
hang guard. The native engine fixture retains its existing five-second guard.
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

The original worker fixture has one event per admission and a 30000 ms heavy-
fixture timeout. The compiled stronger control admits three events per batch
1001 times and retrieves all 3003 facts. The full-volume helper creates only an
owned 10 MiB scratch HFS+ volume and removes it after the real ENOSPC / Task /
scheduler assertions. The expiry helper takes about 65 seconds to prove the
minute retry floor with a persistently failing SQL trigger.

## Worker and reader failure recovery

Run the real controls after building the cached binaries:

```sh
bun build --compile .agents/skills/verify-ui-profiler/scripts/sqlite-watchdog.ts --outfile .scratch/bin/sqlite-watchdog
.scratch/bin/sqlite-watchdog "$PWD/docs/evidence/ui-speed/worker-watchdog-new"
bun build --compile .agents/skills/verify-ui-profiler/scripts/sqlite-factory-server.ts --outfile .scratch/bin/sqlite-factory-server
bun .agents/skills/verify-ui-profiler/scripts/sqlite-factory.ts "$PWD/docs/evidence/ui-speed/worker-factory-new"
bun .agents/skills/verify-ui-profiler/scripts/sqlite-reader.ts "$PWD/docs/evidence/ui-speed/reader-recovery-new"
bun .agents/skills/verify-ui-profiler/scripts/sqlite-reader-http.ts "$PWD/docs/evidence/ui-speed/reader-http-new"
bun .agents/skills/verify-ui-profiler/scripts/sqlite-worker-missing.ts "$PWD/docs/evidence/ui-speed/worker-native-new"
bun build --compile .agents/skills/verify-ui-profiler/scripts/sqlite-byte-bound.ts --outfile .scratch/bin/sqlite-byte-bound
.scratch/bin/sqlite-byte-bound "$PWD/docs/evidence/ui-speed/worker-bytes-new"
pnpm --filter @todo/domain test recordings-sql-review.test.ts
```

Each recovery control takes about 65 seconds. The watchdog holds the actual
worker, offers 1101 calls, asserts the common byte/count bound and settlement,
then observes inactivity retirement separately from call settlement and recovers automatically. The factory control drives Task HTTP and the owner
Diagnostics note during a throwing factory and recovers on the minute backoff.
The reader HTTP control fills the default cap behind an independent read
transaction, asserts nine further batch refusals / 1152 events and the literal
owner explanation, then proves recovery. Earlier quota evictions remain in the
global counters; the refusal assertion uses their prior values as its baseline.
The native control removes an owned bundled worker module and restores it.
The pinned reader is an independent SQLite connection. It is released normally;
automatic expiry progresses with no further recording RPC. Capacity drops are
counted while storage_failures remains zero. Show/compare/export materialization
must run outside snapshots. SQL6 checks unchanged bytes plus 0640/0750 modes.
The original continuous-admission fixture now uses its authorized 30000 ms heavy
fixture guard; performance is asserted only through the paired benchmark.

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

## Healthy overload and format recognition

Run the native format controls with `pnpm --filter @todo/domain test recording-format.test.ts`.
They assert unchanged hashes, 0640 file and 0750 directory modes for overlapping
tables, wrong columns/id/version/index/trigger; real and empty stores reopen.

Compile `scripts/sqlite-format-boundary.ts` to `.scratch/bin/sqlite-format-boundary`
and run that binary from the checkout root with a fresh evidence path. It creates
a real Task database through the compiled CLI in a scratch HOME and refuses both
that database and a copy, preserving their hashes and 0640/0750 modes.

Compile `scripts/sqlite-progress.ts` to `.scratch/bin/sqlite-progress`, then run
that binary with a fresh evidence path. A slow progressing read outlives its
caller deadline without retirement; a read stopped after its third step retires
for inactivity. Recently observed slow service refuses excessive admission.
The original 128-Show and 224-HTTP-Show seat inputs remain archived unchanged.
For high-load controls, from the checkout root use
`TODO_RECORDINGS_STRESS=1 bun .agents/skills/verify-ui-profiler/scripts/sqlite-stress.ts
<evidence> <command> <args...>`. It checks frontmost app and one
minute of owner inactivity, uses at most six CPU processes for at most 85 seconds,
and records loads throughout. There is no pressure in the frozen cost recipe.

## Exclusive initialization and sample expiry

Compile `scripts/sqlite-initialization.ts` to `.scratch/bin/sqlite-initialization`
and run it from the checkout root with a new evidence directory. It covers new
and existing zero-file peers, the compiled CLI committing a Task database before
exclusion, a blocked peer while exclusion is held, and simultaneous legitimate
initializers with exactly one publication. Its barrier markers stay outside
the database directory. `scripts/sqlite-initialization-server.ts` additionally
restarts the compiled server while initialization is held, serves literal Task
reads and creation, releases exclusion and admits a recording.

Run `scripts/sqlite-foreign-files.ts` for all-file hash/mode/listing preservation
with foreign WAL/shm present, absent or partially absent and a rollback journal.
Run `pnpm --filter @todo/domain test recording-rate.test.ts recording-header.test.ts`
for individually expired production rate histories, per-method isolation, the
56-sample aggregate bound and oversized-file refusal. The archived stale-rate
and stale-upload witnesses each use a real 61-second wait and remain unchanged.
The old journal-pragma race schedule is impossible under exclusion; preserve its
reds and map it to the before-exclusion and held-exclusion controls.

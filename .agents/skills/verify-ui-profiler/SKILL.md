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

## Refusals leave every file unchanged and say how to recover

`pnpm --filter @todo/domain test recording-open-refusal.test.ts` holds the
deterministic SQL10 and SQL11 controls. Each refusal class (foreign header,
foreign catalog in the main file or only in committed WAL frames, non-empty
sidecars beside a missing or empty main, an interrupted initialization, a
non-empty journal beside the store, a hard or symbolic link, a path replaced
after the preflight, and a damaged table page) asserts its reason code and an
unchanged directory listing, file hashes and modes. The oversized cases stay in
`recording-header.test.ts`. Both shapes that used to be permanent now open:
an empty main whose initializer died before COMMIT with an empty journal, and
empty `-wal`/`-shm` files left after only `recordings.db` was deleted.

The store decides every foreign, catalog and sidecar refusal from descriptors
alone: it reads the main file and the committed WAL frames itself and compares
the catalog with this version's, so SQLite never opens a path it may refuse.
The writable connection is validated while the store holds a shared exclusion
on its own descriptor, so closing it after a refusal cannot checkpoint or
reset the WAL. The descriptor stays open until the connection closes.

After `bun apps/server/scripts/scratch-diagnostics.ts build`, run
`bun .agents/skills/verify-ui-profiler/scripts/sqlite-refusal-visibility.ts <evidence>`.
It leaves an empty `recordings.db` beside a 512-byte journal, starts the
compiled server, and requires the literal owner Diagnostics entry over HTTP,
`todo diagnostics --format json`, the Markdown section and the terminal
Recent errors pane (wrapped to 46 columns): state `refused`, reason
`interrupted_initialization`, the two absolute file paths and the statement
that recordings are diagnostic data and may be discarded. Task reads continue.
It then stops the server, removes exactly the named files, restarts, and
requires an admitted batch and no refusal entry.

Recovery for the owner, from the Diagnostics entry: stop the server, remove the
listed files in the `diagnostic-recordings` directory beside the Task
database, and start the server again. The Task database is never involved.
The two apps' Diagnostics panels do not show this entry yet; that belongs to
the app-side unit.

`bun .agents/skills/verify-ui-profiler/scripts/sqlite-refusal-classes.ts <checkout>`
prints one row per enumerable refusal class and the two recovery shapes, using
only the RecordingDatabase API, so the same file runs against an older capture
(`git archive <commit>` with the worktree's node_modules linked) for a red
receipt. Every refusal row must show `files_unchanged: true`.
`bun .agents/skills/verify-ui-profiler/scripts/sqlite-swap-witness.ts <checkout> .scratch/bin/todo`
makes a real Task database with the compiled CLI, captures one committed WAL
transaction while its writer is open, renames both over `recordings.db` right
after the immutable preflight, and must report `files_unchanged_since_swap:
true`. `bun .agents/skills/verify-ui-profiler/scripts/sqlite-refusal-race.ts <checkout>`
covers the two refusals that happen after SQLite has opened the path. A path
removed after the preflight must create nothing. A live in-process writer that
commits a catalog change right after the preflight must leave main and WAL
byte-identical. The only change allowed is one 32-bit WAL read mark in that
writer's `-shm`: SQLite sets one of `aReadMark[1..4]` (offsets 104–119;
observed slot 1, offsets 104–107) to the current frame count, so 1 to 4 bytes
change. The script asserts that rule.
The seat's review-4 witnesses (`wal-refusal2.ts`, `swap-task.ts`) stay
archived in the run store and run unchanged from
`.scratch/recordings-sqlite4-s1/claude/`.

## Concurrent writers never make a good store look foreign

A refusal is reported only when two consecutive inspections, each with
identical before and after stamps of both files (main and WAL inode, size,
nanosecond modification and change times, WAL header), return the same reason.
Any inspection that accepts the store proceeds to the live catalog check on
the real connection. If no consistent refusal is reached within
`recordingInspectionPolicy.boundMs` (500 ms), the open answers `store_busy`
(state retrying, no files, no removal advice). The worker retries busy opens
up to 50 times, 10 ms apart, then backs off for a minute.

The seat's review-5 probe `concurrent-open.ts` (one process ingesting and
checkpointing a good store, a second process opening it for 60 s) must show
zero refusals. `bun .agents/skills/verify-ui-profiler/scripts/sqlite-refusal-under-load.ts
<checkout> 60000 <commits-per-second>` holds the same load on a foreign store
and on a damaged store: every open must be refused with its reason or answered
`store_busy`, and none may open.

## Recovery opens are bounded in memory

A store with committed WAL frames is checked on a private temporary copy:
the descriptor reader streams the committed pages (main with the frames
overlaid, journal bytes set to rollback) one page at a time into a 0600 file
in a fresh `mkdtemp` directory. The copy is opened `immutable=1` and
read-only, and the directory is removed afterwards. Peak memory no longer
grows with the store: it is the baseline process, one page buffer and
SQLite's default page cache. The temporary file is at most the main file's
size, which is capped by the recordings ceiling (`totalBytes`, 256 MiB by
default); a larger main file is refused as `oversized` before any copy.
Review 5's `image-cost.ts` measures it under `/usr/bin/time -l`.

## The store's own failures are never a verdict about the files

A refusal with removal advice is reported only for something established
about the files: a header, catalog, sidecar, link, size, integrity or replaced
path. When the store's own machinery fails, the open answers
`check_unavailable`: state retrying, no files, no removal advice. Machinery
failures include the temporary check copy (create or write), reading the store
files, SQLite errors other than `SQLITE_NOTADB` and `SQLITE_CORRUPT*`, and any
unexpected throw. The `detail` ("<stage>: <error code>") says what failed and
contains no path.

`.agents/skills/verify-ui-profiler/scripts/sqlite-check-temp.sh <checkout> <evidence>`
creates an owned 8 MiB HFS+ volume, then opens a store with committed WAL
frames while TMPDIR is normal, missing, read-only and on the full volume. It
also opens a foreign catalog with TMPDIR missing. The volume is detached and
removed afterwards. Expected: normal opens; missing, read-only and full answer
`check_unavailable` (create ENOENT, create EACCES, write ENOSPC); the foreign
catalog is still refused; the temporary directory's listing is unchanged in
every case.

## Access denials are checked, not assumed

An open, create or sidecar error such as EACCES, EPERM, ELOOP, EISDIR,
ENOTDIR, ENXIO or EFTYPE leads to a refusal only when `lstat` confirms a
non-private state. For a file that means: not a regular file, a link count
other than one, another owner, or the owner's read and write bits missing. An
unwritable recordings directory is refused as `directory_not_private`, from
its type, owner and owner rwx bits, with advice about the directory. A denial
that leaves the file looking private (for example a policy denying data
access) answers `check_unavailable` with its stage. A short write of the
temporary check copy also answers `check_unavailable`; the copy is never
assumed complete.

`bun .agents/skills/verify-ui-profiler/scripts/sqlite-access-denial.ts <checkout> <evidence>`
covers three denials of a good store, each run under its own `sandbox-exec`
data or create denial: main data, WAL data, and file creation. All three must
answer retrying with no files and no advice. Four controls must keep their
true refusals: no owner read bit, a directory in place of `recordings.db`, a
symbolic link in its place, and an unwritable directory.

## Journal judgments need a lock, and a failed open changes nothing

Before the exclusion, the store judges sidecars only when `recordings.db` is
absent; nobody can be initializing a file that does not exist. With an empty
main present, the journal and sidecar judgments wait until this open holds
the exclusion. `hot_journal`, and `foreign_header` for a non-empty main, are
judged while this open holds at least a shared lock on its own descriptor;
if it cannot take one within 100 ms, the answer is `initialization_busy`. The
sidecar clean-up decides every sidecar before removing any.

`bun .agents/skills/verify-ui-profiler/scripts/sqlite-journal-holder.ts <checkout> <evidence>`
has three cases:
- a live rollback-mode writer holding a journal on our store gets
  `initialization_busy` with no files and no advice, and the store opens after
  the writer releases;
- a journal left by an initializer killed inside its first commit is refused
  `interrupted_initialization`;
- a journal left by a writer killed inside its transaction is refused
  `hot_journal`.

Files are unchanged in every case. Review 8's `live-initializer.ts` (a second
opener during a live first commit) must answer `initialization_busy`, never
advice.

An ACL deny or an immutable flag on the store's own 0600 file answers
`check_unavailable` with its stage for as long as the restriction stays.
`lstat` cannot establish an ACL or a flag, so this is the intended answer.

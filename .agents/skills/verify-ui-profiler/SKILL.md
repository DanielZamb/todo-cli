---
name: verify-ui-profiler
description: Verify private metadata recording ingestion, bounded storage, owner-only runs, import, export and comparison through compiled Todo HTTP and CLI on scratch data.
---

# Verify shared recordings

Created through create-verification-skill. Read [the feature map](features/README.md).
This unit proves the shared server and CLI, not native app capture or presentation.

## Launch

From the checkout root, use a new evidence directory:

```sh
sh scripts/disk-guard.sh
bun apps/server/scripts/scratch-diagnostics.ts build
bun .agents/skills/verify-ui-profiler/scripts/verify.ts "$PWD/docs/evidence/ui-speed/recordings-new"
```

The helper uses matching cached compiled CLI/server binaries and a new scratch
HOME/database, never an installed server or real ~/.todo-cli. It waits at least
60 seconds for its owned loopback listener. The producer emits real shared
metadata events over HTTP. No native app, Swift or Keychain is used.

## Doctor

Run `bun packages/api/scripts/openapi.ts --check` and `pnpm typecheck`.
The ordinary Diagnostics compiled recipe proves matching health/contract ids.
A zero process exit and result.json with PASS prove completion.

## Drive

Ingest a client-shaped release-timed selection with Profile ordinal and scalar
context. Read it through CLI runs/show/export; require literal 2 starts, one
pending action, 8 ms p50 and 0.5 fraction by 20 ms. Import the export in dry-run
and apply modes; retry must not duplicate events. Compare different builds of
the same scenario and refuse a different environment. Missing owner Sessions,
Access Tokens, forwarded requests and forbidden content are refused.

For filesystem retention, permissions, restart/orphan recovery, conflicting
retries, clock discontinuities and disk faults, run:

```sh
pnpm --filter @todo/domain test diagnostic-recording-corrections.test.ts diagnostic-recordings.test.ts diagnostic-recording-store.test.ts diagnostic-event-types.test.ts diagnostic-labels.test.ts
pnpm --filter @todo/server test diagnostic-recordings.test.ts diagnostics.test.ts
```

The on-request cost comparison uses five counterbalanced alternating pairs and
one compiled binary, 100 literal 15-Task reads per run, with or without a concurrent
16-event producer batch. It imposes no CPU pressure and labels ambient host load:

```sh
bun .agents/skills/verify-ui-profiler/scripts/benchmark.ts "$PWD/docs/evidence/ui-speed/recording-cost-new"
```

The tracked quiet collection-cost recipe and its ceiling remain untouched.
Differences within pair variation are inconclusive. This is an ingestion-on/off
comparison, not a claim about native app recorder overhead or physical paint.

## Evidence

The compiled drive retains actions.json and result.json with the literal summary.
No bearer or Task content is exported into recording files. Performance raw.json
retains every task/ingest latency, counts, bytes, boundary loads, driver CPU and
server loss status; result.json retains each paired difference. Interrupted or
failed evidence survives. Verification output is ignored by Git.

## Cleanup

The helper stops only its child server, awaits exit and removes only its scratch
HOME/database/input files in finally. Evidence survives. Never kill by process
name or contact the owner's server. After builds, remove only closed Bun compile
temporaries from this checkout and record freed bytes.

## Helpers

verify.ts and benchmark.ts are invoked with Bun as above. The checkout-local
.claude/skills/verify-ui-profiler link registers this skill; fresh Claude discovery
is a separate integration receipt, not claimed by this command.

## Recording correction controls

Run the compiled boundary/import controls after building the same-source cache:

```sh
bun .agents/skills/verify-ui-profiler/scripts/corrections.ts "$PWD/docs/evidence/ui-speed/recording-corrections-new"
```

They require literal owner HTTP 400 / CLI exit 2 with an allowlisted reason,
reject conflicting sequence data through import and dry run, preflight conflicts
across the entire local file before any POST, withhold both deadline
fractions as unknown, and prove a retained identical event is a no-op. The domain
controls cover pending acknowledgements, legacy contradictory files, repeated
action phases, every comparison condition, and 1,001 admissions without a drain.
The quota control's second segment now uses a genuinely different event, since
an identical event is a no-op; its byte/eviction assertions remain unchanged.

For a permanent real unlink failure in the same event loop as Task reads:

```sh
bun build --compile .agents/skills/verify-ui-profiler/scripts/expiry-server.ts --outfile .scratch/bin/expiry-fault-server
bun .agents/skills/verify-ui-profiler/scripts/expiry-cost.ts "$PWD/docs/evidence/ui-speed/expiry-cost-new"
```

The verification-only entry replaces its own scratch segment with a directory,
then runs the real server. Five AB/BA pairs last 6.5 seconds per cell, long enough
for two real failed timer attempts. It asserts all 15 Task titles, both load
boundaries and two counted failures. No native app or CPU pressure is involved.
A difference inside pair variation is inconclusive, never proof of zero cost.
The fake-clock control additionally proves no retry for 59,999 ms, a retry at
60,000 ms, normal scheduling after recovery and no reset by other journal work.

## Admission completeness and mixed runs

```sh
pnpm --filter @todo/domain test recording-admission.test.ts recording-run-isolation.test.ts
bun .agents/skills/verify-ui-profiler/scripts/completeness.ts "$PWD/docs/evidence/ui-speed/recording-completeness-new"
bun .agents/skills/verify-ui-profiler/scripts/admission-fault.ts "$PWD/docs/evidence/ui-speed/recording-admission-fault-new"
```

The compiled recipe requires a durable whole-batch refusal mark, a valid 10000 ms
retry, null deadline fractions, a complete-comparison refusal, JSON/NDJSON transfer,
no-write dry run and monotonic import. Six hundred 128-event batches evict the old
run's data while its mark remains exportable, including as a zero-event batch.
It tries private content in every new admission object and checks file modes and
allocated bytes. It also imports two runs with shared action/producer/sequence
identities and checks their separate 8 ms and 400 ms summaries through the CLI.
The unit controls cover clean termination plus restart, rotation, expiry,
coalesced repeated refusals, all exported reducers and per-run uncertainty.
The fault control makes only its private recording directory unwritable. HTTP
returns 500 and the CLI exits 1 with the safe instruction to retain the entire
batch, while one Task write still succeeds exactly once. After storage recovers,
shutdown makes one bounded attempt to persist any outstanding mark. A failed
attempt is counted and never becomes a retry loop.

The earlier narrow witness's zero fractions after a refusal are superseded by
null fractions: known starts can be counted, but the omitted facts make the
all-start denominator unknown. The normal timer control now includes the older
admission marker's expiry as its next wake-up, instead of assuming only data
segments can expire. No retry-delay or byte-bound assertion is weakened.

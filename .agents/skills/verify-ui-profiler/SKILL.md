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
pnpm --filter @todo/domain test diagnostic-recordings.test.ts diagnostic-recording-store.test.ts diagnostic-event-types.test.ts diagnostic-labels.test.ts
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

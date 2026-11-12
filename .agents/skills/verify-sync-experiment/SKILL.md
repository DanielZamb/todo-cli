---
name: verify-sync-experiment
description: Verify the throwaway Replica, Baseline and Patch experiment against compiled domain commands and scratch SQLite. This never qualifies product routes.
---

# Verify the sync experiment

Created with create-verification-skill. This branch is never product.
Read [the feature map](features/README.md).

## Launch

Resolve the checkout with `git rev-parse --show-toplevel` and run from it.
Check `df -k .` before building. Stop below 30 GiB free.
Use the locked dependencies already installed by pnpm. Do not resolve new ones.

```sh
bun experiments/sync-patches/build.ts
.scratch/sync-patches/bin/driver correctness
bun experiments/sync-patches/protocol-check.ts
```

The builder instruments the shared domain only in generated executables. It
never edits product sources or launches the installed server. It compiles the
CLI and the experiment drivers under `.scratch/sync-patches/bin`.

## Doctor

`git branch --show-current` must be `exp/sync-experiment`. Read
`.scratch/sync-patches/bin/build.json`. A zero exit and `checks: 115` for each
arm establish the bounded correctness drive. The post-Purge restore error is
recorded separately and is an unresolved base-code defect, not a passing restore.

## Drive

Run `driver bench`, then `driver burst`, then `wake` from the bin directory
specified above. Each command uses explicit scratch database paths and ephemeral
loopback listeners. The burst calls five actual compiled CLI edits per arm and
then 300 edits through a persistent compiled domain writer. That distinction is
part of the evidence. It is not 300 separate CLI invocations.

Run `codec`, then `bun experiments/sync-patches/retention.ts` after bench.
Build Foundation once per source hash through `scripts/swift-slot.sh swiftc -O
-parse-as-library experiments/sync-patches/Bench.swift -o
.scratch/sync-patches/bin/swift-bench`. Run that binary with `codec
 docs/evidence/sync-experiment/samples.json`. The `transport` executable runs both
TypeScript and Foundation clients against its own scratch server.

## Evidence

`docs/evidence/sync-experiment/` is ignored. `correctness.json` records literal
assertions, the deliberately omitted descendant, and lifecycle reset reasons.
`protocol.json` records the serial reducer's fences and overflow controls.
`bench.json`, `burst.json`, `wake.json`, `codec.json`, `transport.json` and
`diagnostics.json` retain observations. Measurements are comparisons of these
prototypes, not product latency promises. The report states unmeasured paths.

## Cleanup

Successful drives close their stores, children and listeners and delete their own
scratch directories. A failed drive can leave a `todo-sync-*` directory; inspect
its ownership and captured command before removing it. Never kill by name.
Keep evidence after cleanup. Remove only this run's closed `.bun-build` files
and superseded executables. Never access the real Todo directory.

## Helpers

The commands above are the helpers. `summarize.ts` prints E1 summaries; pass
`wake` for E6. `request-cost.ts` measures framing and request overhead only.
`protocol-check.ts` tests the experimental serial subscription reducer.

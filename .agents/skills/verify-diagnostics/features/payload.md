# Polled payload budget

Default GET /diagnostics, todo diagnostics JSON and follow NDJSON exclude span
and delivery lists. The version 2 profiler has counters, a fixed 11-bucket
histogram, per-stage and per-category span summaries, at most eight slow or
failed span labels, and omission counts for bounded metadata lists. Histogram
quantiles are upper bounds, not exact frozen interaction percentiles. Category
keys are inventory rows. Unfinished spans remain counted and overflow is null.

The complete response is at most 49,152 UTF-8 bytes when formatted as pretty JSON
with its newline. Compact HTTP and NDJSON are smaller. Every row is admitted by
its encoded byte cost into a section quota and a shared allocation budget. Empty
scaffolding has a reserved budget. A schema predicate also rejects excess size.
Legacy Profile, client, credential, operation, error and route lists are bounded
samples, with omitted counts. Aggregate storage and operation totals remain full.

Owner-only GET /diagnostics?detail=true explicitly requests a bounded detail
sample, at most 65,536 pretty JSON bytes. Constant run_id, build_id and contract_id
appear once above its rows. Detail has separate caps of 32 recent spans, four
active spans and 16 deliveries, plus counts of available and omitted records.
todo diagnostics --detail exposes it once; --detail --follow is a usage error.
Normal app polling never requests detail. There is no new route or journal.

Build the matching cached server/CLI/seed once, then run on fresh evidence:

```sh
bun apps/server/scripts/measure-diagnostic-payload.ts "$PWD/docs/evidence/ui-speed/payload-measured-new" --assert-budget
bun apps/server/scripts/verify-diagnostic-payload-budget.ts "$PWD/docs/evidence/ui-speed/payload-stress-new"
pnpm --filter @todo/domain test diagnostic-budget.test.ts diagnostic-summary.test.ts diagnostics.test.ts
```

The measurement drives 0, 100, 1,000 and 10,000 real list requests, then a separate
306-operation replay through one stream client. It retains five polls per point,
compact/pretty and profiler sizes, per-field sizes, Server-Timing handler samples
and boundary load. Five measurement polls are additional requests. It measures
observed handler intervals, not a quiet-host speedup or input-to-render latency.

The stress drive makes 10,000 HTTP requests with distinct random trace/request
ids, 2,000 unknown paths normalized to unmatched, and 200 real stream clients,
at most 32 concurrently. At each 1,000 requests it asserts both wire budgets,
default detail absence, bounded slow items, and explicit client omissions.
Actual compiled default/detail CLI output uses the unmodified default spawnSync
buffer and must fit the same budgets. No maxBuffer increase hides a regression.
The same drive replays 306 operations through three clients and checks the
delivery cap, both byte bounds and the absence of repeated run identity fields.

The domain control fills 10,000 distinct route observations, trace roots and
client observations plus long multibyte Profile metadata. It checks complete
encoded responses, histogram counts and omission accounting. All inputs use
scratch databases and public store writes. The normal no-Swift Diagnostics,
server API, auth and 47 recorder-fault recipes remain required.

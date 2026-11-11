# Mac interaction hill climb

The owner target is input to a committed and laid-out result for every Mac
interaction category: median at most 20 ms and p99 at most 300 ms, with
incomplete actions counted. Native input and presentation remain coordinator
acceptance gates. This headless measurement cannot establish that target.

## Frozen workload

Run one command from the checkout root:

```sh
.agents/skills/verify-mac-refresh/scripts/verify.sh docs/evidence/mac-perf/c4/new b520693e
```

It builds both variants before timing and runs five alternating pairs through
the production model, generated transport and unordered RootView. The fixture
has 178 work Tasks, 92 personal Tasks and 925 initial operations, with the
owner-shaped status mix, descriptions, Tags and Attachments. Credential-store
methods trap. The helper launches no Todo.app, signs nothing and uses only
scratch HOME, SQLite and HTTP. The [verification skill](../../.agents/skills/verify-mac-refresh/SKILL.md)
records the recipe and its native acceptance gaps.

The fixed table steps are the initial read, stream ready, one CLI edit, a switch
with each of 0, 50 and 300 operations behind its saved cursor, Complete and its
echo, 20 CLI edits, and a quiet EOF reconnect. Fixture creation, sign-in and
return-to-work setup are outside this selected table. Each step's catalog and
All-tasks rows must equal an independent authoritative server read. Counts
refer to actual catalog reads, rather than queued refresh intentions.

## Baseline and sensitivity

The easy zero-backlog qualification consumes 22 operations and makes 26 catalog
reads and 215 requests. The hard session consumes 372 operations and makes 378
catalog reads and 3,035 requests. Five unchanged-code pairs reproduce that hard
count vector ten times, with zero errors and identical bytes in the 65 compiled
Swift source files on both sides. The [small baseline receipt](../evidence/mac-perf/mac-refresh-baseline-summary.json)
records work, ranges, active load and the frozen source hashes.

| Step | Full catalog reads | Requests |
| --- | ---: | ---: |
| Initial read | 1 | 8 |
| Stream ready | 1 | 10 |
| One CLI edit | 1 | 8 |
| Switch, backlog 0 | 1 | 10 |
| Switch, backlog 50 | 51 | 410 |
| Switch, backlog 300 | 301 | 2,410 |
| Complete and echo | 2 | 17 |
| Burst of 20 CLI edits | 20 | 160 |
| Quiet reconnect | 0 | 2 |
| Total | 378 | 3,035 |

The Phase 0 table adds to 379 full reads and 3,043 requests. Its earlier written
378 total omitted one row in the sum. C3 already removes one quiet-reconnect
read and eight requests before C4; no later attempt may claim that work.

The two identical-code controls have first full-layout medians of 189.9 ms
[180.2, 213.3] and 184.2 ms [166.3, 237.0]. Worst actor-gap medians are 157.1 ms
[153.5, 219.2] and 176.0 ms [148.0, 190.7]. Their ranges overlap. These differences
are inconclusive. The 200 ms layout threshold is already met by the median in
this owner-shaped baseline. It is not evidence of a C4 improvement over the
older Phase 0 fixture and recipe.

At backlog 300, rows become current in median 456.0 and 448.1 ms, while complete
replay drains in median 74.7 and 72.8 seconds. The model is read-only for only
part of that time. Report actor blocking, loading, busy, current rows and replay
work separately. A final cursor does not measure the first current rendering.
Active-interval one-minute load ranges from 2.4 to 47.4 on the baseline side
and 2.7 to 41.7 on the control side. Setup and lock-wait load stays available
separately. Load samples are taken every two seconds.

## Interpretation and gates

The HTTP/1.1 proxy counts client requests, adapts only compatibility metadata
and injects EOF. Its accept backlog is 1,024. A prior controlled probe found
that the default five-slot accept queue distorted an eight-connection burst;
that private-proxy result does not identify a Bun-server defect. The stream's
upstream read has no data-idle timeout. Both corrections precede this baseline.
The proxy has one Python worker per downstream connection and opens a fresh
upstream connection per request. Network timings include that implementation.
Direct-Bun production-transport metrics and socket controls must qualify a
connection-reuse result. A faster proxy run alone cannot establish faster
native input or a server improvement.

Secondary targets are at most 304 selected requests, at most two full reads on
each backlog switch, at most three for the burst, exactly one for Complete and
its echo, zero for quiet reconnect, and at most 16 held sockets after 300 direct
refreshes. Preserve the Phase 0 actor-gap, read-only, busy and current-row ranges.
Keep search, Version, cursor, restore, authorization and real SSE gates green.
Fresh full layout remains a five-pair median with a 200 ms threshold. Changes
inside host variation carry no claimed timing improvement.

At least six mechanism attempts must be logged before stopping. Each names a
specific cause, makes one change, runs this frozen measurement and the relevant
regression gates, then is kept or reverted in full. The coordinator's run store
holds `decision.tsv` outside Git. The Diagnostics review correction and this
measurement preparation are not optimization attempts. The count is zero at
this baseline. No HTTP contract change starts without its ADR.

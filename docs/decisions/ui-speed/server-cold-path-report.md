# Server cold read path

The warm read path has a reproducible CPU/data-materialization problem: every
Profile read decodes the entire operation log and all Tasks before filtering,
and GET /profiles repeats that work once per authorized Profile. The sampled
CPU profile and separate component controls support this cause. A tiny reply
does not imply a cheap computation.

The owner's exact 5,105 ms first request was **not reproduced**. Heavy-history
cases stayed expensive after warming; the new-Profile-after-another-Profile
control did not show a distinct large first-use penalty. A 300 ms external
writer hold did produce about 301 ms of measured writer queue. Thus a SQLite
writer wait is a concrete candidate for a near-five-second event, not a finding
about the installed server. Host scheduling/GC and first-use code/codec work
remain candidates. Quiet and owner-sized pressure confirmation are still owed:
no accepted run met the unchanged quiet ceiling, and session input held the
later pressure attempts. Nothing here proves load alone caused, or could not
cause, the owner's 10–20× incident.

No product code changed. The measured compiled server is the existing
feat/diag-core runtime inherited by e0226565, contract
`57724665f2589fdec09d845635a9e2b87914a84569056085f89fe5700fa5cb64`, server SHA-256
`e1116c4dd5b38d03387b683509a4e16c29c31013db5ac6886c5f10975e7897b1`.
The cached runtime source hash is
`43add62661b44cdc492f14d934d0f7cfc679e95b2a709aa42a83545c6a363e68`.
The installed incident was contract 78a2be44…; its source/build identity was not
supplied. A contract id alone does not identify its implementation. I did not
contact the installed server or open any real Todo database, backup or credential.
The incident observations below are the coordinator's supplied journal evidence,
not another measurement of the owner's data.

## Method and scope

The primary factorial uses 36 generated SQLite checkpoints: 15 or 178 current
Tasks per populated Profile; one, three or eight Profiles; 32, 256 or 2,048 extra
immutable edits; and three deleted Tasks with null or retained 100,000-character
descriptions. There are two request orders per checkpoint, five fresh server
processes per order and three sequential passes over eight routes: 360 runs and
8,640 retained read responses. Every response was 200 and checked for expected
counts/view membership and an echoed request id. Each third pass is retained to
show whether warming continues. No health or sign-in HTTP request precedes the
first measured read; a seeded owner Session is used.

The orders are profiles → tags → tasks → overdue → projects → inbox → today →
scheduled, and tags → tasks → overdue → projects → inbox → today → scheduled →
profiles. Profile routes use p0, with an explicit fixed now for planning views.
These are first uses of each route within that sequence, not eight independently
cold servers. Earlier routes can warm shared code/data. Cold means a new server
process/connection; file copies and normal startup can warm OS pages. There is
no cache flush, memory purge, dropped index, disabled scheduler or altered
SQLite/JIT setting. Startup readiness is recorded separately from handler time.

The base 178 shape has 50 open, 126 done and two cancelled Tasks, 1,260-character
descriptions and one 5,244-character description. Base fixtures omit Projects,
Tags, Attachments and dates. A separate richer one-Profile sweep adds 38 Tags
and 108 link Attachments to the 178 shape and 200-character descriptions to the
15 shape. Its tiny Task reply is about 9 KB. Those controls completed another
120 runs / 2,880 responses. These are synthetic shapes, not copies of the owner.
Recurrence, Dependency edges, heterogeneous older event kinds and non-empty
planning groups are not reproduced.

The history factor is **extra edits**, not total operations. Creating 178 current
Tasks already requires at least 178 operations. Total operations in the tables
include current/deleted Task creation, three Deletes, two auth events and edits.
The edited sentinel Task's title/Version changes by a few current-row bytes;
current Task count is held constant within each history series. A SELECT-only
post-audit checks all 56 final base/empty/rich checkpoints for exact operation
counts, zero rejected appends and correct live Task, Tag and Attachment counts.

All primary timings come from the same compiled server, scratch HOME/database,
loopback port 0 and detailed recording enabled. Server-Timing is the entry-to-
handoff handler interval, plus available auth, writer queue, domain, DB and
encode metrics. Client time stops at response body-end, before JSON validation.
Absent stage headers are null, never zero. Auth contains a credential DB span;
domain can contain DB work. Stage sums overlap. The conservative unattributed
lower bound below subtracts their sum from handler time; overlap makes that a
lower bound, not an exact breakdown.

Medians are over five process restarts; brackets give min/max, all in ms.
No-added-pressure conditions are called ambient. Their one-minute boundary
loads were 6.71–12.14 in the main sweep; **zero quiet runs** met <=4 at both
boundaries. Cells run sequentially. Fixture generation and micro/profiling work
do not run concurrently with the reported timed sweeps. Between-cell host drift is not
controlled, so a cross-cell ratio is not an isolated causal estimate. Cold/warm
pairs within a process and the source/component controls are stronger evidence.

## 1. Cold versus warm, and factor tables

The complete base sweep follows. The warm cost grows with retained history even
when the current Task reply barely changes. Adding large deleted text increases
both retained deleted Task payloads by about 300 KB and history by about 900 KB;
it does not add live Tasks or reply content. Increasing populated Profiles also
increases global Tasks/history, so the fixed-total empty-Profile control below
isolates Profile fan-out separately.

| Tasks per populated Profile | Profiles | Extra edits | Large deleted text | Total operations | History MiB | First /profiles ms | Second /profiles ms | Second tasks ms | Second eight-handler sum ms |
| ---: | ---: | ---: | :---: | ---: | ---: | --- | --- | --- | --- |
| 15 | 1 | 32 | no | 55 | 0.04 | 6.83 [4.27, 7.88] | 1.39 [1.09, 3.02] | 1.31 [1.18, 3.46] | 10.11 [8.91, 22.93] |
| 15 | 1 | 32 | yes | 55 | 0.90 | 5.51 [5.07, 7.64] | 2.30 [1.86, 2.54] | 2.63 [2.09, 4.37] | 18.24 [15.84, 23.69] |
| 15 | 1 | 256 | no | 279 | 0.25 | 10.89 [8.01, 11.25] | 6.43 [3.69, 6.92] | 6.22 [5.34, 8.13] | 48.10 [30.57, 69.81] |
| 15 | 1 | 256 | yes | 279 | 1.11 | 8.42 [7.69, 8.64] | 4.18 [3.75, 4.72] | 10.70 [8.69, 10.97] | 38.80 [34.63, 46.49] |
| 15 | 1 | 2048 | no | 2071 | 1.96 | 34.44 [29.41, 38.61] | 22.35 [19.09, 25.04] | 21.27 [18.97, 24.83] | 183.89 [172.67, 196.00] |
| 15 | 1 | 2048 | yes | 2071 | 2.82 | 32.89 [25.61, 41.96] | 24.54 [20.01, 34.48] | 22.53 [18.20, 29.09] | 176.70 [159.90, 249.96] |
| 15 | 3 | 32 | no | 85 | 0.06 | 23.25 [17.81, 33.46] | 12.89 [10.98, 17.98] | 3.85 [2.89, 4.57] | 36.32 [32.25, 43.39] |
| 15 | 3 | 32 | yes | 85 | 0.91 | 31.74 [27.34, 36.73] | 15.94 [10.19, 35.63] | 5.58 [3.40, 11.67] | 48.37 [37.97, 99.97] |
| 15 | 3 | 256 | no | 309 | 0.27 | 33.09 [31.47, 39.39] | 19.28 [17.50, 29.01] | 11.25 [8.63, 14.46] | 81.29 [71.58, 88.87] |
| 15 | 3 | 256 | yes | 309 | 1.13 | 34.31 [31.08, 42.05] | 17.53 [13.47, 25.14] | 6.39 [4.45, 7.80] | 69.45 [51.16, 76.50] |
| 15 | 3 | 2048 | no | 2101 | 1.97 | 168.32 [110.11, 174.88] | 100.70 [74.57, 115.65] | 33.73 [30.69, 40.55] | 366.84 [334.10, 371.90] |
| 15 | 3 | 2048 | yes | 2101 | 2.83 | 117.87 [104.47, 144.31] | 83.35 [69.41, 187.13] | 27.02 [23.47, 39.19] | 265.83 [237.81, 417.63] |
| 15 | 8 | 32 | no | 160 | 0.09 | 54.07 [46.27, 56.78] | 36.09 [24.15, 39.91] | 5.20 [3.57, 9.33] | 63.32 [51.48, 78.23] |
| 15 | 8 | 32 | yes | 160 | 0.95 | 45.84 [42.52, 58.69] | 30.98 [22.99, 53.38] | 5.07 [3.16, 7.55] | 62.62 [50.97, 88.40] |
| 15 | 8 | 256 | no | 384 | 0.31 | 71.81 [55.00, 100.88] | 51.88 [48.91, 57.06] | 8.30 [5.73, 9.53] | 102.99 [95.09, 108.76] |
| 15 | 8 | 256 | yes | 384 | 1.16 | 63.47 [57.06, 67.13] | 44.12 [37.04, 46.84] | 6.99 [5.42, 7.42] | 83.10 [78.40, 95.58] |
| 15 | 8 | 2048 | no | 2176 | 2.01 | 205.80 [185.88, 254.87] | 179.68 [154.30, 271.15] | 24.12 [23.51, 26.83] | 334.24 [313.25, 457.55] |
| 15 | 8 | 2048 | yes | 2176 | 2.87 | 214.82 [198.44, 229.35] | 181.70 [164.11, 198.31] | 23.78 [23.59, 26.05] | 347.23 [318.02, 367.50] |
| 178 | 1 | 32 | no | 218 | 0.42 | 8.24 [7.51, 9.05] | 4.36 [3.23, 4.61] | 8.66 [5.38, 9.22] | 36.62 [32.95, 44.40] |
| 178 | 1 | 32 | yes | 218 | 1.28 | 9.59 [8.29, 10.27] | 3.24 [2.91, 3.85] | 7.23 [5.61, 7.60] | 31.87 [29.86, 35.01] |
| 178 | 1 | 256 | no | 442 | 1.17 | 13.86 [12.90, 15.03] | 6.44 [6.21, 7.25] | 11.76 [7.27, 13.72] | 54.14 [48.62, 55.36] |
| 178 | 1 | 256 | yes | 442 | 2.03 | 12.23 [11.22, 14.41] | 6.20 [5.88, 9.66] | 9.70 [9.21, 13.40] | 54.82 [50.41, 67.21] |
| 178 | 1 | 2048 | no | 2234 | 7.17 | 36.02 [35.05, 38.35] | 27.37 [23.69, 29.01] | 29.57 [24.77, 30.86] | 221.56 [197.30, 258.63] |
| 178 | 1 | 2048 | yes | 2234 | 8.03 | 30.85 [29.79, 36.44] | 25.16 [22.51, 27.45] | 27.42 [24.05, 29.84] | 194.25 [183.46, 247.80] |
| 178 | 3 | 32 | no | 574 | 1.03 | 38.48 [31.52, 46.71] | 25.01 [22.95, 34.40] | 14.91 [10.62, 18.03] | 93.00 [84.43, 104.02] |
| 178 | 3 | 32 | yes | 574 | 1.89 | 31.15 [30.20, 31.21] | 22.29 [20.42, 23.74] | 11.62 [10.19, 14.29] | 78.22 [74.72, 81.92] |
| 178 | 3 | 256 | no | 798 | 1.78 | 39.16 [36.37, 40.60] | 28.57 [27.77, 33.24] | 13.22 [11.95, 15.94] | 96.60 [92.68, 111.26] |
| 178 | 3 | 256 | yes | 798 | 2.64 | 36.53 [33.36, 53.77] | 29.46 [27.55, 45.57] | 12.13 [10.81, 23.03] | 96.78 [92.73, 167.18] |
| 178 | 3 | 2048 | no | 2590 | 7.79 | 100.98 [96.68, 104.66] | 88.08 [76.85, 129.99] | 31.20 [29.82, 45.15] | 294.29 [264.39, 417.35] |
| 178 | 3 | 2048 | yes | 2590 | 8.64 | 112.89 [98.69, 148.55] | 103.94 [89.24, 115.24] | 36.11 [33.19, 43.98] | 338.16 [300.68, 384.10] |
| 178 | 8 | 32 | no | 1464 | 2.56 | 158.61 [135.56, 164.56] | 130.10 [112.91, 140.06] | 22.36 [19.35, 25.38] | 243.59 [216.77, 290.66] |
| 178 | 8 | 32 | yes | 1464 | 3.42 | 251.56 [202.28, 258.44] | 194.96 [175.19, 238.85] | 31.78 [29.98, 53.18] | 373.89 [356.02, 451.64] |
| 178 | 8 | 256 | no | 1688 | 3.31 | 176.38 [159.02, 177.59] | 155.78 [148.26, 158.72] | 25.57 [24.80, 27.97] | 291.60 [284.50, 300.73] |
| 178 | 8 | 256 | yes | 1688 | 4.17 | 231.91 [191.23, 267.20] | 190.28 [159.75, 232.83] | 31.04 [28.80, 43.59] | 365.53 [317.44, 487.48] |
| 178 | 8 | 2048 | no | 3480 | 9.32 | 375.38 [304.70, 466.79] | 328.77 [275.23, 418.08] | 48.09 [41.78, 102.54] | 616.50 [525.67, 851.96] |
| 178 | 8 | 2048 | yes | 3480 | 10.18 | 428.08 [345.16, 470.60] | 420.74 [295.72, 477.59] | 61.69 [38.32, 63.69] | 811.67 [547.77, 866.64] |

Stage detail. Each stage cell is first / second median ms of five runs; missing spans are --. The lower bound is for the second pass.

| Fixture / route | Handler | Auth | Writer queue | Domain | DB | Encode | Unattributed lower bound |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| n15-p1-large1-h256 / profiles | 8.420 / 4.178 | 0.446 / 0.106 | 0.060 / 0.049 | -- / -- | 0.259 / 0.181 | -- / -- | 3.861 |
| n15-p1-large1-h256 / tags | 9.656 / 3.972 | 0.132 / 0.056 | 0.045 / 0.023 | -- / -- | 0.230 / 0.142 | -- / -- | 3.755 |
| n15-p1-large1-h256 / tasks | 6.267 / 10.695 | 0.104 / 0.056 | 0.039 / 0.023 | 0.478 / 0.324 | 0.300 / 0.275 | -- / -- | 9.963 |
| n15-p1-large1-h256 / overdue | 5.775 / 4.169 | 0.095 / 0.085 | 0.030 / 0.033 | -- / -- | 0.157 / 0.225 | -- / -- | 3.826 |
| n15-p1-large1-h256 / projects | 7.940 / 3.724 | 0.070 / 0.042 | 0.039 / 0.023 | -- / -- | 0.162 / 0.147 | -- / -- | 3.536 |
| n15-p1-large1-h256 / inbox | 5.435 / 4.218 | 0.077 / 0.049 | 0.039 / 0.026 | -- / -- | 0.185 / 0.145 | -- / -- | 4.005 |
| n15-p1-large1-h256 / today | 4.418 / 4.197 | 0.074 / 0.084 | 0.032 / 0.046 | -- / -- | 0.178 / 0.199 | -- / -- | 3.862 |
| n15-p1-large1-h256 / scheduled | 7.632 / 3.931 | 0.061 / 0.065 | 0.032 / 0.037 | -- / -- | 0.137 / 0.245 | -- / -- | 3.643 |
| n178-p8-large1-h2048 / profiles | 428.082 / 420.739 | 1.529 / 1.018 | 0.457 / 0.482 | -- / -- | 22.719 / 22.244 | -- / -- | 397.131 |
| n178-p8-large1-h2048 / tags | 48.810 / 53.628 | 0.088 / 0.085 | 0.035 / 0.026 | -- / -- | 3.187 / 1.932 | -- / -- | 51.704 |
| n178-p8-large1-h2048 / tasks | 62.828 / 61.691 | 0.110 / 0.102 | 0.058 / 0.042 | 9.826 / 9.243 | 5.613 / 5.556 | -- / -- | 46.061 |
| n178-p8-large1-h2048 / overdue | 48.150 / 48.910 | 0.096 / 0.094 | 0.058 / 0.043 | -- / -- | 1.663 / 1.467 | -- / -- | 47.247 |
| n178-p8-large1-h2048 / projects | 53.005 / 45.803 | 0.174 / 0.113 | 0.053 / 0.039 | -- / -- | 2.768 / 2.419 | -- / -- | 42.248 |
| n178-p8-large1-h2048 / inbox | 57.426 / 54.687 | 0.099 / 0.080 | 0.049 / 0.035 | -- / -- | 2.604 / 2.514 | -- / -- | 48.621 |
| n178-p8-large1-h2048 / today | 51.669 / 51.367 | 0.095 / 0.077 | 0.037 / 0.031 | -- / -- | 2.655 / 2.634 | -- / -- | 45.459 |
| n178-p8-large1-h2048 / scheduled | 48.594 / 52.564 | 0.134 / 0.108 | 0.049 / 0.058 | -- / -- | 2.619 / 3.867 | -- / -- | 44.482 |

The full 72 factor/order cells × eight routes × three passes, including all
ranges, missing-stage counts and within-run cold/warm differences, are in
`main/summary.json` under the evidence root. The interactive median/range chart
is `cold-path-chart.html`; it plots warm history scaling, not a speedup claim.

Small first-use effects are visible. For 15 Tasks / one Profile / 55 operations,
GET /profiles first is 6.826 [4.266, 7.884], second 1.387 [1.088, 3.020]. When it
comes after seven Profile routes, its first use is 4.073 [2.664, 4.572], second
1.294 [1.105, 1.442]. This is compatible with shared route/schema/JIT/statement
warming, but no prepare/compile span isolates those mechanisms.

For 178 Tasks per Profile / eight Profiles / 3,480 operations with large deleted
text, GET /profiles is first 428.082 [345.162, 470.604], second 420.739
[295.722, 477.588], third median 414.175. This case does not have the owner's
10–20× first/second ratio. Changing request order has overlapping/noisy heavy-
case ranges and cannot be assigned an independent speedup.

To separate new Profile identity from process/route warming, five trials per
shape warm p0's seven Profile routes before ever asking p1 on the same process.
Both Profiles have the same current population and share the global history:

| Shape, three Profiles, 2,048 edits + large text | First p1 | Second p1 |
| --- | --- | --- |
| 15 Tasks, tags | 12.928 [11.822, 14.575] | 11.320 [10.722, 13.067] |
| 15 Tasks, tasks | 12.811 [11.949, 22.586] | 13.573 [12.327, 15.791] |
| 178 Tasks, tags | 19.575 [17.676, 23.306] | 18.443 [18.023, 19.785] |
| 178 Tasks, tasks | 21.941 [21.363, 24.007] | 21.838 [20.350, 22.879] |

There is no distinct large new-Profile penalty in these overlapping ranges.
The read path has no projection replay or per-Profile data build on first use.
`TaskSearchCache.read` returns a profile/generation/epoch token; without a text
filter it does not prepare search words. SQLite statements/cache pages and JS
code/decoders can warm globally, but their separate cold costs are not named by
the current instrumentation. Migration, attachment cleanup and first daily
Snapshot work occur at startup/scheduler boundaries; they are not a lazy
per-Profile projection rebuild in these reads. File-copy/normal startup warming
means this is not a cold-disk experiment.

## 2. Why GET /profiles is expensive

[ClientReads.profiles](../../../packages/domain/src/client-reads.ts) enumerates
Profiles, then calls auth.read separately for each and computes Task counts.
The [store read port](../../../packages/domain/src/store/store.ts) loads all
Tasks, all Series, Profile-specific Projects/Tags, and historySync(0), filtering
Tasks/history by Profile **after decoding**. historySync selects all op_log rows,
JSON-parses each event and decodes every OpLogEntry, including before/after Task
payloads and stored times. The endpoint does not use the returned history.
With P Profiles, /profiles does P complete data/history materializations and
P+1 credential checks/transactions. A refresh does P+7 such reads, plus the
Task route's extra graph/current-Task read. Small reply size does not bound that
work. The long text need not appear in a live Task or the response to cost CPU.
It is not intrinsically the slowest route with one Profile: the Task list can
cost more because it also reads the graph/current Tasks and encodes a larger
reply. Repeated per-Profile work makes /profiles dominate multi-Profile cases.

For a reply below 1 KB, the 178-Task / three-Profile / long-history case is
103.943 [89.236, 115.241] warm for a 514-byte /profiles reply. Thus the warm
slowness is reproduced without a large reply.

Adding only empty Profiles keeps global current Tasks, operations and payloads
constant. Every trial below retains 2,048 extra edits and the same three large
deleted descriptions. Five fresh-process trials/order; these are a separate
ambient cohort (load 5.19–8.17), so do not treat its absolute ratio to the main
sweep as a controlled speedup.

| Current live Tasks total | Profiles (others empty) | Warm /profiles ms | Reply bytes |
| ---: | ---: | --- | ---: |
| 15 | 3 | 38.264 [36.610, 39.685] | 501 |
| 15 | 8 | 106.244 [103.381, 127.458] | 1,326 |
| 178 | 3 | 54.805 [50.534, 60.382] | 502 |
| 178 | 8 | 155.688 [147.722, 170.798] | 1,327 |

Empty Profiles still cause full global reads. That confirms the structural
fan-out independently of adding current Tasks. The larger populated-Profile
sweep adds both fan-out and more globally decoded data.

The separate component driver uses the same public read path and the exact
history query/OpLogEntry decoder. It takes twelve repetitions, discards the
first two and reports ten warm observations. It is not an HTTP measurement:

| Component | 15 Tasks / 55 ops | 15 Tasks / 2,071 ops + large text | 178 × 8 Tasks / 3,480 ops + large text |
| --- | --- | --- | --- |
| History SQL materialization | 0.027 [0.020, 0.067] | 1.226 [1.002, 2.809] | 6.086 [4.981, 13.789] |
| History JSON.parse only | 0.032 [0.030, 0.045] | 2.164 [1.674, 6.343] | 4.950 [4.240, 5.925] |
| History JSON + schema decode | 0.239 [0.226, 0.857] | 15.421 [11.732, 21.427] | 26.873 [23.146, 47.573] |
| All current/deleted Task JSON + schema decode | 0.035 [0.028, 0.050] | 0.088 [0.067, 0.131] | 4.613 [4.343, 5.842] |
| One authenticated Profile read | 0.315 [0.274, 0.354] | 14.768 [11.855, 21.449] | 36.761 [32.100, 69.338] |
| /profiles domain call | 0.353 [0.322, 0.463] | 15.506 [12.794, 21.304] | 338.948 [281.599, 689.576] |

Component medians are not additive; GC, sampling order and host noise differ.
The overlapping history-decode and whole-read ranges support a limiter, not a
precise percentage from subtracting their medians.

A separate **untimed source-server** Bun CPU profile uses the largest checkpoint
and 40 additional validated /profiles reads. It is not substituted for compiled
latency data. Bun reports 14.23 s and 10,701 samples. Its self-time leaders are
native all (20.9%), native parse (18.3%), Effect assignProperty (11.8%), schema
AST functions, and toISOString (5.3%). The call graph includes historySync and
readTasks. Nested inclusive percentages are not added. This locates result
materialization, JSON parsing and repeated schema/time validation. Driver CPU
was 83.4 ms against server CPU delta 15.21 s over roughly 14.24 s wall; helpers,
JIT/GC and profiler overhead can make process CPU exceed one JS-thread wall
interval. The generator is not the limiter. The profiled RSS/timings are
perturbed and are not production memory/latency claims.

Every authenticated read currently uses an immediate transaction. The scheduler
also does synchronous immediate transactions for due work, credential cleanup
and daily Snapshot checks. In this process its synchronous work cannot hold a
transaction across a yield while a read runs; it can delay request dispatch.
Another process using the same SQLite file can hold the writer lock. A separate
scratch process holding BEGIN IMMEDIATE for 300 ms produced five handler
observations 304.677–307.526 ms, of which writer queue was 300.821–301.061 ms;
auth and DB spans remained below a millisecond. The repeat control also requires
that a >=100 ms writer_lock_wait span survives in owner detail afterwards.
SQLite's configured busy_timeout is 5,000 ms. A near-five-second successful wait
is plausible for the owner's 5,105 ms request; there is no historical lock span
from that server to establish it as the cause.

## 3. Load: completed pairs and explicit holds

The host has ten logical CPUs. An eligible pressure run starts at most six
owned spin processes, checks both installed Todo app paths are not frontmost,
and requires at least 60 seconds since combined-session key-down or any mouse-
button-down event. Only timestamps/app identity are read through JXA/AppKit/
CoreGraphics; no app is launched or activated and no input content is captured.
Session input can include automation, so a failed gate does not identify who
acted. A periodic check stops pressure on renewed activity. Every factor/order
cell is bounded by 90 seconds; the per-run cutoff is 85 seconds or the remaining
cell budget. Cleanup awaits owned workers/server exits.

The exploratory series completed three five-pair cells before the next cell
was interrupted: 15 complete pressure runs and 15 matched no-added-pressure
runs, plus one unmatched baseline. Pair order counterbalances A,B then B,A.
All published responses are validated successes. Six workers per pressure run
have positive CPU receipts. A representative run reports 0.35–0.39 CPU seconds
per worker; the test did create CPU work. It does not establish a particular
fraction of the Mac's heterogeneous cores or a linear mapping from load average
to per-request slowdown. Boundary load ranged 12.42–30.69. A is **not quiet**.

Warm second-pass /profiles, median [range] of five matched runs:

| Fixture / first route | A handler ms | B handler ms | Paired B−A median [range] ms | Paired ratio median [range] | Verdict |
| --- | --- | --- | --- | --- | --- |
| 15 Tasks, 55 ops, /profiles first | 2.332 [1.195, 3.097] | 3.036 [2.330, 8.659] | 1.494 [-0.002, 6.500] | 1.497 [0.999, 4.011] | Inconclusive |
| 15 Tasks, 55 ops, tags first | 3.187 [1.785, 5.000] | 2.332 [2.010, 3.133] | -1.097 [-2.284, 0.256] | 0.656 [0.505, 1.126] | Inconclusive |
| 15 Tasks, 279 ops, /profiles first | 9.306 [5.235, 11.951] | 8.656 [7.194, 23.993] | 0.933 [-3.448, 12.042] | 1.121 [0.676, 2.008] | Inconclusive |

Literal paired B−A differences in the same order:

- 55 ops, /profiles first: 1.494, 1.539, 6.500, 0.258, -0.002 ms.
- 55 ops, tags first: -2.284, -1.097, -1.867, 0.225, 0.256 ms.
- 279 ops, /profiles first: 0.933, 12.042, -3.448, 4.756, -1.919 ms.

Each median difference is inside pair-to-pair variation. The eight-handler warm
sum has paired ratio medians 0.943, 0.890 and 1.116, respectively, also
inconclusive. One **first-pass** /profiles pair in the 279-op cell is 89.715 ms
versus 8.892 ms, ratio 10.09. Its five-pair ratio range is 0.639–10.089 with
median 1.641. It is an isolated observation amid background drift, not proof
that CPU load alone caused a reproducible 10× slowdown. No consistent 10–20×
whole-refresh effect was established.

The first pressure driver stopped during a later cell and its fetch failed
with ECONNREFUSED after two successful responses. The server log has no server
application error. This is consistent with its activity guard stopping the
owned server; the first driver did not persist the guard's exact abort reason,
so that incomplete cell is excluded rather than classified as a server failure
or a completed pair. The final harness persists abort cause/counts and provides
a worker-readiness barrier and symmetric host observation on both sides. Those
last two controls were not present in the exploratory cohort; its estimates are
therefore explicitly exploratory and not pooled with later data.

A subsequent full sweep held all 72 cells for recent session input, exit 2.
The final ten-pair attempt for three small cells held all three; the five-pair
owner-sized large cell held too, both exit 2 before starting workers. At a final
check Chrome was frontmost and last session input was 5.74 seconds earlier.
The explicit quiet attempt held both representative cells at load 23.61,
exit 2. The existing benchmark and its <=4 ceiling were not changed. Quiet
confirmation and complete owner-sized pressure pairs remain owed when these
conditions can be met. Their absence is a limit on the load conclusion, not
permission to call ambient measurements quiet or to claim no overhead.

A later check briefly found 111.50 seconds of session inactivity with T3
frontmost. By the actual next pre-cell checks activity had resumed: all three
late owner-sized pressure cells were held, exit 2, with no new workers. The
late quiet check also held both cells at load 5.93. An eligible observation is
not treated as permission after the gate changes.

## 4. Serial service, one request and one transaction

Twenty cohorts dispatch the eight reads concurrently after warming. These are
five trials per large-history corner. Parallel wall means the last response
body-end, not the sum of client request latencies. All retained entry intervals
are non-overlapping. The largest shape retains all eight entry spans in each
of its five cohorts, proving non-overlap there; the other shapes retain only
one or three of eight entries because of the 32-row detail admission limit.
Their partial span samples do not prove complete coverage.

| Shape, 2,048 edits + large text | Sequential second-pass handler sum, median ms | Concurrent handler sum, median ms | Concurrent last body-end, median ms | Writer queue sum, median ms |
| --- | ---: | ---: | ---: | ---: |
| 15 Tasks × 1 Profile | 95.378 [92.107, 108.068] | 97.042 [91.229, 99.639] | 99.192 [93.221, 101.948] | 0.166 [0.157, 0.210] |
| 15 Tasks × 8 Profiles | 185.431 [182.102, 211.139] | 183.908 [181.830, 187.983] | 186.829 [183.965, 190.159] | 0.251 [0.244, 0.256] |
| 178 Tasks × 1 Profile | 127.953 [127.696, 132.053] | 132.005 [129.171, 134.516] | 134.525 [131.676, 137.382] | 0.176 [0.153, 0.252] |
| 178 Tasks × 8 Profiles | 386.461 [376.604, 409.202] | 395.985 [382.509, 432.672] | 399.255 [386.179, 435.537] | 0.324 [0.306, 0.350] |

The raw per-trial values and ranges are in serial/serial.json and its summary.
The synchronous read CPU is serialized; concurrent fetches do not parallelize
it. This is not a claim that async streams/network IO cannot overlap. Crucially,
writer_lock_wait measures SQLite transaction admission, not time waiting for
Bun to dispatch a request. Its tiny values cannot confirm or rule out that
service queue. Entry intervals and end-to-end wall/sums supply the evidence;
socket_accept_to_entry remains explicitly unobserved.

Eight handlers of 17 ms imply 136 ms of serial work, before network/client
costs. If /profiles is 99 ms and the other seven are 17 ms, the sum is 218 ms.
One HTTP envelope does not remove the repeated domain reads. One transaction
also does not remove them. Existing readSnapshot can hold a coherent deferred
read transaction, but the same P+7 reads still decode global data each time.

Direct-domain counterfactuals, ten warm repetitions after two discarded warmups:

| Shape | Current eight domain calls | One transaction, same P+7 reads | Shared P reads, lower bound |
| --- | --- | --- | --- |
| 15 Tasks / one Profile / 55 ops | 3.302 [2.297, 5.051] | 2.775 [2.352, 3.535] | 0.412 [0.315, 1.167] |
| 15 Tasks / one Profile / 2,071 ops + large text | 117.586 [101.829, 180.857] | 129.199 [109.034, 221.549] | 16.841 [12.224, 32.055] |
| 178 Tasks × eight Profiles / 3,480 ops + large text | 606.873 [499.277, 791.299] | 644.640 [501.621, 1089.167] | 339.477 [289.805, 574.335] |

These are component experiments in the real domain library, not a new endpoint
or a shipped batch implementation. Current domain calls include view work;
the Task component uses auth.read rather than the full HTTP Task graph/output
path. The one-transaction variant does identical read multiplicity plus counts,
not all response construction. Its ranges overlap and show no measured benefit.
The shared variant authenticates/reads each visible Profile once and reuses the
target dataset. It excludes some graph/view assembly and all HTTP encoding, so
it is a **lower bound**, not a promised refresh time. The per-route table above
remains the measured cost of each current endpoint. A same-work single request
would still pay those data costs; a true shared-data request would pay one
upfront dataset cost plus route-specific assembly/encoding that is not isolated
by today's spans. It cannot be assigned eight precise improved endpoint times
without implementing and verifying that counterfactual.

## 5. What Diagnostics would have shown afterwards

| Actual slow work | Current visibility |
| --- | --- |
| Cross-process writer lock after entry | writer_lock_wait / todo-queue; the 300 ms control verifies retained attribution in owner detail. |
| Credential lookup | authentication and nested database/auth.credential; SHA lookup, not Argon2 password verification on each read. |
| Task SELECT result retrieval | database/store.read; JSON/schema materialization happens after that span ends. |
| Full history SELECT/JSON/schema decode | Mostly generic handler time. The history SELECT and decoder have no dedicated read-path span. |
| Graph read on tasks | graph/domain wrappers cover that extra read; they do not cover the preceding full auth.read history load. |
| Response schema/JSON encoding | encode is absent; encoding remains an explicit gap. |
| Before-dispatch serial service or synchronous scheduler work | socket_accept_to_entry is unobserved; writer queue is not a substitute. |
| Process startup, first route/Profile use, JIT/cache state | No boot/first-use marker or per-route cold/warm split. Run id and uptime help context but do not establish those states. |
| Host descheduling/GC versus executing useful work | Stage wall times include both. No per-request/stage CPU or GC attribution. |

For the heavy /profiles row, auth ~1.018 ms, writer queue ~0.482 ms and recorded
DB ~22.244 ms do not explain a ~420.739 ms handler. At least roughly 397 ms is
outside those named spans; overlap can make the missing part larger. The
component/profile controls identify a likely cause, but the polled Diagnostics
body would not have named history decoding. A user could see a slow route and
handler, not this diagnosis automatically.

The default body has counters, per-stage/category summaries and eight compact
slow labels. Explicit detail is bounded to 32 recent spans, four active and
16 deliveries. In the serial controls it retains only 1/8 or 3/8 entry spans
for three shapes, although the internal ring has not filled. Slow-span priority
and byte limits explain this; omission counts are visible. Thus a complete
per-request stage tree afterwards is not guaranteed. Client-recorded timing
headers are more complete for available stage totals at response time. Cold/
warm and Profile identity splits are not retained. The exact missing CPU stage
and any pre-dispatch queue would remain unnamed in the owner's incident.

## Ranked candidates and smallest proposals

| Priority | Finding or candidate | Evidence / what would settle it | Smallest proposed change, not implemented |
| --- | --- | --- | --- |
| 1 | Repeated unneeded global history/Task materialization explains expensive steady reads | Source, 56 audited checkpoints, history/current-data controls and CPU profile agree. More history increases cost with live Task count fixed. | Add narrow projection read ports for Tasks/views/metadata; read history only for History/Revert cases. Filter by Profile in SQL before materializing. Keep schema/auth/consistency guarantees for the relevant data. |
| 2 | /profiles multiplies that cost by visible Profile count | Empty-Profile control holds Tasks/history fixed and still scales. | Compute authorized Profile counts from a grouped projection query in one consistent read snapshot. Preserve Inbox/open/deleted and token-scope semantics. Do not first decode full histories or Task bodies. |
| 3 | A cross-process writer wait can produce a near-five-second handler | Every auth read uses immediate transaction; busy_timeout is 5000 ms; a held writer produces a correctly attributed 301 ms queue. No incident-stage data exists. | First record lock duration/owner class in scratch tests; assess deferred read transactions for pure reads. Requires a concurrency/auth-rejection audit, not a blind transaction-mode replacement. |
| 4 | Shared first-use code/codec/statement warming causes a modest small-fixture penalty | Small first-pass differences and order effects; no large new-Profile penalty after priming another Profile. Heavy-history first/second ranges overlap. | Add boot and bounded first-route-use markers, plus explicit prepare/materialize/decode/encode spans. JIT/SQLite cache controls on a quiet host would separate these mechanisms. |
| 5 | Host scheduling/GC/load contributes transient outliers | Wide paired spread, one 10.09× pair, no repeatable 10–20× refresh effect. Quiet and heavy pressure comparisons are held. | Repeat the matched experiment in an eligible idle window, with CPU/GC and external-writer evidence. Do not turn these incomplete results into a load-only explanation. |
| 6 | Eight serial HTTP/domain reads create a refresh floor | Full interval coverage in five largest-shape cohorts and wall approximately equal to sum. One transaction does not remove P+7 data loads. | After narrowing reads, evaluate one shared current-state snapshot or client reuse/patches. Preserve coherent versions and output semantics; measure full encoding/rendering before promising 20 ms. |

For observability, prioritize history SQL + JSON/schema decode, Task JSON/schema
materialization and response encoding spans before adding more UI detail.
Persist a bounded per-request stage summary for slow items or client timing
exports, and a per-route first-use split, within the existing byte budget. New
metadata/schema fields need a separate ruling; no Profile names, content or
Task ids should be added to new recorder metadata. None of these product or
contract proposals is implemented in this branch.

## Commands, exits and evidence

All paths below are checkout-relative. The evidence root is
`docs/evidence/ui-speed/server-cold-path`. Each server process uses a
new temporary HOME/database cloned from a generated checkpoint. All owned
per-run children/HOMEs/databases are finalized; private seed checkpoints remain
under ignored .scratch for reproducibility. No measurements use native apps,
Swift, Keychain, an installed server or the real ~/.todo-cli.

| Invocation | Actual exit | Receipt |
| --- | ---: | --- |
| `bun .agents/skills/verify-diagnostics/scripts/cold-path-fixture.ts seed "$PWD/.scratch/cold-path/pilot"` | 0 | pilot-seed.log; 36 checkpoints; final audit-main.json validates all inputs |
| `COLD_PILOT=1 bun .agents/skills/verify-diagnostics/scripts/cold-path-fixture.ts seed "$PWD/.scratch/cold-path/smoke"` and `COLD_PILOT=1 bun .agents/skills/verify-diagnostics/scripts/cold-path.ts pilot "$PWD/.scratch/cold-path/smoke" "$PWD/docs/evidence/ui-speed/server-cold-path/smoke"` | 0, 0 | smoke-seed.exit and smoke-run.exit; functional pilot excluded from performance conclusions |
| `bun .agents/skills/verify-diagnostics/scripts/cold-path.ts ambient "$PWD/.scratch/cold-path/pilot" "$PWD/docs/evidence/ui-speed/server-cold-path/main"` | 0 | ambient.exit, main/ambient.json and main/summary.json; 360 runs / 8640 observations |
| `bun .agents/skills/verify-diagnostics/scripts/cold-path.ts pressure "$PWD/.scratch/cold-path/pilot" "$PWD/docs/evidence/ui-speed/server-cold-path/pressure"` | 1, interrupted | pressure.exit/log and pressure/pressure.json; only 15 completed pairs used, unmatched/incomplete work excluded |
| Same pressure command with evidence `"$PWD/docs/evidence/ui-speed/server-cold-path/pressure-retry"` after abort-receipt handling | 2, held | pressure-retry.exit; 72 held cells |
| `COLD_PAIRS=10 COLD_FIRST=profiles COLD_ONLY=n15-p1-large0-h32,n15-p1-large0-h256,n15-p1-large1-h2048 bun .agents/skills/verify-diagnostics/scripts/cold-path.ts pressure "$PWD/.scratch/cold-path/pilot" "$PWD/docs/evidence/ui-speed/server-cold-path/pressure-final-small"` | 2, held | pressure-final-small.exit; three held cells, no new workers |
| `COLD_PAIRS=5 COLD_FIRST=profiles COLD_ONLY=n178-p8-large1-h2048 bun .agents/skills/verify-diagnostics/scripts/cold-path.ts pressure "$PWD/.scratch/cold-path/pilot" "$PWD/docs/evidence/ui-speed/server-cold-path/pressure-final-large"` | 2, held | pressure-final-large.exit; one held cell, no new workers |
| `COLD_FIRST=profiles COLD_ONLY=n15-p1-large1-h2048,n178-p8-large1-h2048 bun .agents/skills/verify-diagnostics/scripts/cold-path.ts quiet "$PWD/.scratch/cold-path/pilot" "$PWD/docs/evidence/ui-speed/server-cold-path/quiet"` | 2, held | quiet.exit; both load-ceiling holds |
| Same quiet invocation with `COLD_PAIRS=5` and evidence docs/evidence/ui-speed/server-cold-path/quiet-late | 2, held | quiet-late.exit; load 5.93 |
| `COLD_PAIRS=5 COLD_FIRST=profiles COLD_ONLY=n15-p1-large1-h2048,n178-p1-large1-h2048,n178-p8-large1-h2048 bun .agents/skills/verify-diagnostics/scripts/cold-path.ts pressure "$PWD/.scratch/cold-path/pilot" "$PWD/docs/evidence/ui-speed/server-cold-path/pressure-late"` | 2, held | pressure-late.exit; all three current pre-cell input gates held |
| `bun .agents/skills/verify-diagnostics/scripts/cold-path-fixture.ts micro "$PWD/.scratch/cold-path/pilot" "$PWD/docs/evidence/ui-speed/server-cold-path/micro.json"` | 0 | micro.exit, micro.json and micro-summary.json; 16 shapes × 12 repetitions, first two discarded |
| `bun .agents/skills/verify-diagnostics/scripts/cold-path.ts serial "$PWD/.scratch/cold-path/pilot" "$PWD/docs/evidence/ui-speed/server-cold-path/serial"` | 0 | serial.exit; 20 cohorts / 640 observations, including concurrent reads |
| `bun .agents/skills/verify-diagnostics/scripts/cold-path.ts lock "$PWD/.scratch/cold-path/pilot" "$PWD/docs/evidence/ui-speed/server-cold-path/lock"` | 0 | lock.exit; five 300 ms writer holds |
| Same lock command with evidence `"$PWD/docs/evidence/ui-speed/server-cold-path/lock-after"`, after adding retained-span assertion | 0 | lock-after.exit; all five retain the named wait afterwards |
| `bun .agents/skills/verify-diagnostics/scripts/cold-path.ts new-profile "$PWD/.scratch/cold-path/pilot" "$PWD/docs/evidence/ui-speed/server-cold-path/new-profile"` | 0 | new-profile.exit; 10 trials / 240 retained observations, plus 70 validated primer reads |
| `bun .agents/skills/verify-diagnostics/scripts/cold-path-fixture.ts empty-profiles "$PWD/.scratch/cold-path/empty"` then `bun .agents/skills/verify-diagnostics/scripts/cold-path.ts ambient "$PWD/.scratch/cold-path/empty" "$PWD/docs/evidence/ui-speed/server-cold-path/empty"` | 0, 0 | empty-seed.exit and empty.exit; 80 trials / 1920 observations |
| `COLD_PILOT=1 COLD_RICH=1 COLD_SIZE=178 bun .agents/skills/verify-diagnostics/scripts/cold-path-fixture.ts seed "$PWD/.scratch/cold-path/rich-smoke"` then `COLD_ONLY=n178-p1-large0-rich-h256 COLD_PAIRS=1 bun .agents/skills/verify-diagnostics/scripts/cold-path.ts pilot "$PWD/.scratch/cold-path/rich-smoke" "$PWD/docs/evidence/ui-speed/server-cold-path/rich-smoke"` | 0, 0 | rich-smoke-seed.exit and rich-smoke.exit |
| `COLD_RICH=1 bun .agents/skills/verify-diagnostics/scripts/cold-path-fixture.ts seed "$PWD/.scratch/cold-path/rich-final"` then `bun .agents/skills/verify-diagnostics/scripts/cold-path.ts ambient "$PWD/.scratch/cold-path/rich-final" "$PWD/docs/evidence/ui-speed/server-cold-path/rich-final"` | 0, 0 | rich-final-seed.exit and rich-final.exit; 120 trials / 2880 observations |
| `COLD_PAIRS=1 COLD_FIRST=profile COLD_ONLY=n178-p8-large1-h2048 bun .agents/skills/verify-diagnostics/scripts/cold-path.ts profile "$PWD/.scratch/cold-path/pilot" "$PWD/docs/evidence/ui-speed/server-cold-path/cpu-profile"` | 0 | cpu-profile.exit; profile.json, cold-path-server.cpuprofile.cpuprofile and its .md; timings excluded |
| `bun .agents/skills/verify-diagnostics/scripts/cold-path-fixture.ts audit "$PWD/.scratch/cold-path/pilot" "$PWD/docs/evidence/ui-speed/server-cold-path/audit-main.json"`, repeated for .scratch/cold-path/empty and .scratch/cold-path/rich-final | 0 | audit.exit; 56 valid final checkpoints |
| `bun .agents/skills/verify-diagnostics/scripts/cold-path-report.ts docs/evidence/ui-speed/server-cold-path/main/ambient.json docs/evidence/ui-speed/server-cold-path/main/summary.json`, repeated for each cohort | 0 | summaries; literal statistics controls run on invocation |
| `bun .agents/skills/verify-diagnostics/scripts/cold-path-report.ts docs/evidence/ui-speed/server-cold-path/main/ambient.json docs/evidence/ui-speed/server-cold-path/main/tables.md tables` | 0 | main/tables.md |
| `bun .agents/skills/verify-diagnostics/scripts/cold-path-report.ts docs/evidence/ui-speed/server-cold-path/main/ambient.json docs/evidence/ui-speed/server-cold-path/cold-path-chart.html chart` | 0 | chart; HTML preview at 728 px has no console messages |
| `bun .agents/skills/verify-diagnostics/scripts/cold-path-report.ts docs/evidence/ui-speed/server-cold-path/micro.json docs/evidence/ui-speed/server-cold-path/micro-summary.json micro` | 0 | true medians/ranges after two discarded warmups |
| `pnpm exec tsc -p .agents/skills/verify-diagnostics/tsconfig.cold-path.json` | 0 | types-check and types-final .log/.exit; includes all harness modules |
| `COLD_ONLY=n15-p1-large0-h32 COLD_PAIRS=1 COLD_FIRST=profiles bun .agents/skills/verify-diagnostics/scripts/cold-path.ts pilot "$PWD/.scratch/cold-path/pilot" "$PWD/docs/evidence/ui-speed/server-cold-path/final-smoke"` | 0 | final-smoke.exit; validates finalized helper split/configuration |
| `bun packages/api/scripts/openapi.ts --check` and `bun apps/server/scripts/scratch-diagnostics.ts build` | 0, 0 | contract-final and cache-final .log/.exit; cached binary reused, hash check equal |
| `bun .agents/skills/verify-diagnostics/scripts/cold-path-host.ts` | 0 | host-validation.json/.exit; read-only final host query, no pressure work |

The phase driver checks statuses and work counts before admitting observations;
there are no silent HTTP retries. A gate/deadline hold is exit 2. Unexpected
HTTP/body/fixture failures exit 1 and preserve earlier completed data.

Development failures were retained. An early pilot read attempted its manifest
before seeding finished and exited 1; the completed smoke then passed. The first
rich fixture's Tag metadata was incomplete: later creates were rejected and the
literal 178-Task assertion caught an actual 38-Task reply, exit 1. That cohort
is excluded. The seeder now requires every append to commit and carries resolved
Tag definitions. The repaired rich fixtures pass literal body counts and the
post-audit. An initial read-only audit of copied WAL-mode files could not open
missing SQLite sidecars, exit 1; the final SELECT-only audit permits sidecar
creation on owned scratch copies and exits 0. Early harness type errors were
fixed before final validation. None of these failures is treated as a fast
successful application result or erased from the evidence.

The measurement modules, their typecheck config and recipe live under
verify-diagnostics. The existing benchmark's ceiling, production schemas,
server, CLI, domain and formal mappings are untouched. A product diff check is
empty and the compiled server hash is retained. Unit/HTTP product behavior was
not changed or requalified as a new implementation. Quiet and complete heavy-
pressure results, a same-build/sanitized reproduction of the installed incident,
and a named decode/encode/boot attribution upgrade remain unproven or proposed.

The final scan found no closed Bun compile temporaries in this worktree, so it
freed 0 bytes; cleanup.json records the scan. The disk guard passed at 48.4 GB
free. No owned pressure, server or fixture process remained. The harness
typecheck, statistics controls, functional smoke, unchanged-contract check and
cached-binary/hash check passed. The product root/unit suites were not rerun
for this report-only job; no application or package source changed.

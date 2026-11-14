# Mac responsiveness measurement

Phase 0 compares immutable Swift client revisions against one compiled scratch
server. It excludes Todo.app and hosted XCTest. SessionVault methods trap;
TodoApp.swift is excluded; AppKit activation is prohibited. Windows stay
unordered and the RootView control rejects attached sheets.

From the repository root, with pnpm dependencies installed:

```sh
bun .agents/skills/verify-cli/scripts/cache-binaries.ts
python3 apps/macos/PerfMeasurement/run.py "$PWD/docs/evidence/mac-perf/new-run" \
  --runs 5 --root-window --compare-diagnostics --personal-tasks 80 \
  --history-operations 925 --max-start-load 0
```

Use a fresh evidence path. This command alternates forward and reverse through
three revisions and Diagnostics closed/open, giving five sessions per cell.
It prints medians, error counts and completed work. The owner requested the
busy-host workload; `--max-start-load 0` disables the default start ceiling of 6.
Each run records its starting load and samples load every two seconds. A busy
host is a workload dimension; overlapping timing ranges do not establish a
client regression. Do not stop unrelated processes.

`--prepare-only` compiles without running. `--ref` selects a smoke case.
`--diagnostics` opens only that workload; `--compare-diagnostics` includes both.
`--active-layout compact` retains a Compact main window instead of full.
Without `--root-window`, the retained host composes production list/sidebar
content and directly measures editor, picker and graph reads. The Root control
uses production RootView, native toolbar and inline Task inspector; it skips
picker/Dependencies presentation to keep every sheet closed. A separate live
DiagnosticsView stays attached when enabled, and must fetch a real snapshot.
Both modes time fresh Compact/full layouts separately, then retain one selected
main window. Fresh construction is included in layout time.

Each session has a fresh scratch HOME, database, compiled server and CLI
credentials. Work has 180 open Tasks; personal has 80 or 180. Each has 70 Tags,
12 Projects, three Dependency edges and ordinary descriptions. CLI import
creates the data. Optional History warmup uses authenticated HTTP operations.
The session asserts literal Task counts, CLI edit titles, final status and
stream cursors. It covers sign-in transport, initial refresh, stream ready, ten
CLI edits, Profile switch, Task open, injected EOF/reconnect, switches with
0/50/300-operation backlogs, Complete plus echo, and 20 CLI writes. A replay's
drain time measures consumed operations; it can exceed time until the latest
rows first appear. The burst duration is a conservative current-list bound:
it requires both the final title and the final consumed sequence.

Source copies and build caches stay under ignored `.scratch/mac-perf`. Builds
use release optimization, test visibility, exact archived Package.resolved pins,
disabled resolution and the shared Swift slot. Evidence retains full SHAs,
source/binary hashes, command exits, workload, raw HTTP records and cleanup.
The current backend is held fixed across all three clients. A loopback proxy
replaces its health contract hash with the client's archived hash. Old generated
decoders reject extra fields, so the proxy removes only five DAG read fields
from Task objects: depends_on, blocks, ready, blocked and remaining_energy.
Adapter duration and byte counts are recorded. This comparison isolates clients
against the current server; it is not a historical whole-stack comparison.

For the first stream without a cursor, the proxy sends the fixture's high-water
sequence, excluding setup History. Backlog cases use explicit saved cursors.
The EOF control closes owned upstream sockets without stopping the server; it
does not reproduce the production 60-second timeout. Client cancellation is
propagated upstream so abandoned streams do not accumulate in Diagnostics.

A CFRunLoopObserver after SwiftUI's before-wait work records longest/total
main-thread awake intervals per step. A separate 2ms main-actor heartbeat records
the longest missed service interval. These are blocking proxies, including
scheduling and synchronous OS waits; they are not CPU time or an exact actor-job
trace. Loading, canWrite=false and busy durations are sampled separately. Each
step has a 30ms settling wait and layout flush. Fresh layout probes are outside
that step's heartbeat/request-count interval. Counts cover timed steps,
not every Diagnostics poll during the entire process lifetime.

Verification-copy instrumentation wraps refresh and synchronous model JSON
round trips. Per-refresh HTTP interval unions approximate outstanding transport
time. They include server/proxy work, exclude subsequent generated conversion,
and can overlap main-actor decode. Model encode/decode is measured explicitly;
generated-runtime JSON decoding and UI work remain in the residual. These
measures are not an additive network-versus-CPU partition.

`measurement.json` retains raw steps. `summary.json` contains medians and ranges,
routes, refresh/event counts and per-refresh timings. `work.json` prints timed
requests, refreshes, consumed operations and HTTP errors; a successful command
also requires the Swift literal-state assertions to pass. Logs and failed
attempts stay local. Offscreen checks do not establish visible input latency,
focus, menu tracking, scrolling, WindowServer drawing or diagram rendering.
Read the [Phase 0 report](../../../docs/decisions/mac-responsiveness-report.md)
before interpreting a result as the owner's freeze.

The server control builds old/new binaries, provisions the same old-format
180/80-Task, 925-operation database, and alternates five passes through natural
host load and eight added busy-loop processes:

```sh
python3 apps/macos/PerfMeasurement/server.py "$PWD/docs/evidence/mac-perf/server-new" \
  --runs 5 --cpu-workers 8
```

It validates response membership/status, measures serial reads, the eight-read
Mac refresh burst, and 20/60 synchronized list requests for each Profile.
`summary.json` retains nearest-rank p50/p90/p99/max, each burst's wall time and
load, and the median of five per-burst p99 values. A route sampled only five
times has a p99 equal to its observed maximum. `work.json` prints errors,
requests and bytes. `--ref` and `--scenario list60-personal` narrow boundary
measurements during a source bisection. No extra CPU load means no added
workers, not a claim that the host was idle.

The focused slow-reply client control warms the model before injecting GET
reply delays, then measures Complete with echo, Profile switch, five search
keystrokes, and the Dependency picker where available:

```sh
python3 apps/macos/PerfMeasurement/run.py "$PWD/docs/evidence/mac-perf/delays-new" \
  --runs 5 --slow-actions --compare-delays --personal-tasks 80 \
  --history-operations 925 --ref 225b512f --ref e69230f9 \
  --cpu-workers 8 --max-start-load 0
```

Delays are 0, 500, 2,000 and 5,000ms. Old search uses production local view state
through a verification-copy notification binding; current search uses the model
setter. Both require the last submitted text. The Root window detaches before
picker model state opens, then a direct picker view renders offscreen. No native
sheet is presented. Separate samples cover empty lists, search pending, picker
loading and the union of unavailable-write/loading/empty/picker-loading states.
Fixed delays diagnose gating and cannot establish which server change caused a
regression. The source bisection and actual-server timings decide that.

The owner-shaped option uses the coordinator's aggregate counts and synthetic
content. It has 178/92 total Tasks, their supplied status mix, long descriptions,
139 link Attachments and 983 operations. Use `--owner-fixture --history-operations
983`. The original open-Task fixture remains the contrasting easy workload.

The production-transport control first prepares immutable client packages:

```sh
python3 apps/macos/PerfMeasurement/run.py docs/evidence/mac-perf/connections-prepare \
  --prepare-only --connection-probe --ref 225b512f --ref e69230f9
python3 apps/macos/PerfMeasurement/connections.py docs/evidence/mac-perf/connections-new \
  --runs 5 --refreshes 300 --cpu-workers 8 --nofile 256
```

It requires the compiled old CLI/seed and both `server-timings` binaries from
`server.py --prepare-only --connection-timings`. Fresh and reused session cases
record actual limits, descriptors, sockets, session counts, requests and matched
handler spans. `--native-session` uses a nil URLSession delegate to contrast the
metrics delegate. The in-test soft limit is a requested starting condition.
Foundation and CFNetwork can raise it; the script records the actual value.
Never call this a fixed-256 test or enforce a hard256 cap as production.

A verification-only interposer can attribute limit changes:

```sh
clang -dynamiclib -o /tmp/mac-perf-limit-trace.dylib apps/macos/PerfMeasurement/limit-trace.c
python3 apps/macos/PerfMeasurement/connections.py docs/evidence/mac-perf/limit-trace-new \
  --runs 1 --refreshes 1 --client-ref e69230f9 --server-ref e69230f9 \
  --load 0 --policy fresh --native-session --limit-trace /tmp/mac-perf-limit-trace.dylib
```

The separate AppKit row runner hosts production RootView, preserving the
selection owner's SwiftUI state. Extracting `taskContent` does not qualify a
click control. Preparing a runner does not authorize displaying its window:

```sh
python3 apps/macos/PerfMeasurement/prepare_rows.py docs/evidence/mac-perf/rows-prepare
```

A fresh, explicit authorization is required before `connections.py --visible-row
--row-runner` displays the scratch window or posts pointer events. It never
launches Todo.app or invokes Keychain. CGPreflightPostEventAccess is read-only;
when false, the CGEvent path is skipped without requesting permission. Require
an active/key old-client window and successful old clicks before interpreting a
current-client failure. Local event delivery, selection and editor state are
recorded separately. The Phase0 visible control failed that sensitivity gate.
`prepare_rows.py --ref e69230f9 --variant no-drag|item-provider` changes only the
archived verification copy and emits source and binary hashes. Restore
`--variant production` before returning to other cached measurements.

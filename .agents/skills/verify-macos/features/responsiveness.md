# Headless responsiveness measurement

The [measurement driver](../../../../apps/macos/PerfMeasurement/README.md) compares
225b512f, a frozen origin/main and e69230f9 against the same compiled scratch
server. This is Phase 0 evidence, not a passing native responsiveness gate.

```sh
bun .agents/skills/verify-cli/scripts/cache-binaries.ts
python3 apps/macos/PerfMeasurement/run.py "$PWD/docs/evidence/mac-perf/new-run" \
  --runs 5 --root-window --compare-diagnostics --personal-tasks 80 \
  --history-operations 925 --max-start-load 0
```

Use a fresh evidence path. Every Swift build and unhosted test uses the shared
Swift slot, release optimization and disabled automatic resolution. The helper
checks archived pins and records source/binary provenance. Copies and caches
stay under ignored .scratch. TodoApp is excluded and credential-store methods
trap before Keychain. AppKit activation is prohibited, windows stay unordered
and no sheet may attach. No product source changes in this phase.

The scratch Profiles hold 180 and 80 open Tasks, 70 Tags and 12 Projects each,
ordinary descriptions, three Dependency edges and 925 initial operations. The
compiled CLI imports the data and produces live edits. The session covers
initial reads, stream ready, ten CLI edits, a Profile switch, inline Task open,
idle EOF, saved-cursor backlogs of 0/50/300, Complete with echo and a 20-edit
CLI burst. A production RootView is retained in one full window; a separate
live DiagnosticsView runs only in the open workload. Both fresh Compact and
full layouts are timed. Sheet features use the separate composition control
described in the driver README.

Read raw measurement.json, the literal-state assertions, commands.json and
cleanup receipts. Require real exit 0, successful HTTP responses, expected
Task counts/status/titles, replay counts and final cursors. Five forward/reverse
passes supply medians and ranges for each revision and Diagnostics state.
The owner requested busy-host testing; --max-start-load 0 disables the default
start ceiling of 6. Load is sampled every two seconds. Unrelated processes must
stay untouched, and overlapping ranges are inconclusive.

Main-run-loop awake intervals and an independent 2ms actor heartbeat are separate
from sampled canWrite=false, loading and busy durations. A blocked sampler cannot
observe every state transition; interpret short state intervals with their
heartbeat uncertainty. Replay drain is not the whole read-only interval. The
model becomes live after ready's initial refresh, before draining operation
replay. The burst's final-cursor requirement is a conservative current-list
bound, not the first instant final rows were visible.

Requests are counted by route within each timed step. JSON round trips and
per-refresh outstanding HTTP interval unions overlap; generated-client decoding
is not fully attributed. Fresh layout probes are outside step request/heartbeat
counts. The proxy adapts the health hash and five unsupported old Task fields,
sets the first stream's high-water cursor, and can inject EOF. It preserves real
HTTP, SSE, Task membership and Versions. An EOF control does not reproduce the
production 60-second request timeout.

The focused delayed-reply control in the README measures Complete, Profile
switch, search keystrokes and picker loading at 0/500/2000/5000ms GET delays.
It keeps credentials trapped, delivers old search through verification-copy
local view state, and detaches Root before direct picker presentation. The
[server control](../../verify-server-api/features/performance.md) compares old/new
binaries under concurrent reads and fixed CPU load. These controls must expose
the reported regression before choosing a hillclimb metric.

Visible input handling, native menus/sheets, focus, scrolling, WindowServer and
diagram drawing remain unproven. The full native gate in the parent skill stays
held, and a scratch real-app proposal is in the Phase 0 report.

# Scratch server latency measurement

The [Mac responsiveness measurement](../../../../apps/macos/PerfMeasurement/README.md)
includes an immutable old/new server control. It is Phase 0 evidence, separate
from the compiled HTTP behavior gate in the parent skill.

```sh
python3 apps/macos/PerfMeasurement/server.py "$PWD/docs/evidence/mac-perf/server-new" \
  --runs 5 --cpu-workers 8
```

The driver builds archived production sources with frozen pnpm resolution. The
old CLI and provisioning binary create a common-format database with 180 and 80
open Tasks, 70 Tags and 12 Projects per Profile, and 925 operations. No Dependency
edges are added to this cross-version fixture. Each server phase clones that
same database. Authentication and all timed reads use real HTTP.

Five forward/reverse passes cover serial reads, the eight-read Mac refresh,
20/60 concurrent lists, natural host contention and eight owned busy-loop
processes. Both plain list and explicit empty-text variants run. The pre-search
server receives the equivalent all-Tasks request without an unsupported text
parameter. Evidence labels the adaptation; do not treat a rejected query as a
fast read. Current ordinary Mac reads omit empty text, while Electron sends it.

Require exit 0, expected Task/Tag/Project membership, successful statuses, the
expected request and byte counts, and cleanup of all owned processes. Read
measurements.json, summary.json and work.json. Quantiles use nearest ranks;
five samples alone cannot estimate a population p99. The 60-list case supplies
300 request samples across five bursts and prints the median of their individual
burst p99 values. Each burst retains wall time and host load. Overlapping timing
ranges are inconclusive. Keep profiler runs separate from reported timings.

The recipe never reads owner storage, creates a managed service, signs, installs
or launches a desktop client. The server and client recipes share a dedicated
measurement lock. CPU workers are stopped by their exact owned process handles.
The compiled HTTP behavior recipe and root check must pass before an accepted
server optimization; this latency script does not replace them.

# Diagnostics read-scope controls

Run from the repository root with the server-read fixture checkpoints already
present. These controls use scratch databases and compiled Bun domain drivers.
They never load the owner's HOME or credentials.

The preserved comparison is 70b60e221f3b59fa5fb0a7aa8813b5dd624a64ae against the
working source. The builder changes only test instrumentation. It times physical
IMMEDIATE transactions from the callback's first instruction after admission
through the return from COMMIT. Nested savepoints are not counted twice.
The driver runs Diagnostics.read with Effect.runSync, so an asynchronous step
cannot count as a successful sample.

```sh
bun .agents/skills/verify-diagnostics/controls/read-fixture.mjs
bun .agents/skills/verify-diagnostics/controls/build-read-driver.mjs before .scratch/bin/diagnostics-before-70b
bun .agents/skills/verify-diagnostics/controls/build-read-driver.mjs after .scratch/bin/diagnostics-after-scoped
bun .agents/skills/verify-diagnostics/controls/paired-reads.mjs
bun .agents/skills/verify-diagnostics/controls/constructor-trace.mjs
bun .agents/skills/verify-diagnostics/controls/wiring-review.mjs
```

Use a fresh fixture/evidence destination or preserve the preceding run first.
The fixture copy adds sixteen real internal checkpoints through takeSnapshot,
each after an accepted Task edit, and eight filesystem Snapshots. The baseline
and candidate use copies of the same database and manifests. After ten warmups,
the controller alternates the first arm on every pair and requires 200 successful
pairs per fixture. It compares normalized body hashes on every pair, then the
full body with fixed Clock and RSS seams. RSS is not fixed in timed samples.
Warmups and full-body controls are excluded from timing summaries.

Constructor tracing wraps statement execution, not merely preparation. A separate
run opens the exact same scratch database sequentially under both binaries,
compares all traced statements/bindings, requires zero credential lookups and
requires the database file's SHA-256 to remain unchanged. The wiring review lists
the covered function and cache statement hashes and accepts only the approved
one-argument constructor edit. It never renews a pin.

The source inputs used for the first run and their generated reusable versions
are recorded in the ignored strict-diagnostics-control-sources.json receipt.
The first paired run exceeded the coordinator's 5 ms median / 50 ms maximum
writer-lock hold limits. Further qualification is held pending that ruling.

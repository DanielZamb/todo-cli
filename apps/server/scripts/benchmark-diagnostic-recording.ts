import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { loadavg } from "node:os";
import { join, resolve } from "node:path";
import { DiagnosticsSnapshot, Task } from "@todo/domain";
import { Schema } from "effect";
import { diagnosticFixture } from "./diagnostic-fixture.ts";

assert.equal(
  process.env.TODO_DIAGNOSTICS_BUSY_BENCHMARK,
  "1",
  "Use only for the approved busy-host comparison",
);
const evidence = resolve(
  process.argv[2] ?? "docs/evidence/ui-speed/busy-recording",
);
mkdirSync(evidence, { recursive: true });
const percentile = (values: readonly number[], q: number) =>
  [...values].sort((a, b) => a - b)[Math.ceil(values.length * q) - 1] ?? 0;
const expected = Array.from(
  { length: 100 },
  (_, index) => `Benchmark Task ${String(index).padStart(3, "0")}`,
);
type Fixture = Awaited<ReturnType<typeof diagnosticFixture>>;
async function read(fixture: Fixture) {
  const start = performance.now();
  const response = await fetch(`${fixture.url}/profiles/work/tasks`, {
    headers: { Authorization: `Bearer ${fixture.credential}` },
    cache: "no-store",
  });
  assert.equal(response.status, 200);
  const body: unknown = await response.json();
  const duration = performance.now() - start;
  const tasks = Schema.decodeUnknownSync(Schema.Array(Task))(body);
  assert.deepEqual(tasks.map((x) => x.title).sort(), expected);
  return { duration, request: response.headers.get("x-todo-request") };
}
async function snapshot(fixture: Fixture) {
  const response = await fetch(`${fixture.url}/diagnostics`, {
    headers: { Authorization: `Bearer ${fixture.credential}` },
  });
  assert.equal(response.status, 200);
  return Schema.decodeUnknownSync(DiagnosticsSnapshot)(await response.json())
    .profiler;
}
const off = await diagnosticFixture(false, 100);
let on: Fixture | undefined;
const runs: Array<{
  pair: number;
  recording: boolean;
  load_start: number;
  load_end: number;
  requests: number;
  errors: number;
  p50_ms: number;
  p90_ms: number;
  p99_ms: number;
  max_ms: number;
  generator_cpu_ms: number;
  elapsed_ms: number;
  server_cpu_and_rss: string;
}> = [];
try {
  on = await diagnosticFixture(true, 100);
  for (const fixture of [off, on])
    for (let index = 0; index < 30; index++) await read(fixture);
  for (let pair = 0; pair < 10; pair++)
    for (const [recording, fixture] of [
      [false, off],
      [true, on],
    ] as const) {
      const durations: number[] = [];
      const load_start = loadavg()[0] ?? 0;
      const start = performance.now();
      const cpu = process.cpuUsage();
      while (durations.length < 200 || performance.now() - start < 2000)
        durations.push((await read(fixture)).duration);
      const used = process.cpuUsage(cpu);
      runs.push({
        pair,
        recording,
        load_start,
        load_end: loadavg()[0] ?? 0,
        requests: durations.length,
        errors: 0,
        p50_ms: percentile(durations, 0.5),
        p90_ms: percentile(durations, 0.9),
        p99_ms: percentile(durations, 0.99),
        max_ms: Math.max(...durations),
        generator_cpu_ms: (used.user + used.system) / 1000,
        elapsed_ms: performance.now() - start,
        server_cpu_and_rss: spawnSync(
          "ps",
          ["-p", String(fixture.server.pid), "-o", "cputime=,rss="],
          { encoding: "utf8" },
        ).stdout.trim(),
      });
      writeFileSync(join(evidence, "runs.json"), JSON.stringify(runs, null, 2));
    }
  const paired = Array.from({ length: 10 }, (_, pair) => {
    const a = runs.find((x) => x.pair === pair && !x.recording);
    const b = runs.find((x) => x.pair === pair && x.recording);
    assert.ok(a && b);
    return {
      pair,
      p50_difference_ms: b.p50_ms - a.p50_ms,
      p99_difference_ms: b.p99_ms - a.p99_ms,
    };
  });
  const summaries = [false, true].map((recording) => {
    const values = runs.filter((x) => x.recording === recording);
    return {
      recording,
      p50_median_ms: percentile(
        values.map((x) => x.p50_ms),
        0.5,
      ),
      p50_range_ms: [
        Math.min(...values.map((x) => x.p50_ms)),
        Math.max(...values.map((x) => x.p50_ms)),
      ],
      p99_median_ms: percentile(
        values.map((x) => x.p99_ms),
        0.5,
      ),
      p99_range_ms: [
        Math.min(...values.map((x) => x.p99_ms)),
        Math.max(...values.map((x) => x.p99_ms)),
      ],
    };
  });
  const probe = await read(on);
  const recorded = await snapshot(on);
  const disabled = await snapshot(off);
  assert.ok(recorded && disabled);
  const spans = recorded.recent.filter((x) => x.request_id === probe.request);
  assert.ok(spans.length >= 8);
  assert.equal(disabled.started, 0);
  const diffs = paired.map((x) => x.p50_difference_ms);
  const median = percentile(diffs, 0.5);
  const variation = Math.max(...diffs) - Math.min(...diffs);
  const profiled = await diagnosticFixture(true, 100, [
    "bun",
    "--cpu-prof",
    "--cpu-prof-md",
    `--cpu-prof-dir=${evidence}`,
    "--cpu-prof-name=server.cpuprofile",
    "apps/server/src/main.ts",
  ]);
  try {
    for (let index = 0; index < 500; index++) await read(profiled);
  } finally {
    await profiled.close();
  }
  const result = {
    result: "PASS",
    condition: "busy host",
    comparison: "same binary, detailed recording disabled versus enabled",
    pairs: 10,
    runs,
    summaries,
    paired,
    paired_p50_median_ms: median,
    paired_p50_range_ms: [Math.min(...diffs), Math.max(...diffs)],
    verdict:
      Math.abs(median) <= variation
        ? "inconclusive within pair-to-pair variation"
        : "observed difference in this busy workload; quiet confirmation owed",
    work: {
      tasks_per_response: 100,
      spans_per_probe_request: spans.length,
      serialized_profiler_bytes: new TextEncoder().encode(
        JSON.stringify(recorded),
      ).byteLength,
      recent_capacity: recorded.capacity,
      active_capacity: recorded.active_capacity,
      events_displaced: recorded.dropped_events,
      lost_starts: recorded.lost_starts,
      allocations: "not counted",
      synchronous_work:
        "UUID creation, scalar record allocation, bounded ring updates and numeric Server-Timing formatting; no journal or Task database writes",
    },
    quiet_confirmation:
      "A quiet-machine confirmation under the unchanged ceiling is owed at integration.",
    source: JSON.parse(
      readFileSync(resolve(".scratch/bin/build.json"), "utf8"),
    ),
  };
  writeFileSync(join(evidence, "result.json"), JSON.stringify(result, null, 2));
  process.stdout.write(
    JSON.stringify(
      {
        summaries,
        paired_p50_median_ms: median,
        verdict: result.verdict,
        work: result.work,
      },
      null,
      2,
    ) + "\n",
  );
} finally {
  writeFileSync(join(evidence, "off-server.log"), off.log());
  if (on) writeFileSync(join(evidence, "on-server.log"), on.log());
  await off.close();
  if (on) await on.close();
}

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { loadavg } from "node:os";
import { join, resolve } from "node:path";
import { diagnosticFixture } from "../../../../apps/server/scripts/diagnostic-fixture.ts";
import { RecordingDatabase } from "../../../../packages/domain/src/recordings-sqlite.ts";
import { modelBatch } from "../../../../packages/domain/test/fixtures/recording-authority.ts";
import { validateRecordingBatch } from "../../../../packages/domain/src/diagnostic-recordings.ts";
const iterations = Number(process.env.TODO_RECORDING_COST_REQUESTS ?? 100);
assert.ok(
  Number.isInteger(iterations) && iterations >= 20 && iterations <= 100,
);
const evidence = resolve(
  process.argv[2] ?? "docs/evidence/ui-speed/recordings-sqlite/cost",
);
mkdirSync(evidence, { recursive: true });
type Cell = {
  scenario: string;
  pair: number;
  enabled: boolean;
  read_ms: number[];
  write_ms: number[];
  ingest_ms: number[];
  producer_results: { producer: number; status: number; accepted: boolean }[];
  load_start: number[];
  load_end: number[];
  elapsed_ms: number;
  driver_cpu_ms: number;
  server_cpu_ms: number;
  seed_status: unknown;
  seed_transaction_max_ms: number;
  status: unknown;
};
const rows: Cell[] = [];
const cases = ["16", "128", "flood32", "expiry", "eviction"];
const serverCPU = (pid: number) => {
  const r = spawnSync("ps", ["-p", String(pid), "-o", "time="], {
    encoding: "utf8",
  });
  assert.equal(r.status, 0);
  return (
    r.stdout
      .trim()
      .split(":")
      .reduce((n, v) => n * 60 + Number(v), 0) * 1000
  );
};
const batch = (run: string, n: number, offset: number) => {
  const a = modelBatch(run);
  return validateRecordingBatch({
    ...a,
    events: Array.from({ length: n }, (_, i) => ({
      ...a.events[0],
      sequence: offset + i + 1,
      monotonic_ms: offset + i + 1,
      name: "span.finished",
      stage: "ipc",
      duration_ms: 1,
      outcome: "completed",
    })),
  });
};
for (const scenario of cases)
  for (let pair = 0; pair < 10; pair++)
    for (const enabled of pair % 2 ? [true, false] : [false, true]) {
      const f = await diagnosticFixture(
          true,
          15,
          scenario === "expiry"
            ? [resolve(".scratch/bin/sqlite-clock-server")]
            : undefined,
        ),
        headers = {
          Authorization: "Bearer " + f.credential,
          "Content-Type": "application/json",
        },
        run = randomUUID(),
        read: number[] = [],
        write: number[] = [],
        ingest: number[] = [],
        failures: { producer: number; status: number; accepted: boolean }[] =
          [];
      const producerRuns = Array.from({ length: 32 }, () => randomUUID()),
        producerSequences = Array.from({ length: 32 }, () => 0);
      let sequence = 0,
        seedStatus: unknown = null,
        txMax = 0;
      try {
        if (scenario === "expiry" || scenario === "eviction") {
          const db = new RecordingDatabase(
            join(f.scratch, "diagnostic-recordings"),
          );
          try {
            for (let i = 0; i < 256; i++) {
              const receipt = db.ingest(batch(run, 128, i * 128), Date.now());
              assert.equal(receipt.accepted, true);
              if (receipt.status.bytes >= 30 * 1048576) break;
            }
            seedStatus = db.status();
            assert.ok(db.status().bytes >= 30 * 1048576);
            txMax = Math.max(...db.timings);
          } finally {
            db.close();
          }
          sequence = 256 * 128;
        }
        if (scenario === "expiry" && enabled)
          writeFileSync(join(f.scratch, "identity-clock-days"), "8");
        for (let i = 0; i < 3; i++) {
          const r = await fetch(f.url + "/profiles/work/tasks", { headers });
          assert.equal(r.status, 200);
          await r.text();
        }
        const serverCPUStart = serverCPU(f.server.pid ?? 0),
          loads = loadavg(),
          began = performance.now(),
          cpu = process.cpuUsage();
        for (let i = 0; i < iterations; i++) {
          const upload = async (producer: number) => {
            if (!enabled) return;
            if (scenario === "expiry") {
              const r = await fetch(f.url + "/diagnostics/profiler/runs", {
                headers,
              });
              assert.equal(r.status, 200);
              await r.json();
              return;
            }
            const n = scenario === "16" ? 16 : 128,
              value = batch(
                scenario === "flood32" ? (producerRuns[producer] ?? run) : run,
                n,
                scenario === "flood32"
                  ? (producerSequences[producer] ?? 0)
                  : sequence,
              );
            sequence += n;
            producerSequences[producer] =
              (producerSequences[producer] ?? 0) + n;
            const t = performance.now(),
              r = await fetch(f.url + "/diagnostics/profiler/ingest", {
                method: "POST",
                headers,
                body: JSON.stringify(value),
              });
            ingest.push(performance.now() - t);
            const body = await r.json();
            assert.ok([200, 500].includes(r.status));
            if (r.status === 200) assert.equal(body.accepted, true);
            failures.push({
              producer,
              status: r.status,
              accepted: r.status === 200,
            });
          };
          const producers = Array.from(
            { length: scenario === "flood32" ? 32 : 1 },
            (_, j) => upload(scenario === "flood32" ? (j + i * 7) % 32 : 0),
          );
          const w = performance.now(),
            title = `Recording load ${i}`,
            created = await fetch(f.url + "/profiles/work/tasks", {
              method: "POST",
              headers,
              body: JSON.stringify({ title, source: "manual" }),
            });
          assert.equal(created.status, 200);
          const task = await created.json();
          assert.equal(task.title, title);
          assert.equal(task.row_version, 1);
          write.push(performance.now() - w);
          const r0 = performance.now(),
            listed = await fetch(f.url + "/profiles/work/tasks", { headers });
          assert.equal(listed.status, 200);
          const tasks = await listed.json();
          assert.equal(tasks.length, 16 + i);
          assert.equal(
            tasks.filter((t: { title: string }) =>
              t.title.startsWith("Benchmark Task "),
            ).length,
            15,
          );
          read.push(performance.now() - r0);
          await Promise.all(producers);
        }
        if (scenario === "flood32" && enabled)
          assert.equal(new Set(failures.map((r) => r.producer)).size, 32);
        const status = await (
            await fetch(f.url + "/diagnostics/profiler/runs", { headers })
          ).json(),
          used = process.cpuUsage(cpu);
        if (scenario === "expiry" && enabled)
          assert.ok(status.status.loss.expired_events > 0);
        if (scenario === "eviction" && enabled)
          assert.ok(status.status.loss.capacity_events > 0);
        rows.push({
          scenario,
          pair,
          enabled,
          read_ms: read,
          write_ms: write,
          ingest_ms: ingest,
          producer_results: failures,
          load_start: loads,
          load_end: loadavg(),
          elapsed_ms: performance.now() - began,
          driver_cpu_ms: (used.user + used.system) / 1000,
          server_cpu_ms: serverCPU(f.server.pid ?? 0) - serverCPUStart,
          seed_status: seedStatus,
          seed_transaction_max_ms: txMax,
          status: status.status,
        });
        writeFileSync(
          join(evidence, "raw.json"),
          JSON.stringify(rows, null, 2),
        );
      } finally {
        await f.close();
      }
    }
const q = (v: number[], p: number) =>
  [...v].sort((a, b) => a - b)[Math.ceil(v.length * p) - 1] ?? 0;
const pairs = cases.flatMap((scenario) =>
  Array.from({ length: 10 }, (_, pair) => {
    const a = rows.find(
        (r) => r.scenario === scenario && r.pair === pair && !r.enabled,
      ),
      b = rows.find(
        (r) => r.scenario === scenario && r.pair === pair && r.enabled,
      );
    assert.ok(a && b);
    const x = a,
      y = b;
    return {
      scenario,
      pair,
      read_baseline_p50: q(x.read_ms, 0.5),
      read_enabled_p50: q(y.read_ms, 0.5),
      read_difference: q(y.read_ms, 0.5) - q(x.read_ms, 0.5),
      write_baseline_p50: q(x.write_ms, 0.5),
      write_enabled_p50: q(y.write_ms, 0.5),
      write_difference: q(y.write_ms, 0.5) - q(x.write_ms, 0.5),
      read_p99: q(y.read_ms, 0.99),
      write_p99: q(y.write_ms, 0.99),
      dropped: y.producer_results.filter((r) => !r.accepted).length,
    };
  }),
);
writeFileSync(
  join(evidence, "result.json"),
  JSON.stringify(
    {
      result: "PASS",
      requests_per_cell: iterations,
      condition:
        "ambient host, no imposed CPU pressure; ten alternating pairs per scenario; checked reads and writes per cell recorded separately",
      pairs,
    },
    null,
    2,
  ),
);

import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { mkdir, rename, readdir, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { loadavg } from "node:os";
import { diagnosticFixture } from "../../../../apps/server/scripts/diagnostic-fixture.ts";
import { validateRecordingBatch } from "../../../../packages/domain/src/diagnostic-recordings.ts";
import {
  encodeManifest,
  manifestName,
  splitBatch,
} from "../../../../packages/domain/src/store/recording-manifest.ts";
import { modelBatch } from "../../../../packages/domain/test/fixtures/recording-authority.ts";
const evidence = resolve(
  process.argv[2] ?? "docs/evidence/ui-speed/recordings-manifest/startup",
);
mkdirSync(evidence, { recursive: true });
const f = await diagnosticFixture(true, 15),
  journal = join(f.scratch, "diagnostic-recordings"),
  full = join(f.scratch, "journal-full"),
  light = join(f.scratch, "journal-light"),
  headers = { Authorization: "Bearer " + f.credential };
let child: ReturnType<typeof spawn> | undefined;
const rows: object[] = [];
const stop = async () => {
  if (child && child.exitCode === null && child.signalCode === null) {
    const ended = new Promise<void>((r) => child!.once("exit", () => r()));
    child.kill("SIGTERM");
    await ended;
  }
  child = undefined;
};
try {
  const ended = new Promise<void>((r) => f.server.once("exit", () => r()));
  f.server.kill("SIGTERM");
  await ended;
  const runIds: string[] = [];
  for (let n = 0; n < 5120; n++) {
    const seed = modelBatch(),
      app = ["macos", "electron", "cli", "server"][n % 4],
      role = app === "electron" ? "electron.renderer" : app,
      run = {
        ...seed.run,
        app,
        admission: {
          schema_version: 1,
          policy: "whole_batch",
          refused_batches: 1,
          unadmitted_events: 3,
          incomplete: true,
        },
      },
      value = validateRecordingBatch({ ...seed, run, events: [] });
    runIds.push(value.run.run_id);
    const parts =
      n < 4096
        ? splitBatch(
            validateRecordingBatch({
              ...value,
              batch_id: randomUUID(),
              events: Array.from({ length: 8 }, (_, i) => ({
                ...seed.events[0],
                process_role: role,
                sequence: i + 1,
                monotonic_ms: i + 1,
                name: "span.finished",
                stage: "ipc",
                duration_ms: 1,
                outcome: "completed",
              })),
            }),
            Date.now(),
          )
        : [];
    for (const p of parts)
      await writeFile(
        join(
          journal,
          `${String(p.segment.time).padStart(13, "0")}-${p.segment.id}.json`,
        ),
        p.text,
        { mode: 0o600 },
      );
    await writeFile(
      join(journal, manifestName(value.run.run_id)),
      encodeManifest({
        version: 2,
        updated_at: Date.now(),
        run: value.run,
        segments: parts.map((p) => p.segment),
        loss: { capacity_events: 0, expired_events: 0, corrupt_events: 0 },
      }),
      { mode: 0o600 },
    );
  }
  const names = await readdir(journal);
  let allocated = 0;
  for (const name of names)
    allocated += (await stat(join(journal, name))).blocks * 512;
  await rename(journal, full);
  await mkdir(light);
  for (let pair = 0; pair < 5; pair++)
    for (const mode of pair % 2 ? ["full", "light"] : ["light", "full"]) {
      const parked = mode === "full" ? full : light;
      await rename(parked, journal);
      let log = "";
      const loads = loadavg(),
        cpu = process.cpuUsage(),
        began = performance.now();
      try {
        child = spawn(resolve(".scratch/bin/todo-server"), [], {
          env: f.env,
          stdio: ["ignore", "pipe", "pipe"],
        });
        child.stdout!.on("data", (x) => (log += x));
        child.stderr!.on("data", (x) => (log += x));
        let url = "";
        const deadline = Date.now() + 60000;
        while (!url && Date.now() < deadline) {
          assert.equal(child.exitCode, null, log);
          url =
            log.match(/Listening on (http:\/\/127\.0\.0\.1:\d+)/)?.[1] ?? "";
          if (!url) await Bun.sleep(5);
        }
        assert.ok(url, log);
        const ready = performance.now() - began,
          times: number[] = [];
        for (let n = 0; n < 10; n++) {
          const before = performance.now(),
            response = await fetch(url + "/profiles/work/tasks", { headers });
          assert.equal(response.status, 200);
          assert.deepEqual(
            (await response.json())
              .map((t: { title: string }) => t.title)
              .sort(),
            Array.from(
              { length: 15 },
              (_, i) => "Benchmark Task " + String(i).padStart(3, "0"),
            ),
          );
          times.push(performance.now() - before);
        }
        const q = performance.now(),
          response = await fetch(url + "/diagnostics/profiler/runs", {
            headers,
          });
        assert.equal(response.status, 200);
        const status = (await response.json()).status;
        assert.equal(status.segments, mode === "full" ? 4096 : 0);
        assert.equal(status.admission_bytes, mode === "full" ? 5120 * 4096 : 0);
        assert.equal(status.loss.storage_failures, 0);
        const usage = process.cpuUsage(cpu);
        rows.push({
          pair,
          mode,
          listening_ms: ready,
          recording_query_ms: performance.now() - q,
          recovery_through_query_ms: performance.now() - began,
          task_ms: times,
          status,
          load_start: loads,
          load_end: loadavg(),
          driver_cpu_ms: (usage.user + usage.system) / 1000,
          server_cpu_rss: spawnSync(
            "ps",
            ["-p", String(child.pid), "-o", "cputime=,rss="],
            { encoding: "utf8" },
          ).stdout.trim(),
        });
        writeFileSync(
          join(evidence, "result.json"),
          JSON.stringify(
            {
              result: "RUNNING",
              allocated_bytes: allocated,
              files: names.length,
              rows,
            },
            null,
            2,
          ),
        );
      } finally {
        await stop();
        await rename(journal, parked);
      }
    }
  await rename(full, journal);
  let log = "";
  child = spawn(resolve(".scratch/bin/manifest-startup-server"), [], {
    env: f.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout!.on("data", (x) => (log += x));
  child.stderr!.on("data", (x) => (log += x));
  let url = "";
  const deadline = Date.now() + 60000;
  while (
    (!url || !existsSync(join(f.scratch, "manifest-recovery-held"))) &&
    Date.now() < deadline
  ) {
    assert.equal(child.exitCode, null, log);
    url = log.match(/Listening on (http:\/\/127\.0\.0\.1:\d+)/)?.[1] ?? "";
    await Bun.sleep(10);
  }
  assert.ok(url);
  assert.ok(existsSync(join(f.scratch, "manifest-recovery-held")));
  const held = await fetch(url + "/profiles/work/tasks", { headers });
  assert.equal(held.status, 200);
  assert.equal((await held.json()).length, 15);
  writeFileSync(join(f.scratch, "manifest-recovery-release"), "release");
  const check = await fetch(url + "/diagnostics/profiler/runs", { headers });
  assert.equal(check.status, 200);
  assert.equal((await check.json()).status.segments, 4096);
  await stop();
  writeFileSync(
    join(evidence, "result.json"),
    JSON.stringify(
      {
        result: "PASS",
        allocated_bytes: allocated,
        files: names.length,
        runs: 5120,
        segments: 4096,
        held_recovery_task_read: true,
        rows,
      },
      null,
      2,
    ),
  );
} finally {
  writeFileSync(join(f.scratch, "manifest-recovery-release"), "release");
  await stop();
  await f.close();
}

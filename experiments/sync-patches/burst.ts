import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createInterface } from "node:readline";
import { join, resolve } from "node:path";
import { writeFileSync, statSync } from "node:fs";
import { Effect } from "effect";
import { baseline, database } from "./baseline.ts";
import { stats } from "./stats.ts";
import type { openCase } from "./driver.ts";
type Case = Awaited<ReturnType<typeof openCase>>;
export async function burst(c: Case) {
  const path = join(c.directory, "scratch.db"),
    configuration = join(c.directory, "observer.json");
  writeFileSync(
    configuration,
    JSON.stringify({
      arm: c.observer.arm,
      writer_only: true,
      profile: "p0",
      at: c.observer.at,
      path,
    }),
  );
  const env = {
    ...process.env,
    HOME: join(c.directory, "home"),
    SYNC_EXPERIMENT_WAL_ZERO: "1",
    SYNC_EXPERIMENT_CONFIG: c.observer.arm === "stored" ? configuration : "",
  };
  const actualCli = [];
  for (let i = 0; i < 5; i++) {
    const row = database(c.store)
      .query<{ row_version: number }, []>(
        "SELECT row_version FROM tasks WHERE id='p0-t040'",
      )
      .get();
    assert.ok(row);
    const t = performance.now(),
      r = spawnSync(
        resolve(".scratch/sync-patches/bin/cli"),
        [
          "--db",
          path,
          "--profile",
          "p0",
          "--format",
          "json",
          "edit",
          "p0-t040",
          "--expected-version",
          String(row.row_version),
          "--title",
          "actual CLI " + i,
        ],
        { env, encoding: "utf8" },
      );
    assert.equal(r.status, 0, r.stderr + r.stdout);
    actualCli.push(performance.now() - t);
    c.observer.poll();
    assert.deepEqual(
      c.observer.replica,
      baseline(c.store, "p0", c.observer.at),
    );
  }
  const child = spawn(
      resolve(".scratch/sync-patches/bin/writer"),
      [path, c.config.credential],
      { env, stdio: ["pipe", "pipe", "inherit"] },
    ),
    lines = createInterface({ input: child.stdout })[Symbol.asyncIterator]();
  assert.equal(JSON.parse((await lines.next()).value ?? "{}").ready, true);
  const reads: number[] = [],
    busy: number[] = [],
    count = c.observer.metrics.filter((r) => r.stage === "patch").length;
  let polls = 0;
  const timer = setInterval(() => {
    const t = performance.now();
    c.observer.poll();
    busy.push(performance.now() - t);
    polls++;
    const r = performance.now();
    const row = database(c.store)
      .query("SELECT payload FROM tasks WHERE id='p0-t040'")
      .get();
    assert.ok(row);
    reads.push(performance.now() - r);
  }, 20);
  const cpu = process.cpuUsage(),
    t = performance.now(),
    wal = () => statSync(path + "-wal").size,
    before = wal();
  child.stdin.write("300\n");
  const commits = JSON.parse((await lines.next()).value ?? "{}").commits;
  assert.equal(commits.length, 300);
  c.observer.poll();
  clearInterval(timer);
  assert.deepEqual(c.observer.replica, baseline(c.store, "p0", c.observer.at));
  const usage = process.cpuUsage(cpu),
    result = {
      arm: c.observer.arm,
      writer_only: true,
      total_ms: performance.now() - t,
      server_cpu_ms: (usage.user + usage.system) / 1000,
      patches:
        c.observer.metrics.filter((r) => r.stage === "patch").length - count,
      patch_bytes: c.observer.metrics
        .filter((r) => r.stage === "patch")
        .slice(count)
        .map((r) => r.bytes),
      wal_bytes: wal() - before,
      task_read_ms: stats(reads),
      busy_ms: stats(busy),
      polls,
      ring: c.observer.memory(),
      actual_cli_ms: stats(actualCli),
    };
  child.stdin.end();
  await new Promise<void>((r, j) =>
    child.on("exit", (code) => (code === 0 ? r() : j(Error("writer " + code)))),
  );
  return result;
}

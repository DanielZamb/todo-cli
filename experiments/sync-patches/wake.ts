import assert from "node:assert/strict";
import {
  mkdtempSync,
  copyFileSync,
  readFileSync,
  mkdirSync,
  rmSync,
  writeFileSync,
  watch,
} from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir, loadavg } from "node:os";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { Effect } from "effect";
import { openStore } from "../../packages/domain/src/store/store.ts";
import { baseline, database, sequence } from "./baseline.ts";
import { difference, applyPatch } from "./patch.ts";
const config = JSON.parse(
  readFileSync(".scratch/sync-patches/owner/fixture.json", "utf8"),
);
const stamp = () => performance.timeOrigin + performance.now(),
  sleep = (n: number) => new Promise((r) => setTimeout(r, n));
const results = [];
for (let pair = 0; pair < 5; pair++)
  for (const arm of pair % 2
    ? ["hint", "wal", "data10", "data20", "data50", "poll250"]
    : ["poll250", "data50", "data20", "data10", "wal", "hint"]) {
    const dir = mkdtempSync(join(tmpdir(), "todo-sync-wake-")),
      path = join(dir, "scratch.db");
    copyFileSync(config.path, path);
    const store = await Effect.runPromise(openStore({ path })),
      db = database(store);
    db.exec("PRAGMA wal_autocheckpoint=0");
    let replica = baseline(store, "p0", config.at),
      applied = 0,
      checks = 0,
      wakes = 0;
    const deliveries: number[] = [],
      compute: number[] = [];
    const check = () => {
      checks++;
      if (sequence(db) === applied) return;
      const t = performance.now(),
        next = baseline(store, "p0", config.at);
      if (next.cursor === replica.cursor) return;
      const patch = difference(replica, next, "whole");
      replica = applyPatch(replica, patch);
      assert.deepEqual(replica, next);
      applied = Number(next.cursor.split(":").at(-2));
      compute.push(performance.now() - t);
      deliveries.push(stamp());
    };
    applied = sequence(db);
    const period =
      arm === "poll250"
        ? 250
        : arm.startsWith("data")
          ? Number(arm.slice(4))
          : 1000;
    let version = db
      .query<{ data_version: number }, []>("PRAGMA data_version")
      .get()?.data_version;
    const timer = setInterval(() => {
      wakes++;
      if (arm.startsWith("data")) {
        checks++;
        const v = db
          .query<{ data_version: number }, []>("PRAGMA data_version")
          .get()?.data_version;
        if (v === version) return;
        version = v;
      }
      check();
    }, period);
    const watcher =
      arm === "wal"
        ? watch(path + "-wal", () => {
            wakes++;
            check();
          })
        : undefined;
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch() {
        wakes++;
        check();
        return new Response("ok");
      },
    });
    const child = spawn(
        resolve(".scratch/sync-patches/bin/writer"),
        [path, config.credential],
        {
          stdio: ["pipe", "pipe", "inherit"],
          env: { ...process.env, HOME: dir },
        },
      ),
      lines = createInterface({ input: child.stdout })[Symbol.asyncIterator]();
    assert.equal(JSON.parse((await lines.next()).value ?? "{}").ready, true);
    const latencies = [],
      load = loadavg();
    for (let i = 0; i < 20; i++) {
      await sleep(7 + ((i * 137 + pair * 61) % 251));
      const n = deliveries.length;
      child.stdin.write("1\n");
      const commits = JSON.parse((await lines.next()).value ?? "{}").commits;
      if (arm === "hint") await fetch(server.url);
      const deadline = Date.now() + 2000;
      while (deliveries.length === n && Date.now() < deadline) await sleep(1);
      assert.ok(deliveries.length > n, arm);
      latencies.push((deliveries.at(-1) ?? 0) - commits[0]);
    }
    const idle = [];
    for (const subscribers of [1, 2, 5]) {
      const c = process.cpuUsage(),
        w = wakes,
        k = checks,
        t = performance.now();
      await sleep(500);
      const cpu = process.cpuUsage(c);
      idle.push({
        subscribers,
        ms: performance.now() - t,
        cpu_ms: (cpu.user + cpu.system) / 1000,
        wakes: wakes - w,
        checks: checks - k,
        shared_observer: true,
      });
    }
    const n = deliveries.length,
      t = performance.now();
    child.stdin.write("300\n");
    const burst = JSON.parse((await lines.next()).value ?? "{}").commits;
    if (arm === "hint") await fetch(server.url);
    while (
      (Number(replica.cursor.split(":").at(-2)) < sequence(db) ||
        deliveries.length === n) &&
      performance.now() - t < 5000
    )
      await sleep(2);
    assert.deepEqual(replica, baseline(store, "p0", config.at));
    const burstResult = {
      commits: burst.length,
      patches: deliveries.length - n,
      total_ms: performance.now() - t,
      last_commit_to_apply_ms: (deliveries.at(-1) ?? 0) - burst.at(-1),
    };
    const before = deliveries.length;
    child.stdin.write("1\n");
    const missed = JSON.parse((await lines.next()).value ?? "{}").commits[0];
    while (deliveries.length === before) await sleep(2);
    const missedMs = (deliveries.at(-1) ?? 0) - missed;
    const duplicate = deliveries.length;
    check();
    check();
    assert.equal(deliveries.length, duplicate);
    db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
    child.stdin.end();
    await new Promise<void>((r, j) =>
      child.on("exit", (code) =>
        code === 0 ? r() : j(Error("writer " + code)),
      ),
    );
    clearInterval(timer);
    watcher?.close();
    server.stop(true);
    await Effect.runPromise(store.close());
    rmSync(dir, { recursive: true, force: true });
    results.push({
      pair,
      arm,
      load,
      latencies,
      compute,
      idle,
      burst: burstResult,
      missed_ms: missedMs,
      duplicate_ok: true,
    });
    console.log("wake", pair, arm);
  }
mkdirSync("docs/evidence/sync-experiment", { recursive: true });
writeFileSync(
  "docs/evidence/sync-experiment/wake.json",
  JSON.stringify(results, null, 2),
);

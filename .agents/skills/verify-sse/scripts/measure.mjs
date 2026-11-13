import { Database } from "bun:sqlite";
import { now } from "./host-clock.mjs";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir, loadavg, cpus } from "node:os";
import { join, resolve } from "node:path";
import { openStore, TaskCommands } from "../../../../packages/domain/src/store/store.ts";
import { Effect } from "effect";

const [before, after, destination] = process.argv.slice(2).map((path) => resolve(path));
mkdirSync(destination, { recursive: true });
const rows = [];
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const quantiles = (values) => {
  const sorted = values.toSorted((a, b) => a - b);
  return Object.fromEntries([50, 90, 99, 100].map((p) => [`p${p}`, sorted[Math.ceil(sorted.length * p / 100) - 1]]));
};
for (let pair = 0; pair < 5; pair++) {
  for (const arm of pair % 2 ? ["after", "before"] : ["before", "after"]) {
    const scratch = mkdtempSync(join(tmpdir(), "todo-stream-meter-"));
    const path = join(scratch, "scratch.db");
    const store = await Effect.runPromise(openStore({ path }));
    let child;
    const controllers = [];
    try {
      await Effect.runPromise(store.auth.setupOwner("stream measurement passphrase"));
      await Effect.runPromise(store.ensureProfile({ id: "work", name: "work", created_at: "2026-11-01T00:00:00Z", updated_at: "2026-11-01T00:00:00Z" }));
      for (let i = 0; i < 7; i++) await Effect.runPromise(store.ensureProfile({ id: `empty-${i}`, name: `empty-${i}`, created_at: "2026-11-01T00:00:00Z", updated_at: "2026-11-01T00:00:00Z" }));
      const { credential } = await Effect.runPromise(store.auth.signIn("stream measurement passphrase"));
      const commands = new TaskCommands(store);
      let target;
      for (let i = 0; i < 178; i++) {
        const result = await Effect.runPromise(commands.create({ credential, profile: "work" }, { title: `Measurement Task ${i}`, description: "Synthetic planning notes. ".repeat(i === 177 ? 210 : 51), tag_names: [`Tag ${i % 39}`], attachments: i < 108 ? [{ kind: "link", url: `https://example.test/tasks/${i}` }] : [], project_name: `Project ${i % 5}`, priority: ["P1", "P2", "P3", "P4"][i % 4] }));
        if (result.outcome !== "committed") throw new Error(`Fixture creation failed: ${JSON.stringify(result)}`);
        if (i === 0) target = result.task;
        if (i >= 50) await Effect.runPromise(commands.transition({ credential, profile: "work", task_id: result.task.id }, { from_version: 1, action: i < 176 ? "complete" : "cancel" }));
      }
      await Effect.runPromise(store.snapshots.runDaily());
      const commits = new Map();
      const events = new Map();
      const stats = [];
      let base;
      let output = "";
      let pending = "";
      const home = join(scratch, "home"); mkdirSync(home);
      child = Bun.spawn([arm === "before" ? before : after], { env: { ...process.env, HOME: home, TODO_DB: path, TODO_PORT: "0" }, stdin: "pipe", stdout: "pipe", stderr: "pipe" });
      const readOutput = async (source) => {
        for await (const bytes of source) {
          const chunk = new TextDecoder().decode(bytes);
          output += chunk;
          const match = output.match(/Listening on (http:\/\/127\.0\.0\.1:\d+)/);
          if (match) base = match[1];
          pending += chunk;
          let boundary;
          while ((boundary = pending.indexOf("\n")) >= 0) {
            const line = pending.slice(0, boundary); pending = pending.slice(boundary + 1);
            if (line.startsWith("METER ")) {
              const value = JSON.parse(line.slice(6));
              if (value.committed !== undefined) commits.set(value.seq, value.committed);
              else stats.push(value);
            }
          }
        }
      };
      const reader = readOutput(child.stdout);
      const errors = new Response(child.stderr).text();
      for (let i = 0; !base && i < 600; i++) await delay(100);
      if (!base) throw new Error(`Server readiness failed: ${output} ${await errors}`);
      const send = async (method, route, body) => {
        const response = await fetch(base + route, { method, headers: { Authorization: `Bearer ${credential}`, "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
        if (!response.ok) throw new Error(`HTTP ${response.status}: ${await response.text()}`);
        return response.json();
      };
      const sample = async () => {
        const length = stats.length; const started = now(); child.stdin.write("stats\n");
        for (let i = 0; stats.length === length && i < 1000; i++) await delay(1);
        if (!stats[length]) throw new Error("Missing meter sample");
        if (!(started <= stats[length].sampledAt && stats[length].sampledAt <= now())) throw new Error("Meter sample is not on the shared host clock");
        return stats[length];
      };
      const db = new Database(path, { readonly: true });
      let cursor = db.query("SELECT max(seq) AS n FROM op_log").get().n;
      const streamTasks = [];
      const connect = async () => {
        const controller = new AbortController(); controllers.push(controller);
        const response = await fetch(`${base}/profiles/work/events`, { signal: controller.signal, headers: { Authorization: `Bearer ${credential}`, "Last-Event-ID": String(cursor) } });
        if (!response.ok) throw new Error(`SSE ${response.status}`);
        let ready = false;
        streamTasks.push((async () => {
          let text = "";
          try {
            for await (const chunk of response.body) {
              text += new TextDecoder().decode(chunk);
              let boundary;
              while ((boundary = text.indexOf("\n\n")) >= 0) {
                const frame = text.slice(0, boundary); text = text.slice(boundary + 2);
                if (frame.includes("event: ready")) ready = true;
                const id = frame.match(/^id: (\d+)/m);
                if (id && !events.has(Number(id[1]))) events.set(Number(id[1]), now());
              }
            }
          } catch (error) { if (!controller.signal.aborted) throw error; }
        })());
        while (!ready) await delay(1);
      };
      const waitEvent = async (seq) => {
        for (let i = 0; !events.has(seq) && i < 10000; i++) await delay(1);
        if (!events.has(seq) || !commits.has(seq)) throw new Error(`Missing commit/event ${seq}`);
        const elapsed = events.get(seq) - commits.get(seq);
        if (elapsed < 0) throw new Error(`Negative commit-to-event interval for ${seq}`);
        return elapsed;
      };
      const idle = [];
      for (const count of [1, 2, 5]) {
        while (controllers.length < count) await connect();
        await delay(300);
        const start = await sample(); const t = now(); await delay(2000); const end = await sample();
        idle.push({ streams: count, seconds: (now() - t) / 1000, historyReads: end.historyReads - start.historyReads, passes: end.passes - start.passes, cpuMs: (end.cpu.user + end.cpu.system - start.cpu.user - start.cpu.system) / 1000 });
      }
      while (controllers.length > 1) controllers.pop().abort();
      await delay(300);
      const latency = [];
      const replyLatency = [];
      let eventFirst = 0;
      const load = loadavg();
      for (let i = 0; i < 40; i++) {
        await delay((i * 73 + pair * 31) % 251);
        const begin = now();
        target = await send("PATCH", `/profiles/work/tasks/${target.id}`, { from_version: target.row_version, changes: { title: `Latency ${pair} ${i}` } });
        const reply = now();
        const seq = db.query("SELECT max(seq) AS n FROM op_log WHERE profile='work'").get().n;
        latency.push(await waitEvent(seq)); replyLatency.push(reply - begin);
        if (events.get(seq) < reply) eventFirst++;
      }
      const start = await sample(); const t = now(); const readLatency = [];
      let seq;
      for (let i = 0; i < 300; i++) {
        target = await send("PATCH", `/profiles/work/tasks/${target.id}`, { from_version: target.row_version, changes: { title: `Burst ${i}` } });
        if (i % 10 === 0) { const readStart = now(); const read = await send("GET", `/profiles/work/tasks/${target.id}`); if (read.title !== `Burst ${i}`) throw new Error("Read mismatch"); readLatency.push(now() - readStart); }
      }
      seq = db.query("SELECT max(seq) AS n FROM op_log WHERE profile='work'").get().n;
      await waitEvent(seq); const end = await sample();
      const burst = { edits: 300, elapsedMs: now() - t, historyReads: end.historyReads - start.historyReads, passes: end.passes - start.passes, cpuMs: (end.cpu.user + end.cpu.system - start.cpu.user - start.cpu.system) / 1000, taskRead: quantiles(readLatency) };
      rows.push({ pair, arm, load, loadAfter: loadavg(), latency: quantiles(latency), samples: latency, replyLatency: quantiles(replyLatency), eventFirst, idle, burst, errors: 0, tasks: db.query("SELECT count(*) AS n FROM tasks").get().n });
      db.close();
      writeFileSync(join(destination, "result.json"), JSON.stringify({ clock: "clock_gettime_nsec_np(CLOCK_MONOTONIC_RAW)", cores: cpus().length, rows }, null, 2));
      writeFileSync(join(destination, `${pair}-${arm}.log`), output);
      process.stdout.write(`${pair} ${arm} ${JSON.stringify(rows.at(-1).latency)}\n`);
      for (const controller of controllers) controller.abort();
      await Promise.all(streamTasks);
      child.kill("SIGTERM"); await child.exited; await reader; await errors;
    } finally {
      for (const controller of controllers) controller.abort();
      if (child && child.exitCode === null) { child.kill("SIGTERM"); await child.exited; }
      await Effect.runPromise(store.close()); rmSync(scratch, { recursive: true, force: true });
    }
  }
}

import assert from "node:assert/strict";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { loadavg, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Effect } from "effect";
import { openStore, TaskCommands } from "../../../../packages/domain/src/store/store.ts";
import { now } from "./host-clock.mjs";

const [before, after, destination] = process.argv.slice(2).map((path) => resolve(path));
mkdirSync(destination, { recursive: false });
const scratch = mkdtempSync(join(tmpdir(), "todo-wake-idle-"));
const run = Effect.runPromise;
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const until = async (predicate) => {
  const deadline = now() + 60000;
  while (!predicate()) { assert.ok(now() < deadline, "Idle meter timed out"); await delay(5); }
};
const rows = [];
let store;
try {
  const template = join(scratch, "template.db");
  store = await run(openStore({ path: template }));
  await run(store.auth.setupOwner("idle measurement passphrase"));
  await run(store.ensureProfile({ id: "work", name: "work", created_at: "2026-11-01T00:00:00Z", updated_at: "2026-11-01T00:00:00Z" }));
  const { credential } = await run(store.auth.signIn("idle measurement passphrase"));
  const commands = new TaskCommands(store);
  for (let i = 0; i < 178; i++) {
    const result = await run(commands.create({ credential, profile: "work" }, { title: `Idle Task ${i}`, description: "Synthetic planning notes. ".repeat(51), tag_names: [`Tag ${i % 39}`], project_name: `Project ${i % 5}`, attachments: i < 108 ? [{ kind: "link", url: `https://example.test/tasks/${i}` }] : [] }));
    assert.equal(result.outcome, "committed");
  }
  const cursor = (await run(store.history())).at(-1).seq;
  await run(store.close()); store = undefined;
  for (let pair = 0; pair < 5; pair++) for (const arm of pair % 2 ? ["after", "before"] : ["before", "after"]) {
    const directory = join(scratch, `${pair}-${arm}`); mkdirSync(directory);
    const path = join(directory, "scratch.db"); copyFileSync(template, path);
    const child = Bun.spawn([arm === "before" ? before : after], { env: { ...process.env, HOME: directory, TODO_DB: path, TODO_PORT: "0" }, stdin: "pipe", stdout: "pipe", stderr: "pipe" });
    const controllers = [];
    const streams = [];
    const stats = [];
    let output = "";
    let pending = "";
    let base;
    const reading = (async () => {
      for await (const bytes of child.stdout) {
        const chunk = new TextDecoder().decode(bytes); output += chunk; pending += chunk;
        base = output.match(/Listening on (http:\/\/127\.0\.0\.1:\d+)/)?.[1];
        let end;
        while ((end = pending.indexOf("\n")) >= 0) {
          const line = pending.slice(0, end); pending = pending.slice(end + 1);
          if (line.startsWith("METER ")) { const value = JSON.parse(line.slice(6)); if (value.cpu) stats.push(value); }
        }
      }
    })();
    const errors = new Response(child.stderr).text();
    try {
      await until(() => base || child.exitCode !== null); assert.ok(base, output);
      const sample = async () => {
        const index = stats.length; const start = now(); child.stdin.write("stats\n");
        await until(() => stats.length > index);
        const value = stats[index]; assert.ok(start <= value.sampledAt && value.sampledAt <= now(), "Host clock bracket"); return value;
      };
      for (const count of [1, 2, 5]) {
        while (controllers.length < count) {
          const controller = new AbortController(); controllers.push(controller);
          const response = await fetch(`${base}/profiles/work/events`, { signal: controller.signal, headers: { Authorization: `Bearer ${credential}`, "Last-Event-ID": String(cursor) } });
          assert.equal(response.status, 200);
          let ready = false;
          streams.push((async () => {
            let text = "";
            try { for await (const bytes of response.body) { text += new TextDecoder().decode(bytes); if (text.includes("event: ready")) ready = true; assert.ok(!text.includes("event: operation"), "Unexpected idle operation"); } }
            catch (error) { if (!controller.signal.aborted) throw error; }
          })());
          await until(() => ready);
        }
        await delay(300);
        const load = loadavg(); const start = await sample(); await delay(2000); const end = await sample();
        const seconds = (end.sampledAt - start.sampledAt) / 1000;
        rows.push({ pair, arm, streams: count, seconds, cpuMs: (end.cpu.user + end.cpu.system - start.cpu.user - start.cpu.system) / 1000, passes: end.passes - start.passes, historyReads: end.historyReads - start.historyReads, queryCalls: end.queryCalls - start.queryCalls, stateChecks: end.stateChecks - start.stateChecks, load });
        writeFileSync(join(destination, "result.json"), JSON.stringify({ clock: "clock_gettime_nsec_np(CLOCK_MONOTONIC_RAW)", fixtureTasks: 178, rows }, null, 2));
      }
      console.log(`PASS idle pair ${pair} ${arm}`);
    } finally {
      for (const controller of controllers) controller.abort();
      await Promise.all(streams);
      if (child.exitCode === null) { child.kill("SIGTERM"); await child.exited; }
      await reading; const stderr = await errors;
      writeFileSync(join(destination, `${pair}-${arm}.log`), output + stderr);
    }
  }
} finally {
  if (store) await run(store.close());
  rmSync(scratch, { recursive: true, force: true });
}

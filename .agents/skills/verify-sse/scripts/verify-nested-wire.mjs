import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Effect, Schema } from "effect";
import { Profile, ZonedInstant } from "../../../../packages/domain/src/index.ts";
import { openStore, TaskCommands } from "../../../../packages/domain/src/store/store.ts";
import { compositionLeaves, compositionPaths } from "../../../../apps/server/test/fixtures/stream-wake-compositions.ts";

const root = resolve(import.meta.dirname, "../../../..");
const evidence = resolve(process.argv[2]);
const storeSource = process.argv[3];
const boundary = process.argv[4] ?? "mutate";
mkdirSync(evidence, { recursive: false });
const scratch = mkdtempSync(join(tmpdir(), "todo-nested-wire-"));
const run = Effect.runPromise;
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const until = async (predicate) => {
  for (let i = 0; i < 1200; i++) { if (predicate()) return; await delay(50); }
  throw new Error("Timed out waiting for compiled nested-wire proof");
};
const frames = [];
let child;
let streamReader;
const controller = new AbortController();
let output = "";
let stderr = "";
let reading;
let readingError;
let raw;
try {
  const build = await Bun.build({
    entrypoints: [join(import.meta.dirname, "nested-wire-server.mjs")],
    target: "bun", compile: { outfile: join(scratch, "server") },
    plugins: [{ name: "internal-write-composition", setup(build) {
      build.onLoad({ filter: /apps\/server\/src\/server\.ts$/ }, (args) => {
        let source = readFileSync(args.path, "utf8");
        const store = "const store = streamWakeStore(rawStore, wake);";
        const scheduler = "yield* scheduler(store).pipe(Effect.forkScoped);";
        assert.equal(source.split(store).length, 2);
        assert.equal(source.split(scheduler).length, 2);
        source = source.replace(store, `${store} globalThis.streamWakeProbeStore = store; globalThis.streamWakeProbeWake = wake;`).replace(scheduler, "yield* Effect.void;");
        return { contents: source, loader: "ts" };
      });
      if (storeSource) build.onLoad({ filter: /apps\/server\/src\/stream-wake-store\.ts$/ }, () => ({ contents: readFileSync(storeSource, "utf8"), loader: "ts" }));
    } }],
  });
  assert.equal(build.success, true, String(build.logs));
  raw = await run(openStore({ path: join(scratch, "scratch.db") }));
  await run(raw.auth.setupOwner("nested wire test passphrase"));
  const profile = Schema.decodeUnknownSync(Profile)({ id: "work", name: "work", created_at: "2026-11-01T00:00:00Z", updated_at: "2026-11-01T00:00:00Z" });
  await run(raw.putProfile(profile));
  const { credential } = await run(raw.auth.signIn("nested wire test passphrase"));
  const request = { credential, profile: profile.id };
  const commands = new TaskCommands(raw);
  const task = await run(commands.create(request, { title: "Reminder inside rollback" }));
  assert.equal(task.outcome, "committed");
  const due = Schema.decodeUnknownSync(ZonedInstant)({ kind: "instant", utc: new Date(Date.now() - 1000).toISOString(), time_zone: "UTC" });
  await run(commands.edit({ ...request, task_id: task.task.id }, { from_version: 1, changes: { due_at: due } }));
  assert.equal((await run(raw.history())).at(-1).seq, 4);
  mkdirSync(join(scratch, "home"));
  child = Bun.spawn([join(scratch, "server")], { cwd: root, env: { ...process.env, HOME: join(scratch, "home"), TODO_DB: join(scratch, "scratch.db"), TODO_PORT: "0" }, stdin: "pipe", stdout: "pipe", stderr: "pipe" });
  reading = (async () => { for await (const chunk of child.stdout) output += new TextDecoder().decode(chunk); })();
  readingError = (async () => { for await (const chunk of child.stderr) stderr += new TextDecoder().decode(chunk); })();
  await until(() => output.includes("Listening on http://127.0.0.1:"));
  const base = output.match(/Listening on (http:\/\/127\.0\.0\.1:\d+)/)[1];
  const response = await fetch(`${base}/profiles/work/events`, { signal: controller.signal, headers: { Authorization: `Bearer ${credential}`, "Last-Event-ID": "4" } });
  assert.equal(response.status, 200);
  streamReader = (async () => {
    let pending = "";
    try {
      for await (const chunk of response.body) {
        pending += new TextDecoder().decode(chunk);
        let end;
        while ((end = pending.indexOf("\n\n")) >= 0) {
          const fields = Object.fromEntries(pending.slice(0, end).split("\n").map((line) => { const colon = line.indexOf(":"); return [line.slice(0, colon), line.slice(colon + 1).trimStart()]; }));
          frames.push({ ...fields, data: JSON.parse(fields.data) }); pending = pending.slice(end + 2);
        }
      }
    } catch (error) { if (!controller.signal.aborted) throw error; }
  })();
  await until(() => frames.some((frame) => frame.event === "ready"));
  if (boundary === "matrix") {
    const rows = [];
    let index = 0;
    const send = async (method, route, body) => {
      const reply = await fetch(base + route, { method, headers: { Authorization: `Bearer ${credential}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
      assert.equal(reply.status, 200); return reply.json();
    };
    for (const path of compositionPaths) for (const rollback of [false, true]) for (const leaf of compositionLeaves) {
      const target = (await run(raw.tasks())).find((value) => value.id === task.task.id);
      await send("PATCH", `/profiles/work/tasks/${target.id}`, { from_version: target.row_version, changes: { due_at: { kind: "instant", utc: new Date(Date.now() - 10000 - index * 1000).toISOString(), time_zone: "UTC" } } });
      const cursor = (await run(raw.history())).at(-1).seq;
      await until(() => frames.some((frame) => frame.event === "operation" && frame.data.seq === cursor));
      const controls = () => output.split("\n").filter((line) => line.startsWith("CONTROL "));
      const previous = controls().length;
      child.stdin.write(`${JSON.stringify({ credential, path, rollback, leaf: leaf.name })}\n`);
      await until(() => controls().length > previous);
      const control = controls().at(-1);
      const observation = JSON.parse(control.slice(control.indexOf("{")));
      const successor = await send("POST", "/profiles/work/tasks", { title: "Durable successor" });
      const witness = await send("POST", "/profiles/work/tasks", { title: "Next cursor witness" });
      await until(() => frames.some((frame) => frame.event === "operation" && frame.data.event.kind === "TaskCreated" && frame.data.event.task.id === witness.id));
      const durable = (await run(raw.history(cursor))).filter((entry) => entry.outcome === "committed" && entry.profile === "work");
      const operations = frames.filter((frame) => frame.event === "operation" && frame.data.seq > cursor);
      const received = operations.map((frame) => frame.data);
      const kinds = rollback ? ["TaskCreated", "TaskCreated"] : ["ReminderFired", "TaskCreated", "TaskCreated"];
      rows.push({ index, path, leaf: leaf.name, rollback, cursor, control, durable: durable.map((entry) => [entry.seq, entry.event.kind]), received: received.map((entry) => [entry.seq, entry.event.kind]), passed: observation.checks.every((value) => value === 0) && observation.after === observation.before + 1 && JSON.stringify(received) === JSON.stringify(durable) });
      writeFileSync(join(evidence, "result.json"), JSON.stringify({ cases: rows.length, leaves: compositionLeaves.map((leaf) => leaf.name), paths: compositionPaths, rows }, null, 2));
      assert.equal(control.startsWith(`CONTROL ${rollback ? "Failure" : "Success"}`), true, JSON.stringify(rows.at(-1)));
      assert.deepEqual(observation.checks, Array(path.length + 2).fill(0), JSON.stringify(rows.at(-1)));
      assert.equal(observation.after, observation.before + 1);
      assert.deepEqual(durable.map((entry) => entry.event.kind), kinds);
      assert.deepEqual(received.map((entry) => entry.event.kind), kinds, JSON.stringify(rows.at(-1)));
      if (rollback) assert.deepEqual(received.map((entry) => entry.seq), [cursor + 1, cursor + 2]);
      assert.deepEqual(received, durable);
      assert.deepEqual(operations.map((frame) => frame.id), durable.map((entry) => String(entry.seq)));
      assert.deepEqual(received.filter((entry) => entry.event.kind === "TaskCreated").map((entry) => entry.event.task.id), [successor.id, witness.id]);
      index++;
    }
    console.log(`PASS; ${rows.length} generated compositions delivered exactly durable History`);
  } else {
  child.stdin.write(`${JSON.stringify({ credential, boundary })}\n`);
  await until(() => output.includes("CONTROL Failure"));
  const afterRollback = await run(raw.history(4));
  assert.deepEqual(afterRollback, []);
  for (const title of ["Durable successor", "Next cursor witness"]) {
    const reply = await fetch(`${base}/profiles/work/tasks`, { method: "POST", headers: { Authorization: `Bearer ${credential}`, "Content-Type": "application/json" }, body: JSON.stringify({ title }) });
    assert.equal(reply.status, 200); await reply.json();
  }
  await until(() => frames.some((frame) => frame.event === "operation" && frame.data.event.kind === "TaskCreated" && frame.data.event.task.title === "Next cursor witness"));
  const durableEntries = await run(raw.history(4));
  const operations = frames.filter((frame) => frame.event === "operation");
  const durable = durableEntries.map((entry) => [entry.seq, entry.event.kind, entry.event.task?.title]);
  const received = operations.map((frame) => [frame.data.seq, frame.data.event.kind, frame.data.event.task?.title]);
  const expected = [[5, "TaskCreated", "Durable successor"], [6, "TaskCreated", "Next cursor witness"]];
  writeFileSync(join(evidence, "result.json"), JSON.stringify({ boundary, cursor: 4, afterRollback, durable, received, expected, instrumentation: "store reference and stdin trigger; scheduler held; production SSE/decorator", passed: JSON.stringify(received) === JSON.stringify(expected) }, null, 2));
  assert.deepEqual(durable, expected);
  assert.deepEqual(received, expected);
  assert.deepEqual(operations.map((frame) => frame.id), ["5", "6"]);
  assert.deepEqual(operations.map((frame) => frame.data), durableEntries);
  console.log("PASS; stream delivered exactly durable History after nested rollback and seq reuse");
  }
} finally {
  controller.abort();
  if (streamReader) await streamReader;
  if (child && child.exitCode === null) { child.kill("SIGTERM"); await child.exited; }
  await reading; await readingError;
  if (raw) await run(raw.close());
  writeFileSync(join(evidence, "server.log"), output + stderr);
  rmSync(scratch, { recursive: true, force: true });
}

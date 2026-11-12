import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { DiagnosticRecordings } from "../../../../packages/domain/src/store/diagnostic-recordings.ts";
import { validateRecordingBatch } from "../../../../packages/domain/src/diagnostic-recordings.ts";
import { encodeManifest } from "../../../../packages/domain/src/store/recording-manifest.ts";
import { modelBatch } from "../../../../packages/domain/test/fixtures/recording-authority.ts";
const ops = [
  "ingest",
  "refuse",
  "import",
  "export",
  "rotate",
  "evict",
  "expire",
  "restart",
];
if (process.argv[2] === "worker") {
  const root = resolve(process.argv[3] ?? ""),
    operation = process.argv[4],
    target = Number(process.argv[5]),
    input = JSON.parse(await readFile(join(root, "input"), "utf8")),
    a = validateRecordingBatch(input.a),
    next = validateRecordingBatch(input.next);
  let now = input.now,
    store: DiagnosticRecordings | undefined,
    point = 0;
  const tick = (label: string) => {
    point++;
    if (point === target) {
      writeFileSync(join(root, "held"), label);
      setInterval(() => {}, 1000);
      return new Promise<void>(() => {});
    }
    return Promise.resolve();
  };
  const attach = (subject: object) => {
    for (const method of ["atomic", "remove"]) {
      const original: unknown = Reflect.get(subject, method);
      assert.equal(typeof original, "function");
      Reflect.set(
        subject,
        method,
        async function (this: object, ...args: unknown[]) {
          const name = String(args[0]);
          await tick(`${method}.before:${name}`);
          if (method === "atomic") {
            for (const [phase, text] of [
              ["open", ""],
              ["partial", String(args[1]).slice(0, 20)],
              ["flushed", String(args[1])],
            ]) {
              const path = join(root, "journal", `${name}.tmp`);
              await writeFile(path, text ?? "");
              await tick(`${phase}:${name}`);
              await rm(path);
            }
          }
          const out =
            typeof original === "function"
              ? await original.apply(this, args)
              : undefined;
          await tick(`${method}.after:${name}`);
          return out;
        },
      );
    }
  };
  if (operation === "restart") attach(DiagnosticRecordings.prototype);
  store = await DiagnosticRecordings.open(join(root, "journal"), {
    now: () => now,
  });
  if (operation !== "restart") attach(store);
  const conflict = () => {
    try {
      store!.ingest(
        validateRecordingBatch({
          ...a,
          batch_id: randomUUID(),
          events: [{ ...a.events[0], action_id: randomUUID() }],
        }),
      );
    } catch {}
  };
  if (operation === "ingest") store.ingest(next);
  if (operation === "refuse") conflict();
  if (operation === "import")
    store.ingest({
      ...next,
      run: {
        ...next.run,
        admission: {
          schema_version: 1,
          policy: "whole_batch",
          refused_batches: 7,
          unadmitted_events: 21,
          incomplete: true,
        },
      },
    });
  if (operation === "export") await store.export(a.run.run_id);
  if (operation === "rotate") {
    const map: unknown = Reflect.get(store, "manifests");
    assert.ok(map instanceof Map);
    Reflect.set(
      store,
      "manifestCapacity",
      () => Buffer.byteLength(encodeManifest(map.get(a.run.run_id))) + 100,
    );
    store.ingest(next);
  }
  if (operation === "evict") {
    const map: unknown = Reflect.get(store, "manifests"),
      fn: unknown = Reflect.get(store, "evict");
    assert.ok(map instanceof Map);
    assert.equal(typeof fn, "function");
    if (typeof fn === "function")
      await fn.call(store, a.run.run_id, [map.get(a.run.run_id).segments[0]]);
  }
  if (operation === "expire") {
    now += 2 * 86400000;
    await store.runs();
  }
  await store.flush();
  writeFileSync(join(root, "completed"), String(point));
  await store.close();
  process.exit(0);
}
const evidence = resolve(
  process.argv[2] ?? "docs/evidence/ui-speed/recordings-manifest/crashes",
);
mkdirSync(evidence, { recursive: true });
const binary = resolve(".scratch/bin/manifest-crash"),
  rows: object[] = [];
for (const marked of [false, true])
  for (const operation of ops) {
    const source = await mkdtemp(join(tmpdir(), "todo-crash-source-")),
      a = modelBatch(),
      healthy = modelBatch(),
      next = modelBatch(a.run.run_id, 6);
    let now = 1000,
      store = await DiagnosticRecordings.open(join(source, "journal"), {
        now: () => now,
      });
    try {
      store.ingest(a);
      store.ingest(modelBatch(a.run.run_id, 3));
      await store.flush();
      if (marked) {
        try {
          store.ingest(
            validateRecordingBatch({
              ...a,
              batch_id: randomUUID(),
              events: [{ ...a.events[0], action_id: randomUUID() }],
            }),
          );
        } catch {}
        await store.flush();
      }
      now += 6 * 86400000;
      store.ingest(healthy);
      await store.flush();
      await store.close();
      await writeFile(join(source, "input"), JSON.stringify({ a, next, now }));
      let points = 0;
      for (let target = 0; target <= points; target++) {
        const root = await mkdtemp(join(tmpdir(), "todo-crash-cell-"));
        await cp(source, root, { recursive: true });
        const child = spawn(
          binary,
          ["worker", root, operation, String(target)],
          { stdio: ["ignore", "pipe", "pipe"] },
        );
        let log = "";
        child.stdout.on("data", (x) => (log += x));
        child.stderr.on("data", (x) => (log += x));
        try {
          const ended = new Promise<void>((r) => child.once("exit", () => r()));
          const deadline = Date.now() + 60000;
          while (
            !existsSync(join(root, "completed")) &&
            !existsSync(join(root, "held")) &&
            child.exitCode === null &&
            child.signalCode === null &&
            Date.now() < deadline
          )
            await Bun.sleep(5);
          if (target === 0) {
            await ended;
            assert.equal(child.exitCode, 0, log);
            points = Number(await readFile(join(root, "completed"), "utf8"));
          } else {
            assert.ok(existsSync(join(root, "held")), log);
            child.kill("SIGKILL");
            await ended;
            assert.equal(child.signalCode, "SIGKILL");
          }
          store = await DiagnosticRecordings.open(join(root, "journal"), {
            now: () => now + (operation === "expire" ? 2 * 86400000 : 0),
          });
          assert.equal(
            (await store.show(healthy.run.run_id)).summary[0]?.starts,
            1,
          );
          const list = await store.runs(),
            found = list.runs.find((x) => x.run.run_id === a.run.run_id);
          if (found) {
            const shown = await store.show(a.run.run_id);
            if (marked || shown.run.admission?.incomplete)
              for (const r of shown.summary) {
                assert.equal(r.fraction_by_20_ms, null);
                assert.equal(r.fraction_by_300_ms, null);
              }
            assert.ok(
              [0, 1, 2, 3].includes(
                shown.summary.reduce((n, r) => n + r.starts, 0),
              ),
            );
            await store.export(a.run.run_id);
          } else
            await assert.rejects(store.show(a.run.run_id), /run is missing/);
          const retry = store.ingest(next);
          await store.flush();
          assert.equal(
            store.settledReceipt(retry, next.batch_id).accepted,
            true,
          );
          const retried = (await store.runs()).runs.find(
            (r) => r.run.run_id === a.run.run_id,
          )?.events;
          const duplicate = store.ingest(next);
          await store.flush();
          assert.equal(
            store.settledReceipt(duplicate, next.batch_id).duplicate,
            true,
          );
          assert.equal(
            (await store.runs()).runs.find((r) => r.run.run_id === a.run.run_id)
              ?.events,
            retried,
          );
          rows.push({
            marked,
            operation,
            target,
            points,
            killed: target !== 0,
            explicit_retry_and_duplicate: true,
            label:
              target === 0
                ? "completed"
                : await readFile(join(root, "held"), "utf8"),
          });
          await store.close();
          writeFileSync(
            join(evidence, "result.json"),
            JSON.stringify(
              { result: "RUNNING", cases: rows.length, rows },
              null,
              2,
            ),
          );
        } finally {
          if (child.exitCode === null && child.signalCode === null) {
            child.kill("SIGKILL");
            await new Promise<void>((r) => child.once("exit", () => r()));
          }
          await store.close();
          await rm(root, { recursive: true, force: true });
        }
      }
    } finally {
      await store.close();
      await rm(source, { recursive: true, force: true });
    }
  }
writeFileSync(
  join(evidence, "result.json"),
  JSON.stringify({ result: "PASS", cases: rows.length, rows }, null, 2),
);

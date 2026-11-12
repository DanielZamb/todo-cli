import assert from "node:assert/strict";
import { Effect, Schema } from "effect";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  copyFileSync,
  rmSync,
  statSync,
  existsSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir, loadavg, cpus } from "node:os";
import { spawn, spawnSync } from "node:child_process";
import {
  openStore,
  TaskCommands,
} from "../../packages/domain/src/store/store.ts";
import {
  ProfileId,
  TaskId,
  Version,
  Task,
  Instant,
  TimeZoneId,
  parseQuickAdd,
  DependencyCommands,
} from "../../packages/domain/src/index.ts";
import { batchEditTasks } from "../../packages/domain/src/batch-edit.ts";
import {
  copyTask,
  moveTask,
  createSeries,
  revertTask,
} from "../../packages/domain/src/commands.ts";
import { AttachmentCommands } from "../../packages/domain/src/attachment-commands.ts";
import { attach, type Arm } from "./observer.ts";
import { baseline, database, sequence } from "./baseline.ts";
import { difference, applyPatch, bytes } from "./patch.ts";
import { seed } from "./fixture.ts";
import { Replica, Patch } from "./model.ts";
const run = Effect.runPromise,
  base = resolve(".scratch/sync-patches"),
  evidence = resolve("docs/evidence/sync-experiment");
mkdirSync(base, { recursive: true });
mkdirSync(evidence, { recursive: true });
const mode = process.argv[2] ?? "pilot";
const P = (s: string) => Schema.decodeUnknownSync(ProfileId)(s),
  T = (s: string) => Schema.decodeUnknownSync(TaskId)(s),
  V = (n: number) => Schema.decodeUnknownSync(Version)(n);
export async function openCase(fixture: string, arm: Arm) {
  const config = JSON.parse(
      readFileSync(join(fixture, "fixture.json"), "utf8"),
    ),
    directory = mkdtempSync(join(tmpdir(), "todo-sync-experiment-"));
  copyFileSync(config.path, join(directory, "scratch.db"));
  mkdirSync(join(directory, "home", ".todo-cli"), { recursive: true });
  writeFileSync(
    join(directory, "home", ".todo-cli", "session_p0.json"),
    JSON.stringify({ token: config.credential }),
  );
  const store = await run(openStore({ path: join(directory, "scratch.db") })),
    observer = attach(
      store,
      arm,
      "p0",
      config.at,
      join(directory, "scratch.db"),
    ),
    commands = new TaskCommands(store),
    request = { credential: config.credential, profile: P("p0") };
  return {
    config,
    directory,
    store,
    observer,
    commands,
    request,
    async close() {
      await run(store.close());
      rmSync(directory, { recursive: true, force: true });
    },
  };
}
type Case = Awaited<ReturnType<typeof openCase>>;
const task = (c: Case, id: string) => {
  const row = database(c.store)
    .query<{ payload: string }, [string]>(
      "SELECT payload FROM tasks WHERE id=?",
    )
    .get(id);
  assert.ok(row, id);
  return Schema.decodeUnknownSync(Task)(JSON.parse(row.payload));
};
async function operation(c: Case, kind: string, i: number) {
  const target =
      kind === "complete" || kind === "reopen" ? "p0-t000" : "p0-t040",
    before = task(c, target),
    request = { ...c.request, task_id: before.id };
  switch (kind) {
    case "dependency": {
      const on = i % 2 === 0;
      const result = await run(
        new DependencyCommands(c.store).change(
          { ...c.request, task_id: T("p0-t042") },
          {
            blocker_id: T("p0-t041"),
            from_version: task(c, "p0-t042").row_version,
          },
          on ? "depend" : "undepend",
        ),
      );
      assert.equal(result.outcome, "success");
      break;
    }
    case "complete":
    case "reopen": {
      const result = await run(
        c.commands.transition(request, {
          from_version: before.row_version,
          action: before.status === "open" ? "complete" : "reopen",
        }),
      );
      assert.equal(result.outcome, "committed");
      break;
    }
    case "description": {
      const result = await run(
        c.commands.edit(request, {
          from_version: before.row_version,
          changes: { description: "d".repeat(1260) + i },
        }),
      );
      assert.equal(result.outcome, "committed");
      break;
    }
    case "quick-add": {
      const draft = await run(
        parseQuickAdd({
          text: "New Task " + i + " p2 #Tag",
          now: Schema.decodeUnknownSync(Instant)(c.config.at),
          time_zone: Schema.decodeUnknownSync(TimeZoneId)("UTC"),
        }),
      );
      const result = await run(
        c.commands.create(
          c.request,
          { title: draft.title, priority: draft.priority },
          { task_id: T("added-" + i) },
        ),
      );
      assert.equal(result.outcome, "committed");
      break;
    }
    case "move": {
      const id = T("p0-t045"),
        row = task(c, id),
        profile = row.profile_id === "p0" ? P("p1") : P("p0");
      const result = await run(
        moveTask(
          c.store,
          {
            credential: c.request.credential,
            profile: row.profile_id,
            task_id: id,
          },
          { from_version: row.row_version, destination_profile: profile },
        ),
      );
      assert.equal(result.outcome, "committed");
      break;
    }
    case "batch": {
      const items = Array.from({ length: 10 }, (_, j) => {
        const row = task(c, "p0-t" + String(j + 35).padStart(3, "0"));
        return { task_id: row.id, from_version: row.row_version };
      });
      const result = await run(
        batchEditTasks(c.store, c.request, {
          items,
          changes: { priority: i % 2 ? "P1" : "P4" },
        }),
      );
      assert.equal(result.totals.rejected, 0);
      break;
    }
    case "midnight": {
      c.observer.at = new Date(
        Date.parse(c.observer.at) + 86400000,
      ).toISOString();
      if (c.observer.arm === "stored") {
        const prev = c.observer.replica,
          next = baseline(c.store, "p0", c.observer.at),
          patch = difference(prev, next, "whole");
        database(c.store)
          .transaction(() =>
            database(c.store)
              .query(
                "INSERT INTO sync_patch_outbox(from_cursor,to_cursor,payload) VALUES (?,?,?)",
              )
              .run(patch.from, patch.to, JSON.stringify(patch)),
          )
          .immediate();
      }
      c.observer.poll();
      break;
    }
    default:
      throw Error("unknown op " + kind);
  }
}
const stats = (v: number[]) => {
  const a = [...v].sort((a, b) => a - b),
    p = (n: number) => a[Math.max(0, Math.ceil(n * a.length) - 1)] ?? 0;
  return {
    n: a.length,
    median: p(0.5),
    p90: p(0.9),
    p99: p(0.99),
    min: a[0] ?? 0,
    max: a.at(-1) ?? 0,
  };
};
function fileBytes(p: string) {
  return existsSync(p) ? statSync(p).size : 0;
}
async function measured(c: Case, kind: string, i: number) {
  const before = baseline(c.store, "p0", c.observer.at),
    wal = join(c.directory, "scratch.db-wal"),
    disk = fileBytes(wal),
    cpu = process.cpuUsage(),
    start = performance.now();
  const phaseStart = new Map(Object.entries(c.observer.phases));
  await operation(c, kind, i);
  const command = performance.now() - start;
  const current =
    c.observer.arm === "off"
      ? baseline(c.store, "p0", c.observer.at)
      : c.observer.replica;
  const replyStart = performance.now(),
    reply = difference(before, current, "whole"),
    replyBytes = bytes(reply),
    replyMs = performance.now() - replyStart,
    afterCpu = process.cpuUsage(cpu);
  const duration = performance.now() - start;
  const oracle = baseline(c.store, "p0", c.observer.at);
  assert.deepEqual(current, oracle);
  if (c.observer.arm !== "off")
    assert.deepEqual(applyPatch(before, reply), oracle);
  const encode = [];
  for (const shape of ["whole", "edits"] as const) {
    const t = performance.now(),
      patch = difference(before, oracle, shape),
      produce = performance.now() - t,
      b = bytes(patch),
      a = performance.now(),
      result = applyPatch(before, patch),
      apply = performance.now() - a;
    assert.deepEqual(result, oracle);
    encode.push({
      shape,
      produce_ms: produce,
      apply_ms: apply,
      bytes: b,
      changed_lists:
        Object.keys(patch.lists).length + Object.keys(patch.edits).length,
    });
  }
  return {
    kind,
    i,
    phases: Object.fromEntries(
      Object.entries(c.observer.phases).map(([key, value]) => [
        key,
        value - (phaseStart.get(key) ?? 0),
      ]),
    ),
    command_ms: command,
    reply_ms: duration,
    compose_encode_ms: replyMs,
    reply_bytes: replyBytes,
    cpu_ms: (afterCpu.user + afterCpu.system) / 1000,
    wal_bytes: fileBytes(wal) - disk,
    patches: c.observer.patches.length,
    ...c.observer.memory(),
    shapes: encode,
    before,
    after: oracle,
    reply,
  };
}
async function fixtures() {
  for (const [which, large] of [
    ["owner", false],
    ["large", true],
  ] as const) {
    const dir = join(base, which);
    if (!existsSync(join(dir, "fixture.json"))) await seed(dir, large);
  }
  return ["owner", "large"].map((s) => join(base, s));
}
if (mode === "seed") {
  await fixtures();
  console.log("seeded");
} else if (mode === "pilot" || mode === "bench") {
  const results: unknown[] = [],
    samples: Array<{
      kind: string;
      before: typeof Replica.Type;
      after: typeof Replica.Type;
      whole: typeof Patch.Type;
      edits: typeof Patch.Type;
    }> = [];
  for (const fixture of await fixtures())
    for (let pair = 0; pair < (mode === "pilot" ? 1 : 5); pair++) {
      const arms: Arm[] =
        pair % 2 ? ["memory", "stored", "off"] : ["off", "stored", "memory"];
      for (const arm of arms) {
        const c = await openCase(fixture, arm);
        try {
          for (const [kind, i] of [
            "dependency",
            "dependency",
            "complete",
            "reopen",
            "description",
            "quick-add",
            "move",
            "batch",
            "midnight",
          ].map((k, i) => [k, i] as const)) {
            const result = await measured(c, kind, i),
              { before, after, reply, ...metrics } = result;
            results.push({
              fixture: fixture.endsWith("owner") ? "owner" : "large",
              arm,
              pair,
              load: loadavg(),
              ...metrics,
            });
            if (pair === 0 && arm === "memory")
              samples.push({
                kind,
                before,
                after,
                whole: reply,
                edits: difference(before, after, "edits"),
              });
          }
          console.log(fixture.split("/").at(-1), pair, arm);
        } finally {
          await c.close();
        }
      }
    }
  if (samples.length) {
    const before = samples[0]!.before,
      after = {
        ...before,
        cursor: before.cursor + "-order",
        lists: { ...before.lists, default: before.lists.dependency ?? [] },
      };
    samples.push({
      kind: "dependency-reorder",
      before,
      after,
      whole: difference(before, after, "whole"),
      edits: difference(before, after, "edits"),
    });
  }
  writeFileSync(
    join(evidence, mode + ".json"),
    JSON.stringify({ results, samples, cores: cpus().length }, null, 2),
  );
  console.log("validated", results.length);
} else if (mode === "burst") {
  const { burst } = await import("./burst.ts");
  const results = [];
  for (let pair = 0; pair < 5; pair++)
    for (const arm of (pair % 2
      ? ["memory", "stored"]
      : ["stored", "memory"]) as Array<"stored" | "memory">) {
      const c = await openCase((await fixtures())[0]!, arm);
      try {
        results.push({ pair, ...(await burst(c)) });
      } finally {
        await c.close();
      }
    }
  writeFileSync(join(evidence, "burst.json"), JSON.stringify(results, null, 2));
  console.log("burst", results.length);
} else if (mode === "correctness") {
  const { correctness } = await import("./correctness.ts");
  const results = [];
  for (const arm of ["stored", "memory"] as const) {
    const c = await openCase((await fixtures())[0]!, arm);
    try {
      results.push(await correctness(c));
    } finally {
      await c.close();
    }
  }
  writeFileSync(
    join(evidence, "correctness.json"),
    JSON.stringify(results, null, 2),
  );
  console.log(results);
} else if (mode === "codec") {
  throw Error("codec is driven separately");
} else throw Error(mode);

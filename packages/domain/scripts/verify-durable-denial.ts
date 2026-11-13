import { Database } from "bun:sqlite";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { Clock, Effect, Schema } from "effect";
import { AuthError } from "../src/auth/model.ts";
import { TaskCommands } from "../src/commands.ts";
import { Event } from "../src/events.ts";
import { ProfileId, TaskId, Version } from "../src/ids.ts";
import { type OperationStore, openStore } from "../src/store/store.ts";
import { CreateTask, resolveTaskCreation } from "../src/task-commands.ts";
import { Instant } from "../src/time.ts";

const [mode, directory, evidence] = process.argv.slice(2);
assert.ok(directory && isAbsolute(directory));
assert.ok(evidence && isAbsolute(evidence));
mkdirSync(directory, { recursive: true });
mkdirSync(evidence, { recursive: true });
const path = join(directory, "scratch.db");
const profile = Schema.decodeUnknownSync(ProfileId)("work");
const personal = Schema.decodeUnknownSync(ProfileId)("personal");
let time = Date.parse("2026-11-13T00:20:00.001Z");
const stamp = () =>
  Schema.decodeUnknownSync(Instant)(new Date(time).toISOString());
const fixed = <A, E>(effect: Effect.Effect<A, E>) =>
  Clock.clockWith((clock) =>
    Effect.provideService(effect, Clock.Clock, {
      ...clock,
      currentTimeMillisUnsafe: () => time,
      currentTimeMillis: Effect.sync(() => time),
      currentTimeNanosUnsafe: () => BigInt(time) * 1_000_000n,
      currentTimeNanos: Effect.sync(() => BigInt(time) * 1_000_000n),
    }),
  );
const count = (db: Database, target: string | null = profile) =>
  db
    .query<{ n: number }, [string | null]>(
      "SELECT count(*) n FROM op_log WHERE profile IS ? AND json_extract(event,'$.kind')='AuthAttemptRejected'",
    )
    .get(target)?.n ?? 0;
const refuse = (
  store: OperationStore,
  target = profile,
  credential = "tok_forged",
  access: "read" | "write" = "read",
) =>
  Effect.gen(function* () {
    const error = yield* Effect.flip(
      store.auth.authenticate({ credential, profile: target, access }),
    );
    assert.ok(error instanceof AuthError);
    return error.detail;
  });
const noise = (
  db: Database,
  at: string,
  n: number,
  target: string | null = profile,
) => {
  const insert = db.query(
    "INSERT INTO op_log(actor,profile,entity_version,event,outcome,reason) VALUES ('noise',?,1,?,'committed',NULL)",
  );
  const event = JSON.stringify({
    kind: "AuthChanged",
    action: "signOut",
    credential_id: null,
    entity_version: 1,
    occurred_at: at,
  });
  db.transaction(() => {
    for (let i = 0; i < n; i++) insert.run(target, event);
  }).immediate();
};
const mark = (name: string, value: unknown) =>
  writeFileSync(
    join(evidence, `${name}.json`),
    `${JSON.stringify(value, null, 2)}\n`,
  );
const program = Effect.acquireUseRelease(
  openStore({ path }),
  (store) =>
    Effect.gen(function* () {
      yield* store.putProfile({
        id: profile,
        name: "work",
        created_at: stamp(),
        updated_at: stamp(),
      });
      yield* store.putProfile({
        id: personal,
        name: "personal",
        created_at: stamp(),
        updated_at: stamp(),
      });
      const db = new Database(path);
      db.function("domain_write_allowed", () => 1);
      db.exec("PRAGMA busy_timeout=5000");
      try {
        if (mode === "older") {
          process.send?.("clock-captured");
          yield* Effect.promise(
            () =>
              new Promise<void>((resolve) =>
                process.once("message", () => resolve()),
              ),
          );
          noise(db, "2026-11-13T00:19:59.999Z", 5000);
          process.send?.("committed");
          process.disconnect?.();
          return;
        }
        if (mode === "race-worker") {
          // Each worker reads its own clock; a later clock may commit first.
          time += Number(process.argv[5] ?? "0");
          const target = Schema.decodeUnknownSync(ProfileId)(
            process.argv[6] ?? "race",
          );
          process.send?.("ready");
          yield* Effect.promise(
            () =>
              new Promise<void>((resolve) =>
                process.once("message", () => resolve()),
              ),
          );
          yield* refuse(store, target);
          process.send?.("done");
          process.disconnect?.();
          return;
        }
        if (mode === "race" || mode === "proof") {
          const race = Schema.decodeUnknownSync(ProfileId)("race");
          yield* store.putProfile({
            id: race,
            name: "race",
            created_at: stamp(),
            updated_at: stamp(),
          });
          const children = [0, 50].map((offset) =>
            spawn(
              process.execPath,
              ["race-worker", directory, evidence, String(offset)],
              { stdio: ["ignore", "ignore", "inherit", "ipc"] },
            ),
          );
          const ready = children.map(
            (child) => new Promise((resolve) => child.once("message", resolve)),
          );
          assert.deepEqual(yield* Effect.promise(() => Promise.all(ready)), [
            "ready",
            "ready",
          ]);
          const done = children.map(
            (child) => new Promise((resolve) => child.once("message", resolve)),
          );
          const exits = children.map(
            (child) =>
              new Promise((resolve) =>
                child.once("exit", (code, signal) => resolve({ code, signal })),
              ),
          );
          for (const child of children) child.send("release");
          assert.deepEqual(yield* Effect.promise(() => Promise.all(done)), [
            "done",
            "done",
          ]);
          assert.deepEqual(yield* Effect.promise(() => Promise.all(exits)), [
            { code: 0, signal: null },
            { code: 0, signal: null },
          ]);
          const rows = db
            .query<{ n: number }, []>(
              "SELECT count(*) n FROM op_log WHERE profile='race' AND json_extract(event,'$.kind')='AuthAttemptRejected'",
            )
            .get()?.n;
          mark("race", {
            rows,
            expected: 1,
            clocks: [stamp(), new Date(time + 50).toISOString()],
            exits: 2,
          });
          assert.equal(rows, 1);
          // Deterministic order: a process whose clock reads 50 ms later
          // commits first; this process, with the earlier clock, must still
          // find that refusal in the same minute.
          const skew = Schema.decodeUnknownSync(ProfileId)("skew");
          yield* store.putProfile({
            id: skew,
            name: "skew",
            created_at: stamp(),
            updated_at: stamp(),
          });
          const later = spawn(
            process.execPath,
            ["race-worker", directory, evidence, "50", "skew"],
            { stdio: ["ignore", "ignore", "inherit", "ipc"] },
          );
          const laterReady = new Promise((resolve) =>
            later.once("message", resolve),
          );
          assert.equal(yield* Effect.promise(() => laterReady), "ready");
          const laterDone = new Promise((resolve) =>
            later.once("message", resolve),
          );
          const laterExit = new Promise((resolve) =>
            later.once("exit", (code, signal) => resolve({ code, signal })),
          );
          later.send("release");
          assert.equal(yield* Effect.promise(() => laterDone), "done");
          assert.deepEqual(yield* Effect.promise(() => laterExit), {
            code: 0,
            signal: null,
          });
          yield* refuse(store, skew);
          const skewRows = count(db, skew);
          mark("clock-skew", {
            rows: skewRows,
            expected: 1,
            committedFirst: new Date(time + 50).toISOString(),
            attempt: stamp(),
          });
          assert.equal(skewRows, 1);
        }
        if (mode === "proof") {
          const observations: unknown[] = [];
          const snapshot = yield* store.snapshots.create("before first denial");
          yield* refuse(store);
          yield* refuse(store);
          assert.equal(count(db), 1);
          yield* store.snapshots.restore(snapshot.id);
          assert.equal(count(db), 0);
          yield* refuse(store);
          assert.equal(count(db), 1);
          observations.push({ restore: 1 });
          const child = spawn(
            process.execPath,
            ["older", directory, evidence],
            { stdio: ["ignore", "ignore", "inherit", "ipc"] },
          );
          const ready = yield* Effect.promise(
            () =>
              new Promise<unknown>((resolve) => child.once("message", resolve)),
          );
          assert.equal(ready, "clock-captured");
          const done = new Promise<unknown>((resolve) =>
            child.once("message", resolve),
          );
          const exit = new Promise((resolve) =>
            child.once("exit", (code, signal) => resolve({ code, signal })),
          );
          child.send("release");
          assert.equal(yield* Effect.promise(() => done), "committed");
          assert.deepEqual(yield* Effect.promise(() => exit), {
            code: 0,
            signal: null,
          });
          yield* refuse(store);
          assert.equal(count(db), 1);
          observations.push({ barrierPriorMinute: 1, committedRows: 5000 });
          noise(db, "2026-11-13T00:18:59.999Z", 1);
          yield* refuse(store);
          assert.equal(count(db), 2);
          observations.push({ olderThanHorizonLimit: 2 });
          // A large row (over the walked-event bound) stamped before the
          // horizon is skipped unread, so it does not hide the newest refusal.
          db.query(
            "INSERT INTO op_log(actor,profile,entity_version,event,outcome,reason) VALUES ('import',?,1,?,'committed',NULL)",
          ).run(
            profile,
            JSON.stringify({
              kind: "TaskCreated",
              entity_version: 1,
              occurred_at: "2026-11-13T00:18:59.999Z",
              task: { description: "x".repeat(100_000) },
            }),
          );
          yield* refuse(store);
          assert.equal(count(db), 2);
          observations.push({ largeOlderRowDoesNotHide: 2 });
          time += 60_000;
          yield* refuse(store);
          assert.equal(count(db), 3);
          observations.push({ minuteBoundary: 3 });
          yield* store.auth.setupOwner("scratch durable passphrase");
          const session = yield* store.auth.signIn(
            "scratch durable passphrase",
          );
          const first = yield* store.auth.issueToken({
            credential: session.credential,
            token: { name: "first", profile: null, scope: "read-only" },
          });
          const second = yield* store.auth.issueToken({
            credential: session.credential,
            token: { name: "second", profile: null, scope: "read-only" },
          });
          const before = count(db);
          assert.equal(
            yield* refuse(store, profile, first.credential, "write"),
            "write_scope",
          );
          assert.equal(
            yield* refuse(store, profile, second.credential, "write"),
            "write_scope",
          );
          assert.equal(count(db) - before, 2);
          assert.equal(
            yield* refuse(store, personal, first.credential, "write"),
            "write_scope",
          );
          assert.equal(count(db, personal), 1);
          yield* store.auth.revokeToken({
            credential: session.credential,
            name: "first",
          });
          assert.equal(
            yield* refuse(store, profile, first.credential, "write"),
            "revoked",
          );
          assert.equal(count(db) - before, 3);
          const read = yield* Effect.flip(
            store.auth.read({ credential: first.credential, profile }),
          );
          assert.ok(read instanceof AuthError);
          assert.equal(read.detail, "revoked");
          assert.equal(count(db) - before, 4);
          observations.push({
            keyVariations: { actor: 2, profile: 1, detail: 3, action: 4 },
          });
          for (let i = 0; i < 10; i++) {
            const error = yield* Effect.flip(
              store.auth.signIn("wrong passphrase"),
            );
            assert.ok(error instanceof AuthError);
            assert.equal(error.detail, "invalid_passphrase");
          }
          const locked = yield* Effect.flip(
            store.auth.signIn("scratch durable passphrase"),
          );
          assert.ok(locked instanceof AuthError);
          assert.equal(locked.detail, "sign_in_locked");
          yield* Effect.flip(store.auth.signIn("scratch durable passphrase"));
          assert.equal(
            db
              .query<{ n: number }, []>(
                "SELECT count(*) n FROM op_log WHERE json_extract(event,'$.detail')='invalid_passphrase'",
              )
              .get()?.n,
            10,
          );
          assert.equal(
            db
              .query<{ n: number }, []>(
                "SELECT count(*) n FROM op_log WHERE json_extract(event,'$.detail')='sign_in_locked'",
              )
              .get()?.n,
            1,
          );
          observations.push({ wrongPassphrases: 10, lockedRows: 1 });
          const commands = new TaskCommands(store);
          const request = { credential: session.credential, profile };
          const task = yield* commands.create(request, {
            title: "Purge proof",
          });
          assert.equal(task.outcome, "committed");
          assert.ok(task.task);
          const target = { ...request, task_id: task.task.id };
          yield* commands.delete(target, {
            from_version: task.task.row_version,
          });
          const authBefore = count(db);
          yield* commands.purge(target, {
            from_version: Schema.decodeUnknownSync(Version)(2),
          });
          assert.equal(count(db), authBefore);
          yield* refuse(store);
          assert.equal(count(db), authBefore);
          observations.push({ purgePreservesAuthRows: authBefore });
          yield* refuse(store, personal);
          const personalBefore = count(db, personal);
          const deleted = yield* store.auth.deleteProfile({
            credential: session.credential,
            profile: personal,
            options: { with_tasks: false, dry_run: false },
          });
          assert.equal(deleted.outcome, "deleted");
          yield* refuse(store, personal);
          assert.equal(count(db, personal), personalBefore);
          const renamed = yield* store.ensureProfile({
            id: personal,
            name: "personal",
            created_at: stamp(),
            updated_at: stamp(),
          });
          assert.notEqual(renamed.id, personal);
          yield* refuse(store, renamed.id);
          assert.equal(count(db, renamed.id), 1);
          observations.push({
            profileDeletionRetainsOldRows: personalBefore,
            newProfileRows: 1,
          });
          mark("proof", observations);
          console.log("PASS durable denial lifecycle and barrier");
        }
        if (mode === "bench") {
          const observations: unknown[] = [];
          const original: unknown = Reflect.get(store, "transaction");
          assert.equal(typeof original, "function");
          const holds: number[] = [];
          let nesting = 0;
          Reflect.set(store, "transaction", (run: () => unknown) => {
            let acquired: number | undefined;
            const outer = nesting++ === 0;
            try {
              assert.ok(typeof original === "function");
              return original.call(store, () => {
                if (outer) acquired = performance.now();
                return run();
              });
            } finally {
              nesting--;
              if (outer && acquired !== undefined)
                holds.push(performance.now() - acquired);
            }
          });
          // quiet: 200,000 rows before the horizon. null: the same for the
          // null Profile. whole-window: 200,000 rows inside the window.
          // *-before: a prior-minute bulk committed before the first refusal;
          // *-after: committed after it, so every repeat has to pass it.
          // prior-*: 5,000 small AuthChanged rows; import-*: 5,000 TaskCreated
          // rows with a title only; desc200-*: 5,000 with 200-character
          // descriptions; big-*: 1,000 with 100,000-character descriptions.
          const scenario = process.argv[5];
          assert.ok(
            scenario &&
              [
                "quiet",
                "null",
                "whole-window",
                "prior-before",
                "prior-after",
                "import-before",
                "import-after",
                "desc200-before",
                "desc200-after",
                "big-before",
                "big-after",
              ].includes(scenario),
          );
          const shape = scenario.startsWith("big")
            ? { tasks: 1000, description: 100_000 }
            : scenario.startsWith("desc200")
              ? { tasks: 5000, description: 200 }
              : { tasks: 5000, description: 0 };
          const bulk = (target: ProfileId | null) => {
            const at = "2026-11-13T00:19:59.999Z";
            if (scenario.startsWith("prior"))
              return noise(db, at, 5000, target);
            const insert = db.query(
              "INSERT INTO op_log(actor,profile,entity_version,event,from_version,to_version,outcome,reason) VALUES ('import',?,1,?,NULL,1,'committed',NULL)",
            );
            const occurred_at = Schema.decodeUnknownSync(Instant)(at);
            db.transaction(() => {
              for (let i = 0; i < shape.tasks; i++) {
                const task = resolveTaskCreation(
                  Schema.decodeUnknownSync(CreateTask)({
                    title: `Imported Task ${i}`,
                    ...(shape.description > 0
                      ? {
                          description: `${i} `.padEnd(
                            shape.description,
                            "lorem ipsum ",
                          ),
                        }
                      : {}),
                  }),
                  profile,
                  Schema.decodeUnknownSync(TaskId)(`import-${i}`),
                  occurred_at,
                );
                const event = Schema.decodeUnknownSync(Event)({
                  kind: "TaskCreated",
                  entity_version: 1,
                  occurred_at,
                  task,
                  series: null,
                  project: null,
                  tags: [],
                });
                insert.run(
                  target,
                  JSON.stringify(Schema.encodeSync(Event)(event)),
                );
              }
            }).immediate();
          };
          {
            const target = scenario === "null" ? null : profile;
            const attempt = () =>
              target === null
                ? Effect.map(
                    Effect.flip(
                      store.auth.signOut({ credential: "tok_forged" }),
                    ),
                    (error) => {
                      assert.ok(error instanceof AuthError);
                      return error.detail;
                    },
                  )
                : refuse(store);
            // TODO_BENCH_STAGE=seed builds the scenario's History and stops,
            // so one fixture is cloned for every arm; =run reuses it. For an
            // *-after scenario the seed also holds the first refusal and the
            // bulk after it, so no run rewrites the bulk.
            const stage = process.env.TODO_BENCH_STAGE;
            const after = scenario.endsWith("-after");
            if (stage !== "run") {
              noise(
                db,
                scenario === "whole-window"
                  ? stamp()
                  : "2026-11-13T00:18:59.999Z",
                200000,
                target,
              );
              if (!after) bulk(target);
              if (stage === "seed" && after) {
                yield* attempt();
                bulk(target);
              }
            }
            if (stage === "seed") {
              db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
              mark("seed", { scenario, refusals: count(db, target) });
              return;
            }
            const before = count(db, target);
            holds.length = 0;
            const start = performance.now();
            yield* attempt();
            const firstMs = performance.now() - start;
            const firstHolds = [...holds];
            const firstRows = count(db, target) - before;
            if (stage !== "run" && after) bulk(target);
            holds.length = 0;
            // Each repeat's write transactions, in order: the failed check's
            // own, then a recording transaction if one was opened.
            const repeats: { ms: number; holds: number[] }[] = [];
            const burst = performance.now();
            for (let i = 0; i < 1000; i++) {
              const from = holds.length;
              const one = performance.now();
              yield* attempt();
              repeats.push({
                ms: performance.now() - one,
                holds: holds.slice(from),
              });
            }
            const burstMs = performance.now() - burst;
            const burstRows = count(db, target) - before - firstRows;
            assert.equal(burstRows, 0);
            // CLI-shaped: every repeat in a newly opened store, as each CLI
            // run is a new process with nothing in memory.
            const fresh: { openMs: number; refuseMs: number }[] = [];
            for (let i = 0; i < 20; i++) {
              const opened = performance.now();
              yield* Effect.acquireUseRelease(
                openStore({ path }),
                (other) =>
                  Effect.gen(function* () {
                    const ready = performance.now();
                    if (target === null)
                      yield* Effect.flip(
                        other.auth.signOut({ credential: "tok_forged" }),
                      );
                    else yield* refuse(other);
                    fresh.push({
                      openMs: ready - opened,
                      refuseMs: performance.now() - ready,
                    });
                  }),
                (other) => Effect.orDie(other.close()),
              );
            }
            // One on this branch; the base appends one per fresh store.
            const freshRows = count(db, target) - before;
            observations.push({
              scenario,
              firstMs,
              firstHolds,
              burstMs,
              repeats,
              fresh,
              firstRows,
              burstRows,
              freshRows,
            });
          }
          mark("bench", observations);
          console.log("PASS 1000-denial bursts");
        }
      } finally {
        db.close();
      }
    }),
  (store) => Effect.orDie(store.close()),
);
await Effect.runPromise(fixed(program));

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "@effect/vitest";
import {
  CommittedOperationsCell,
  collectCommitted,
  noteCommitted,
  Profile,
  type TaskId,
} from "@todo/domain";
import { openStore, StoreError, TaskCommands } from "@todo/domain/store";
import { Effect, Fiber, Schema } from "effect";
import { TestClock } from "effect/testing";
import { created, task, time } from "./store-fixtures.ts";

const work = Schema.decodeUnknownSync(Profile)({
  id: "work",
  name: "Work",
  created_at: "2026-11-13T00:00:00Z",
  updated_at: "2026-11-13T00:00:00Z",
});

it.effect("reports the highest seq a request committed, per request", () =>
  Effect.acquireUseRelease(
    Effect.sync(() => mkdtempSync(join(tmpdir(), "todo-committed-"))),
    (directory) =>
      Effect.acquireUseRelease(
        openStore({ path: join(directory, "scratch.db") }),
        (store) =>
          Effect.gen(function* () {
            yield* store.putProfile(work);
            yield* store.auth.setupOwner("committed scratch");
            const signIn = yield* collectCommitted(
              store.auth.signIn("committed scratch"),
            );
            const request = {
              credential: signIn.value.credential,
              profile: work.id,
            };
            const db: { query: (sql: string) => { get: () => unknown } } =
              Reflect.get(store, "db");
            const committedMax = () =>
              (
                db
                  .query(
                    "SELECT max(seq) AS seq FROM op_log WHERE outcome='committed'",
                  )
                  .get() as { seq: number }
              ).seq;
            // Sign-in decides in the passphrase queue, outside the request:
            // its AuthChanged commit is not attributed to the request.
            expect(signIn.seq).toBe(null);
            const commands = new TaskCommands(store);
            const created = yield* collectCommitted(
              commands.create(request, {
                title: "One",
                source: "agent",
              } as never),
            );
            expect(created.seq).toBe(committedMax());
            if (created.value.outcome !== "committed")
              throw new Error("create");
            const task = created.value.task;
            const target = { ...request, task_id: task.id as TaskId };
            // A Conflict records a rejected attempt and commits nothing.
            const conflict = yield* collectCommitted(
              commands.edit(target, {
                from_version: 99,
                changes: { title: "Stale" },
              } as never),
            );
            expect([conflict.value.outcome, conflict.seq]).toEqual([
              "rejected",
              null,
            ]);
            // A dry run commits nothing.
            const preview = yield* collectCommitted(
              commands.delete(target, {
                from_version: task.row_version,
                dry_run: true,
              } as never),
            );
            expect(preview.seq).toBe(null);
            // Two requests interleaving between transactions keep their own seqs.
            const [left, right] = yield* Effect.all(
              [
                collectCommitted(
                  Effect.gen(function* () {
                    yield* commands.create(request, {
                      title: "Left 1",
                      source: "agent",
                    } as never);
                    yield* Effect.yieldNow;
                    yield* commands.create(request, {
                      title: "Left 2",
                      source: "agent",
                    } as never);
                  }),
                ),
                collectCommitted(
                  Effect.gen(function* () {
                    yield* commands.create(request, {
                      title: "Right 1",
                      source: "agent",
                    } as never);
                    yield* Effect.yieldNow;
                  }),
                ),
              ],
              { concurrency: "unbounded" },
            );
            const titles = (yield* commands.list(request)).length;
            expect(titles).toBe(4);
            expect(left.seq).toBe(committedMax());
            expect(right.seq).toBeLessThan(left.seq ?? 0);
            expect(right.seq).toBeGreaterThan(created.seq ?? 0);
            // Outside collectCommitted nothing is collected and nothing fails.
            yield* commands.create(request, {
              title: "Plain",
              source: "agent",
            } as never);
          }),
        (store) => Effect.orDie(store.close()),
      ),
    (directory) => Effect.sync(() => rmSync(directory, { recursive: true })),
  ),
);

type Row = {
  seq: number;
  actor: string;
  profile: string | null;
  from_version: number | null;
  to_version: number | null;
  event: string;
  outcome: string;
  occurred_at: string;
};
const noted = (row: Row) => ({
  seq: row.seq,
  event: row.event,
  actor: row.actor,
  profile: row.profile,
  from_version: row.from_version,
  to_version: row.to_version,
  occurred_at: row.occurred_at,
});
const scratchStore = <A, E>(
  body: (
    store: Effect.Success<ReturnType<typeof openStore>>,
    rows: () => Row[],
  ) => Effect.Effect<A, E>,
) =>
  Effect.acquireUseRelease(
    Effect.sync(() => mkdtempSync(join(tmpdir(), "todo-committed-"))),
    (directory) =>
      Effect.acquireUseRelease(
        openStore({ path: join(directory, "scratch.db") }),
        (store) =>
          Effect.gen(function* () {
            yield* store.putProfile(work);
            yield* store.auth.setupOwner("committed scratch");
            const db: { query: (sql: string) => { all: () => unknown[] } } =
              Reflect.get(store, "db");
            return yield* body(
              store,
              () =>
                db
                  .query(
                    "SELECT seq,actor,profile,from_version,to_version,event,outcome,json_extract(event,'$.occurred_at') AS occurred_at FROM op_log ORDER BY seq",
                  )
                  .all() as Row[],
            );
          }),
        (store) => Effect.orDie(store.close()),
      ),
    (directory) => Effect.sync(() => rmSync(directory, { recursive: true })),
  );

it.effect("a failing collector never costs a commit", () =>
  scratchStore((store, rows) =>
    Effect.gen(function* () {
      const { credential } = yield* store.auth.signIn("committed scratch");
      const request = { credential, profile: work.id };
      // A cell whose push throws: the note fails inside the write's transaction.
      const broken = { noted: Object.freeze([]) as never[] };
      const result = yield* new TaskCommands(store)
        .create(request, { title: "Still committed", source: "agent" } as never)
        .pipe(Effect.provideService(CommittedOperationsCell, broken));
      expect(result.outcome).toBe("committed");
      const last = rows().at(-1);
      expect([last?.outcome, JSON.parse(last?.event ?? "{}").kind]).toEqual([
        "committed",
        "TaskCreated",
      ]);
    }),
  ),
);

it.effect(
  "a rolled-back insert never claims the operation that takes its seq",
  () =>
    scratchStore((store, rows) =>
      Effect.gen(function* () {
        yield* TestClock.setTime(Date.parse(time));
        const { credential } = yield* store.auth.signIn("committed scratch");
        const request = { credential, profile: work.id };
        let rolledBackSeq = 0;
        const rollBack = store.auth.mutate(request, (identity) =>
          Effect.gen(function* () {
            const entry = yield* store.append({
              ...identity,
              event: created as never,
            });
            rolledBackSeq = entry.seq;
            return yield* Effect.fail(new StoreError(new Error("rolled back")));
          }),
        );
        // Request B: its own fiber, no collector of A's, the same actor at the
        // same fixed time, another Task.
        const commitOther = store.auth
          .mutate(request, (identity) =>
            store.append({
              ...identity,
              event: {
                ...created,
                task: { ...task, id: "task-2", title: "Another Task" },
              } as never,
            }),
          )
          .pipe(Effect.provideService(CommittedOperationsCell, undefined));
        // Request A: its append is rolled back, then B takes that seq while A
        // is still running, and A itself succeeds.
        const first = yield* collectCommitted(
          Effect.gen(function* () {
            yield* Effect.exit(rollBack);
            yield* Fiber.join(yield* Effect.forkChild(commitOther));
          }),
        );
        const taken = rows().find((row) => row.seq === rolledBackSeq);
        expect(rolledBackSeq).toBeGreaterThan(0);
        expect(taken?.outcome).toBe("committed");
        expect(JSON.parse(taken?.event ?? "{}").task.id).toBe("task-2");
        expect(JSON.parse(taken?.event ?? "{}").occurred_at).toBe(time);
        // A committed nothing and reports nothing.
        expect(first.seq).toBe(null);
      }),
    ),
);

it.effect("a note made outside the request's fiber is dropped", () =>
  scratchStore((store, rows) =>
    Effect.gen(function* () {
      const db = Reflect.get(store, "db");
      const row = rows()[0] as Row;
      const inside = yield* collectCommitted(
        Effect.sync(() => noteCommitted(db, noted(row))),
      );
      expect(inside.seq).toBe(row.seq);
      const outside = yield* collectCommitted(
        Effect.promise(() =>
          Promise.resolve().then(() => noteCommitted(db, noted(row))),
        ),
      );
      expect(outside.seq).toBe(null);
    }),
  ),
);

it.effect("a redacted operation never lets a request report a lower seq", () =>
  scratchStore((store, rows) =>
    Effect.gen(function* () {
      const { credential } = yield* store.auth.signIn("committed scratch");
      const request = { credential, profile: work.id };
      const commands = new TaskCommands(store);
      let highest = 0;
      const reply = yield* collectCommitted(
        Effect.gen(function* () {
          yield* commands.create(request, {
            title: "Kept",
            source: "agent",
          } as never);
          const created = yield* commands.create(request, {
            title: "Purged later",
            source: "agent",
          } as never);
          if (created.outcome !== "committed") throw new Error("create");
          highest = rows().at(-1)?.seq ?? 0;
          // Another request (its own fiber, no collector of this one) deletes
          // and purges that Task before this request ends.
          const target = { ...request, task_id: created.task.id as TaskId };
          const purge = Effect.gen(function* () {
            const deleted = yield* commands.delete(target, {
              from_version: created.task.row_version,
              with_dependencies: true,
            } as never);
            if (deleted.outcome !== "committed") throw new Error("delete");
            const purged = yield* commands.purge(target, {
              from_version: deleted.task.row_version,
            } as never);
            if (purged.outcome !== "committed") throw new Error("purge");
          }).pipe(Effect.provideService(CommittedOperationsCell, undefined));
          yield* Fiber.join(yield* Effect.forkChild(purge));
        }),
      );
      const row = rows().find((value) => value.seq === highest);
      expect(JSON.parse(row?.event ?? "{}").kind).toBe("TaskHistoryRedacted");
      expect(row?.outcome).toBe("committed");
      // The highest operation can no longer be confirmed: nothing is reported,
      // never the lower seq of the first create.
      expect(reply.seq).toBe(null);
    }),
  ),
);

it.effect("a rolled-back insert leaves the request's committed seq", () =>
  scratchStore((store, rows) =>
    Effect.gen(function* () {
      const { credential } = yield* store.auth.signIn("committed scratch");
      const request = { credential, profile: work.id };
      const reply = yield* collectCommitted(
        Effect.gen(function* () {
          yield* new TaskCommands(store).create(request, {
            title: "Committed",
            source: "agent",
          } as never);
          yield* Effect.exit(
            store.auth.mutate(request, (identity) =>
              Effect.gen(function* () {
                yield* store.append({ ...identity, event: created as never });
                return yield* Effect.fail(
                  new StoreError(new Error("rolled back")),
                );
              }),
            ),
          );
        }),
      );
      const committed = rows().filter((row) => row.outcome === "committed");
      expect(reply.seq).toBe(committed.at(-1)?.seq);
      expect(JSON.parse(committed.at(-1)?.event ?? "{}").task.title).toBe(
        "Committed",
      );
    }),
  ),
);

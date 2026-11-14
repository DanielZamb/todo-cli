import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "@effect/vitest";
import { collectCommitted, Profile, type TaskId } from "@todo/domain";
import { openStore, TaskCommands } from "@todo/domain/store";
import { Effect, Schema } from "effect";

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

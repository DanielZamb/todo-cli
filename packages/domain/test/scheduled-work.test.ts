import { Database } from "bun:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "@effect/vitest";
import { Effect, Schema } from "effect";
import { TestClock } from "effect/testing";
import { Instant, Task, TimeZoneId, Version } from "../src/index.ts";
import { openStore, TaskCommands } from "../src/store/store.ts";
import {
  actor,
  created,
  profile,
  taskInput,
  time,
  work,
} from "./store-fixtures.ts";

const at = Date.parse(time);
const fixture = Effect.gen(function* () {
  yield* TestClock.setTime(at);
  const directory = yield* Effect.acquireRelease(
    Effect.sync(() => mkdtempSync(join(tmpdir(), "todo-s03-test-"))),
    (path) => Effect.sync(() => rmSync(path, { recursive: true, force: true })),
  );
  const path = join(directory, "scratch.db");
  const store = yield* Effect.acquireRelease(openStore({ path }), (store) =>
    Effect.orDie(store.close()),
  );
  yield* store.putProfile(work);
  const add = (input: unknown) =>
    store.append({
      actor,
      profile,
      event: { ...created, task: Schema.decodeUnknownSync(Task)(input) },
    });
  return { path, store, add };
});
const instant = (milliseconds: number) => ({
  kind: "instant",
  utc: new Date(milliseconds).toISOString(),
  time_zone: "UTC",
});

describe("durable scheduled work", () => {
  it.effect(
    "wakes at the exact scheduled instant and fires one reminder for competing connections, replay and changed due time",
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const { path, store, add } = yield* fixture;
          yield* add({
            ...taskInput,
            status: "snoozed",
            scheduled_at: instant(at + 1000),
            due_at: instant(at + 1000),
          });
          const other = yield* Effect.acquireRelease(
            openStore({ path }),
            (store) => Effect.orDie(store.close()),
          );
          expect(yield* store.scheduled.nextAt()).toBe(at + 1000);
          expect(yield* store.scheduled.runDue()).toEqual({
            woken: 0,
            reminders: 0,
          });
          yield* TestClock.setTime(at + 1000);
          expect(
            yield* Effect.all(
              [store.scheduled.runDue(), other.scheduled.runDue()],
              { concurrency: "unbounded" },
            ),
          ).toEqual([
            { woken: 1, reminders: 1 },
            { woken: 0, reminders: 0 },
          ]);
          expect(
            (yield* store.tasks()).map((task) => [
              task.status,
              task.row_version,
            ]),
          ).toEqual([["open", 2]]);
          const reminders = (yield* store.history()).filter(
            (entry) => entry.event.kind === "ReminderFired",
          );
          expect(
            reminders.map((entry) => [
              entry.outcome,
              entry.from_version,
              entry.to_version,
              entry.event,
            ]),
          ).toEqual([
            [
              "committed",
              null,
              null,
              {
                kind: "ReminderFired",
                entity_version: 1,
                occurred_at: "2026-10-27T14:00:01.000Z",
                task_id: "task-1",
                due_at: "2026-10-27T14:00:01.000Z",
                task_version: 2,
                title: "Write the store",
              },
            ],
          ]);
          expect(yield* store.scheduled.nextAt()).toBe(null);
          yield* store.takeSnapshot();
          yield* store.rebuild();
          yield* store.rebuild({ useSnapshot: true });
          expect(yield* other.scheduled.runDue()).toEqual({
            woken: 0,
            reminders: 0,
          });
          yield* store.auth.setupOwner("scheduler test passphrase");
          const session = yield* store.auth.signIn("scheduler test passphrase");
          const commands = new TaskCommands(store);
          const request = {
            credential: session.credential,
            profile,
            task_id: Schema.decodeUnknownSync(Task)(taskInput).id,
          };
          yield* commands.edit(request, {
            from_version: Schema.decodeUnknownSync(Version)(2),
            changes: {
              due_at: {
                kind: "instant",
                utc: Schema.decodeUnknownSync(Instant)("2026-10-27T14:00:01Z"),
                time_zone:
                  Schema.decodeUnknownSync(TimeZoneId)("America/Bogota"),
              },
            },
          });
          expect(yield* store.scheduled.runDue()).toEqual({
            woken: 0,
            reminders: 0,
          });
          const current = (yield* commands.list(request))[0];
          if (!current) return yield* Effect.die("missing task");
          yield* commands.edit(request, {
            from_version: current.row_version,
            changes: {
              due_at: {
                kind: "instant",
                utc: time,
                time_zone: Schema.decodeUnknownSync(TimeZoneId)("UTC"),
              },
            },
          });
          expect(yield* store.scheduled.runDue()).toEqual({
            woken: 0,
            reminders: 1,
          });
          expect(
            (yield* store.history()).filter(
              (entry) => entry.event.kind === "ReminderFired",
            ).length,
          ).toBe(2);
        }),
      ),
  );

  it.effect(
    "ignores dates, deleted Tasks, finished Tasks and future instants",
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const { store, add } = yield* fixture;
          yield* add({
            ...taskInput,
            id: "date",
            status: "snoozed",
            scheduled_at: { kind: "date", date: "2026-10-26" },
            due_at: { kind: "date", date: "2026-10-26" },
          });
          for (const status of ["done", "cancelled"])
            yield* add({
              ...taskInput,
              id: status,
              status,
              due_at: instant(at - 1),
            });
          yield* add({
            ...taskInput,
            id: "deleted",
            deleted_at: time,
            due_at: instant(at - 1),
          });
          yield* add({
            ...taskInput,
            id: "date-open",
            due_at: { kind: "date", date: "2026-10-26" },
          });
          yield* add({
            ...taskInput,
            id: "future",
            due_at: instant(at + 10000),
          });
          expect(yield* store.scheduled.nextAt()).toBe(at + 10000);
          expect(yield* store.scheduled.runDue()).toEqual({
            woken: 0,
            reminders: 0,
          });
          expect(
            (yield* store.history()).filter(
              (entry) => entry.event.kind === "ReminderFired",
            ),
          ).toEqual([]);
        }),
      ),
  );

  it.effect("rolls back wake-ups together with failed reminder receipts", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const { path, store, add } = yield* fixture;
        yield* add({
          ...taskInput,
          status: "snoozed",
          scheduled_at: instant(at),
          due_at: instant(at),
        });
        const db = new Database(path);
        try {
          db.exec(
            "CREATE TRIGGER fail_reminder BEFORE INSERT ON op_log WHEN json_extract(NEW.event,'$.kind')='ReminderFired' BEGIN SELECT RAISE(ABORT,'receipt failed'); END",
          );
          expect((yield* Effect.result(store.scheduled.runDue()))._tag).toBe(
            "Failure",
          );
          expect(
            (yield* store.tasks()).map((task) => [
              task.status,
              task.row_version,
            ]),
          ).toEqual([["snoozed", 1]]);
          expect((yield* store.history()).length).toBe(1);
          db.exec("DROP TRIGGER fail_reminder");
          expect(yield* store.scheduled.runDue()).toEqual({
            woken: 1,
            reminders: 1,
          });
        } finally {
          db.close();
        }
      }),
    ),
  );

  it.effect(
    "cleans only expired credentials at the exact boundary and keeps History",
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const { store } = yield* fixture;
          yield* store.auth.setupOwner("scheduler test passphrase");
          const session = yield* store.auth.signIn("scheduler test passphrase");
          const token = yield* store.auth.issueToken({
            credential: session.credential,
            token: {
              name: "short",
              profile,
              scope: "read-only",
              expires_at: Schema.decodeUnknownSync(Instant)(
                new Date(at + 1000).toISOString(),
              ),
            },
          });
          expect(yield* store.auth.nextExpiry()).toBe(at + 1000);
          expect(yield* store.auth.cleanupExpired()).toBe(0);
          yield* TestClock.setTime(at + 1000);
          expect(yield* store.auth.cleanupExpired()).toBe(1);
          expect(yield* store.auth.cleanupExpired()).toBe(0);
          expect(
            yield* store.auth.listTokens({ credential: session.credential }),
          ).toEqual([]);
          expect(
            (yield* Effect.result(
              store.auth.authenticate({
                credential: token.credential,
                profile,
                access: "read",
              }),
            ))._tag,
          ).toBe("Failure");
          expect(yield* store.auth.nextExpiry()).toBe(at + 7 * 86400000);
          expect(
            (yield* store.history()).filter(
              (entry) =>
                entry.event.kind === "AuthChanged" &&
                entry.event.action === "cleanupExpired",
            ).length,
          ).toBe(1);
          yield* TestClock.setTime(at + 7 * 86400000);
          expect(yield* store.auth.cleanupExpired()).toBe(1);
          expect(yield* store.auth.nextExpiry()).toBe(null);
        }),
      ),
  );
  it.effect(
    "keeps distinct submillisecond due instants and waits until they have passed",
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const { store, add } = yield* fixture;
          yield* add({
            ...taskInput,
            due_at: {
              kind: "instant",
              utc: "2026-10-27T14:00:00.000000001Z",
              time_zone: "UTC",
            },
          });
          expect(yield* store.scheduled.nextAt()).toBe(at + 1);
          expect(yield* store.scheduled.runDue()).toEqual({
            woken: 0,
            reminders: 0,
          });
          yield* TestClock.setTime(at + 1);
          expect(yield* store.scheduled.runDue()).toEqual({
            woken: 0,
            reminders: 1,
          });
          yield* store.auth.setupOwner("scheduler test passphrase");
          const session = yield* store.auth.signIn("scheduler test passphrase");
          yield* new TaskCommands(store).edit(
            {
              credential: session.credential,
              profile,
              task_id: Schema.decodeUnknownSync(Task)(taskInput).id,
            },
            {
              from_version: Schema.decodeUnknownSync(Version)(1),
              changes: {
                due_at: {
                  kind: "instant",
                  utc: Schema.decodeUnknownSync(Instant)(
                    "2026-10-27T14:00:00.000000002Z",
                  ),
                  time_zone: Schema.decodeUnknownSync(TimeZoneId)("UTC"),
                },
              },
            },
          );
          expect(yield* store.scheduled.runDue()).toEqual({
            woken: 0,
            reminders: 1,
          });
          expect(
            (yield* store.history()).flatMap((entry) =>
              entry.event.kind === "ReminderFired" ? [entry.event.due_at] : [],
            ),
          ).toEqual([
            "2026-10-27T14:00:00.000000001Z",
            "2026-10-27T14:00:00.000000002Z",
          ]);
        }),
      ),
  );
});

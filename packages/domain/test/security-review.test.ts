// Regression tests for the second security review of the input limits,
// rejection bounds and sign-in lockout (SOL-1 to SOL-6).
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "@effect/vitest";
import { Effect, Fiber, Schema } from "effect";
import { TestClock } from "effect/testing";
import { AttachmentCommands } from "../src/attachment-commands.ts";
import { AttachManyItem } from "../src/attachments.ts";
import { AuthError, TokenOptions } from "../src/auth/model.ts";
import { BatchEditRequest } from "../src/batch-edit.ts";
import {
  createTask,
  moveTask,
  mutateTask,
  revertTask,
} from "../src/commands.ts";
import { Tag, Task } from "../src/entities.ts";
import { ProfileId } from "../src/ids.ts";
import { importTasks } from "../src/import-tasks.ts";
import { inputLimits } from "../src/limits.ts";
import {
  type OperationStore,
  openStore,
  TaskCommands,
} from "../src/store/store.ts";
import { CreateSeries, CreateTask } from "../src/task-commands.ts";
import {
  actor,
  created as createdEvent,
  profile,
  taskInput,
  work,
} from "./store-fixtures.ts";

const passphrase = "scratch review passphrase";
const withStore = <A, E>(
  run: (store: OperationStore, path: string) => Effect.Effect<A, E>,
) =>
  Effect.scoped(
    Effect.gen(function* () {
      yield* TestClock.setTime(Date.parse("2026-11-06T12:00:00Z"));
      const directory = yield* Effect.acquireRelease(
        Effect.sync(() => mkdtempSync(join(tmpdir(), "todo-review-"))),
        (path) =>
          Effect.sync(() => rmSync(path, { recursive: true, force: true })),
      );
      const store = yield* Effect.acquireRelease(
        openStore({ path: join(directory, "scratch.db") }),
        (value) => Effect.orDie(value.close()),
      );
      yield* store.putProfile(work);
      return yield* run(store, join(directory, "scratch.db"));
    }),
  );
const owner = (store: OperationStore) =>
  Effect.gen(function* () {
    yield* store.auth.setupOwner(passphrase);
    const session = yield* store.auth.signIn(passphrase);
    return { credential: session.credential, profile };
  });
const historyText = (store: OperationStore) =>
  Effect.map(store.history(), (entries) => JSON.stringify(entries));

describe("second security review", () => {
  it.effect(
    "SOL-1: a sign-in verified against the old hash gets no Session once a reset replaced it",
    () =>
      withStore((store) =>
        Effect.gen(function* () {
          yield* owner(store);
          const verify = Bun.password.verify;
          let release = () => {};
          const held = new Promise<void>((resolve) => {
            release = resolve;
          });
          let entered = () => {};
          const started = new Promise<void>((resolve) => {
            entered = resolve;
          });
          Bun.password.verify = async (...args) => {
            entered();
            await held;
            return verify(...args);
          };
          try {
            const signIn = yield* Effect.forkChild(
              Effect.result(store.auth.signIn(passphrase)),
            );
            yield* Effect.promise(() => started);
            Bun.password.verify = verify;
            yield* store.auth.resetPassphrase("a replacement passphrase");
            release();
            const result = yield* Fiber.join(signIn);
            expect(result._tag).toBe("Failure");
            expect(
              result._tag === "Failure" && result.failure instanceof AuthError
                ? result.failure.detail
                : null,
            ).toBe("invalid_passphrase");
          } finally {
            Bun.password.verify = verify;
            release();
          }
        }),
      ),
  );

  it.effect(
    "SOL-2: a large refused import naming a purged Task stores none of its content",
    () =>
      withStore((store) =>
        Effect.gen(function* () {
          const request = yield* owner(store);
          const commands = new TaskCommands(store);
          const created = yield* commands.create(request, {
            title: "Purged secret title",
          });
          if (created.outcome !== "committed") throw new Error("fixture");
          const target = { ...request, task_id: created.task.id };
          const deleted = yield* commands.delete(target, {
            from_version: created.task.row_version,
          });
          if (deleted.outcome !== "committed") throw new Error("fixture");
          const purged = yield* commands.purge(target, {
            from_version: deleted.task.row_version,
          });
          expect(purged.outcome).toBe("committed");
          yield* importTasks(store, request, {
            items: [
              {
                external_id: "late",
                task_id: created.task.id,
                title: "Purged secret title",
                description: "x".repeat(40_000),
                unexpected: true,
              },
            ],
          });
          expect(yield* historyText(store)).not.toContain(
            "Purged secret title",
          );
          const rejected = (yield* store.history()).filter(
            (entry) => entry.event.kind === "TaskAttemptRejected",
          );
          const last = rejected.at(-1)?.event;
          expect(
            last?.kind === "TaskAttemptRejected"
              ? last.violations[0]?.received
              : undefined,
          ).toEqual({ truncated: true, characters: expect.any(Number) });
        }),
      ),
  );

  it.effect(
    "SOL-3: a refused attach-many item with a huge Task id stores a bounded event",
    () =>
      withStore((store) =>
        Effect.gen(function* () {
          const request = yield* owner(store);
          const before = (yield* historyText(store)).length;
          yield* new AttachmentCommands(store).attachMany(request, {
            items: [
              {
                task_id: "q".repeat(1_000_000),
                from_version: 1,
                attachments: [],
              },
            ],
          });
          expect((yield* historyText(store)).length - before).toBeLessThan(
            2_000,
          );
        }),
      ),
  );

  it("SOL-4: refuses times with unbounded fractional seconds or zones", () => {
    const long = `2026-11-06T12:00:00.${"0".repeat(1_000)}Z`;
    expect(
      Schema.is(CreateTask)({
        title: "Due",
        due_at: {
          kind: "instant",
          utc: "2026-11-06T12:00:00.000Z",
          time_zone: "UTC",
        },
      }),
    ).toBe(true);
    expect(
      Schema.is(CreateTask)({
        title: "Due",
        due_at: { kind: "instant", utc: long, time_zone: "UTC" },
      }),
    ).toBe(false);
    expect(
      Schema.is(CreateSeries)({
        task: { title: "Daily" },
        recurrence: {
          dtstart: { kind: "instant", utc: long, time_zone: "UTC" },
          rrule: "FREQ=DAILY",
          exdate: [],
        },
      }),
    ).toBe(false);
    expect(
      Schema.is(TokenOptions)({
        name: "agent",
        profile: null,
        scope: "read-only",
        expires_at: long,
      }),
    ).toBe(false);
  });

  it.effect(
    "SOL-5: a Task cannot grow past 100 Tags through comma lists or 100 Attachments through repeated groups",
    () =>
      withStore((store) =>
        Effect.gen(function* () {
          const request = yield* owner(store);
          const commands = new TaskCommands(store);
          const names = Array.from({ length: 100 }, (_, group) =>
            Array.from({ length: 20 }, (_, index) => `t${group}-${index}`).join(
              ",",
            ),
          );
          const tagged = yield* commands.create(request, {
            title: "Tagged",
            tag_names: names,
          });
          expect(tagged.outcome).toBe("rejected");
          const created = yield* commands.create(request, { title: "Linked" });
          if (created.outcome !== "committed") throw new Error("fixture");
          const links = (from: number) =>
            Array.from({ length: 100 }, (_, index) => ({
              kind: "link" as const,
              url: `https://example.com/${from}/${index}`,
            }));
          const report = yield* new AttachmentCommands(store).attachMany(
            request,
            {
              items: [
                {
                  task_id: created.task.id,
                  from_version: 1,
                  attachments: links(1),
                },
                {
                  task_id: created.task.id,
                  from_version: 2,
                  attachments: links(2),
                },
              ],
            },
          );
          expect(report.items.map((row) => row.outcome)).toEqual([
            "attached",
            "rejected",
          ]);
          const task = (yield* commands.list(request)).find(
            (value) => value.id === created.task.id,
          );
          expect(task?.attachments?.length).toBe(100);
        }),
      ),
  );

  it.effect(
    "SOL-6: sign-in on a database without an owner is also locked after 10 attempts",
    () =>
      withStore((store) =>
        Effect.gen(function* () {
          const details = [];
          for (let index = 0; index < 15; index++) {
            const error = yield* Effect.flip(store.auth.signIn("anything"));
            details.push(error instanceof AuthError ? error.detail : "other");
          }
          expect(details).toEqual([
            ...Array(10).fill("invalid_passphrase"),
            ...Array(5).fill("sign_in_locked"),
          ]);
          const rows = (yield* store.history()).filter(
            (entry) => entry.event.kind === "AuthAttemptRejected",
          );
          expect(rows).toHaveLength(11);
        }),
      ),
  );

  it.effect(
    "DS2-4: separate database handles guessing at once get only 10 results in total",
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          yield* TestClock.setTime(Date.parse("2026-11-06T12:00:00Z"));
          const directory = yield* Effect.acquireRelease(
            Effect.sync(() => mkdtempSync(join(tmpdir(), "todo-review-"))),
            (path) =>
              Effect.sync(() => rmSync(path, { recursive: true, force: true })),
          );
          const path = join(directory, "scratch.db");
          const open = Effect.acquireRelease(openStore({ path }), (value) =>
            Effect.orDie(value.close()),
          );
          const first = yield* open;
          yield* first.auth.setupOwner(passphrase);
          const handles = [
            first,
            yield* open,
            yield* open,
            yield* open,
            yield* open,
          ];
          // Five handles have five queues; three guesses each run at once.
          const outcomes = yield* Effect.all(
            handles.flatMap((store) =>
              [0, 1, 2].map(() =>
                Effect.map(
                  Effect.flip(store.auth.signIn("wrong guess")),
                  (error) =>
                    error instanceof AuthError ? error.detail : "other",
                ),
              ),
            ),
            { concurrency: "unbounded" },
          );
          const counted = outcomes.filter(
            (detail) => detail === "invalid_passphrase",
          );
          expect(counted).toHaveLength(10);
          expect(
            outcomes
              .filter((detail) => detail !== "invalid_passphrase")
              .every(
                (detail) =>
                  detail === "sign_in_locked" || detail === "sign_in_busy",
              ),
          ).toBe(true);
          expect(
            (yield* first.history()).filter(
              (entry) =>
                entry.event.kind === "AuthAttemptRejected" &&
                entry.event.detail === "invalid_passphrase",
            ),
          ).toHaveLength(10);
        }),
      ),
  );

  it("DS2-3: refuses submitted Task and Attachment ids over 200 characters", () => {
    const item = (task_id: string) => ({ task_id, from_version: 1 });
    const batch = (task_id: string) => ({
      items: [item(task_id)],
      changes: { priority: "P1" },
    });
    expect(Schema.is(BatchEditRequest)(batch("t".repeat(200)))).toBe(true);
    expect(Schema.is(BatchEditRequest)(batch("t".repeat(201)))).toBe(false);
    expect(
      Schema.is(AttachManyItem)({
        ...item("t".repeat(201)),
        attachments: [{ kind: "link", url: "https://example.com/" }],
      }),
    ).toBe(false);
  });

  it.effect(
    "R-1: a correct sign-in that finishes after the 10th failure is refused as locked",
    () =>
      withStore((store, path) =>
        Effect.gen(function* () {
          yield* store.auth.setupOwner(passphrase);
          for (let index = 0; index < 9; index++)
            yield* Effect.flip(store.auth.signIn("wrong guess"));
          const verify = Bun.password.verify;
          let release = () => {};
          const held = new Promise<void>((resolve) => {
            release = resolve;
          });
          let entered = () => {};
          const started = new Promise<void>((resolve) => {
            entered = resolve;
          });
          // Hold only the correct passphrase's verification.
          Bun.password.verify = async (value, ...rest) => {
            if (value === passphrase) {
              entered();
              await held;
            }
            return verify(value, ...rest);
          };
          try {
            const correct = yield* Effect.forkChild(
              Effect.flip(store.auth.signIn(passphrase)),
            );
            yield* Effect.promise(() => started);
            const other = yield* openStore({ path });
            try {
              yield* Effect.flip(other.auth.signIn("wrong guess"));
            } finally {
              yield* Effect.orDie(other.close());
            }
            release();
            const error = yield* Fiber.join(correct);
            expect(error instanceof AuthError ? error.detail : null).toBe(
              "sign_in_locked",
            );
          } finally {
            Bun.password.verify = verify;
            release();
          }
        }),
      ),
  );

  it.effect(
    "R-2: Move and Revert of the Move keep a Task that is already past the Tag limit",
    () =>
      withStore((store) =>
        Effect.gen(function* () {
          const request = yield* owner(store);
          const personal = Schema.decodeUnknownSync(ProfileId)("personal");
          yield* store.putProfile({ ...work, id: personal, name: "Personal" });
          const commands = new TaskCommands(store);
          const created = yield* commands.create(request, {
            title: "Many tags",
            tag_names: Array.from({ length: 60 }, (_, index) => `tag${index}`),
          });
          if (created.outcome !== "committed") throw new Error("fixture");
          // Lower the limit so this Task looks like one written before it.
          const limits = inputLimits as { tagsPerTask: number };
          const original = limits.tagsPerTask;
          limits.tagsPerTask = 50;
          try {
            const target = { ...request, task_id: created.task.id };
            const grown = yield* commands.edit(target, {
              from_version: created.task.row_version,
              changes: {
                tag_names: [
                  ...Array.from({ length: 60 }, (_, index) => `tag${index}`),
                  "one more",
                ],
              },
            });
            expect(grown.outcome).toBe("rejected");
            const moved = yield* moveTask(store, target, {
              from_version: created.task.row_version,
              destination_profile: personal,
            });
            expect(moved.outcome).toBe("committed");
            const arrived = (yield* commands.list({
              ...request,
              profile: personal,
            }))[0];
            expect(arrived?.tags).toHaveLength(60);
            if (!arrived) throw new Error("fixture");
            // Reverting the Move brings the Task back with the same Tags.
            const arrival = (yield* store.history()).find(
              (entry) => entry.event.kind === "TaskMovedIn",
            );
            if (!arrival) throw new Error("fixture");
            const reverted = yield* revertTask(
              store,
              { ...request, profile: personal, task_id: arrived.id },
              { from_version: arrived.row_version, seq: arrival.seq },
            );
            expect(reverted.outcome).toBe("committed");
            const back = (yield* commands.list(request)).find(
              (task) => task.id === arrived.id,
            );
            expect(back?.tags).toHaveLength(60);
          } finally {
            limits.tagsPerTask = original;
          }
        }),
      ),
  );

  it.effect(
    "SOL-R-3: a CLI title edit keeps working on an older Task with more than 100 Tags",
    () =>
      withStore((store) =>
        Effect.gen(function* () {
          const request = yield* owner(store);
          const limits = inputLimits as { tagsPerTask: number };
          const original = limits.tagsPerTask;
          // Append a 101-Tag Task as an older version would have written it.
          const tags = Array.from({ length: 101 }, (_, index) =>
            Schema.decodeUnknownSync(Tag)({
              id: `tag-${index}`,
              profile_id: "work",
              name: `tag${index}`,
            }),
          );
          const older = Schema.decodeUnknownSync(Task)({
            ...taskInput,
            id: "older-task",
            tags: tags.map((tag) => tag.id),
          });
          limits.tagsPerTask = 200;
          try {
            yield* store.append({
              actor,
              profile,
              event: { ...createdEvent, task: older, tags },
            });
          } finally {
            limits.tagsPerTask = original;
          }
          const createdTask = (yield* new TaskCommands(store).list(request))[0];
          if (!createdTask) throw new Error("fixture");
          expect(createdTask.tags).toHaveLength(101);
          const created = { task: createdTask };
          const edited = yield* mutateTask(
            store,
            request,
            "edit",
            created.task.id,
            created.task.row_version,
            { title: "Renamed older Task" },
          );
          expect(edited).toMatchObject({
            outcome: "committed",
            task: { title: "Renamed older Task" },
          });
          expect(
            (yield* new TaskCommands(store).list(request))[0]?.tags,
          ).toHaveLength(101);
        }),
      ),
  );

  it.effect(
    "SOL-R-4: the CLI --recurrence flag meets the same exdate limit as HTTP",
    () =>
      withStore((store) =>
        Effect.gen(function* () {
          const request = yield* owner(store);
          const recurrence = (count: number) =>
            JSON.stringify({
              dtstart: { kind: "date", date: "2026-11-06" },
              rrule: "FREQ=DAILY",
              exdate: Array.from({ length: count }, () => ({
                kind: "date",
                date: "2026-11-07",
              })),
            });
          const accepted = yield* Effect.result(
            createTask(store, request, {
              title: "Daily",
              recurrence: recurrence(1_000),
            }),
          );
          expect(accepted._tag).toBe("Success");
          const refused = yield* Effect.result(
            createTask(store, request, {
              title: "Daily too",
              recurrence: recurrence(1_001),
            }),
          );
          expect(refused._tag).toBe("Failure");
          expect(
            (yield* new TaskCommands(store).list(request)).map(
              (task) => task.title,
            ),
          ).toEqual(["Daily"]);
        }),
      ),
  );

  it.effect(
    "R2-1: a Move through the store cannot grow a Task past 100 Tags",
    () =>
      withStore((store) =>
        Effect.gen(function* () {
          const request = yield* owner(store);
          const personal = Schema.decodeUnknownSync(ProfileId)("personal");
          yield* store.putProfile({ ...work, id: personal, name: "Personal" });
          const created = yield* new TaskCommands(store).create(request, {
            title: "Bare",
          });
          if (created.outcome !== "committed") throw new Error("fixture");
          const before = created.task;
          const crafted = (count: number) => {
            const tags = Array.from({ length: count }, (_, index) =>
              Schema.decodeUnknownSync(Tag)({
                id: `moved-${count}-${index}`,
                profile_id: "personal",
                name: `moved${count}-${index}`,
              }),
            );
            return store.move({
              actor,
              before,
              after: Schema.decodeUnknownSync(Task)({
                ...before,
                profile_id: personal,
                row_version: before.row_version + 1,
                tags: tags.map((tag) => tag.id),
              }),
              original_seq: null,
              definitions: { project: null, tags },
            });
          };
          expect((yield* crafted(101)).outcome).toBe("rejected");
          // The same crafted Move within the limit commits, so the refusal
          // above comes from the limit.
          expect((yield* crafted(50)).outcome).toBe("committed");
        }),
      ),
  );
});

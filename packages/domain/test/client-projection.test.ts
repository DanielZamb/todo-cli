import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "@effect/vitest";
import { ClientReads, Discovery, readGraph, TaskId } from "@todo/domain";
import { openStore, TaskCommands } from "@todo/domain/store";
import { Effect, Schema } from "effect";
import { TestClock } from "effect/testing";
import { vi } from "vitest";
import { actor, created, taskInput, time, work } from "./store-fixtures.ts";

it.effect(
  "projection routes return literal results without decoding History",
  () =>
    Effect.acquireUseRelease(
      Effect.sync(() => mkdtempSync(join(tmpdir(), "todo-projection-test-"))),
      (directory) =>
        Effect.acquireUseRelease(
          openStore({ path: join(directory, "scratch.db") }),
          (store) =>
            Effect.gen(function* () {
              yield* TestClock.setTime(Date.parse(time));
              yield* store.putProfile(work);
              yield* store.auth.setupOwner("projection scratch only");
              const { credential } = yield* store.auth.signIn(
                "projection scratch only",
              );
              yield* store.append({ actor, profile: work.id, event: created });
              const reads = new ClientReads(store);
              const request = { credential, profile: work.id };
              const parse = JSON.parse;
              const spy = vi.spyOn(JSON, "parse");
              try {
                expect(
                  (yield* reads.profiles(credential)).map((p) => [
                    p.id,
                    p.visible_task_count,
                    p.open_task_count,
                    p.inbox_task_count,
                  ]),
                ).toEqual([["work", 1, 1, 1]]);
                expect(yield* reads.projects(request)).toEqual([]);
                expect(yield* reads.tags(request)).toEqual([]);
                expect(
                  (yield* reads.view(request, "inbox", time)).groups.map((g) =>
                    g.tasks.map((t) => t.id),
                  ),
                ).toEqual([["task-1"]]);
                expect(
                  (yield* new TaskCommands(store).list(request)).map(
                    (t) => t.id,
                  ),
                ).toEqual(["task-1"]);
                expect(
                  (yield* readGraph(
                    store,
                    {
                      ...request,
                      task_id: Schema.decodeUnknownSync(TaskId)(taskInput.id),
                    },
                    time,
                  ))?.nodes.map((n) => n.task.id),
                ).toEqual(["task-1"]);
                expect(
                  (yield* new Discovery(store).directory(credential)).map(
                    (p) => p.open_task_count,
                  ),
                ).toEqual([1]);
                expect(
                  yield* new Discovery(store).lookup(credential, {
                    prefix: "ab",
                  }),
                ).toEqual([]);
                expect(
                  spy.mock.calls
                    .map(([text]) => parse(text))
                    .filter(
                      (value) =>
                        typeof value === "object" &&
                        value !== null &&
                        "kind" in value,
                    ),
                ).toEqual([]);
              } finally {
                spy.mockRestore();
              }
              const historySpy = vi.spyOn(JSON, "parse");
              try {
                expect(
                  (yield* reads.history({
                    ...request,
                    task_id: Schema.decodeUnknownSync(TaskId)(taskInput.id),
                  })).map((entry) => entry.event.kind),
                ).toEqual(["TaskCreated"]);
                expect(historySpy.mock.calls.length).toBe(1);
              } finally {
                historySpy.mockRestore();
              }
              yield* store.reject({
                actor,
                profile: work.id,
                reason: "validation",
                event: {
                  kind: "DependencyAdded",
                  occurred_at: time,
                  dependent_id: taskInput.id,
                  blocker_id: "\u0000blocker",
                },
              });
              expect(
                (yield* reads.history({
                  ...request,
                  task_id: Schema.decodeUnknownSync(TaskId)("\u0000blocker"),
                })).map((entry) => entry.event.kind),
              ).toEqual(["TaskAttemptRejected"]);
            }),
          (store) => Effect.orDie(store.close()),
        ),
      (directory) =>
        Effect.sync(() => rmSync(directory, { recursive: true, force: true })),
    ),
);

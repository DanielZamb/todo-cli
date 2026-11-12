import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "@effect/vitest";
import type { AccessRequest } from "@todo/domain";
import { ClientReads, ProfileId, readGraph, Task, TaskId } from "@todo/domain";
import type { OperationStore } from "@todo/domain/store";
import { openStore, TaskCommands } from "@todo/domain/store";
import { Effect, Schema } from "effect";
import { TestClock } from "effect/testing";
import { expectTypeOf } from "vitest";
import { actor, created, taskInput, time, work } from "./store-fixtures.ts";

it.effect(
  "read boundaries keep checked Profile, ids and filters across mutation hooks",
  () =>
    Effect.acquireUseRelease(
      Effect.sync(() => mkdtempSync(join(tmpdir(), "todo-read-boundary-"))),
      (directory) =>
        Effect.acquireUseRelease(
          openStore({ path: join(directory, "scratch.db") }),
          (store) =>
            Effect.gen(function* () {
              yield* TestClock.setTime(Date.parse(time));
              const other = {
                ...work,
                id: Schema.decodeUnknownSync(ProfileId)("other"),
                name: "Other",
              };
              yield* store.putProfile(work);
              yield* store.putProfile(other);
              yield* store.auth.setupOwner("read boundary scratch only");
              const { credential } = yield* store.auth.signIn(
                "read boundary scratch only",
              );
              yield* store.append({
                actor,
                profile: work.id,
                event: {
                  ...created,
                  task: Schema.decodeUnknownSync(Task)({
                    ...taskInput,
                    id: "aa-task-1",
                    title: "Ship first",
                  }),
                },
              });
              for (const [id, profile, title] of [
                ["bb-task-2", work.id, "Same Profile second"],
                ["cc-secret", other.id, "Foreign secret"],
              ] as const) {
                yield* store.append({
                  actor,
                  profile,
                  event: {
                    ...created,
                    task: Schema.decodeUnknownSync(Task)({
                      ...taskInput,
                      id,
                      profile_id: profile,
                      title,
                    }),
                  },
                });
              }
              const token = yield* store.auth.issueToken({
                credential,
                token: { name: "scoped", profile: work.id, scope: "read-only" },
              });
              const commands = new TaskCommands(store),
                reads = new ClientReads(store);
              const used = store.diagnostics.credentialUsed.bind(
                  store.diagnostics,
                ),
                graph = store.graph.bind(store);
              for (const hook of ["credential", "graph"]) {
                for (const route of [
                  "list",
                  "search",
                  "show",
                  "graph",
                  "history",
                  "view",
                ]) {
                  const request = {
                    credential: token.credential,
                    profile: work.id,
                    task_id: Schema.decodeUnknownSync(TaskId)("aa-task-1"),
                  };
                  const filters = { prefix: "aa", text: "Ship" };
                  const mutate = () => {
                    request.profile = other.id;
                    request.task_id =
                      Schema.decodeUnknownSync(TaskId)("cc-secret");
                    filters.prefix = "cc";
                    filters.text = "Foreign";
                  };
                  Object.defineProperty(store.diagnostics, "credentialUsed", {
                    configurable: true,
                    value: (...args: Parameters<typeof used>) => {
                      used(...args);
                      if (hook === "credential") mutate();
                    },
                  });
                  Object.defineProperty(store, "graph", {
                    configurable: true,
                    value: (...args: Parameters<typeof graph>) => {
                      if (hook === "graph") mutate();
                      return graph(...args);
                    },
                  });
                  try {
                    const result =
                      route === "list"
                        ? (yield* commands.list(request, {
                            prefix: filters.prefix,
                          })).map((t) => t.id)
                        : route === "search"
                          ? (yield* commands.list(request, filters)).map(
                              (t) => t.id,
                            )
                          : route === "show"
                            ? [(yield* commands.get(request))?.id]
                            : route === "graph"
                              ? (yield* readGraph(
                                  store,
                                  request,
                                  time,
                                ))?.nodes.map((n) => n.task.id)
                              : route === "history"
                                ? (yield* reads.history(request)).map((e) =>
                                    e.event.kind === "TaskCreated"
                                      ? e.event.task.id
                                      : e.event.kind,
                                  )
                                : (yield* reads.view(
                                    request,
                                    "inbox",
                                    time,
                                  )).groups.flatMap((g) =>
                                    g.tasks.map((t) => t.id),
                                  );
                    expect({ hook, route, result }).toEqual({
                      hook,
                      route,
                      result:
                        route === "view"
                          ? ["aa-task-1", "bb-task-2"]
                          : ["aa-task-1"],
                    });
                  } finally {
                    Object.defineProperty(store.diagnostics, "credentialUsed", {
                      value: used,
                    });
                    Object.defineProperty(store, "graph", { value: graph });
                  }
                }
              }
              const request = {
                credential: token.credential,
                profile: work.id,
                task_id: Schema.decodeUnknownSync(TaskId)("aa-task-1"),
              };
              Object.defineProperty(store.diagnostics, "credentialUsed", {
                configurable: true,
                value: (...args: Parameters<typeof used>) => {
                  used(...args);
                  request.task_id =
                    Schema.decodeUnknownSync(TaskId)("bb-task-2");
                },
              });
              try {
                expect(
                  (yield* reads.history(request)).map((e) =>
                    e.event.kind === "TaskCreated"
                      ? e.event.task.id
                      : e.event.kind,
                  ),
                ).toEqual(["aa-task-1"]);
              } finally {
                Object.defineProperty(store.diagnostics, "credentialUsed", {
                  value: used,
                });
              }
            }),
          (store) => Effect.orDie(store.close()),
        ),
      (directory) =>
        Effect.sync(() => rmSync(directory, { recursive: true, force: true })),
    ),
);

it.effect(
  "Profile summaries return only the checked set after a hook inserts a Profile",
  () =>
    Effect.acquireUseRelease(
      Effect.sync(() => mkdtempSync(join(tmpdir(), "todo-checked-profiles-"))),
      (directory) =>
        Effect.acquireUseRelease(
          openStore({ path: join(directory, "scratch.db") }),
          (store) =>
            Effect.gen(function* () {
              yield* TestClock.setTime(Date.parse(time));
              yield* store.putProfile(work);
              yield* store.auth.setupOwner("checked profiles scratch only");
              const { credential } = yield* store.auth.signIn(
                "checked profiles scratch only",
              );
              const used = store.diagnostics.credentialUsed.bind(
                store.diagnostics,
              );
              let calls = 0;
              const late = {
                ...work,
                id: Schema.decodeUnknownSync(ProfileId)("late"),
                name: "Late",
              };
              Object.defineProperty(store.diagnostics, "credentialUsed", {
                configurable: true,
                value: (...args: Parameters<typeof used>) => {
                  used(...args);
                  if (++calls === 2) Effect.runSync(store.putProfile(late));
                },
              });
              try {
                expect(
                  (yield* new ClientReads(store).profiles(credential)).map(
                    (p) => [p.id, p.name, p.visible_task_count],
                  ),
                ).toEqual([["work", "Work", 0]]);
                expect(calls).toBe(2);
                expect((yield* store.profiles()).map((p) => p.id)).toEqual([
                  "late",
                  "work",
                ]);
              } finally {
                Object.defineProperty(store.diagnostics, "credentialUsed", {
                  value: used,
                });
              }
            }),
          (store) => Effect.orDie(store.close()),
        ),
      (directory) =>
        Effect.sync(() => rmSync(directory, { recursive: true, force: true })),
    ),
);

it.effect(
  "read authority owns and freezes validated fields without freezing its caller",
  () =>
    Effect.acquireUseRelease(
      Effect.sync(() => mkdtempSync(join(tmpdir(), "todo-immutable-read-"))),
      (directory) =>
        Effect.acquireUseRelease(
          openStore({ path: join(directory, "scratch.db") }),
          (store) =>
            Effect.gen(function* () {
              yield* TestClock.setTime(Date.parse(time));
              yield* store.putProfile(work);
              yield* store.auth.setupOwner("immutable read scratch only");
              const { credential } = yield* store.auth.signIn(
                "immutable read scratch only",
              );
              const token = yield* store.auth.issueToken({
                credential,
                token: { name: "read", profile: work.id, scope: "read-only" },
              });
              const request = {
                credential: token.credential,
                profile: work.id,
              };
              const fields = { filters: { prefix: "aa", tags: ["one"] } };
              const { selection: read } = yield* store.auth.readMetadata(
                request,
                Schema.Struct({
                  filters: Schema.Struct({
                    prefix: Schema.String,
                    tags: Schema.Array(Schema.String),
                  }),
                }),
                fields,
              );
              fields.filters.prefix = "ff";
              fields.filters.tags.push("two");
              if (read.kind !== "read")
                throw new Error("Expected a present Profile");
              expect(read.profile).toBe("work");
              expect(read.scope).toBe("read-only");
              expect(read.fields).toEqual({
                filters: { prefix: "aa", tags: ["one"] },
              });
              expect(Reflect.set(read, "profile", "other")).toBe(false);
              expect(Reflect.set(read.fields.filters, "prefix", "ff")).toBe(
                false,
              );
              expect(Reflect.set(read.fields.filters.tags, "0", "other")).toBe(
                false,
              );
              expect(Object.isFrozen(request)).toBe(false);
              expect(Object.isFrozen(fields.filters)).toBe(false);
            }),
          (store) => Effect.orDie(store.close()),
        ),
      (directory) =>
        Effect.sync(() => rmSync(directory, { recursive: true, force: true })),
    ),
);

it("query ports reject raw access requests at compile time", () => {
  expectTypeOf<AccessRequest>().not.toMatchTypeOf<
    Parameters<OperationStore["graphRead"]>[0]
  >();
  expectTypeOf<AccessRequest>().not.toMatchTypeOf<
    Parameters<OperationStore["changesRead"]>[0]
  >();
  expectTypeOf<AccessRequest>().not.toMatchTypeOf<
    Parameters<OperationStore["snapshots"]["showRead"]>[0]
  >();
});

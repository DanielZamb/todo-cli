import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "@effect/vitest";
import {
  ClientReads,
  Discovery,
  ProfileId,
  readGraph,
  Task,
  TaskId,
} from "@todo/domain";
import { AttachmentCommands } from "@todo/domain/attachments";
import { openStore, TaskCommands } from "@todo/domain/store";
import { Cause, Effect, Exit, Schema } from "effect";
import { TestClock } from "effect/testing";
import { taskHistory } from "../src/store/history-reads.ts";
import {
  counterfeitAuthority as counterfeit,
  authorityModes as modes,
} from "./authority-fixtures.ts";
import { actor, created, taskInput, time, work } from "./store-fixtures.ts";

it.effect(
  "every query port refuses copied or mutated authority values without returning data",
  () =>
    Effect.acquireUseRelease(
      Effect.sync(() => mkdtempSync(join(tmpdir(), "todo-authority-runtime-"))),
      (directory) =>
        Effect.acquireUseRelease(
          openStore({ path: join(directory, "scratch.db") }),
          (store) =>
            Effect.gen(function* () {
              yield* TestClock.setTime(Date.parse(time));
              yield* store.putProfile(work);
              const personal = {
                ...work,
                id: Schema.decodeUnknownSync(ProfileId)("personal"),
                name: "Personal",
              };
              yield* store.putProfile(personal);
              yield* store.auth.setupOwner("authority runtime scratch only");
              const { credential } = yield* store.auth.signIn(
                "authority runtime scratch only",
              );
              yield* store.append({ actor, profile: work.id, event: created });
              yield* store.append({
                actor,
                profile: personal.id,
                event: {
                  ...created,
                  task: Schema.decodeUnknownSync(Task)({
                    ...taskInput,
                    id: "foreign",
                    profile_id: personal.id,
                  }),
                },
              });
              const token = yield* store.auth.issueToken({
                credential,
                token: { name: "work", profile: work.id, scope: "read-only" },
              });
              const request = {
                credential: token.credential,
                profile: work.id,
                task_id: Schema.decodeUnknownSync(TaskId)("task-1"),
              };
              const snapshot = yield* store.snapshots.create(
                "runtime authority fixture",
              );
              yield* store.auth.readSnapshot(() =>
                Effect.gen(function* () {
                  const read = yield* store.auth.authorizeRead(
                    request,
                    Schema.Struct({ task_id: TaskId }),
                    { task_id: request.task_id },
                  );
                  const owner = yield* store.auth.ownerRead(
                    { credential },
                    Schema.Struct({ snapshot: Schema.String }),
                    { snapshot: snapshot.id },
                  );
                  const commands = new TaskCommands(store),
                    reads = new ClientReads(store),
                    discovery = new Discovery(store),
                    attachments = new AttachmentCommands(store);
                  const profiles = yield* store.auth.profilesRead(
                    { credential: token.credential },
                    Schema.Struct({}),
                    {},
                  );
                  const projection = Reflect.get(store.auth, "projection");
                  const database = Reflect.get(store, "db");
                  expect(Object.keys(read)).toEqual([]);
                  expect(structuredClone(read)).toEqual({});
                  const authorityConstructor = Reflect.get(
                    Object.getPrototypeOf(read),
                    "constructor",
                  );
                  expect(
                    Reflect.set(authorityConstructor, "inspect", () => ({
                      profile: "personal",
                    })),
                  ).toBe(false);
                  expect(
                    Reflect.set(
                      Object.getPrototypeOf(read),
                      "profile",
                      "personal",
                    ),
                  ).toBe(false);
                  const failures: string[] = [];
                  const attempts: Array<{
                    mode: string;
                    port: string;
                    refused: string;
                  }> = [];
                  const originalQuery: (...args: unknown[]) => unknown =
                    Reflect.get(store.auth, "queryWithin");
                  const originalProfiles = store.auth.profilesRead.bind(
                    store.auth,
                  );
                  const direct = [
                    {
                      name: "diagnostics",
                      authority: owner,
                      invoke: (value: unknown) =>
                        Reflect.apply(
                          Reflect.get(store.diagnostics, "readWithin"),
                          store.diagnostics,
                          [value],
                        ),
                    },
                    {
                      name: "managed-image",
                      authority: read,
                      invoke: (value: unknown) =>
                        Reflect.apply(
                          Reflect.get(attachments, "imageWithin"),
                          attachments,
                          [value, created.task],
                        ),
                    },
                    {
                      name: "subscription",
                      authority: read,
                      invoke: (value: unknown) =>
                        Reflect.apply(store.auth.checkRead, store.auth, [
                          value,
                          "read",
                        ]),
                    },
                    {
                      name: "graph",
                      authority: read,
                      invoke: (value: unknown) =>
                        Reflect.apply(store.graphRead, store, [value]),
                    },
                    {
                      name: "changes",
                      authority: read,
                      invoke: (value: unknown) =>
                        Reflect.apply(store.changesRead, store, [value, 0]),
                    },
                    {
                      name: "snapshot-list",
                      authority: owner,
                      invoke: (value: unknown) =>
                        Reflect.apply(
                          store.snapshots.listRead,
                          store.snapshots,
                          [value],
                        ),
                    },
                    {
                      name: "snapshot-show",
                      authority: owner,
                      invoke: (value: unknown) =>
                        Reflect.apply(
                          store.snapshots.showRead,
                          store.snapshots,
                          [value],
                        ),
                    },
                    ...["metadata", "tasks", "catalog", "projects", "tags"].map(
                      (name) => ({
                        name: "projection-" + name,
                        authority: read,
                        invoke: (value: unknown) =>
                          Effect.try({
                            try: () =>
                              Reflect.apply(
                                Reflect.get(projection, name),
                                projection,
                                [value],
                              ),
                            catch: (cause) => cause,
                          }),
                      }),
                    ),
                    {
                      name: "projection-profiles",
                      authority: profiles.read,
                      invoke: (value: unknown) =>
                        Effect.try({
                          try: () =>
                            Reflect.apply(
                              Reflect.get(projection, "profiles"),
                              projection,
                              [value],
                            ),
                          catch: (cause) => cause,
                        }),
                    },
                    {
                      name: "task-history",
                      authority: read,
                      invoke: (value: unknown) =>
                        Effect.try({
                          try: () =>
                            Reflect.apply(taskHistory, undefined, [
                              database,
                              value,
                            ]),
                          catch: (cause) => cause,
                        }),
                    },
                  ];
                  expect(
                    (yield* store.graphRead(read)).tasks.map((task) => task.id),
                  ).toEqual(["task-1"]);
                  expect(
                    (yield* store.changesRead(read, 0)).entries.map(
                      (entry) => entry.profile,
                    ),
                  ).toEqual(["work", "work"]);
                  expect((yield* store.snapshots.showRead(owner)).id).toBe(
                    snapshot.id,
                  );
                  for (const mode of modes) {
                    for (const port of direct) {
                      let operation: Effect.Effect<unknown, unknown>;
                      try {
                        operation = port.invoke(
                          counterfeit(port.authority, mode),
                        );
                      } catch (error) {
                        if (
                          error instanceof TypeError ||
                          Reflect.get(Object(error), "_tag") === "StoreError"
                        ) {
                          attempts.push({
                            mode,
                            port: port.name,
                            refused: "construction",
                          });
                          continue;
                        }
                        throw error;
                      }
                      const result = yield* Effect.exit(operation);
                      attempts.push({
                        mode,
                        port: port.name,
                        refused: Exit.isFailure(result) ? "port" : "none",
                      });
                      if (
                        Exit.isSuccess(result) ||
                        Reflect.get(
                          Object(Cause.squash(result.cause)),
                          "_tag",
                        ) !== "StoreError"
                      )
                        failures.push(mode + ":" + port.name);
                    }
                    Object.defineProperty(store.auth, "queryWithin", {
                      configurable: true,
                      value: (...args: unknown[]) => {
                        const callback = args[3];
                        if (typeof callback !== "function")
                          throw Error("Missing query callback");
                        const wrapped = (value: object) =>
                          Reflect.apply(callback, undefined, [
                            counterfeit(value, mode),
                          ]);
                        return Reflect.apply(originalQuery, store.auth, [
                          ...args.slice(0, 3),
                          wrapped,
                          ...args.slice(4),
                        ]);
                      },
                    });
                    Object.defineProperty(store.auth, "profilesRead", {
                      configurable: true,
                      value: (...args: Parameters<typeof originalProfiles>) =>
                        originalProfiles(...args).pipe(
                          Effect.map((result) => ({
                            ...result,
                            read: counterfeit(result.read, mode),
                          })),
                        ),
                    });
                    const queries: Array<
                      [string, Effect.Effect<unknown, unknown>]
                    > = [
                      ["metadata", store.auth.metadata(request)],
                      ["catalog", store.auth.catalog(request)],
                      ["projects", reads.projects(request)],
                      ["tags", reads.tags(request)],
                      ["history", reads.history(request)],
                      [
                        "full-state",
                        store.auth.readState(request, Schema.Struct({}), {}),
                      ],
                      ["list", commands.list(request)],
                      ["show", commands.get(request)],
                      ["graph-query", readGraph(store, request, time)],
                      ["view", reads.view(request, "inbox", time)],
                      [
                        "image",
                        attachments.image(
                          request,
                          Schema.decodeUnknownSync(
                            Schema.NonEmptyString.pipe(
                              Schema.brand("AttachmentId"),
                            ),
                          )("image"),
                        ),
                      ],
                      [
                        "lookup",
                        discovery.lookup(token.credential, { prefix: "aa" }),
                      ],
                    ];
                    try {
                      for (const [name, operation] of queries) {
                        const result = yield* Effect.exit(operation);
                        attempts.push({
                          mode,
                          port: name,
                          refused: Exit.isFailure(result) ? "query" : "none",
                        });
                        if (
                          Exit.isSuccess(result) ||
                          Reflect.get(
                            Object(Cause.squash(result.cause)),
                            "_tag",
                          ) !== "StoreError"
                        )
                          failures.push(mode + ":" + name);
                      }
                    } finally {
                      Object.defineProperty(store.auth, "queryWithin", {
                        value: originalQuery,
                      });
                      Object.defineProperty(store.auth, "profilesRead", {
                        value: originalProfiles,
                      });
                    }
                  }
                  const wrongKindOperation: Effect.Effect<unknown, unknown> =
                    Reflect.apply(store.graphRead, store, [owner]);
                  const wrongKind = yield* Effect.exit(wrongKindOperation);
                  expect(Exit.isFailure(wrongKind)).toBe(true);
                  yield* Effect.acquireUseRelease(
                    openStore({ path: join(directory, "other.db") }),
                    (other) =>
                      Effect.gen(function* () {
                        const result = yield* Effect.exit(
                          other.graphRead(read),
                        );
                        expect(Exit.isFailure(result)).toBe(true);
                        if (Exit.isFailure(result))
                          expect(
                            Reflect.get(
                              Object(Cause.squash(result.cause)),
                              "_tag",
                            ),
                          ).toBe("StoreError");
                      }),
                    (other) => Effect.orDie(other.close()),
                  );
                  if (process.env.TODO_AUTHORITY_EVIDENCE)
                    writeFileSync(
                      process.env.TODO_AUTHORITY_EVIDENCE,
                      JSON.stringify(
                        {
                          modes,
                          ports: direct.map((port) => port.name),
                          attempts,
                          failures,
                        },
                        null,
                        2,
                      ),
                    );
                  expect(failures).toEqual([]);
                }),
              );
            }),
          (store) => Effect.orDie(store.close()),
        ),
      (directory) =>
        Effect.sync(() => rmSync(directory, { recursive: true, force: true })),
    ),
);

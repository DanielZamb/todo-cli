import { Database } from "bun:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "@effect/vitest";
import { openStore } from "@todo/domain/store";
import { Effect, Schema } from "effect";
import {
  provePurge,
  proveSharedMetadataPurge,
} from "../scripts/purge-proof.ts";
import { ProfileId, Series, Task } from "../src/index.ts";
import { finish, start, weekly } from "./recurrence-fixtures.ts";
import {
  actor,
  created,
  edited,
  later,
  profile,
  seedLegacy,
  sequence,
  task,
  taskInput,
  work,
} from "./store-fixtures.ts";

const scratch = <A, E>(run: (path: string) => Effect.Effect<A, E>) =>
  Effect.acquireUseRelease(
    Effect.sync(() => mkdtempSync(join(tmpdir(), "todo-c02-test-"))),
    (directory) => run(join(directory, "scratch.db")),
    (directory) =>
      Effect.sync(() => rmSync(directory, { recursive: true, force: true })),
  );

describe("transactional operation log", () => {
  it.effect(
    "sequential Purges erase formerly shared metadata from every replay fragment and raw bytes",
    () => scratch((path) => proveSharedMetadataPurge(path)),
  );
  it.effect(
    "Purge erases raw scratch database bytes after checkpoint and VACUUM, redacts snapshots and rolls back failures",
    () => scratch((path) => provePurge(path)),
  );

  it.effect(
    "Purge preserves shared Series and resolved next Occurrences through full and snapshot replay",
    () =>
      scratch((path) =>
        Effect.gen(function* () {
          const store = yield* openStore({ path });
          try {
            yield* store.putProfile(work);
            yield* store.startSeries(start(weekly, "first"));
            yield* store.finishTask(finish("first", "second"));
            const first = (yield* store.tasks()).find(
              (task) => task.id === "first",
            );
            if (!first) throw new Error("First Occurrence missing");
            const deleted = {
              ...first,
              row_version: 3,
              deleted_at: later,
              updated_at: later,
            };
            yield* store.append({
              actor,
              profile,
              event: {
                kind: "TaskDeleted",
                entity_version: 1,
                occurred_at: later,
                before: first,
                after: deleted,
              },
            });
            yield* store.takeSnapshot();
            yield* store.append({
              actor,
              profile,
              event: {
                kind: "TaskPurged",
                entity_version: 1,
                occurred_at: later,
                task_id: first.id,
                before: deleted,
              },
            });
            expect(
              (yield* store.tasks()).map((task) => [
                task.id,
                task.row_version,
                task.title,
              ]),
            ).toEqual([["second", 1, "Weekday review"]]);
            const rows = () => {
              const db = new Database(path, { readonly: true });
              try {
                return [
                  "tasks",
                  "task_tags",
                  "series",
                  "projects",
                  "tags",
                  "task_versions",
                  "series_versions",
                ].map((table) =>
                  db.query(`SELECT * FROM ${table} ORDER BY 1`).all(),
                );
              } finally {
                db.close();
              }
            };
            const expected = rows();
            yield* store.rebuild();
            expect(rows()).toEqual(expected);
            yield* store.rebuild({ useSnapshot: true });
            expect(rows()).toEqual(expected);
            const second = (yield* store.tasks())[0];
            if (!second) throw new Error("Second Occurrence missing");
            const deletedSecond = {
              ...second,
              row_version: 2,
              deleted_at: later,
              updated_at: later,
            };
            yield* store.append({
              actor,
              profile,
              event: {
                kind: "TaskDeleted",
                entity_version: 1,
                occurred_at: later,
                before: second,
                after: deletedSecond,
              },
            });
            yield* store.append({
              actor,
              profile,
              event: {
                kind: "TaskPurged",
                entity_version: 1,
                occurred_at: later,
                task_id: second.id,
                before: deletedSecond,
              },
            });
            expect(yield* store.series()).toEqual([]);
            const afterBoth = rows();
            yield* store.rebuild();
            expect(rows()).toEqual(afterBoth);
            yield* store.rebuild({ useSnapshot: true });
            expect(rows()).toEqual(afterBoth);
            expect(JSON.stringify(yield* store.history())).not.toContain(
              "Weekday review",
            );
          } finally {
            yield* store.close();
          }
        }),
      ),
  );
  it.effect("reopening redacts Purges recorded by an older store", () =>
    scratch((path) =>
      Effect.gen(function* () {
        const store = yield* openStore({ path });
        const deleted = {
          ...task,
          row_version: 2,
          deleted_at: later,
          updated_at: later,
        };
        const deletion = {
          kind: "TaskDeleted",
          entity_version: 1,
          occurred_at: later,
          before: task,
          after: deleted,
        };
        const purge = {
          kind: "TaskPurged",
          entity_version: 1,
          occurred_at: later,
          task_id: task.id,
          before: deleted,
        };
        try {
          yield* store.putProfile(work);
          yield* store.append({ actor, profile, event: created });
          yield* store.append({ actor, profile, event: deletion });
          yield* store.append({ actor, profile, event: purge });
        } finally {
          yield* store.close();
        }
        const old = new Database(path);
        try {
          old.exec("DROP TRIGGER op_log_no_update");
          for (const [index, event] of [created, deletion, purge].entries())
            old
              .query("UPDATE op_log SET event=? WHERE seq=?")
              .run(JSON.stringify(event), index + 1);
          old.exec(
            "CREATE TRIGGER op_log_no_update BEFORE UPDATE ON op_log BEGIN SELECT RAISE(ABORT, 'op_log is append-only'); END;",
          );
        } finally {
          old.close();
        }
        const reopened = yield* openStore({ path, create: false });
        try {
          expect(
            (yield* reopened.history()).map((entry) => entry.event.kind),
          ).toEqual([
            "TaskHistoryRedacted",
            "TaskHistoryRedacted",
            "TaskHistoryRedacted",
          ]);
          expect(
            (yield* reopened.revert({
              actor,
              profile,
              seq: sequence(3),
              occurred_at: later,
            })).reason,
          ).toBe("task_purged");
          expect(yield* reopened.rebuild()).toEqual([]);
        } finally {
          yield* reopened.close();
        }
      }),
    ),
  );
  it.effect(
    "opens WAL with a 5000ms timeout, appends changes and preserves rejected conflicts",
    () =>
      scratch((path) =>
        Effect.gen(function* () {
          const store = yield* openStore({ path });
          try {
            expect(yield* store.settings()).toEqual({
              journal_mode: "wal",
              busy_timeout: 5000,
              user_version: 6,
            });
            yield* store.putProfile(work);
            const first = yield* store.append({
              actor,
              profile,
              event: created,
            });
            const second = yield* store.append({
              actor,
              profile,
              event: edited,
            });
            const conflict = yield* store.append({
              actor,
              profile,
              event: edited,
            });
            expect([first.seq, second.seq, conflict.seq]).toEqual([1, 2, 3]);
            expect([
              first.from_version,
              first.to_version,
              second.from_version,
              second.to_version,
            ]).toEqual([null, 1, 1, 2]);
            expect({
              outcome: conflict.outcome,
              reason: conflict.reason,
              to_version: conflict.to_version,
            }).toEqual({
              outcome: "rejected",
              reason: "conflict",
              to_version: null,
            });
            expect(
              (yield* store.tasks()).map((value) => [
                value.id,
                value.title,
                value.row_version,
              ]),
            ).toEqual([["task-1", "Ship the store", 2]]);
            expect(
              (yield* store.history(1)).map((value) => [
                value.seq,
                value.outcome,
              ]),
            ).toEqual([
              [2, "committed"],
              [3, "rejected"],
            ]);
          } finally {
            yield* store.close();
          }
        }),
      ),
  );

  it.effect(
    "records schema and semantic validation attempts without changing the projection",
    () =>
      scratch((path) =>
        Effect.gen(function* () {
          const store = yield* openStore({ path });
          try {
            yield* store.putProfile(work);
            yield* store.append({ actor, profile, event: created });
            const invalid = yield* store.append({
              actor,
              profile,
              event: { ...edited, after: { ...edited.after, title: "" } },
            });
            const missingTag = yield* store.append({
              actor,
              profile,
              event: {
                ...edited,
                after: { ...edited.after, tags: ["absent"] },
              },
            });
            const denied = yield* store.reject({
              actor,
              profile,
              event: edited,
              reason: "auth",
            });
            expect([invalid.reason, missingTag.reason, denied.reason]).toEqual([
              "validation",
              "validation",
              "auth",
            ]);
            expect(
              (yield* store.tasks()).map((value) => [
                value.title,
                value.row_version,
              ]),
            ).toEqual([["Write the store", 1]]);
            expect(
              (yield* store.rebuild()).map((value) => [
                value.title,
                value.row_version,
              ]),
            ).toEqual([["Write the store", 1]]);
          } finally {
            yield* store.close();
          }
        }),
      ),
  );

  it.effect(
    "rolls back both the op and projection when SQLite rejects a projection write",
    () =>
      scratch((path) =>
        Effect.gen(function* () {
          const store = yield* openStore({ path });
          const sql = new Database(path);
          try {
            yield* store.putProfile(work);
            sql.exec(
              "CREATE TRIGGER fail_task BEFORE INSERT ON tasks BEGIN SELECT RAISE(ABORT, 'test failure'); END;",
            );
            expect(
              yield* Effect.isFailure(
                store.append({ actor, profile, event: created }),
              ),
            ).toBe(true);
            expect(yield* store.history()).toEqual([]);
            expect(yield* store.tasks()).toEqual([]);
            sql.exec("DROP TRIGGER fail_task");
            expect(
              (yield* store.append({ actor, profile, event: created })).seq,
            ).toBe(1);
          } finally {
            sql.close();
            yield* store.close();
          }
        }),
      ),
  );

  it.effect(
    "rejects direct projection writes and history mutation on another connection",
    () =>
      scratch((path) =>
        Effect.gen(function* () {
          const store = yield* openStore({ path });
          const sql = new Database(path);
          try {
            yield* store.putProfile(work);
            yield* store.append({ actor, profile, event: created });
            for (const statement of [
              "UPDATE tasks SET payload=payload",
              "DELETE FROM tasks",
              "INSERT INTO tasks(id,payload) SELECT 'copy',payload FROM tasks",
              "INSERT INTO task_tags VALUES ('task-1','x')",
              "DELETE FROM op_log",
              "UPDATE op_log SET reason='x'",
            ])
              expect(() => sql.exec(statement)).toThrow();
            expect((yield* store.tasks()).length).toBe(1);
            expect((yield* store.history()).length).toBe(1);
          } finally {
            sql.close();
            yield* store.close();
          }
        }),
      ),
  );

  it.effect("compares versions across independent domain connections", () =>
    scratch((path) =>
      Effect.gen(function* () {
        const one = yield* openStore({ path });
        const two = yield* openStore({ path, create: false });
        try {
          yield* one.putProfile(work);
          yield* one.append({ actor, profile, event: created });
          expect(
            (yield* one.append({ actor, profile, event: edited })).outcome,
          ).toBe("committed");
          expect(
            (yield* two.append({ actor, profile, event: edited })).reason,
          ).toBe("conflict");
          expect(
            (yield* two.tasks()).map((value) => value.row_version),
          ).toEqual([2]);
        } finally {
          yield* two.close();
          yield* one.close();
        }
      }),
    ),
  );

  it.effect(
    "drops and rebuilds the projection, replays snapshot tails and reverts without erasing history",
    () =>
      scratch((path) =>
        Effect.gen(function* () {
          const store = yield* openStore({ path });
          try {
            yield* store.putProfile(work);
            yield* store.append({ actor, profile, event: created });
            expect(yield* store.takeSnapshot()).toBe(1);
            yield* store.append({ actor, profile, event: edited });
            yield* store.append({ actor, profile, event: edited });
            expect(
              (yield* store.rebuild()).map((value) => [
                value.id,
                value.title,
                value.row_version,
                value.tags,
              ]),
            ).toEqual([["task-1", "Ship the store", 2, []]]);
            expect(
              (yield* store.rebuild({ useSnapshot: true })).map((value) => [
                value.id,
                value.title,
                value.row_version,
              ]),
            ).toEqual([["task-1", "Ship the store", 2]]);
            const reverted = yield* store.revert({
              actor,
              profile,
              seq: sequence(2),
              occurred_at: later,
            });
            expect([
              reverted.seq,
              reverted.outcome,
              reverted.from_version,
              reverted.to_version,
            ]).toEqual([4, "committed", 2, 3]);
            expect(
              (yield* store.rebuild()).map((value) => [
                value.title,
                value.row_version,
              ]),
            ).toEqual([["Write the store", 3]]);
            expect(
              (yield* store.history()).map((value) => [
                value.seq,
                value.outcome,
              ]),
            ).toEqual([
              [1, "committed"],
              [2, "committed"],
              [3, "rejected"],
              [4, "committed"],
            ]);
            expect(
              (yield* store.revert({
                actor,
                profile,
                seq: sequence(2),
                occurred_at: later,
              })).reason,
            ).toBe("conflict");
          } finally {
            yield* store.close();
          }
        }),
      ),
  );

  it.effect("Purge rejects Revert and ID reuse after both replay modes", () =>
    scratch((path) =>
      Effect.gen(function* () {
        const store = yield* openStore({ path });
        try {
          yield* store.putProfile(work);
          yield* store.append({ actor, profile, event: created });
          const deleted = Schema.decodeUnknownSync(Task)({
            ...task,
            row_version: 2,
            updated_at: later,
            deleted_at: later,
          });
          yield* store.append({
            actor,
            profile,
            event: {
              kind: "TaskDeleted",
              entity_version: 1,
              occurred_at: later,
              before: task,
              after: deleted,
            },
          });
          yield* store.append({
            actor,
            profile,
            event: {
              kind: "TaskPurged",
              entity_version: 1,
              occurred_at: later,
              task_id: task.id,
              before: deleted,
            },
          });
          expect(yield* store.tasks()).toEqual([]);
          expect(
            (yield* store.append({ actor, profile, event: created })).reason,
          ).toBe("task_purged");
          for (const seq of [1, 2, 3, 4])
            expect(
              (yield* store.revert({
                actor,
                profile,
                seq: sequence(seq),
                occurred_at: later,
              })).reason,
            ).toBe("task_purged");
          expect(yield* store.rebuild()).toEqual([]);
          yield* store.takeSnapshot();
          expect(yield* store.rebuild({ useSnapshot: true })).toEqual([]);
          expect(
            (yield* store.append({ actor, profile, event: created })).reason,
          ).toBe("task_purged");
        } finally {
          yield* store.close();
        }
      }),
    ),
  );

  it.effect("rejects cross-profile and forged before facts", () =>
    scratch((path) =>
      Effect.gen(function* () {
        const store = yield* openStore({ path });
        try {
          yield* store.putProfile(work);
          const personal = Schema.decodeUnknownSync(ProfileId)("personal");
          yield* store.putProfile({ ...work, id: personal, name: "Personal" });
          yield* store.append({ actor, profile, event: created });
          expect(
            (yield* store.append({ actor, profile: personal, event: edited }))
              .reason,
          ).toBe("profile_mismatch");
          expect(
            (yield* store.append({
              actor,
              profile,
              event: { ...edited, before: { ...taskInput, title: "Forged" } },
            })).reason,
          ).toBe("conflict");
          expect((yield* store.tasks()).map((value) => value.title)).toEqual([
            "Write the store",
          ]);
        } finally {
          yield* store.close();
        }
      }),
    ),
  );
});

describe("resolved metadata and occurrences", () => {
  for (const mutation of ["create", "edit"]) {
    for (const invalid of [
      { name: "missing Project", project_id: "missing-project", tags: [] },
      { name: "foreign Project", project_id: "personal-project", tags: [] },
      { name: "missing Tag", project_id: null, tags: ["missing-tag"] },
      { name: "foreign Tag", project_id: null, tags: ["personal-tag"] },
    ]) {
      it.effect(
        `rejects Series defaults with a ${invalid.name} during ${mutation}`,
        () =>
          scratch((path) =>
            Effect.gen(function* () {
              const store = yield* openStore({ path });
              const personal = Schema.decodeUnknownSync(ProfileId)("personal");
              try {
                yield* store.putProfile(work);
                yield* store.putProfile({
                  ...work,
                  id: personal,
                  name: "Personal",
                });
                yield* store.append({
                  actor,
                  profile: personal,
                  event: {
                    ...created,
                    task: {
                      ...task,
                      id: "personal-task",
                      profile_id: personal,
                      project_id: "personal-project",
                      tags: ["personal-tag"],
                    },
                    project: {
                      id: "personal-project",
                      profile_id: personal,
                      name: "Personal project",
                      created_at: task.created_at,
                      updated_at: task.updated_at,
                    },
                    tags: [
                      {
                        id: "personal-tag",
                        profile_id: personal,
                        name: "Personal tag",
                      },
                    ],
                  },
                });
                const series = {
                  id: "series-1",
                  profile_id: profile,
                  entity_version: 1,
                  row_version: 1,
                  recurrence: {
                    dtstart: { kind: "date", date: "2026-10-27" },
                    rrule: "FREQ=DAILY",
                    exdate: [],
                  },
                  task: {
                    ...task,
                    project_id: invalid.project_id,
                    tags: invalid.tags,
                  },
                  created_at: task.created_at,
                  updated_at: task.updated_at,
                  deleted_at: null,
                };
                const initialSeries = { ...series, task };
                if (mutation === "edit")
                  yield* store.append({
                    actor,
                    profile,
                    event: { ...created, series: initialSeries },
                  });
                const rejected = yield* store.append({
                  actor,
                  profile,
                  event:
                    mutation === "create"
                      ? { ...created, series }
                      : {
                          ...edited,
                          series_before: initialSeries,
                          series_after: {
                            ...series,
                            row_version: 2,
                            updated_at: later,
                          },
                        },
                });
                expect([
                  rejected.outcome,
                  rejected.reason,
                  rejected.event.kind,
                ]).toEqual(["rejected", "validation", "TaskAttemptRejected"]);
                expect(
                  (yield* store.series()).map((value) => [
                    value.id,
                    value.row_version,
                    value.task.project_id,
                    value.task.tags,
                  ]),
                ).toEqual(
                  mutation === "create" ? [] : [["series-1", 1, null, []]],
                );
                expect(
                  (yield* store.rebuild()).map((value) => [
                    value.id,
                    value.row_version,
                  ]),
                ).toEqual(
                  mutation === "create"
                    ? [["personal-task", 1]]
                    : [
                        ["personal-task", 1],
                        ["task-1", 1],
                      ],
                );
                expect(
                  (yield* store.series()).map((value) => [
                    value.id,
                    value.row_version,
                    value.task.project_id,
                    value.task.tags,
                  ]),
                ).toEqual(
                  mutation === "create" ? [] : [["series-1", 1, null, []]],
                );
              } finally {
                yield* store.close();
              }
            }),
          ),
      );
    }
  }

  it.effect("records a rejected Revert of an unknown operation", () =>
    scratch((path) =>
      Effect.gen(function* () {
        const store = yield* openStore({ path });
        try {
          yield* store.putProfile(work);
          const rejected = yield* store.revert({
            actor,
            profile,
            seq: sequence(99),
            occurred_at: later,
          });
          expect([
            rejected.seq,
            rejected.outcome,
            rejected.reason,
            rejected.event.kind,
          ]).toEqual([1, "rejected", "invalid_revert", "TaskAttemptRejected"]);
          expect(yield* store.rebuild()).toEqual([]);
        } finally {
          yield* store.close();
        }
      }),
    ),
  );
  it.effect("reconstructs Project and Tag definitions from events alone", () =>
    scratch((path) =>
      Effect.gen(function* () {
        const store = yield* openStore({ path });
        const project = {
          id: "project-1",
          profile_id: "work",
          name: "Port",
          created_at: task.created_at,
          updated_at: task.updated_at,
        };
        const tag = { id: "tag-1", profile_id: "work", name: "focus" };
        const added = {
          ...created,
          task: { ...task, project_id: "project-1", tags: ["tag-1"] },
          project,
          tags: [tag],
        };
        try {
          yield* store.putProfile(work);
          expect(
            (yield* store.append({ actor, profile, event: added })).outcome,
          ).toBe("committed");
          expect(
            (yield* store.rebuild()).map((value) => [
              value.project_id,
              value.tags,
            ]),
          ).toEqual([["project-1", ["tag-1"]]]);
          expect(
            (yield* store.projects()).map((value) => [value.id, value.name]),
          ).toEqual([["project-1", "Port"]]);
          expect(
            (yield* store.tags()).map((value) => [value.id, value.name]),
          ).toEqual([["tag-1", "focus"]]);
          const nextTag = { id: "tag-2", profile_id: "work", name: "review" };
          const edit = {
            ...edited,
            before: added.task,
            after: {
              ...edited.after,
              project_id: "project-1",
              tags: ["tag-2"],
            },
            project_before: project,
            project_after: project,
            tags_before: [tag],
            tags_after: [nextTag],
          };
          expect(
            (yield* store.append({ actor, profile, event: edit })).outcome,
          ).toBe("committed");
          yield* store.takeSnapshot();
          expect(
            (yield* store.rebuild({ useSnapshot: true })).map(
              (value) => value.tags,
            ),
          ).toEqual([["tag-2"]]);
          expect(
            (yield* store.tags()).map((value) => [value.id, value.name]),
          ).toEqual([
            ["tag-1", "focus"],
            ["tag-2", "review"],
          ]);
          expect(
            (yield* store.revert({
              actor,
              profile,
              seq: sequence(2),
              occurred_at: later,
            })).outcome,
          ).toBe("committed");
          expect(
            (yield* store.rebuild()).map((value) => [
              value.tags,
              value.row_version,
            ]),
          ).toEqual([[["tag-1"], 3]]);
          const sql = new Database(path);
          try {
            expect(
              sql.query("SELECT task_id,tag_id FROM task_tags").all(),
            ).toEqual([{ task_id: "task-1", tag_id: "tag-1" }]);
          } finally {
            sql.close();
          }
        } finally {
          yield* store.close();
        }
      }),
    ),
  );

  it.effect(
    "commits and reverts completion and resolved next occurrences as one event",
    () =>
      scratch((path) =>
        Effect.gen(function* () {
          const store = yield* openStore({ path });
          const project = {
            id: "series-project",
            profile_id: profile,
            name: "Series project",
            created_at: task.created_at,
            updated_at: task.updated_at,
          };
          const tag = {
            id: "series-tag",
            profile_id: profile,
            name: "Series tag",
          };
          const defaults = {
            ...task,
            project_id: "series-project",
            tags: ["series-tag"],
          };
          const series = Schema.decodeUnknownSync(Series)({
            id: "series-1",
            profile_id: "work",
            entity_version: 1,
            row_version: 1,
            recurrence: {
              dtstart: { kind: "date", date: "2026-10-27" },
              rrule: "FREQ=DAILY",
              exdate: [],
            },
            task: defaults,
            created_at: task.created_at,
            updated_at: task.updated_at,
            deleted_at: null,
          });
          const occurrence = {
            ...defaults,
            id: "task-2",
            occurrence: {
              id: "occurrence-2",
              series_id: "series-1",
              date: "2026-10-28",
            },
          };
          const completion = {
            kind: "TaskCompleted",
            entity_version: 1,
            occurred_at: later,
            before: defaults,
            after: {
              ...defaults,
              status: "done",
              row_version: 2,
              updated_at: later,
              completed_at: later,
            },
            next_occurrences: [occurrence],
          };
          try {
            yield* store.putProfile(work);
            yield* store.append({
              actor,
              profile,
              event: {
                ...created,
                task: defaults,
                series,
                project,
                tags: [tag],
              },
            });
            expect(
              (yield* store.append({ actor, profile, event: completion }))
                .outcome,
            ).toBe("committed");
            expect(
              (yield* store.rebuild()).map((value) => [
                value.id,
                value.status,
                value.row_version,
                value.project_id,
                value.tags,
              ]),
            ).toEqual([
              ["task-1", "done", 2, "series-project", ["series-tag"]],
              ["task-2", "open", 1, "series-project", ["series-tag"]],
            ]);
            expect(
              (yield* store.series()).map((value) => [
                value.task.project_id,
                value.task.tags,
              ]),
            ).toEqual([["series-project", ["series-tag"]]]);
            expect(
              (yield* store.revert({
                actor,
                profile,
                seq: sequence(2),
                occurred_at: later,
              })).outcome,
            ).toBe("committed");
            expect(
              (yield* store.rebuild()).map((value) => [
                value.id,
                value.status,
                value.row_version,
                value.deleted_at,
              ]),
            ).toEqual([
              ["task-1", "open", 3, null],
              ["task-2", "open", 2, "2026-10-27T15:00:00Z"],
            ]);
            expect(
              (yield* store.series()).map((value) => [
                value.id,
                value.row_version,
              ]),
            ).toEqual([["series-1", 1]]);
          } finally {
            yield* store.close();
          }
        }),
      ),
  );
});

describe("migration 0002", () => {
  it.effect(
    "preserves legacy tasks, names, tags and versions as replayable baseline events",
    () =>
      scratch((path) =>
        Effect.gen(function* () {
          seedLegacy(path);
          const store = yield* openStore({ path, create: false });
          try {
            expect(
              (yield* store.profiles()).map((value) => [value.id, value.name]),
            ).toEqual([
              ["personal", "Personal"],
              ["work", "Work"],
            ]);
            expect(
              (yield* store.tasks()).map((value) => [
                value.id,
                value.title,
                value.row_version,
                value.status,
              ]),
            ).toEqual([
              ["legacy-1", "Ship the port", 7, "open"],
              ["legacy-2", "Buy tea", 2, "done"],
            ]);
            expect((yield* store.tasks())[0]?.scheduled_at).toEqual({
              kind: "instant",
              utc: "2026-10-27T14:00:00.000Z",
              time_zone: "UTC",
            });
            expect(
              (yield* store.projects()).map((value) => [
                value.profile_id,
                value.name,
              ]),
            ).toEqual([["work", "Port"]]);
            expect(
              (yield* store.tags()).map((value) => [
                value.profile_id,
                value.name,
              ]),
            ).toEqual([
              ["personal", "home"],
              ["work", "focus"],
              ["work", "port"],
            ]);
            expect(
              (yield* store.series()).map((value) => value.recurrence.rrule),
            ).toEqual(["FREQ=DAILY"]);
            expect(
              (yield* store.rebuild()).map((value) => [
                value.id,
                value.row_version,
                value.tags,
              ]),
            ).toEqual([
              [
                "legacy-1",
                7,
                ['["work","tag","focus"]', '["work","tag","port"]'],
              ],
              ["legacy-2", 2, ['["personal","tag","home"]']],
            ]);
            expect(
              (yield* store.history()).map((value) => [
                value.seq,
                value.actor,
                value.to_version,
              ]),
            ).toEqual([
              [1, "migration:0002", 7],
              [2, "migration:0002", 2],
            ]);
          } finally {
            yield* store.close();
          }
          const reopened = yield* openStore({ path, create: false });
          try {
            expect((yield* reopened.history()).length).toBe(2);
          } finally {
            yield* reopened.close();
          }
          const sql = new Database(path);
          try {
            expect(
              sql
                .query(
                  "SELECT name FROM sqlite_master WHERE name IN ('users','sessions')",
                )
                .all(),
            ).toEqual([]);
          } finally {
            sql.close();
          }
        }),
      ),
  );

  it.effect(
    "rolls migration back on invalid legacy data and refuses to create missing paths",
    () =>
      scratch((path) =>
        Effect.gen(function* () {
          expect(
            yield* Effect.isFailure(openStore({ path, create: false })),
          ).toBe(true);
          seedLegacy(path);
          const sql = new Database(path);
          sql.exec("UPDATE tasks SET title='' WHERE id='legacy-1'");
          expect(
            yield* Effect.isFailure(openStore({ path, create: false })),
          ).toBe(true);
          expect(sql.query("SELECT count(*) AS n FROM tasks").get()).toEqual({
            n: 2,
          });
          expect(sql.query("SELECT count(*) AS n FROM users").get()).toEqual({
            n: 2,
          });
          expect(sql.query("PRAGMA user_version").get()).toEqual({
            user_version: 0,
          });
          sql.close();
        }),
      ),
  );
});

it.effect(
  "moves atomically across Profiles and preserves scoped events through replay",
  () =>
    scratch((path) =>
      Effect.gen(function* () {
        const store = yield* openStore({ path });
        const database = new Database(path);
        try {
          const personal = Schema.decodeUnknownSync(ProfileId)("personal");
          yield* store.putProfile(work);
          yield* store.putProfile({ ...work, id: personal, name: "Personal" });
          yield* store.append({ actor, profile, event: created });
          const after = Schema.decodeUnknownSync(Task)({
            ...task,
            profile_id: personal,
            row_version: 2,
            updated_at: later,
          });
          database.exec(
            "CREATE TRIGGER fail_move BEFORE INSERT ON tasks WHEN NEW.profile_id='personal' BEGIN SELECT RAISE(ABORT, 'forced arrival failure'); END",
          );
          const failure = yield* Effect.flip(
            store.move({ actor, before: task, after, original_seq: null }),
          );
          expect(failure._tag).toBe("StoreError");
          expect(
            (yield* store.tasks()).map((task) => [
              task.id,
              task.profile_id,
              task.row_version,
            ]),
          ).toEqual([["task-1", "work", 1]]);
          expect(
            (yield* store.history()).map((entry) => [
              entry.seq,
              entry.event.kind,
            ]),
          ).toEqual([[1, "TaskCreated"]]);
          database.exec("DROP TRIGGER fail_move");
          yield* store.takeSnapshot();
          const result = yield* store.move({
            actor,
            before: task,
            after,
            original_seq: null,
          });
          expect([
            result.outcome,
            result.profile,
            result.from_version,
            result.to_version,
          ]).toEqual(["committed", "personal", null, 2]);
          expect(
            (yield* store.history()).map((entry) => [
              entry.seq,
              entry.profile,
              entry.event.kind,
            ]),
          ).toEqual([
            [1, "work", "TaskCreated"],
            [2, "work", "TaskMovedOut"],
            [3, "personal", "TaskMovedIn"],
          ]);
          for (const useSnapshot of [false, true]) {
            yield* store.rebuild({ useSnapshot });
            expect(
              (yield* store.tasks()).map((task) => [
                task.id,
                task.profile_id,
                task.row_version,
              ]),
            ).toEqual([["task-1", "personal", 2]]);
          }
          const stale = yield* store.move({
            actor,
            before: task,
            after,
            original_seq: null,
          });
          expect([stale.outcome, stale.reason]).toEqual([
            "rejected",
            "conflict",
          ]);
          expect(
            (yield* store.tasks()).map((task) => [
              task.id,
              task.profile_id,
              task.row_version,
            ]),
          ).toEqual([["task-1", "personal", 2]]);
        } finally {
          database.close();
          yield* store.close();
        }
      }),
    ),
);

import { Database } from "bun:sqlite";
import assert from "node:assert/strict";
import { Effect, Schema } from "effect";
import { ClientReads } from "../src/client-reads.ts";
import { Edge, emptyDependencies } from "../src/dependencies.ts";
import { Task } from "../src/entities.ts";
import { Event } from "../src/events.ts";
import { ActorId, ProfileId } from "../src/ids.ts";
import { dependencyMigrationSql } from "../src/store/0007.ts";
import { type OperationStore, openStore } from "../src/store/store.ts";
import { Instant } from "../src/time.ts";

export const actor = Schema.decodeUnknownSync(ActorId)("dag-proof");
export const profile = Schema.decodeUnknownSync(ProfileId)("dag");
export const at = Schema.decodeUnknownSync(Instant)("2026-11-09T06:00:00Z");
export const task = (name: string, fields: Partial<Task> = {}) =>
  Schema.decodeUnknownSync(Task)({
    id: name,
    profile_id: profile,
    entity_version: 1,
    row_version: 1,
    title: `Task ${name}`,
    description: null,
    status: "open",
    project_id: null,
    priority: "P2",
    scheduled_at: null,
    due_at: null,
    energy: null,
    estimate_min: null,
    source: "dag-proof",
    tags: [],
    occurrence: null,
    created_at: at,
    updated_at: at,
    completed_at: null,
    deleted_at: null,
    ...fields,
  });
export const edge = (dependent: string, blocker: string) =>
  Schema.decodeUnknownSync(Edge)({
    profile_id: profile,
    dependent_id: dependent,
    blocker_id: blocker,
  });
export const create = (value: Task, blockers: string[] = []) =>
  Schema.decodeUnknownSync(Event)({
    kind: "TaskCreated",
    entity_version: blockers.length ? 2 : 1,
    occurred_at: at,
    task: value,
    series: null,
    project: null,
    tags: [],
    ...(blockers.length
      ? {
          dependencies: {
            ...emptyDependencies(),
            added: blockers.map((blocker) => edge(value.id, blocker)),
          },
        }
      : {}),
  });
export const delta = (
  dependent: string,
  blocker: string,
  from: number,
  kind: "DependencyAdded" | "DependencyRemoved" = "DependencyAdded",
) =>
  Schema.decodeUnknownSync(Event)({
    kind,
    entity_version: 1,
    occurred_at: at,
    dependent_id: dependent,
    blocker_id: blocker,
    from_version: from,
    to_version: from + 1,
  });
export const append = (store: OperationStore, event: unknown) =>
  store.append({ actor, profile, event });
export const current = (store: OperationStore, name: string) =>
  store.tasks().pipe(
    Effect.map((tasks) => {
      const value = tasks.find((task) => task.id === name);
      assert.ok(value);
      return value;
    }),
  );
export const remove = (store: OperationStore, name: string) =>
  Effect.gen(function* () {
    const before = yield* current(store, name);
    return yield* append(store, {
      kind: "TaskDeleted",
      entity_version: 1,
      occurred_at: at,
      before,
      after: {
        ...before,
        deleted_at: at,
        updated_at: at,
        row_version: before.row_version + 1,
      },
    });
  });
const editStatus = (
  store: OperationStore,
  name: string,
  status: Task["status"],
) =>
  Effect.gen(function* () {
    const before = yield* current(store, name);
    return yield* append(store, {
      kind: "TaskEdited",
      entity_version: 1,
      occurred_at: at,
      before,
      after: {
        ...before,
        status,
        completed_at: status === "done" ? at : null,
        row_version: before.row_version + 1,
      },
      series_before: null,
      series_after: null,
      project_before: null,
      project_after: null,
      tags_before: [],
      tags_after: [],
    });
  });
const seed = (store: OperationStore, names: string[]) =>
  Effect.gen(function* () {
    yield* store.putProfile({
      id: profile,
      name: "DAG",
      created_at: at,
      updated_at: at,
    });
    for (const name of names)
      assert.equal(
        (yield* append(store, create(task(name)))).outcome,
        "committed",
      );
  });
const versions = (store: OperationStore) =>
  store
    .tasks()
    .pipe(
      Effect.map((tasks) => tasks.map((task) => [task.id, task.row_version])),
    );
const replay = (store: OperationStore) =>
  Effect.gen(function* () {
    const tasks = yield* store.tasks();
    const edges = yield* store.dependencies();
    yield* store.rebuild();
    assert.deepEqual(yield* store.dependencies(), edges);
    assert.deepEqual(yield* store.tasks(), tasks);
    yield* store.rebuild({ useSnapshot: true });
    assert.deepEqual(yield* store.dependencies(), edges);
    assert.deepEqual(yield* store.tasks(), tasks);
  });
export const dagCases = {
  edges: (store: OperationStore) =>
    Effect.gen(function* () {
      yield* seed(store, ["A", "B", "C"]);
      yield* store.takeSnapshot();
      assert.equal(
        (yield* append(store, delta("B", "A", 1))).outcome,
        "committed",
      );
      assert.equal(
        (yield* append(store, delta("C", "B", 1))).outcome,
        "committed",
      );
      assert.deepEqual(yield* versions(store), [
        ["A", 1],
        ["B", 2],
        ["C", 2],
      ]);
      assert.deepEqual(yield* store.dependencies(), [
        edge("B", "A"),
        edge("C", "B"),
      ]);
      const cycle = yield* append(store, delta("A", "C", 1));
      assert.equal(cycle.reason, "dependency_cycle");
      assert.deepEqual(cycle.dependency_error?.details, {
        dependent_id: "A",
        blocker_id: "C",
        path: ["A", "B", "C", "A"],
      });
      const self = yield* append(store, delta("A", "A", 1));
      assert.equal(self.reason, "dependency_cycle");
      assert.deepEqual(self.dependency_error?.details, {
        dependent_id: "A",
        blocker_id: "A",
        path: ["A", "A"],
      });
      assert.equal(
        (yield* append(store, delta("B", "A", 1, "DependencyRemoved"))).reason,
        "conflict",
      );
      yield* replay(store);
      yield* store.takeSnapshot();
      assert.equal(
        (yield* append(store, delta("B", "A", 2, "DependencyRemoved"))).outcome,
        "committed",
      );
      yield* replay(store);
      assert.equal((yield* store.history()).at(-1)?.from_version, 2);
      assert.equal((yield* store.history()).at(-1)?.to_version, 3);
    }),
  statuses: (store: OperationStore) =>
    Effect.gen(function* () {
      yield* seed(store, ["A", "B"]);
      yield* append(store, delta("B", "A", 1));
      assert.equal((yield* editStatus(store, "B", "done")).reason, "blocked");
      yield* editStatus(store, "A", "cancelled");
      yield* editStatus(store, "B", "done");
      assert.equal(
        (yield* editStatus(store, "A", "open")).reason,
        "blocks_done_task",
      );
      yield* append(store, delta("B", "A", 3, "DependencyRemoved"));
      yield* editStatus(store, "A", "open");
      assert.equal(
        (yield* append(store, delta("B", "A", 4))).reason,
        "blocked",
      );
      yield* replay(store);
    }),
  groupedDelete: (store: OperationStore) =>
    Effect.gen(function* () {
      yield* seed(store, ["A", "B", "C"]);
      yield* append(store, delta("B", "A", 1));
      yield* append(store, delta("C", "B", 1));
      const deleted = yield* remove(store, "B");
      assert.equal(deleted.event.entity_version, 2);
      assert.equal(deleted.event.kind, "TaskDeleted");
      if (
        deleted.event.kind !== "TaskDeleted" ||
        deleted.event.entity_version !== 2
      )
        throw new Error("Missing grouped Delete");
      assert.deepEqual(deleted.event.dependencies, {
        added: [],
        removed: [edge("B", "A"), edge("C", "B")],
        versions: [{ id: "C", from_version: 2, to_version: 3, updated_at: at }],
      });
      assert.deepEqual(yield* store.dependencies(), []);
      assert.deepEqual(yield* versions(store), [
        ["A", 1],
        ["B", 3],
        ["C", 3],
      ]);
      yield* store.takeSnapshot();
      yield* replay(store);
      assert.equal(
        (yield* store.revert({
          actor,
          profile,
          seq: deleted.seq,
          occurred_at: at,
        })).outcome,
        "committed",
      );
      assert.deepEqual(yield* store.dependencies(), [
        edge("B", "A"),
        edge("C", "B"),
      ]);
      assert.deepEqual(yield* versions(store), [
        ["A", 1],
        ["B", 4],
        ["C", 4],
      ]);
      yield* replay(store);
    }),
  revertCycle: (store: OperationStore) =>
    Effect.gen(function* () {
      yield* seed(store, ["A", "B", "C"]);
      yield* append(store, delta("B", "A", 1));
      const removed = yield* append(
        store,
        delta("B", "A", 2, "DependencyRemoved"),
      );
      yield* append(store, delta("C", "B", 1));
      yield* append(store, delta("A", "C", 1));
      const result = yield* store.revert({
        actor,
        profile,
        seq: removed.seq,
        occurred_at: at,
      });
      assert.equal(result.reason, "dependency_cycle");
      assert.deepEqual(result.dependency_error?.details, {
        dependent_id: "B",
        blocker_id: "A",
        path: ["A", "B", "C", "A"],
      });
      assert.deepEqual(yield* store.dependencies(), [
        edge("A", "C"),
        edge("C", "B"),
      ]);
      yield* replay(store);
    }),
  initialAndDegree: (store: OperationStore) =>
    Effect.gen(function* () {
      yield* seed(
        store,
        Array.from({ length: 14 }, (_, i) => `B${String(i).padStart(2, "0")}`),
      );
      assert.equal(
        (yield* append(store, create(task("T"), ["B00"]))).outcome,
        "committed",
      );
      assert.equal((yield* current(store, "T")).row_version, 1);
      for (let i = 1; i < 13; i++)
        assert.equal(
          (yield* append(
            store,
            delta("T", `B${String(i).padStart(2, "0")}`, i),
          )).outcome,
          "committed",
        );
      const tooMany = yield* append(store, delta("T", "B13", 13));
      assert.equal(tooMany.reason, "too_many_dependencies");
      assert.equal(
        tooMany.dependency_error?.message,
        "This Task depends on 14 Tasks. That's a lot for one Task. It might be a whole Project, or it might be clearer split under a few more parent Tasks.",
      );
      assert.equal(
        (yield* append(store, create(task("missing"), ["absent"]))).reason,
        "dependency_profile_mismatch",
      );
      assert.equal(
        (yield* store.tasks()).some((task) => task.id === "missing"),
        false,
      );
      yield* store.putProfile({
        id: Schema.decodeUnknownSync(ProfileId)("foreign"),
        name: "Foreign",
        created_at: at,
        updated_at: at,
      });
      yield* store.append({
        actor,
        profile: Schema.decodeUnknownSync(ProfileId)("foreign"),
        event: create(
          task("foreign-task", {
            profile_id: Schema.decodeUnknownSync(ProfileId)("foreign"),
          }),
        ),
      });
      assert.equal(
        (yield* append(store, delta("B00", "foreign-task", 1))).reason,
        "dependency_profile_mismatch",
      );
      yield* store.takeSnapshot();
      yield* replay(store);
    }),
  restoreDeleteCycle: (store: OperationStore) =>
    Effect.gen(function* () {
      yield* seed(store, ["A", "B", "C"]);
      yield* append(store, delta("B", "A", 1));
      yield* append(store, delta("C", "B", 1));
      const deleted = yield* remove(store, "B");
      yield* append(store, delta("A", "C", 1));
      assert.equal(
        (yield* store.revert({
          actor,
          profile,
          seq: deleted.seq,
          occurred_at: at,
        })).reason,
        "dependency_cycle",
      );
      assert.equal((yield* current(store, "B")).deleted_at, at);
      assert.deepEqual(yield* store.dependencies(), [edge("A", "C")]);
    }),
  revertCompletion: (store: OperationStore) =>
    Effect.gen(function* () {
      yield* seed(store, ["A", "B"]);
      const completed = yield* editStatus(store, "A", "done");
      yield* append(store, delta("B", "A", 1));
      yield* editStatus(store, "B", "done");
      assert.equal(
        (yield* store.revert({
          actor,
          profile,
          seq: completed.seq,
          occurred_at: at,
        })).reason,
        "blocks_done_task",
      );
      assert.equal((yield* current(store, "A")).status, "done");
      yield* replay(store);
    }),
  profileDelete: (store: OperationStore) =>
    Effect.gen(function* () {
      yield* seed(store, ["A", "B", "C"]);
      yield* store.putProfile({
        id: Schema.decodeUnknownSync(ProfileId)("other"),
        name: "Other",
        created_at: at,
        updated_at: at,
      });
      yield* append(store, delta("B", "A", 1));
      yield* append(store, delta("C", "B", 1));
      yield* store.auth.setupOwner("dag scratch passphrase");
      const session = yield* store.auth.signIn("dag scratch passphrase");
      const result = yield* store.auth.deleteProfile({
        ...session,
        profile,
        options: { with_tasks: true, dry_run: false },
      });
      assert.equal(result.outcome, "deleted");
      assert.deepEqual(yield* versions(store), [
        ["A", 2],
        ["B", 4],
        ["C", 4],
      ]);
      assert.deepEqual(yield* store.dependencies(), []);
      assert.deepEqual(
        (yield* store.tasks()).map((task) => task.deleted_at !== null),
        [true, true, true],
      );
      yield* store.takeSnapshot();
      yield* replay(store);
    }),
  revertPreservesContent: (store: OperationStore) =>
    Effect.gen(function* () {
      yield* seed(store, ["A", "B"]);
      const added = yield* append(store, delta("B", "A", 1));
      assert.equal(
        (yield* store.revert({
          actor,
          profile,
          seq: added.seq,
          occurred_at: at,
        })).outcome,
        "committed",
      );
      assert.equal((yield* current(store, "B")).title, "Task B");
      assert.deepEqual(yield* versions(store), [
        ["A", 1],
        ["B", 3],
      ]);
      const addedAgain = yield* append(store, delta("B", "A", 3));
      yield* editStatus(store, "B", "snoozed");
      assert.equal(
        (yield* store.revert({
          actor,
          profile,
          seq: addedAgain.seq,
          occurred_at: at,
        })).reason,
        "conflict",
      );
      assert.equal((yield* current(store, "B")).status, "snoozed");
      yield* replay(store);
    }),
  move: (store: OperationStore) =>
    Effect.gen(function* () {
      yield* seed(store, ["A", "B", "C"]);
      const destination = Schema.decodeUnknownSync(ProfileId)("other");
      yield* store.putProfile({
        id: destination,
        name: "Other",
        created_at: at,
        updated_at: at,
      });
      yield* append(store, delta("B", "A", 1));
      yield* append(store, delta("C", "B", 1));
      const before = yield* current(store, "B");
      assert.equal(
        (yield* store.move({
          actor,
          before,
          after: {
            ...before,
            profile_id: destination,
            row_version: Schema.decodeUnknownSync(Task.fields.row_version)(3),
          },
          original_seq: null,
        })).outcome,
        "committed",
      );
      assert.deepEqual(yield* store.dependencies(), []);
      assert.deepEqual(yield* versions(store), [
        ["A", 1],
        ["B", 3],
        ["C", 3],
      ]);
      yield* store.takeSnapshot();
      yield* replay(store);
    }),
  historyTargets: (store: OperationStore) =>
    Effect.gen(function* () {
      yield* seed(store, ["A", "B"]);
      yield* store.auth.setupOwner("dag scratch passphrase");
      const session = yield* store.auth.signIn("dag scratch passphrase");
      yield* append(store, delta("B", "A", 1));
      yield* append(store, delta("A", "B", 1));
      const reads = new ClientReads(store);
      for (const target of ["A", "B"])
        assert.deepEqual(
          (yield* reads.history({
            ...session,
            profile,
            task_id: Schema.decodeUnknownSync(Task.fields.id)(target),
          })).map((entry) => entry.event.kind),
          ["TaskCreated", "DependencyAdded", "TaskAttemptRejected"],
        );
      yield* remove(store, "A");
      assert.deepEqual(
        (yield* reads.history({
          ...session,
          profile,
          task_id: Schema.decodeUnknownSync(Task.fields.id)("B"),
        })).map((entry) => entry.event.kind),
        [
          "TaskCreated",
          "DependencyAdded",
          "TaskAttemptRejected",
          "TaskDeleted",
        ],
      );
    }),
  shortestCycle: (store: OperationStore) =>
    Effect.gen(function* () {
      yield* seed(store, ["A", "B", "C", "D"]);
      for (const [dependent, blocker, version] of [
        ["B", "A", 1],
        ["C", "A", 1],
        ["D", "B", 1],
        ["D", "C", 2],
      ] as const)
        yield* append(store, delta(dependent, blocker, version));
      yield* editStatus(store, "B", "cancelled");
      const cycle = yield* append(store, delta("A", "D", 1));
      assert.equal(cycle.dependency_error?.code, "dependency_cycle");
      if (cycle.dependency_error?.code !== "dependency_cycle")
        throw new Error("Missing cycle");
      assert.deepEqual(cycle.dependency_error.details.path, [
        "A",
        "B",
        "D",
        "A",
      ]);
      assert.equal(
        (yield* append(store, delta("D", "A", 3))).outcome,
        "committed",
      );
      assert.deepEqual(yield* store.dependencies(), [
        edge("B", "A"),
        edge("C", "A"),
        edge("D", "A"),
        edge("D", "B"),
        edge("D", "C"),
      ]);
      yield* replay(store);
    }),
  rejectedEvidence: (store: OperationStore) =>
    Effect.gen(function* () {
      yield* seed(store, []);
      yield* append(
        store,
        create(task("A", { description: "x".repeat(40000) })),
      );
      yield* append(store, create(task("B")));
      yield* append(store, delta("B", "A", 1));
      const result = yield* editStatus(store, "B", "done");
      assert.equal(result.dependency_error?.code, "blocked");
      if (result.dependency_error?.code !== "blocked")
        throw new Error("Missing blockers");
      assert.equal(
        result.dependency_error.details.blockers[0]?.description?.length,
        40000,
      );
      assert.equal(result.event.kind, "TaskAttemptRejected");
      if (result.event.kind !== "TaskAttemptRejected")
        throw new Error("Missing rejected attempt");
      assert.equal(result.event.details?.truncated, true);
      assert.equal(result.event.details?.witness, null);
      assert.equal(result.from_version, 2);
    }),
  seriesInitial: (store: OperationStore) =>
    Effect.gen(function* () {
      yield* seed(store, ["A"]);
      const series = {
        id: "daily",
        profile_id: profile,
        entity_version: 1,
        row_version: 1,
        recurrence: {
          dtstart: { kind: "date", date: "2026-11-09" },
          rrule: "FREQ=DAILY;COUNT=2",
          exdate: [],
        },
        task: task("defaults"),
        created_at: at,
        updated_at: at,
        deleted_at: null,
      };
      const result = yield* store.startSeries({
        actor,
        profile,
        series,
        task_id: "first",
        occurrence_id: "occ-first",
        occurred_at: at,
        depends_on: ["A"],
      });
      assert.equal(result.outcome, "committed");
      assert.equal(result.event.entity_version, 2);
      assert.deepEqual(yield* versions(store), [
        ["A", 1],
        ["first", 1],
      ]);
      assert.deepEqual(yield* store.dependencies(), [edge("first", "A")]);
      const blocked = yield* store.finishTask({
        actor,
        profile,
        task_id: "first",
        from_version: 1,
        action: "complete",
        occurred_at: at,
        next_task_id: "second",
        next_occurrence_id: "occ-second",
      });
      assert.equal(blocked.reason, "blocked");
      assert.equal((yield* store.tasks()).length, 2);
      yield* store.finishTask({
        actor,
        profile,
        task_id: "first",
        from_version: 1,
        action: "cancel",
        occurred_at: at,
        next_task_id: "second",
        next_occurrence_id: "occ-second",
      });
      assert.deepEqual(yield* versions(store), [
        ["A", 1],
        ["first", 2],
        ["second", 1],
      ]);
      assert.deepEqual(yield* store.dependencies(), [edge("first", "A")]);
      yield* store.takeSnapshot();
      yield* replay(store);
    }),
  longCycle: (store: OperationStore) =>
    Effect.gen(function* () {
      yield* seed(
        store,
        Array.from({ length: 103 }, (_, i) => String(i).padStart(3, "0")),
      );
      for (let i = 1; i < 103; i++)
        yield* append(
          store,
          delta(String(i).padStart(3, "0"), String(i - 1).padStart(3, "0"), 1),
        );
      const result = yield* append(store, delta("000", "102", 1));
      assert.equal(result.reason, "dependency_cycle");
      assert.equal(result.dependency_error?.code, "dependency_cycle");
      if (result.dependency_error?.code !== "dependency_cycle")
        throw new Error("Missing cycle");
      assert.deepEqual(result.dependency_error.details.path, [
        ...Array.from({ length: 103 }, (_, i) => String(i).padStart(3, "0")),
        "000",
      ]);
    }),
};
export function provePurgeEndpoint(store: OperationStore, target: "A" | "B") {
  return Effect.gen(function* () {
    yield* seed(store, ["A", "B", "C"]);
    yield* append(store, delta("B", "A", 1));
    yield* append(store, delta("C", "B", 1));
    assert.equal((yield* editStatus(store, "B", "done")).reason, "blocked");
    yield* store.takeSnapshot();
    const ownerSnapshot = yield* store.snapshots.create("dag-before-delete");
    yield* remove(store, target);
    yield* store.takeSnapshot();
    const before = yield* current(store, target);
    assert.equal(
      (yield* append(store, {
        kind: "TaskPurged",
        entity_version: 1,
        occurred_at: at,
        task_id: before.id,
        before,
      })).outcome,
      "committed",
    );
    assert.deepEqual(
      yield* versions(store),
      target === "A"
        ? [
            ["B", 3],
            ["C", 2],
          ]
        : [
            ["A", 1],
            ["C", 3],
          ],
    );
    assert.deepEqual(
      yield* store.dependencies(),
      target === "A" ? [edge("C", "B")] : [],
    );
    const history = yield* store.history();
    const erased = history.filter(
      (entry) => entry.event.kind === "TaskHistoryRedacted",
    );
    assert.ok(erased.length >= 3);
    assert.equal(JSON.stringify(history).includes(`Task ${target}`), false);
    assert.ok(
      erased.some(
        (entry) =>
          entry.event.kind === "TaskHistoryRedacted" &&
          entry.event.replay.dependencies?.added.some(
            (edge) =>
              edge.dependent_id === target || edge.blocker_id === target,
          ),
      ),
    );
    yield* replay(store);
    const original = erased[0];
    assert.ok(original);
    assert.equal(
      (yield* store.revert({
        actor,
        profile,
        seq: original.seq,
        occurred_at: at,
      })).reason,
      "task_purged",
    );
    const copies = yield* store.snapshots.list();
    for (const copy of copies.snapshots) {
      const db = new Database(
        `${store.snapshots.directory}/${copy.id}.sqlite`,
        { readonly: true },
      );
      try {
        assert.equal(
          db.query("SELECT 1 FROM tasks WHERE id=?").get(target),
          null,
        );
        assert.deepEqual(
          db
            .query(
              "SELECT * FROM task_dependencies WHERE dependent_id=? OR blocker_id=?",
            )
            .all(target, target),
          [],
        );
      } finally {
        db.close();
      }
    }
    yield* store.snapshots.restore(ownerSnapshot.id);
    assert.deepEqual(
      yield* versions(store),
      target === "A"
        ? [
            ["B", 2],
            ["C", 2],
          ]
        : [
            ["A", 1],
            ["C", 2],
          ],
    );
    assert.deepEqual(
      yield* store.dependencies(),
      target === "A" ? [edge("C", "B")] : [],
    );
    yield* replay(store);
  });
}
export function proveMigrationAndGuards(path: string) {
  return Effect.gen(function* () {
    const store = yield* openStore({ path });
    yield* seed(store, ["A", "B"]);
    yield* store.takeSnapshot();
    yield* store.close();
    const db = new Database(path);
    db.function("domain_write_allowed", () => 1);
    db.exec("PRAGMA foreign_keys=ON");
    db.exec(
      "DROP TABLE task_dependencies; DROP INDEX tasks_profile_id_id; PRAGMA user_version=6",
    );
    db.exec(
      "DROP TRIGGER snapshots_no_update; UPDATE snapshots SET payload=json_remove(payload,'$.edges'); CREATE TRIGGER snapshots_no_update BEFORE UPDATE ON snapshots BEGIN SELECT RAISE(ABORT, 'snapshots are immutable'); END;",
    );
    const before = db.query("SELECT * FROM op_log ORDER BY seq").all();
    db.transaction(() => {
      db.exec(dependencyMigrationSql);
      db.exec(dependencyMigrationSql);
    }).immediate();
    assert.deepEqual(
      db.query("SELECT * FROM op_log ORDER BY seq").all(),
      before,
    );
    assert.equal(
      db.query<{ user_version: number }, []>("PRAGMA user_version").get()
        ?.user_version,
      7,
    );
    assert.throws(
      () =>
        db
          .query("INSERT INTO task_dependencies VALUES (?,?,?)")
          .run(profile, "A", "A"),
      /CHECK/,
    );
    assert.throws(
      () =>
        db
          .query("INSERT INTO task_dependencies VALUES (?,?,?)")
          .run(profile, "A", "absent"),
      /FOREIGN KEY/,
    );
    db.exec("PRAGMA user_version=6");
    db.close();
    const reopened = yield* openStore({ path });
    const snapshots = yield* reopened.snapshots.list();
    assert.deepEqual(
      snapshots.snapshots.map((copy) => [copy.reason, copy.schema_version]),
      [["pre-migration", 6]],
    );
    yield* reopened.rebuild({ useSnapshot: true });
    assert.deepEqual(yield* reopened.dependencies(), []);
    assert.deepEqual(yield* versions(reopened), [
      ["A", 1],
      ["B", 1],
    ]);
    yield* reopened.close();
    const guarded = new Database(path);
    guarded.exec("PRAGMA foreign_keys=ON");
    guarded.function("domain_write_allowed", () => 0);
    for (const sql of [
      "INSERT INTO task_dependencies VALUES ('dag','B','A')",
      "UPDATE task_dependencies SET blocker_id='B'",
      "DELETE FROM task_dependencies",
    ]) {
      if (sql.startsWith("INSERT"))
        assert.throws(() => guarded.exec(sql), /domain writes only/);
    }
    guarded.function("domain_write_allowed", () => 1);
    guarded.exec("INSERT INTO task_dependencies VALUES ('dag','B','A')");
    guarded.function("domain_write_allowed", () => 0);
    assert.throws(
      () => guarded.exec("UPDATE task_dependencies SET blocker_id='B'"),
      /domain writes only/,
    );
    assert.throws(
      () => guarded.exec("DELETE FROM task_dependencies"),
      /domain writes only/,
    );
    assert.match(
      guarded
        .query<{ sql: string }, []>(
          "SELECT sql FROM sqlite_master WHERE name='task_dependencies'",
        )
        .get()?.sql ?? "",
      /WITHOUT ROWID/,
    );
    guarded.close();
  });
}
export const runDagCase = (
  path: string,
  run: (store: OperationStore) => Effect.Effect<void, unknown>,
) =>
  Effect.gen(function* () {
    const store = yield* openStore({ path });
    try {
      yield* run(store);
    } finally {
      yield* store.close();
    }
  });

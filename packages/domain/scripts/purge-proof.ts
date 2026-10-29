import { Database } from "bun:sqlite";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Effect, Schema } from "effect";
import {
  ActorId,
  Instant,
  Profile,
  ProfileId,
  Sequence,
  Series,
  Task,
} from "../src/index.ts";
import { openStore } from "../src/store/store.ts";

export const provePurge = (path: string) =>
  Effect.gen(function* () {
    const actor = Schema.decodeUnknownSync(ActorId)("purge-proof");
    const profile = Schema.decodeUnknownSync(ProfileId)("purge-work");
    const occurred_at = Schema.decodeUnknownSync(Instant)(
      "2026-10-27T16:00:00Z",
    );
    const canaries = [
      "P01-private-title-2710",
      "P01-private-description-2710",
      "P01-private-tag-2710",
      "P01-private-project-2710",
      "P01-rejected-title-2710",
    ];
    const store = yield* openStore({ path });
    try {
      yield* store.putProfile(
        Schema.decodeUnknownSync(Profile)({
          id: profile,
          name: "Purge proof",
          created_at: occurred_at,
          updated_at: occurred_at,
        }),
      );
      const project = {
        id: "private-project",
        profile_id: profile,
        name: canaries[3],
        created_at: occurred_at,
        updated_at: occurred_at,
      };
      const tag = { id: "private-tag", profile_id: profile, name: canaries[2] };
      const task = Schema.decodeUnknownSync(Task)({
        id: "private-task",
        profile_id: profile,
        entity_version: 1,
        row_version: 1,
        title: canaries[0],
        description: canaries[1],
        status: "open",
        project_id: project.id,
        tags: [tag.id],
        priority: "P2",
        scheduled_at: null,
        due_at: null,
        energy: null,
        estimate_min: null,
        source: "agent",
        occurrence: null,
        created_at: occurred_at,
        updated_at: occurred_at,
        completed_at: null,
        deleted_at: null,
      });
      const series = Schema.decodeUnknownSync(Series)({
        id: "legacy-series:private-task",
        profile_id: profile,
        entity_version: 1,
        row_version: 1,
        recurrence: {
          dtstart: { kind: "date", date: "2026-10-27" },
          rrule: "FREQ=DAILY",
          exdate: [],
        },
        task,
        created_at: occurred_at,
        updated_at: occurred_at,
        deleted_at: null,
      });
      assert.equal(
        (yield* store.append({
          actor,
          profile,
          event: {
            kind: "TaskCreated",
            entity_version: 1,
            occurred_at,
            task,
            series,
            project,
            tags: [tag],
          },
        })).outcome,
        "committed",
      );
      yield* store.takeSnapshot();
      const rejected = yield* store.append({
        actor,
        profile,
        event: {
          kind: "TaskCreated",
          entity_version: 1,
          occurred_at,
          task: { ...task, title: canaries[4] },
          series: null,
          project,
          tags: [tag],
        },
      });
      assert.equal(rejected.reason, "conflict");
      const deleted = {
        ...task,
        row_version: 2,
        updated_at: occurred_at,
        deleted_at: occurred_at,
      };
      yield* store.append({
        actor,
        profile,
        event: {
          kind: "TaskDeleted",
          entity_version: 1,
          occurred_at,
          before: task,
          after: deleted,
        },
      });
      yield* store.takeSnapshot();
      const prior = (yield* store.history()).map(({ event, ...entry }) => ({
        ...entry,
        kind: event.kind,
        occurred_at: event.occurred_at,
      }));
      const sql = new Database(path);
      try {
        sql.exec(
          "CREATE TRIGGER fail_purge BEFORE UPDATE ON snapshots BEGIN SELECT RAISE(ABORT, 'forced purge failure'); END;",
        );
        assert.equal(
          (yield* store
            .append({
              actor,
              profile,
              event: {
                kind: "TaskPurged",
                entity_version: 1,
                occurred_at,
                task_id: task.id,
                before: deleted,
              },
            })
            .pipe(Effect.result))._tag,
          "Failure",
        );
        assert.deepEqual(
          (yield* store.tasks()).map((task) => [task.title, task.row_version]),
          [["P01-private-title-2710", 2]],
        );
        assert.equal((yield* store.history()).length, 3);
        sql.exec("DROP TRIGGER fail_purge");
        assert.throws(
          () => sql.exec("UPDATE op_log SET event='{}'"),
          /append-only/,
        );
      } finally {
        sql.close();
      }
      assert.equal(
        (yield* store.append({
          actor,
          profile,
          event: {
            kind: "TaskPurged",
            entity_version: 1,
            occurred_at,
            task_id: task.id,
            before: deleted,
          },
        })).outcome,
        "committed",
      );
      assert.deepEqual(
        (yield* store.history()).slice(0, 3).map(({ event, ...entry }) => ({
          ...entry,
          kind:
            event.kind === "TaskHistoryRedacted"
              ? event.original_kind
              : event.kind,
          occurred_at: event.occurred_at,
        })),
        prior,
      );
      assert.deepEqual(
        (yield* store.history()).map((entry) => [
          entry.seq,
          entry.event.kind,
          entry.event.kind === "TaskHistoryRedacted"
            ? entry.event.original_kind
            : null,
          entry.outcome,
          entry.from_version,
          entry.to_version,
        ]),
        [
          [1, "TaskHistoryRedacted", "TaskCreated", "committed", null, 1],
          [
            2,
            "TaskHistoryRedacted",
            "TaskAttemptRejected",
            "rejected",
            null,
            null,
          ],
          [3, "TaskHistoryRedacted", "TaskDeleted", "committed", 1, 2],
          [4, "TaskHistoryRedacted", "TaskPurged", "committed", 2, null],
        ],
      );
      for (const seq of [1, 2, 3, 4])
        assert.equal(
          (yield* store.revert({
            actor,
            profile,
            seq: Schema.decodeUnknownSync(Sequence)(seq),
            occurred_at,
          })).reason,
          "task_purged",
        );
      yield* store.reject({
        actor,
        profile,
        reason: "conflict",
        event: {
          kind: "TaskEdited",
          occurred_at,
          task_id: task.id,
          title: canaries[0],
          tags: [canaries[2]],
        },
      });
      assert.deepEqual(yield* store.tasks(), []);
      assert.deepEqual(yield* store.projects(), []);
      assert.deepEqual(yield* store.tags(), []);
      assert.deepEqual(yield* store.series(), []);
      assert.deepEqual(yield* store.rebuild(), []);
      assert.deepEqual(yield* store.rebuild({ useSnapshot: true }), []);
      assert.deepEqual(yield* store.series(), []);
      const sqlAfter = new Database(path);
      try {
        assert.deepEqual(sqlAfter.query("SELECT * FROM task_versions").all(), [
          { id: "private-task", version: 2 },
        ]);
        assert.throws(
          () => sqlAfter.exec("UPDATE op_log SET event='{}'"),
          /append-only/,
        );
        assert.throws(
          () => sqlAfter.exec("UPDATE snapshots SET payload='{}'"),
          /immutable/,
        );
      } finally {
        sqlAfter.close();
      }
    } finally {
      yield* store.close();
    }
    const compact = new Database(path);
    try {
      compact.exec(
        "PRAGMA wal_checkpoint(TRUNCATE); VACUUM; PRAGMA wal_checkpoint(TRUNCATE);",
      );
    } finally {
      compact.close();
    }
    const bytes = readFileSync(path);
    for (const canary of canaries)
      assert.equal(bytes.includes(Buffer.from(canary)), false, canary);
    return {
      result: "PASS",
      raw_bytes_absent: canaries,
      replay_tasks: [],
      revert_reason: "task_purged",
      atomic_failure: "rolled back",
    };
  });

export const proveSharedMetadataPurge = (path: string) =>
  Effect.gen(function* () {
    const actor = Schema.decodeUnknownSync(ActorId)("shared-purge-proof");
    const profile = Schema.decodeUnknownSync(ProfileId)("shared-work");
    const occurred_at = Schema.decodeUnknownSync(Instant)(
      "2026-10-27T16:00:00Z",
    );
    const store = yield* openStore({ path });
    const canaries = [
      "P01-shared-project-2710",
      "P01-shared-tag-2710",
      "P01-shared-A-2710",
      "P01-shared-B-2710",
    ];
    try {
      yield* store.putProfile(
        Schema.decodeUnknownSync(Profile)({
          id: profile,
          name: "Shared purge",
          created_at: occurred_at,
          updated_at: occurred_at,
        }),
      );
      const project = {
        id: "shared-project",
        profile_id: profile,
        name: canaries[0],
        created_at: occurred_at,
        updated_at: occurred_at,
      };
      const tag = { id: "shared-tag", profile_id: profile, name: canaries[1] };
      for (const [index, id] of ["A", "B"].entries()) {
        const task = Schema.decodeUnknownSync(Task)({
          id,
          profile_id: profile,
          entity_version: 1,
          row_version: 1,
          title: canaries[index + 2],
          description: null,
          status: "open",
          project_id: project.id,
          tags: [tag.id],
          priority: "P2",
          scheduled_at: null,
          due_at: null,
          energy: null,
          estimate_min: null,
          source: "agent",
          occurrence: null,
          created_at: occurred_at,
          updated_at: occurred_at,
          completed_at: null,
          deleted_at: null,
        });
        assert.equal(
          (yield* store.append({
            actor,
            profile,
            event: {
              kind: "TaskCreated",
              entity_version: 1,
              occurred_at,
              task,
              series: null,
              project,
              tags: [tag],
            },
          })).outcome,
          "committed",
        );
      }
      yield* store.takeSnapshot();
      for (const id of ["A", "B"]) {
        const before = (yield* store.tasks()).find((task) => task.id === id);
        assert.ok(before);
        const after = {
          ...before,
          row_version: 2,
          deleted_at: occurred_at,
          updated_at: occurred_at,
        };
        yield* store.append({
          actor,
          profile,
          event: {
            kind: "TaskDeleted",
            entity_version: 1,
            occurred_at,
            before,
            after,
          },
        });
        yield* store.append({
          actor,
          profile,
          event: {
            kind: "TaskPurged",
            entity_version: 1,
            occurred_at,
            task_id: before.id,
            before: after,
          },
        });
        yield* store.takeSnapshot();
      }
      const state = () => {
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
          ].map((table) => db.query(`SELECT * FROM ${table} ORDER BY 1`).all());
        } finally {
          db.close();
        }
      };
      assert.deepEqual(yield* store.projects(), []);
      assert.deepEqual(yield* store.tags(), []);
      const expected = state();
      yield* store.rebuild();
      assert.deepEqual(state(), expected);
      yield* store.rebuild({ useSnapshot: true });
      assert.deepEqual(state(), expected);
      assert.deepEqual(
        (yield* store.history())
          .filter(
            (entry) =>
              entry.event.kind === "TaskHistoryRedacted" &&
              entry.event.original_kind === "TaskCreated",
          )
          .map((entry) =>
            entry.event.kind === "TaskHistoryRedacted"
              ? entry.event.task_ids
              : [],
          ),
        [["A"], ["B"]],
      );
    } finally {
      yield* store.close();
    }
    const db = new Database(path);
    try {
      db.exec(
        "PRAGMA wal_checkpoint(TRUNCATE); VACUUM; PRAGMA wal_checkpoint(TRUNCATE);",
      );
    } finally {
      db.close();
    }
    for (const canary of canaries)
      assert.equal(
        readFileSync(path).includes(Buffer.from(canary)),
        false,
        canary,
      );
    return {
      result: "PASS",
      raw_bytes_absent: canaries,
      sequential_purges: 2,
      projection_replay: "identical",
    };
  });

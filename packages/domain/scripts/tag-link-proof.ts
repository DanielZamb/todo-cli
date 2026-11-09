import { Database } from "bun:sqlite";
import assert from "node:assert/strict";
import { Effect, Schema } from "effect";
import { Tag, Task } from "../src/entities.ts";
import { ProfileId } from "../src/ids.ts";
import {
  createProjection,
  putMetadata,
  putTask,
} from "../src/store/projection.ts";
import { openStore } from "../src/store/store.ts";
import { actor, later, profile, work } from "../test/store-fixtures.ts";
import {
  linkCreated,
  linkEdited,
  linkedTask,
  linkTags,
  tagCases,
} from "../test/tag-link-fixtures.ts";

export const proveTagLinks = (path: string) =>
  Effect.gen(function* () {
    const store = yield* openStore({ path });
    const sql = new Database(path);
    const rows = () =>
      sql
        .query("SELECT task_id,tag_id FROM task_tags ORDER BY task_id,tag_id")
        .all();
    const inspect = (task: Task) => {
      assert.deepEqual(
        sql.query("SELECT payload FROM tasks WHERE id=?").get(task.id),
        { payload: JSON.stringify(task) },
      );
      assert.deepEqual(
        rows(),
        [...new Set(task.tags)]
          .sort()
          .map((tag_id) => ({ task_id: task.id, tag_id })),
      );
      assert.deepEqual(
        sql.query("SELECT version FROM task_versions WHERE id=?").get(task.id),
        { version: task.row_version },
      );
    };
    const replay = (task: Task) =>
      Effect.gen(function* () {
        inspect(task);
        assert.deepEqual(yield* store.rebuild(), [task]);
        inspect(task);
        assert.deepEqual(yield* store.rebuild({ useSnapshot: true }), [task]);
        inspect(task);
      });
    try {
      yield* store.putProfile(work);
      let current = linkedTask("tagged");
      assert.equal(
        (yield* store.append({ actor, profile, event: linkCreated(current) }))
          .outcome,
        "committed",
      );
      yield* store.takeSnapshot();
      const states = [];
      for (const entry of tagCases) {
        const event = linkEdited(current, entry.tags);
        assert.equal(
          (yield* store.append({ actor, profile, event })).outcome,
          "committed",
        );
        current = event.after;
        yield* replay(current);
        states.push({ case: entry.name, task: current, links: rows() });
      }
      const newName = linkEdited(current, ["tag-d"]);
      const accepted = yield* store.append({ actor, profile, event: newName });
      assert.equal(accepted.outcome, "committed");
      current = newName.after;
      yield* replay(current);
      const reverted = yield* store.revert({
        actor,
        profile,
        seq: accepted.seq,
        occurred_at: later,
      });
      assert.equal(reverted.outcome, "committed");
      current = Schema.decodeUnknownSync(Task)({
        ...current,
        tags: [],
        row_version: current.row_version + 1,
      });
      yield* replay(current);

      const back = linkEdited(current, ["tag-a", "tag-b", "tag-c"]);
      assert.equal(
        (yield* store.append({ actor, profile, event: back })).outcome,
        "committed",
      );
      current = back.after;
      const history = yield* store.history();
      for (const tags of [["tag-c", "tag-a", "tag-b"], ["tag-d"]]) {
        sql.exec(
          "CREATE TRIGGER fail_version BEFORE UPDATE ON task_versions BEGIN SELECT RAISE(ABORT, 'forced version failure'); END",
        );
        const failure = yield* Effect.flip(
          store.append({ actor, profile, event: linkEdited(current, tags) }),
        );
        assert.equal(failure._tag, "StoreError");
        sql.exec("DROP TRIGGER fail_version");
        inspect(current);
        assert.deepEqual(yield* store.history(), history);
      }
      for (const statement of [
        "DELETE FROM task_tags",
        "INSERT INTO task_tags VALUES ('tagged','tag-d')",
        "UPDATE task_tags SET tag_id='tag-d' WHERE tag_id='tag-a'",
        "UPDATE tasks SET payload=payload",
        "UPDATE task_versions SET version=999",
      ])
        assert.throws(
          () => sql.exec(statement),
          /domain writes only|no such function: domain_write_allowed/,
        );

      const duplicate = linkEdited(current, [
        "tag-a",
        "tag-a",
        "tag-b",
        "tag-c",
      ]);
      const rejected = yield* store.append({
        actor,
        profile,
        event: duplicate,
      });
      assert.deepEqual(
        [rejected.outcome, rejected.reason],
        ["rejected", "validation"],
      );
      inspect(current);
      const personal = Schema.decodeUnknownSync(ProfileId)("personal");
      yield* store.putProfile({ ...work, id: personal, name: "Personal" });
      const destination = Schema.decodeUnknownSync(Task)({
        ...current,
        profile_id: personal,
        tags: ["personal-a", "personal-b", "personal-c"],
        row_version: current.row_version + 1,
      });
      const moved = yield* store.move({
        actor,
        before: current,
        after: destination,
        original_seq: null,
        definitions: {
          project: null,
          tags: linkTags.slice(0, 3).map((tag) =>
            Schema.decodeUnknownSync(Tag)({
              ...tag,
              id: `personal-${tag.id.slice(-1)}`,
              profile_id: personal,
            }),
          ),
        },
      });
      assert.equal(moved.outcome, "committed");
      current = destination;
      yield* replay(current);
      const deleted = Schema.decodeUnknownSync(Task)({
        ...current,
        row_version: current.row_version + 1,
        deleted_at: later,
      });
      assert.equal(
        (yield* store.append({
          actor,
          profile: personal,
          event: {
            kind: "TaskDeleted",
            entity_version: 1,
            occurred_at: later,
            before: current,
            after: deleted,
          },
        })).outcome,
        "committed",
      );
      yield* replay(deleted);
      yield* store.takeSnapshot();
      yield* replay(deleted);
      return {
        status: "passed",
        states,
        moved: destination,
        deleted,
        finalLinks: rows(),
      };
    } finally {
      sql.close();
      yield* store.close();
    }
  });

export function proveProjectionTagSets() {
  const db = new Database(":memory:");
  try {
    db.function("domain_write_allowed", () => 1);
    db.exec(
      "PRAGMA foreign_keys=ON; CREATE TABLE profiles(id TEXT PRIMARY KEY); INSERT INTO profiles VALUES ('work')",
    );
    createProjection(db);
    putMetadata(db, { projects: [], tags: linkTags });
    let current = linkedTask("projection");
    putTask(db, current);
    db.exec(
      "CREATE TRIGGER refuse_relink BEFORE DELETE ON task_tags BEGIN SELECT RAISE(ABORT, 'unchanged links rewritten'); END",
    );
    for (const tags of [
      ["tag-a", "tag-b", "tag-c"],
      ["tag-c", "tag-a", "tag-b"],
      ["tag-c", "tag-a", "tag-a", "tag-b"],
    ]) {
      current = Schema.decodeUnknownSync(Task)({
        ...current,
        tags,
        row_version: current.row_version + 1,
      });
      putTask(db, current);
      assert.deepEqual(db.query("SELECT payload FROM tasks").get(), {
        payload: JSON.stringify(current),
      });
      assert.deepEqual(
        db.query("SELECT tag_id FROM task_tags ORDER BY tag_id").all(),
        [{ tag_id: "tag-a" }, { tag_id: "tag-b" }, { tag_id: "tag-c" }],
      );
    }
    db.exec("DROP TRIGGER refuse_relink");
    for (const tags of [["tag-d", "tag-d"], [], [], ["tag-a", "tag-a"]]) {
      current = Schema.decodeUnknownSync(Task)({
        ...current,
        tags,
        row_version: current.row_version + 1,
      });
      putTask(db, current);
      assert.deepEqual(db.query("SELECT payload FROM tasks").get(), {
        payload: JSON.stringify(current),
      });
      assert.deepEqual(
        db.query("SELECT tag_id FROM task_tags ORDER BY tag_id").all(),
        [...new Set(tags)].sort().map((tag_id) => ({ tag_id })),
      );
    }
    const fresh = linkedTask("new-duplicates", ["tag-a", "tag-a"]);
    putTask(db, fresh);
    assert.deepEqual(
      db
        .query("SELECT tag_id FROM task_tags WHERE task_id='new-duplicates'")
        .all(),
      [{ tag_id: "tag-a" }],
    );
  } finally {
    db.close();
  }
}

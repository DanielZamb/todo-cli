import { Database } from "bun:sqlite";
import { createHash } from "node:crypto";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { TestClock } from "effect/testing";
import { SnapshotError } from "../src/snapshots.ts";
import { openStore } from "../src/store/store.ts";
import {
  actor,
  created,
  edited,
  profile,
  task,
  time,
  work,
} from "./store-fixtures.ts";

const fixture = (
  run: (
    store: Effect.Success<ReturnType<typeof openStore>>,
    directory: string,
  ) => Effect.Effect<void, unknown>,
) =>
  Effect.scoped(
    Effect.gen(function* () {
      const directory = yield* Effect.acquireRelease(
        Effect.sync(() => mkdtempSync(join(tmpdir(), "todo-snapshot-purge-"))),
        (path) =>
          Effect.sync(() => rmSync(path, { recursive: true, force: true })),
      );
      const store = yield* Effect.acquireRelease(
        openStore({ path: join(directory, "scratch.db") }),
        (store) => Effect.orDie(store.close()),
      );
      yield* store.putProfile(work);
      yield* store.append({
        actor,
        profile,
        event: {
          ...created,
          task: { ...task, tags: ["alpha", "beta"] },
          tags: [
            { id: "alpha", profile_id: profile, name: "Alpha" },
            { id: "beta", profile_id: profile, name: "Beta" },
          ],
        },
      });
      yield* store.append({
        actor,
        profile,
        event: { ...created, task: { ...task, id: "keeper", title: "Keeper" } },
      });
      yield* run(store, directory);
    }),
  );
const purge = (store: Effect.Success<ReturnType<typeof openStore>>) =>
  Effect.gen(function* () {
    const before = (yield* store.tasks()).find((row) => row.id === task.id);
    if (!before) throw new Error("Missing Purge target");
    const after = {
      ...before,
      deleted_at: time,
      row_version: before.row_version + 1,
    };
    yield* store.append({
      actor,
      profile,
      event: {
        kind: "TaskDeleted",
        entity_version: 1,
        occurred_at: time,
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
        occurred_at: time,
        before: after,
        task_id: task.id,
      },
    });
  });

it.effect(
  "Purge removes every declared Task reference from stored copies and restores the keeper",
  () =>
    fixture((store, directory) =>
      Effect.gen(function* () {
        const live = new Database(join(directory, "scratch.db"));
        try {
          const declared = live
            .query<{ name: string }, []>(
              "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
            )
            .all()
            .flatMap(({ name }) =>
              live
                .query<{ table: string; from: string; to: string }, []>(
                  `PRAGMA foreign_key_list("${name}")`,
                )
                .all()
                .filter((row) => row.table === "tasks")
                .map((row) => [name, row.from, row.to]),
            )
            .sort();
          expect(declared).toEqual([
            ["task_dependencies", "blocker_id", "id"],
            ["task_dependencies", "dependent_id", "id"],
            ["task_dependencies", "profile_id", "profile_id"],
            ["task_dependencies", "profile_id", "profile_id"],
            ["task_tags", "task_id", "id"],
          ]);
          const saved = yield* store.snapshots.create("tagged Task");
          yield* purge(store);
          const copy = new Database(saved.path, { readonly: true });
          try {
            expect(copy.query("PRAGMA foreign_key_check").all()).toEqual([]);
            expect(copy.query("SELECT * FROM task_tags").all()).toEqual([]);
            expect(
              copy.query("SELECT id FROM tasks ORDER BY id").all(),
            ).toEqual([{ id: "keeper" }]);
            expect(
              copy.query("SELECT * FROM task_versions ORDER BY id").all(),
            ).toEqual([
              { id: "keeper", version: 1 },
              { id: "task-1", version: 1 },
            ]);
          } finally {
            copy.close();
          }
          const generation = (yield* store.snapshots.generation()).generation;
          yield* store.snapshots.restore(saved.id);
          expect((yield* store.tasks()).map((row) => row.title)).toEqual([
            "Keeper",
          ]);
          expect((yield* store.snapshots.generation()).generation).not.toBe(
            generation,
          );
        } finally {
          live.close();
        }
      }),
    ),
);

it.effect(
  "Purge handles a newly declared Task reference without a table allowlist",
  () =>
    fixture((store, directory) =>
      Effect.gen(function* () {
        const db = new Database(join(directory, "scratch.db"));
        try {
          db.exec(
            "CREATE TABLE future_task_reference (task TEXT REFERENCES tasks(id) ON DELETE CASCADE); INSERT INTO future_task_reference VALUES ('task-1'),('keeper')",
          );
          const saved = yield* store.snapshots.create("future reference");
          yield* purge(store);
          for (const path of [saved.path, join(directory, "scratch.db")]) {
            const copy = new Database(path, { readonly: true });
            try {
              expect(
                copy.query("SELECT * FROM future_task_reference").all(),
              ).toEqual([{ task: "keeper" }]);
            } finally {
              copy.close();
            }
          }
          yield* store.snapshots.restore(saved.id);
          expect((yield* store.tasks()).map((row) => row.id)).toEqual([
            "keeper",
          ]);
        } finally {
          db.close();
        }
      }),
    ),
);

it.effect(
  "restore repairs only durable Purge ids and refuses an unexplained orphan",
  () =>
    fixture((store, directory) =>
      Effect.gen(function* () {
        const saved = yield* store.snapshots.create("old damaged copy");
        yield* purge(store);
        const rewrite = (orphan: string) => {
          const db = new Database(saved.path);
          try {
            db.function("domain_write_allowed", () => 1);
            db.query("INSERT INTO task_tags VALUES (?,?)").run(
              orphan,
              "orphan-tag",
            );
            db.query(
              "INSERT OR IGNORE INTO attachment_cleanup VALUES (?,?)",
            ).run(profile, task.id);
            if (orphan === task.id) {
              db.query(
                "INSERT OR IGNORE INTO attachment_cleanup VALUES (?,?)",
              ).run(profile, "keeper");
              db.query("INSERT INTO task_dependencies VALUES (?,?,?)").run(
                profile,
                task.id,
                "keeper",
              );
              db.query("INSERT INTO task_dependencies VALUES (?,?,?)").run(
                profile,
                "keeper",
                task.id,
              );
            }
          } finally {
            db.close();
          }
          const bytes = readFileSync(saved.path);
          writeFileSync(
            join(directory, "snapshots", `${saved.id}.json`),
            JSON.stringify({
              ...saved,
              sha256: createHash("sha256").update(bytes).digest("hex"),
              size: statSync(saved.path).size,
            }),
          );
        };
        rewrite(task.id);
        yield* store.snapshots.restore(saved.id);
        const copy = new Database(saved.path, { readonly: true });
        try {
          expect(copy.query("PRAGMA foreign_key_check").all()).toEqual([]);
          expect(
            copy
              .query("SELECT * FROM attachment_cleanup ORDER BY task_id")
              .all(),
          ).toEqual([
            { profile_id: "work", task_id: "keeper" },
            { profile_id: "work", task_id: "task-1" },
          ]);
          expect(copy.query("SELECT * FROM task_dependencies").all()).toEqual(
            [],
          );
        } finally {
          copy.close();
        }
        expect(
          readFileSync(saved.path).includes(Buffer.from("Write the store")),
        ).toBe(false);
        const manifest = yield* store.snapshots.show(saved.id);
        expect(manifest.sha256).toBe(
          createHash("sha256").update(readFileSync(saved.path)).digest("hex"),
        );
        expect(manifest.size).toBe(statSync(saved.path).size);
        expect(manifest.task_counts.map((row) => row.count)).toEqual([1]);
        rewrite("never-purged");
        const result = yield* store.snapshots
          .restore(saved.id)
          .pipe(Effect.result);
        expect(result._tag).toBe("Failure");
        if (result._tag === "Failure")
          expect(String(result.failure)).toContain(
            "Restored Snapshot violates foreign keys",
          );
        expect((yield* store.tasks()).map((row) => row.id)).toEqual(["keeper"]);
      }),
    ),
);

it.effect(
  "Purge redacts reminder receipts and replay checkpoints before restore",
  () =>
    fixture((store) =>
      Effect.gen(function* () {
        const before = { ...task, tags: ["alpha", "beta"] };
        const tags = yield* store.tags();
        const changed = yield* store.append({
          actor,
          profile,
          event: {
            ...edited,
            tags_before: tags,
            tags_after: tags,
            before,
            after: {
              ...before,
              row_version: 2,
              due_at: { kind: "instant", utc: time, time_zone: "UTC" },
            },
          },
        });
        expect(changed.outcome).toBe("committed");
        yield* TestClock.setTime(Date.parse(time));
        expect(yield* store.scheduled.runDue()).toEqual({
          woken: 0,
          reminders: 1,
        });
        yield* store.takeSnapshot();
        const saved = yield* store.snapshots.create("reminder and checkpoint");
        yield* purge(store);
        expect(readFileSync(saved.path).includes(Buffer.from(task.title))).toBe(
          false,
        );
        yield* store.snapshots.restore(saved.id);
        yield* store.rebuild();
        expect((yield* store.tasks()).map((row) => row.title)).toEqual([
          "Keeper",
        ]);
        expect(yield* store.scheduled.pendingReminders()).toBe(0);
        expect(yield* store.scheduled.nextAt()).toBe(null);
        expect(
          (yield* store.history()).some(
            (row) => row.event.kind === "ReminderFired",
          ),
        ).toBe(false);
      }),
    ),
);

it.effect(
  "a checksum mismatch stops Purge and preserves the deleted Task",
  () =>
    fixture((store) =>
      Effect.gen(function* () {
        const saved = yield* store.snapshots.create("checksum refusal");
        writeFileSync(saved.path, "corrupt");
        const result = yield* purge(store).pipe(Effect.result);
        expect(result._tag).toBe("Failure");
        if (result._tag === "Failure")
          expect(String(result.failure)).toContain("Purge stopped");
        expect(
          (yield* store.tasks()).map((row) => [row.id, row.deleted_at]),
        ).toEqual([
          ["keeper", null],
          ["task-1", time],
        ]);
      }),
    ),
);

it.effect(
  "refuses checksum-matching non-SQLite bytes as invalid_snapshot without changing live Tasks",
  () =>
    fixture((store, directory) =>
      Effect.gen(function* () {
        const saved = yield* store.snapshots.create("malformed SQLite");
        const bytes = Buffer.from("not a SQLite file");
        writeFileSync(saved.path, bytes);
        writeFileSync(
          join(directory, "snapshots", `${saved.id}.json`),
          JSON.stringify({
            ...saved,
            size: bytes.length,
            sha256: createHash("sha256").update(bytes).digest("hex"),
          }),
        );
        const rows = () => {
          const db = new Database(join(directory, "scratch.db"), {
            readonly: true,
          });
          try {
            return Object.fromEntries(
              db
                .query<{ name: string }, []>(
                  "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
                )
                .all()
                .map(({ name }) => [
                  name,
                  db
                    .query(`SELECT * FROM "${name.replaceAll('"', '""')}"`)
                    .all(),
                ]),
            );
          } finally {
            db.close();
          }
        };
        const before = rows();
        const result = yield* store.snapshots
          .restore(saved.id)
          .pipe(Effect.result);
        expect(result._tag).toBe("Failure");
        if (result._tag === "Failure") {
          expect(result.failure.cause).toBeInstanceOf(SnapshotError);
          if (result.failure.cause instanceof SnapshotError)
            expect(result.failure.cause.code).toBe("invalid_snapshot");
        }
        expect((yield* store.tasks()).map((row) => row.id)).toEqual([
          "keeper",
          "task-1",
        ]);
        expect((yield* store.snapshots.list()).snapshots.length).toBe(1);
        expect(rows()).toEqual(before);
      }),
    ),
);

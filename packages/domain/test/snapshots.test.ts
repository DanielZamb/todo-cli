import { Database } from "bun:sqlite";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "@effect/vitest";
import { Effect, Schema } from "effect";
import { Profile, Task } from "../src/index.ts";
import { currentSchemaVersion } from "../src/store/migration.ts";
import { openStore } from "../src/store/store.ts";
import { actor, created, profile, task, time, work } from "./store-fixtures.ts";

const fixture = <A, E>(
  run: (
    store: Effect.Success<ReturnType<typeof openStore>>,
    directory: string,
  ) => Effect.Effect<A, E>,
) =>
  Effect.scoped(
    Effect.gen(function* () {
      const directory = yield* Effect.acquireRelease(
        Effect.sync(() => mkdtempSync(join(tmpdir(), "todo-f13-test-"))),
        (path) =>
          Effect.sync(() => rmSync(path, { recursive: true, force: true })),
      );
      const store = yield* Effect.acquireRelease(
        openStore({ path: join(directory, "scratch.db") }),
        (store) => Effect.orDie(store.close()),
      );
      yield* store.putProfile(work);
      yield* store.putProfile(
        Schema.decodeUnknownSync(Profile)({
          ...work,
          id: "personal",
          name: "Personal",
        }),
      );
      yield* store.append({ actor, profile, event: created });
      return yield* run(store, directory);
    }),
  );

describe("owner Snapshots", () => {
  it.effect(
    "restores all Profiles through an existing second connection and preserves the live inode",
    () =>
      fixture((store, directory) =>
        Effect.gen(function* () {
          const saved = yield* store.snapshots.create("manual");
          expect(
            saved.task_counts.map((row) => [row.profile, row.count]),
          ).toEqual([
            ["personal", 0],
            ["work", 1],
          ]);
          expect(statSync(saved.path).mode & 0o777).toBe(0o600);
          expect(statSync(join(directory, "snapshots")).mode & 0o777).toBe(
            0o700,
          );
          const other = yield* openStore({
            path: join(directory, "scratch.db"),
          });
          try {
            yield* store.append({
              actor,
              profile,
              event: { ...created, task: { ...task, id: "later-task" } },
            });
            const inode = statSync(join(directory, "scratch.db")).ino;
            const dry = yield* store.snapshots.restore(saved.id, {
              dryRun: true,
            });
            expect(
              dry.task_counts.map((row) => [
                row.profile,
                row.before,
                row.after,
              ]),
            ).toEqual([
              ["personal", 0, 0],
              ["work", 2, 1],
            ]);
            expect((yield* store.tasks()).length).toBe(2);
            const applied = yield* store.snapshots.restore(saved.id);
            expect(applied.dry_run).toBe(false);
            expect(statSync(join(directory, "scratch.db")).ino).toBe(inode);
            expect((yield* other.tasks()).map((row) => row.title)).toEqual([
              "Write the store",
            ]);
            yield* other.append({
              actor,
              profile,
              event: { ...created, task: { ...task, id: "new-task" } },
            });
            expect((yield* store.tasks()).length).toBe(2);
            expect(
              (yield* store.snapshots.list()).snapshots
                .map((row) => row.reason)
                .sort(),
            ).toEqual(["manual", "pre-restore"]);
          } finally {
            yield* other.close();
          }
        }),
      ),
  );

  it.effect(
    "Purge redacts stored files and restore re-applies durable Purges without erasing another Profile",
    () =>
      fixture((store, directory) =>
        Effect.gen(function* () {
          const personal = Schema.decodeUnknownSync(Task)({
            ...task,
            id: "personal-task",
            profile_id: "personal",
            title: "Keep personal Task",
          });
          yield* store.append({
            actor,
            profile: personal.profile_id,
            event: { ...created, task: personal },
          });
          const saved = yield* store.snapshots.create("manual");
          const unredacted = readFileSync(saved.path);
          const originalManifest = readFileSync(
            join(directory, "snapshots", `${saved.id}.json`),
          );
          const deleted = { ...task, row_version: 2, deleted_at: time };
          yield* store.append({
            actor,
            profile,
            event: {
              kind: "TaskDeleted",
              entity_version: 1,
              occurred_at: time,
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
              occurred_at: time,
              before: deleted,
              task_id: task.id,
            },
          });
          expect(
            readFileSync(saved.path).includes(Buffer.from("Write the store")),
          ).toBe(false);
          expect(
            (yield* store.snapshots.show(saved.id)).task_counts.map(
              (row) => row.count,
            ),
          ).toEqual([1, 0]);
          writeFileSync(saved.path, unredacted);
          writeFileSync(
            join(directory, "snapshots", `${saved.id}.json`),
            originalManifest,
          );
          yield* store.snapshots.restore(saved.id);
          expect((yield* store.tasks()).map((row) => row.title)).toEqual([
            "Keep personal Task",
          ]);
          yield* store.snapshots.restore(saved.id);
          expect((yield* store.tasks()).map((row) => row.title)).toEqual([
            "Keep personal Task",
          ]);
          yield* store.rebuild();
          expect((yield* store.tasks()).map((row) => row.title)).toEqual([
            "Keep personal Task",
          ]);
        }),
      ),
  );

  it.effect(
    "refuses corruption and a newer schema without changing Tasks or creating a safety Snapshot",
    () =>
      fixture((store, directory) =>
        Effect.gen(function* () {
          const saved = yield* store.snapshots.create("manual");
          writeFileSync(saved.path, "corrupt");
          const corrupt = yield* store.snapshots
            .restore(saved.id)
            .pipe(Effect.result);
          expect(corrupt._tag).toBe("Failure");
          expect((yield* store.tasks()).map((row) => row.id)).toEqual([
            "task-1",
          ]);
          const newer = yield* store.snapshots.create("newer");
          const db = new Database(newer.path);
          db.exec("PRAGMA user_version=999");
          db.close();
          const { createHash } = yield* Effect.promise(
            () => import("node:crypto"),
          );
          writeFileSync(
            join(directory, "snapshots", `${newer.id}.json`),
            JSON.stringify({
              ...newer,
              schema_version: 999,
              sha256: createHash("sha256")
                .update(readFileSync(newer.path))
                .digest("hex"),
            }),
          );
          const result = yield* store.snapshots
            .restore(newer.id)
            .pipe(Effect.result);
          expect(result._tag).toBe("Failure");
          expect((yield* store.snapshots.list()).snapshots.length).toBe(2);
          expect((yield* store.tasks()).map((row) => row.id)).toEqual([
            "task-1",
          ]);
        }),
      ),
  );
});

it.effect(
  "two independent WAL writers create consistent Snapshots concurrently",
  () =>
    fixture((store, directory) =>
      Effect.gen(function* () {
        const worker = new URL("fixtures/snapshot-writer.ts", import.meta.url)
          .pathname;
        const children = ["CLI process", "server process"].map((reason) =>
          Bun.spawn(
            [process.execPath, worker, join(directory, "scratch.db"), reason],
            { stdout: "pipe", stderr: "pipe" },
          ),
        );
        const codes = yield* Effect.promise(() =>
          Promise.all(children.map((child) => child.exited)),
        );
        expect(codes).toEqual([0, 0]);
        const snapshots = (yield* store.snapshots.list()).snapshots;
        expect(snapshots.map((row) => row.reason).sort()).toEqual([
          "CLI process",
          "server process",
        ]);
        expect(
          snapshots.map((row) => row.task_counts.map((count) => count.count)),
        ).toEqual([
          [0, 1],
          [0, 1],
        ]);
      }),
    ),
);

it.effect(
  "migrates a pre-migration Snapshot forward and restores literal legacy Tasks",
  () =>
    Effect.scoped(
      Effect.gen(function* () {
        const directory = yield* Effect.acquireRelease(
          Effect.sync(() => mkdtempSync(join(tmpdir(), "todo-f13-test-"))),
          (path) =>
            Effect.sync(() => rmSync(path, { recursive: true, force: true })),
        );
        const path = join(directory, "scratch.db");
        const { seedLegacy } = yield* Effect.promise(
          () => import("./store-fixtures.ts"),
        );
        yield* Effect.sync(() => seedLegacy(path));
        const store = yield* Effect.acquireRelease(
          openStore({ path }),
          (store) => Effect.orDie(store.close()),
        );
        const saved = (yield* store.snapshots.list()).snapshots[0];
        expect(saved?.schema_version).toBe(0);
        if (!saved) throw new Error("Pre-migration Snapshot missing");
        yield* store.snapshots.restore(saved.id);
        expect(
          (yield* store.tasks()).map((task) => [task.title, task.row_version]),
        ).toEqual([
          ["Ship the port", 7],
          ["Buy tea", 2],
        ]);
        expect((yield* store.settings()).user_version).toBe(
          currentSchemaVersion,
        );
      }),
    ),
);

it.effect(
  "a failed replacement rolls back every row and restores projection guard triggers",
  () =>
    fixture((store, directory) =>
      Effect.gen(function* () {
        const saved = yield* store.snapshots.create("broken schema fixture");
        const db = new Database(saved.path);
        db.exec("DROP TABLE credentials");
        db.close();
        const { createHash } = yield* Effect.promise(
          () => import("node:crypto"),
        );
        writeFileSync(
          join(directory, "snapshots", `${saved.id}.json`),
          JSON.stringify({
            ...saved,
            size: statSync(saved.path).size,
            sha256: createHash("sha256")
              .update(readFileSync(saved.path))
              .digest("hex"),
          }),
        );
        expect(
          (yield* store.snapshots.restore(saved.id).pipe(Effect.result))._tag,
        ).toBe("Failure");
        expect((yield* store.tasks()).map((row) => row.title)).toEqual([
          "Write the store",
        ]);
        const live = new Database(join(directory, "scratch.db"));
        try {
          expect(() => live.exec("DELETE FROM tasks")).toThrow();
        } finally {
          live.close();
        }
      }),
    ),
);

it.effect(
  "Purge recovers interrupted Snapshot publication and removes abandoned restore staging bytes",
  () =>
    fixture((store, directory) =>
      Effect.gen(function* () {
        const saved = yield* store.snapshots.create(
          "interrupted publication fixture",
        );
        rmSync(join(directory, "snapshots", `${saved.id}.json`));
        utimesSync(
          saved.path,
          new Date("2020-01-01T00:00:00Z"),
          new Date("2020-01-01T00:00:00Z"),
        );
        const abandoned = join(
          directory,
          "snapshots",
          ".restore-11111111-1111-1111-1111-111111111111.sqlite",
        );
        writeFileSync(abandoned, "Write the store");
        const deleted = { ...task, row_version: 2, deleted_at: time };
        yield* store.append({
          actor,
          profile,
          event: {
            kind: "TaskDeleted",
            entity_version: 1,
            occurred_at: time,
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
            occurred_at: time,
            task_id: task.id,
            before: deleted,
          },
        });
        expect(
          readFileSync(saved.path).includes(Buffer.from("Write the store")),
        ).toBe(false);
        expect((yield* store.snapshots.show(saved.id)).reason).toBe(
          "interrupted Snapshot",
        );
        expect((yield* store.snapshots.show(saved.id)).created_at).toBe(
          "2020-01-01T00:00:00.000Z",
        );
        expect(() => readFileSync(abandoned)).toThrow();
      }),
    ),
);

it.effect(
  "prune previews and applies configurable retention while keeping the newest Snapshot",
  () =>
    fixture((store, directory) =>
      Effect.gen(function* () {
        const old = yield* store.snapshots.create("older");
        const recent = yield* store.snapshots.create("newest");
        writeFileSync(
          join(directory, "snapshots", `${old.id}.json`),
          JSON.stringify({ ...old, created_at: "2020-01-01T00:00:00Z" }),
        );
        writeFileSync(
          join(directory, "snapshots", "retention.json"),
          JSON.stringify({ daily: 0, weekly: 0, pre_change_days: 0 }),
        );
        const preview = yield* store.snapshots.prune({ dryRun: true });
        expect(preview.removed.map((row) => row.reason)).toEqual(["older"]);
        expect(preview.retained).toBe(1);
        expect((yield* store.snapshots.list()).snapshots.length).toBe(2);
        const applied = yield* store.snapshots.prune();
        expect(applied.removed.map((row) => row.reason)).toEqual(["older"]);
        expect(
          (yield* store.snapshots.list()).snapshots.map((row) => row.id),
        ).toEqual([recent.id]);
        expect((yield* store.tasks()).map((row) => row.title)).toEqual([
          "Write the store",
        ]);
      }),
    ),
);

for (const mode of ["privacy", "manifest"] satisfies (
  | "privacy"
  | "manifest"
)[]) {
  it.effect(`restored Snapshot ${mode} regression`, () =>
    Effect.scoped(
      Effect.gen(function* () {
        const directory = yield* Effect.acquireRelease(
          Effect.sync(() => mkdtempSync(join(tmpdir(), "todo-f13-test-"))),
          (path) =>
            Effect.sync(() => rmSync(path, { recursive: true, force: true })),
        );
        const { proveRestoredPurge } = yield* Effect.promise(
          () => import("../scripts/snapshot-restore-proof.ts"),
        );
        yield* proveRestoredPurge(directory, mode);
      }),
    ),
  );
}

it.effect(
  "retains Profile Delete and import pre-change Snapshots for the configured period",
  () =>
    fixture((store, directory) =>
      Effect.gen(function* () {
        yield* store.snapshots.create("before Profile delete Personal");
        yield* store.snapshots.create("before import Tasks.csv");
        const newest = yield* store.snapshots.create("manual");
        writeFileSync(
          join(directory, "snapshots", `${newest.id}.json`),
          JSON.stringify({ ...newest, created_at: "2099-01-01T00:00:00Z" }),
        );
        writeFileSync(
          join(directory, "snapshots", "retention.json"),
          JSON.stringify({ daily: 0, weekly: 0, pre_change_days: 30 }),
        );
        const report = yield* store.snapshots.prune({ dryRun: true });
        expect(report.removed).toEqual([]);
        expect(report.retained).toBe(3);
      }),
    ),
);

it.effect(
  "restores exact Profile tombstones, migrates version-3, version-4 and version-5 Snapshots through 0004, 0005 and 0006 and refuses a newer schema",
  () =>
    Effect.scoped(
      Effect.gen(function* () {
        const { proveSnapshotSchema } = yield* Effect.promise(
          () => import("../scripts/snapshot-restore-proof.ts"),
        );
        const directory = yield* Effect.acquireRelease(
          Effect.sync(() =>
            mkdtempSync(join(tmpdir(), "todo-f13-schema-test-")),
          ),
          (path) =>
            Effect.sync(() => rmSync(path, { recursive: true, force: true })),
        );
        expect(yield* proveSnapshotSchema(directory)).toEqual({
          status: "PASS",
          migrated_from: [3, 4, 5],
          migrated_to: currentSchemaVersion,
          newer_schema_refused: currentSchemaVersion + 1,
          tombstones_restored_exactly: true,
        });
      }),
    ),
);

it.effect(
  "Snapshot restore preserves missing attachment references and Purge redacts every saved path",
  () =>
    Effect.scoped(
      Effect.gen(function* () {
        const { proveSnapshotAttachments } = yield* Effect.promise(
          () => import("../scripts/snapshot-restore-proof.ts"),
        );
        const directory = yield* Effect.acquireRelease(
          Effect.sync(() =>
            mkdtempSync(join(tmpdir(), "todo-f13-attachment-test-")),
          ),
          (path) =>
            Effect.sync(() => rmSync(path, { recursive: true, force: true })),
        );
        expect(yield* proveSnapshotAttachments(directory)).toEqual({
          status: "PASS",
          before_attachment_count: 0,
          restored_missing_file: true,
          purge_snapshot_paths_redacted: true,
          purge_erased_bytes: true,
          restored_purged_tasks: 0,
        });
      }),
    ),
);

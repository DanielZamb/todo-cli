import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "@effect/vitest";
import { Effect, Schema } from "effect";
import { TestClock } from "effect/testing";
import { Profile, Recurrence } from "../src/entities.ts";
import { Version } from "../src/ids.ts";
import { openStore, TaskCommands } from "../src/store/store.ts";
import { CreateTask } from "../src/task-commands.ts";
import { profile, seedLegacy, work } from "./store-fixtures.ts";

it.effect(
  "persists an external id and rejects duplicates in the same Profile",
  () =>
    Effect.scoped(
      Effect.gen(function* () {
        yield* TestClock.setTime(Date.now());
        const directory = yield* Effect.acquireRelease(
          Effect.sync(() => mkdtempSync(join(tmpdir(), "todo-import-test-"))),
          (path) =>
            Effect.sync(() => rmSync(path, { recursive: true, force: true })),
        );
        const store = yield* Effect.acquireRelease(
          openStore({ path: join(directory, "scratch.db") }),
          (value) => Effect.orDie(value.close()),
        );
        yield* store.putProfile(work);
        yield* store.auth.setupOwner("scratch import passphrase");
        const session = yield* store.auth.signIn("scratch import passphrase");
        const request = { credential: session.credential, profile };
        const commands = new TaskCommands(store);
        const input = Schema.decodeUnknownSync(CreateTask)({
          title: "Repository sync",
          external_id: "repo:one",
        });
        const created = yield* commands.create(request, input);
        expect(created.outcome).toBe("committed");
        expect(
          (yield* commands.list(request)).map((task) => ({
            title: task.title,
            external_id: Reflect.get(task, "external_id"),
          })),
        ).toEqual([{ title: "Repository sync", external_id: "repo:one" }]);
        expect(yield* commands.create(request, input)).toEqual({
          outcome: "rejected",
          reason: "external_id_conflict",
          latest: null,
        });
      }),
    ),
);

import { Database } from "bun:sqlite";
import { readFileSync } from "node:fs";
import { ensureProfile } from "../src/commands.ts";
import { ImportRequest, parseImportText } from "../src/import.ts";
import { importTasks } from "../src/import-tasks.ts";
import { authMigrationSql } from "../src/store/0003.ts";
import { migrateExternalId } from "../src/store/0005.ts";
import { migrate } from "../src/store/migration.ts";

const usingImport = <A, E>(
  run: (
    store: Effect.Success<ReturnType<typeof openStore>>,
    request: { credential: string; profile: typeof profile },
  ) => Effect.Effect<A, E>,
  prepare?: (path: string) => void,
) =>
  Effect.scoped(
    Effect.gen(function* () {
      yield* TestClock.setTime(Date.now());
      const directory = yield* Effect.acquireRelease(
        Effect.sync(() => mkdtempSync(join(tmpdir(), "todo-import-test-"))),
        (path) =>
          Effect.sync(() => rmSync(path, { recursive: true, force: true })),
      );
      if (prepare)
        yield* Effect.sync(() => prepare(join(directory, "scratch.db")));
      const store = yield* Effect.acquireRelease(
        openStore({ path: join(directory, "scratch.db") }),
        (value) => Effect.orDie(value.close()),
      );
      yield* store.putProfile(work);
      yield* store.auth.setupOwner("scratch import passphrase");
      const session = yield* store.auth.signIn("scratch import passphrase");
      return yield* run(store, { credential: session.credential, profile });
    }),
  );
const fixture = () =>
  parseImportText(
    readFileSync(
      new URL("fixtures/import/repository-sync.json", import.meta.url),
      "utf8",
    ),
  );

it.effect("Import preserves Attachments when an update omits them", () =>
  usingImport((store, request) =>
    Effect.gen(function* () {
      const created = yield* new TaskCommands(store).create(request, {
        title: "Attachment import source",
        external_id: "repo:attachments",
      });
      if (created.outcome !== "committed") throw new Error("No Task");
      const target = { ...request, task_id: created.task.id };
      const attached = yield* new AttachmentCommands(store).attach(target, {
        from_version: created.task.row_version,
        location: { kind: "file", path: "/tmp/import-keeps-draft.md" },
        label: "jira",
      });
      if (attached.outcome !== "committed") throw new Error("No Attachment");
      const report = yield* importTasks(store, request, {
        items: [
          {
            external_id: "repo:attachments",
            title: "Imported title keeps reference",
            from_version: 2,
          },
        ],
        dry_run: false,
        close_missing: false,
      });
      expect(report.items[0]?.outcome).toBe("updated");
      const durable = (yield* store.tasks()).find(
        (task) => task.id === created.task.id,
      );
      expect(durable?.title).toBe("Imported title keeps reference");
      expect(durable?.attachments).toEqual(attached.task.attachments);
      yield* store.rebuild();
      expect(
        (yield* store.tasks()).find((task) => task.id === created.task.id)
          ?.attachments,
      ).toEqual(attached.task.attachments);
    }),
  ),
);

import { AttachmentCommands } from "../src/attachment-commands.ts";

const input = (items: unknown[], options = {}) =>
  Schema.decodeUnknownSync(ImportRequest)({ items, ...options });

it.effect(
  "import refuses a deleted Profile without resurrecting its name",
  () =>
    usingImport((store, request) =>
      Effect.gen(function* () {
        yield* ensureProfile(store, "personal");
        expect(
          (yield* store.auth.deleteProfile({
            ...request,
            options: { with_tasks: false, dry_run: false },
          })).outcome,
        ).toBe("deleted");
        for (const dry_run of [true, false]) {
          const result = yield* Effect.flip(
            importTasks(
              store,
              request,
              input(
                [{ external_id: "deleted:one", title: "Must stay absent" }],
                { dry_run },
              ),
            ),
          );
          expect(result).toMatchObject({
            _tag: "AuthError",
            detail: "profile_deleted",
          });
        }
        const recreated = yield* ensureProfile(store, work.name);
        expect(recreated.id).not.toBe(work.id);
        expect((yield* store.profiles()).map((p) => p.id)).not.toContain(
          work.id,
        );
        expect(yield* store.tasks()).toEqual([]);
      }),
    ),
);

for (const version of [2, 3]) {
  it.effect(
    `opening schema ${version} chains through 3, 4 and 5 with one Snapshot and byte-identical rows`,
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const directory = yield* Effect.acquireRelease(
            Effect.sync(() => mkdtempSync(join(tmpdir(), "todo-c11-chain-"))),
            (path) =>
              Effect.sync(() => rmSync(path, { recursive: true, force: true })),
          );
          const path = join(directory, "scratch.db");
          const db = new Database(path);
          db.function("domain_write_allowed", () => 1);
          db.exec(
            readFileSync(
              new URL("fixtures/v2-recurrence.sql", import.meta.url),
              "utf8",
            ),
          );
          if (version === 3) db.exec(authMigrationSql);
          const tables = db
            .query<{ name: string }, []>(
              "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
            )
            .all()
            .map((row) => row.name);
          const before = tables.map((table) => [
            table,
            JSON.stringify(
              db.query(`SELECT * FROM ${table} ORDER BY rowid`).all(),
            ),
          ]);
          db.close();
          const store = yield* openStore({ path });
          expect((yield* store.settings()).user_version).toBe(6);
          const snapshots = (yield* store.snapshots.list()).snapshots;
          expect(snapshots.map((s) => [s.reason, s.schema_version])).toEqual([
            ["pre-migration", version],
          ]);
          yield* store.close();
          const after = new Database(path, { readonly: true });
          try {
            for (const [table, rows] of before) {
              if (table === undefined) throw new Error("Missing fixture table");
              const columns = after
                .query<{ name: string }, []>(`PRAGMA table_xinfo(${table})`)
                .all()
                .filter((column) => column.name !== "external_id")
                .map((column) => column.name)
                .join(",");
              expect(
                JSON.stringify(
                  after
                    .query(`SELECT ${columns} FROM ${table} ORDER BY rowid`)
                    .all(),
                ),
              ).toBe(rows);
            }
          } finally {
            after.close();
          }
          const reopened = yield* Effect.acquireRelease(
            openStore({ path }),
            (value) => Effect.orDie(value.close()),
          );
          expect(
            (yield* reopened.snapshots.list()).snapshots.map((s) => [
              s.reason,
              s.schema_version,
            ]),
          ).toEqual([["pre-migration", version]]);
        }),
      ),
  );
}

it.effect(
  "previews repository sync without writes, applies it and imports it unchanged",
  () =>
    usingImport((store, request) =>
      Effect.gen(function* () {
        const historyBefore = yield* store.history();
        const preview = yield* importTasks(store, request, {
          items: fixture(),
          dry_run: true,
        });
        expect(preview.totals).toEqual({
          created: 2,
          updated: 0,
          unchanged: 0,
          rejected: 0,
        });
        expect(
          preview.items.map((row) => [
            row.external_id,
            row.outcome,
            row.task_id,
            row.from_version,
          ]),
        ).toEqual([
          ["repository:arg-weekly-export", "created", null, null],
          ["repository:jira-etl-follow-up", "created", null, null],
        ]);
        expect(yield* store.tasks()).toEqual([]);
        expect(yield* store.projects()).toEqual([]);
        expect(yield* store.tags()).toEqual([]);
        expect(yield* store.history()).toEqual(historyBefore);
        const applied = yield* importTasks(store, request, {
          items: fixture(),
        });
        expect(applied.totals).toEqual({
          created: 2,
          updated: 0,
          unchanged: 0,
          rejected: 0,
        });
        const history = yield* store.history();
        expect(
          (yield* importTasks(store, request, { items: fixture() })).totals,
        ).toEqual({ created: 0, updated: 0, unchanged: 2, rejected: 0 });
        expect(yield* store.history()).toEqual(history);
        expect(
          (yield* store.tasks())
            .map((task) => [task.external_id, task.status, task.source])
            .sort(),
        ).toEqual([
          ["repository:arg-weekly-export", "open", "agent"],
          ["repository:jira-etl-follow-up", "done", "agent"],
        ]);
        const snapshot = yield* store.tasks();
        yield* store.takeSnapshot();
        expect(yield* store.rebuild()).toEqual(snapshot);
        expect(yield* store.rebuild({ useSnapshot: true })).toEqual(snapshot);
      }),
    ),
);

it.effect(
  "updates only supplied fields, clears nulls, rejects stale Versions and validates each Task",
  () =>
    usingImport((store, request) =>
      Effect.gen(function* () {
        yield* importTasks(
          store,
          request,
          input([
            {
              external_id: "a",
              title: "Original",
              description: "Keep",
              priority: "P1",
              project_name: "Port",
              tag_names: ["proof"],
            },
          ]),
        );
        const preview = yield* importTasks(
          store,
          request,
          input(
            [
              {
                external_id: "a",
                title: "Updated",
                description: null,
                project_name: null,
                tag_names: null,
              },
            ],
            { dry_run: true },
          ),
        );
        expect(
          preview.items.map((row) => [
            row.outcome,
            row.changed_fields,
            row.from_version,
          ]),
        ).toEqual([
          ["updated", ["title", "description", "project_name", "tag_names"], 1],
        ]);
        const report = yield* importTasks(
          store,
          request,
          input([
            {
              external_id: "a",
              title: "Updated",
              description: null,
              project_name: null,
              tag_names: null,
            },
          ]),
        );
        expect(report.totals).toEqual({
          created: 0,
          updated: 1,
          unchanged: 0,
          rejected: 0,
        });
        expect(
          (yield* store.tasks()).map((task) => [
            task.title,
            task.description,
            task.priority,
            task.project_id,
            task.tags,
            task.row_version,
          ]),
        ).toEqual([["Updated", null, "P1", null, [], 2]]);
        const conflict = yield* importTasks(
          store,
          request,
          input([{ external_id: "a", title: "Stale", from_version: 1 }]),
        );
        expect(conflict.items.map((row) => [row.outcome, row.error])).toEqual([
          [
            "rejected",
            {
              code: "occ_conflict",
              message:
                "Task changed since preview. Preview again and apply the current Version.",
              details: { current_version: 2 },
            },
          ],
        ]);
        expect((yield* store.tasks())[0]?.title).toBe("Updated");
        expect(
          (yield* importTasks(
            store,
            request,
            input([
              { external_id: "b" },
              { external_id: "c", title: "Valid" },
              { external_id: "d", title: "   " },
              { external_id: "e", title: "Typo", typo: true },
            ]),
          )).totals,
        ).toEqual({ created: 1, updated: 0, unchanged: 0, rejected: 3 });
        expect(
          (yield* store.history()).filter((op) => op.reason === "conflict")
            .length,
        ).toBe(1);
      }),
    ),
);

it.effect(
  "close-missing only cancels externally identified Tasks and refuses incomplete files",
  () =>
    usingImport((store, request) =>
      Effect.gen(function* () {
        const commands = new TaskCommands(store);
        yield* commands.create(request, { title: "Manual" });
        yield* importTasks(
          store,
          request,
          input([
            { external_id: "a", title: "Keep" },
            { external_id: "b", title: "Cancel" },
          ]),
        );
        const preview = yield* importTasks(
          store,
          request,
          input([{ external_id: "a" }], { dry_run: true, close_missing: true }),
        );
        expect(preview.totals).toEqual({
          created: 0,
          updated: 1,
          unchanged: 1,
          rejected: 0,
        });
        expect(
          (yield* store.tasks()).filter((task) => task.status === "cancelled"),
        ).toEqual([]);
        yield* importTasks(
          store,
          request,
          input([{ external_id: "a" }, { title: "Missing identity" }], {
            close_missing: true,
          }),
        );
        expect(
          (yield* store.tasks()).filter((task) => task.status === "cancelled"),
        ).toEqual([]);
        yield* importTasks(
          store,
          request,
          input([{ external_id: "a" }], { close_missing: true }),
        );
        expect(
          (yield* store.tasks())
            .map((task) => [task.title, task.status, task.deleted_at])
            .sort(),
        ).toEqual([
          ["Cancel", "cancelled", null],
          ["Keep", "open", null],
          ["Manual", "open", null],
        ]);
        const rejected = yield* importTasks(
          store,
          request,
          input([
            { external_id: "a", title: "First" },
            { external_id: "a", title: "Second" },
          ]),
        );
        expect(rejected.totals).toEqual({
          created: 0,
          updated: 0,
          unchanged: 0,
          rejected: 2,
        });
      }),
    ),
);

it("migration 0005 adds the index transactionally, preserves rows and History, and can run twice from 4", () => {
  for (const version of [4]) {
    const db = new Database(":memory:");
    db.function("domain_write_allowed", () => 1);
    db.exec(
      readFileSync(
        new URL("fixtures/v2-recurrence.sql", import.meta.url),
        "utf8",
      ),
    );
    migrate(db);
    db.exec(
      "DROP INDEX tasks_profile_external_id; ALTER TABLE tasks DROP COLUMN external_id;",
    );
    db.exec(`PRAGMA user_version=${version}`);
    const before = db.query("SELECT * FROM op_log").all();
    const tasksBefore = db
      .query("SELECT id,payload FROM tasks ORDER BY id")
      .all();
    db.transaction(() => migrateExternalId(db))();
    db.transaction(() => migrateExternalId(db))();
    expect(db.query("PRAGMA user_version").get()).toEqual({ user_version: 5 });
    expect(db.query("SELECT * FROM op_log").all()).toEqual(before);
    expect(db.query("SELECT id,payload FROM tasks ORDER BY id").all()).toEqual(
      tasksBefore,
    );
    expect(
      db
        .query(
          "SELECT name FROM sqlite_master WHERE type='index' AND name='tasks_profile_external_id'",
        )
        .all(),
    ).toEqual([{ name: "tasks_profile_external_id" }]);
    db.close();
  }
});

it.effect(
  "an external id belongs to the first Occurrence and does not repeat on successors",
  () =>
    usingImport((store, request) =>
      Effect.gen(function* () {
        const commands = new TaskCommands(store);
        const created = yield* commands.create(
          request,
          { title: "First Occurrence", external_id: "repository:series" },
          {
            recurrence: Schema.decodeUnknownSync(Recurrence)({
              dtstart: { kind: "date", date: "2026-10-29" },
              rrule: "FREQ=DAILY;COUNT=2",
              exdate: [],
            }),
          },
        );
        expect(created.outcome).toBe("committed");
        if (created.outcome !== "committed")
          throw new Error("Expected first Occurrence");
        expect(created.task.external_id).toBe("repository:series");
        yield* commands.transition(
          { ...request, task_id: created.task.id },
          { from_version: created.task.row_version, action: "complete" },
        );
        expect(
          (yield* store.tasks()).filter(
            (task) => task.external_id === "repository:series",
          ).length,
        ).toBe(1);
        expect(
          (yield* store.tasks())
            .filter((task) => task.status === "open")
            .map((task) => task.external_id ?? null),
        ).toEqual([null]);
      }),
    ),
);

it.effect(
  "creates a named owner Snapshot before Apply, creates none for preview, and aborts if Snapshot creation fails",
  () =>
    usingImport((store, request) =>
      Effect.gen(function* () {
        const items = input(
          [{ external_id: "safety:a", title: "Preserved before import" }],
          { file_name: "repository-sync.json" },
        );
        expect((yield* store.snapshots.list()).snapshots).toEqual([]);
        yield* importTasks(store, request, { ...items, dry_run: true });
        expect((yield* store.snapshots.list()).snapshots).toEqual([]);
        yield* importTasks(store, request, items);
        expect(
          (yield* store.snapshots.list()).snapshots.map((snapshot) => [
            snapshot.reason,
            snapshot.schema_version,
            snapshot.task_counts.map((profile) => profile.count),
          ]),
        ).toEqual([["before import repository-sync.json", 6, [0]]]);
        const directory = store.snapshots.directory;
        rmSync(directory, { recursive: true, force: true });
        writeFileSync(directory, "Not a directory");
        const readState = () =>
          Effect.all([
            store.tasks(),
            store.projects(),
            store.tags(),
            store.history(),
          ]);
        const before = yield* readState();
        expect(
          (yield* Effect.exit(
            importTasks(
              store,
              request,
              input([
                {
                  external_id: "safety:b",
                  title: "Must not be created",
                  project_name: "Must not exist",
                  tag_names: ["Must not exist"],
                },
              ]),
            ),
          ))._tag,
        ).toBe("Failure");
        expect(yield* readState()).toEqual(before);
      }),
    ),
);

it.effect(
  "opening one schema version behind creates exactly one pre-migration Snapshot",
  () =>
    Effect.scoped(
      Effect.gen(function* () {
        const directory = yield* Effect.acquireRelease(
          Effect.sync(() =>
            mkdtempSync(join(tmpdir(), "todo-import-migrate-")),
          ),
          (path) =>
            Effect.sync(() => rmSync(path, { recursive: true, force: true })),
        );
        const path = join(directory, "scratch.db");
        const original = yield* openStore({ path });
        yield* original.putProfile(work);
        yield* original.close();
        const db = new Database(path);
        db.exec("PRAGMA user_version=4");
        db.close();
        const migrated = yield* openStore({ path });
        expect((yield* migrated.settings()).user_version).toBe(6);
        expect(
          (yield* migrated.snapshots.list()).snapshots.map((snapshot) => [
            snapshot.reason,
            snapshot.schema_version,
          ]),
        ).toEqual([["pre-migration", 4]]);
        yield* migrated.close();
        const reopened = yield* Effect.acquireRelease(
          openStore({ path }),
          (store) => Effect.orDie(store.close()),
        );
        expect(
          (yield* reopened.snapshots.list()).snapshots.map(
            (snapshot) => snapshot.reason,
          ),
        ).toEqual(["pre-migration"]);
      }),
    ),
);

it.effect(
  "explicit null clears Tag ids while a foreign Project rejection preserves the title",
  () =>
    usingImport((store, request) =>
      Effect.gen(function* () {
        yield* importTasks(
          store,
          request,
          input([
            {
              external_id: "nullable:a",
              title: "Keep title",
              tag_names: ["proof"],
            },
          ]),
        );
        const cleared = yield* importTasks(
          store,
          request,
          input([{ external_id: "nullable:a", tags: null }]),
        );
        expect(
          cleared.items.map((row) => [row.outcome, row.changed_fields]),
        ).toEqual([["updated", ["tags"]]]);
        expect((yield* store.tasks())[0]?.tags).toEqual([]);
        const invalid = yield* importTasks(
          store,
          request,
          input([
            {
              external_id: "nullable:a",
              title: "Must roll back",
              project_id: "missing-project",
            },
          ]),
        );
        expect(invalid.totals).toEqual({
          created: 0,
          updated: 0,
          unchanged: 0,
          rejected: 1,
        });
        expect(
          (yield* store.tasks()).map((task) => [task.title, task.row_version]),
        ).toEqual([["Keep title", 2]]);
      }),
    ),
);

it.effect(
  "external ids are unique within a Profile and importing another Profile preserves every existing Task",
  () =>
    usingImport((store, request) =>
      Effect.gen(function* () {
        yield* importTasks(
          store,
          request,
          input([{ external_id: "shared:key", title: "Work Task" }]),
        );
        const original = yield* store.tasks();
        const other = Schema.decodeUnknownSync(Profile)({
          ...work,
          id: "personal",
          name: "Personal",
        });
        yield* store.putProfile(other);
        const personal = { ...request, profile: other.id };
        const report = yield* importTasks(
          store,
          personal,
          input([{ external_id: "shared:key", title: "Personal Task" }]),
        );
        expect(report.totals).toEqual({
          created: 1,
          updated: 0,
          unchanged: 0,
          rejected: 0,
        });
        yield* importTasks(store, personal, input([], { close_missing: true }));
        expect(
          (yield* store.tasks()).filter(
            (task) => task.profile_id === request.profile,
          ),
        ).toEqual(original);
        expect(
          (yield* store.tasks())
            .filter((task) => task.profile_id === other.id)
            .map((task) => [task.title, task.status, task.external_id]),
        ).toEqual([["Personal Task", "cancelled", "shared:key"]]);
      }),
    ),
);

it("a failed unique-index migration rolls back the column, schema version and every existing row", () => {
  const db = new Database(":memory:");
  try {
    db.function("domain_write_allowed", () => 1);
    db.exec(
      readFileSync(
        new URL("fixtures/v2-recurrence.sql", import.meta.url),
        "utf8",
      ),
    );
    migrate(db);
    db.exec(
      "DROP INDEX tasks_profile_external_id; ALTER TABLE tasks DROP COLUMN external_id; PRAGMA user_version=3",
    );
    db.exec(
      "UPDATE tasks SET payload=json_set(payload,'$.external_id','duplicate') WHERE id='legacy-1'",
    );
    db.exec(
      "INSERT INTO tasks(id,payload) SELECT 'legacy-copy',json_set(payload,'$.id','legacy-copy') FROM tasks WHERE id='legacy-1'",
    );
    const before = db.query("SELECT id,payload FROM tasks ORDER BY id").all();
    const history = db.query("SELECT * FROM op_log ORDER BY seq").all();
    expect(() => db.transaction(() => migrateExternalId(db))()).toThrow(
      "UNIQUE constraint failed",
    );
    expect(db.query("PRAGMA user_version").get()).toEqual({ user_version: 3 });
    expect(
      db
        .query<{ name: string }, []>("PRAGMA table_xinfo(tasks)")
        .all()
        .map((column) => column.name)
        .includes("external_id"),
    ).toBe(false);
    expect(db.query("SELECT id,payload FROM tasks ORDER BY id").all()).toEqual(
      before,
    );
    expect(db.query("SELECT * FROM op_log ORDER BY seq").all()).toEqual(
      history,
    );
  } finally {
    db.close();
  }
});

it.effect(
  "a preview rejects a different Task with the same external id and Version",
  () =>
    usingImport((store, request) =>
      Effect.gen(function* () {
        yield* importTasks(
          store,
          request,
          input([{ external_id: "identity:a", title: "Keep accepted title" }]),
        );
        const result = yield* importTasks(
          store,
          request,
          input([
            {
              external_id: "identity:a",
              title: "Wrong Task",
              task_id: "old-task-id",
              from_version: 1,
            },
          ]),
        );
        expect(
          result.items.map((row) => [
            row.outcome,
            row.error?.code,
            row.error?.details?.current_version,
          ]),
        ).toEqual([["rejected", "occ_conflict", 1]]);
        expect(
          (yield* store.tasks()).map((task) => [task.title, task.row_version]),
        ).toEqual([["Keep accepted title", 1]]);
      }),
    ),
);

it.effect(
  "Purge erases rejected imports that matched a deleted external id",
  () =>
    usingImport((store, request) =>
      Effect.gen(function* () {
        const secret = "C11 private rejected import";
        const report = yield* importTasks(
          store,
          request,
          input([{ external_id: "private:one", title: secret }]),
        );
        const id = report.items[0]?.task_id;
        if (!id) throw new Error("Missing imported Task");
        const commands = new TaskCommands(store);
        yield* commands.delete(
          { ...request, task_id: id },
          { from_version: Schema.decodeUnknownSync(Version)(1) },
        );
        yield* importTasks(
          store,
          request,
          input([{ external_id: "private:one", title: secret }]),
        );
        yield* commands.purge(
          { ...request, task_id: id },
          { from_version: Schema.decodeUnknownSync(Version)(2) },
        );
        expect(JSON.stringify(yield* store.history()).includes(secret)).toBe(
          false,
        );
        for (const snapshot of (yield* store.snapshots.list()).snapshots)
          expect(
            readFileSync(snapshot.path).includes(Buffer.from(secret)),
          ).toBe(false);
      }),
    ),
);
it.effect(
  "combined Tag ids and names import unchanged on the second pass",
  () =>
    usingImport((store, request) =>
      Effect.gen(function* () {
        yield* new TaskCommands(store).create(request, {
          title: "Tag seed",
          tag_names: ["id-tag"],
        });
        const tag = (yield* store.tags())[0];
        if (!tag) throw new Error("Missing Tag");
        const value = input([
          {
            external_id: "union:one",
            title: "Tag union",
            tags: [tag.id],
            tag_names: ["named-tag"],
          },
        ]);
        yield* importTasks(store, request, value);
        const repeat = yield* importTasks(store, request, value);
        expect(repeat.totals).toEqual({
          created: 0,
          updated: 0,
          unchanged: 1,
          rejected: 0,
        });
        expect(
          (yield* store.tasks()).find(
            (task) => task.external_id === "union:one",
          )?.row_version,
        ).toBe(1);
      }),
    ),
);
it.effect("Conflict History records the supplied expected Version", () =>
  usingImport((store, request) =>
    Effect.gen(function* () {
      yield* importTasks(
        store,
        request,
        input([{ external_id: "history:one", title: "One" }]),
      );
      yield* importTasks(
        store,
        request,
        input([{ external_id: "history:one", title: "Two" }]),
      );
      yield* importTasks(
        store,
        request,
        input([
          { external_id: "history:one", title: "Stale", from_version: 1 },
        ]),
      );
      expect(
        (yield* store.history())
          .filter((entry) => entry.reason === "conflict")
          .map((entry) => entry.from_version),
      ).toEqual([1]);
    }),
  ),
);
it.effect(
  "previewed missing cancellations retain Versions and stop when a file Task is rejected",
  () =>
    usingImport((store, request) =>
      Effect.gen(function* () {
        const seeded = yield* importTasks(
          store,
          request,
          input([
            { external_id: "gate:a", title: "A" },
            { external_id: "gate:b", title: "B" },
          ]),
        );
        const b = seeded.items[1]?.task_id;
        if (!b) throw new Error("Missing B");
        yield* importTasks(
          store,
          request,
          input([{ external_id: "gate:b", title: "B current" }]),
        );
        const candidates = [
          { external_id: "gate:b", task_id: b, from_version: 1 },
        ];
        const rejected = yield* importTasks(
          store,
          request,
          input([{ external_id: "gate:a", title: "A", from_version: 9 }], {
            close_missing: true,
            close_missing_candidates: candidates,
          }),
        );
        expect(rejected.totals.rejected).toBe(1);
        expect(
          (yield* store.tasks()).find((task) => task.id === b)?.status,
        ).toBe("open");
        const stale = yield* importTasks(
          store,
          request,
          input([{ external_id: "gate:a", title: "A" }], {
            close_missing: true,
            close_missing_candidates: candidates,
          }),
        );
        expect(
          stale.items.map((row) => [row.external_id, row.outcome]),
        ).toEqual([
          ["gate:a", "unchanged"],
          ["gate:b", "rejected"],
        ]);
        expect(
          (yield* store.tasks()).find((task) => task.id === b)?.status,
        ).toBe("open");
      }),
    ),
);

it.effect(
  "Project id takes precedence over a name and repeated imports remain unchanged",
  () =>
    usingImport((store, request) =>
      Effect.gen(function* () {
        const commands = new TaskCommands(store);
        yield* commands.create(
          request,
          Schema.decodeUnknownSync(CreateTask)({
            title: "Project seed",
            project_name: "Chosen",
          }),
        );
        const project = (yield* store.projects())[0];
        if (!project) throw new Error("Missing fixture Project");
        const item = {
          external_id: "project:both",
          title: "Combined Project",
          project_id: project.id,
          project_name: "Ignored",
        };
        yield* importTasks(store, request, { items: [item] });
        expect(
          (yield* importTasks(store, request, { items: [item] })).totals,
        ).toEqual({ created: 0, updated: 0, unchanged: 1, rejected: 0 });
        expect(
          (yield* store.tasks())
            .filter((t) => t.external_id === "project:both")
            .map((t) => [t.project_id, t.row_version]),
        ).toEqual([[project.id, 1]]);
        const cleared = { ...item, project_id: null };
        yield* importTasks(store, request, { items: [cleared] });
        expect(
          (yield* importTasks(store, request, { items: [cleared] })).totals,
        ).toEqual({ created: 0, updated: 0, unchanged: 1, rejected: 0 });
        expect(
          (yield* store.tasks())
            .filter((t) => t.external_id === "project:both")
            .map((t) => [t.project_id, t.row_version]),
        ).toEqual([[null, 2]]);
      }),
    ),
);

it.effect(
  "import wakes a legacy snoozed Task through the shared reopen command",
  () =>
    usingImport(
      (store, request) =>
        Effect.gen(function* () {
          const before = (yield* store.tasks()).filter(
            (task) => task.profile_id !== profile,
          );
          const commands = new TaskCommands(store);
          const legacy = (yield* store.tasks()).find(
            (task) => task.id === "legacy-1",
          );
          if (!legacy) throw new Error("Missing migrated fixture Task");
          yield* commands.edit(
            { ...request, task_id: legacy.id },
            {
              from_version: legacy.row_version,
              changes: { external_id: "legacy:snoozed" },
            },
          );
          const items = [{ external_id: "legacy:snoozed", status: "open" }];
          const preview = yield* importTasks(
            store,
            request,
            input(items, { dry_run: true }),
          );
          expect(preview.totals).toEqual({
            created: 0,
            updated: 1,
            unchanged: 0,
            rejected: 0,
          });
          expect(
            (yield* store.tasks())
              .filter((task) => task.id === legacy.id)
              .map((task) => [task.status, task.row_version]),
          ).toEqual([["snoozed", 8]]);
          expect(
            (yield* importTasks(store, request, input(items))).totals,
          ).toEqual({ created: 0, updated: 1, unchanged: 0, rejected: 0 });
          expect(
            (yield* store.tasks())
              .filter((task) => task.id === legacy.id)
              .map((task) => [task.status, task.row_version]),
          ).toEqual([["open", 9]]);
          expect(
            (yield* store.tasks()).filter(
              (task) => task.profile_id !== profile,
            ),
          ).toEqual(before);
          expect(yield* store.rebuild()).toEqual(yield* store.tasks());
        }),
      (path) => {
        seedLegacy(path);
        const database = new Database(path);
        try {
          database.exec(
            "UPDATE tasks SET status='snoozed',recurrence=NULL,scheduled_at='2027-01-01T00:00:00Z' WHERE id='legacy-1'",
          );
        } finally {
          database.close();
        }
      },
    ),
);

it.effect(
  "validation and duplicate import rejections record the supplied expected Version",
  () =>
    usingImport((store, request) =>
      Effect.gen(function* () {
        yield* importTasks(
          store,
          request,
          input([{ external_id: "invalid:version", title: "First" }]),
        );
        yield* importTasks(
          store,
          request,
          input([{ external_id: "invalid:version", title: "Second" }]),
        );
        yield* importTasks(
          store,
          request,
          input([
            { external_id: "invalid:version", title: "", from_version: 1 },
          ]),
        );
        yield* importTasks(
          store,
          request,
          input([
            {
              external_id: "invalid:version",
              title: "Duplicate A",
              from_version: 1,
            },
            {
              external_id: "invalid:version",
              title: "Duplicate B",
              from_version: 1,
            },
          ]),
        );
        expect(
          (yield* store.history())
            .filter((entry) => entry.outcome === "rejected")
            .map((entry) => entry.from_version),
        ).toEqual([1, 1, 1]);
        expect(
          (yield* store.tasks()).map((task) => [task.title, task.row_version]),
        ).toEqual([["Second", 2]]);
      }),
    ),
);

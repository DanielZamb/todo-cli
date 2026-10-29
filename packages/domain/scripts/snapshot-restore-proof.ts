import { Database } from "bun:sqlite";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { Effect, Schema } from "effect";
import { AttachmentCommands } from "../src/attachment-commands.ts";
import { attachmentExists } from "../src/attachment-store.ts";
import { TaskCommands } from "../src/commands.ts";
import { Profile } from "../src/entities.ts";
import { Version } from "../src/ids.ts";
import { SnapshotError, type SnapshotManifest } from "../src/snapshots.ts";
import { currentSchemaVersion } from "../src/store/migration.ts";
import { openStore } from "../src/store/store.ts";
import {
  actor,
  created,
  profile,
  task,
  time,
  work,
} from "../test/store-fixtures.ts";

export const proveRestoredPurge = (
  directory: string,
  mode: "privacy" | "manifest",
) =>
  Effect.gen(function* () {
    const proofDirectory = join(directory, mode);
    yield* Effect.sync(() => mkdirSync(proofDirectory, { recursive: true }));
    return yield* Effect.acquireUseRelease(
      openStore({ path: join(proofDirectory, "scratch.db") }),
      (store) =>
        Effect.gen(function* () {
          yield* store.putProfile(work);
          const empty = yield* store.snapshots.create("pre-empty-regression");
          yield* store.append({ actor, profile, event: created });
          const saved = yield* store.snapshots.create(
            "pre-with-task-regression",
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
              task_id: task.id,
              before: deleted,
            },
          });
          const restored = yield* store.snapshots.restore(saved.id);
          if (mode === "manifest") {
            assert.ok(restored.safety_snapshot);
            const shown = yield* store.snapshots.show(
              restored.safety_snapshot.id,
            );
            assert.equal(restored.safety_snapshot.sha256, shown.sha256);
            assert.equal(
              shown.sha256,
              createHash("sha256")
                .update(readFileSync(shown.path))
                .digest("hex"),
            );
            return { status: "PASS", safety_checksum_matches: true };
          }
          const rejected = yield* store.append({
            actor,
            profile,
            event: created,
          });
          assert.equal(rejected.outcome, "rejected");
          assert.equal(
            JSON.stringify(yield* store.history()).includes("Write the store"),
            false,
          );
          assert.equal(rejected.reason, "task_purged");
          const after = yield* store.snapshots.create(
            "pre-rejected-replay-regression",
          );
          assert.equal(
            readFileSync(after.path).includes(Buffer.from("Write the store")),
            false,
          );
          yield* store.snapshots.restore(empty.id);
          const replayed = yield* store.append({
            actor,
            profile,
            event: created,
          });
          assert.equal(replayed.outcome, "rejected");
          assert.equal(replayed.reason, "task_purged");
          assert.deepEqual(yield* store.tasks(), []);
          const another = yield* openStore({
            path: join(proofDirectory, "scratch.db"),
          });
          try {
            assert.equal(
              (yield* another.append({ actor, profile, event: created }))
                .reason,
              "task_purged",
            );
            assert.equal(
              JSON.stringify(yield* another.history()).includes(
                "Write the store",
              ),
              false,
            );
          } finally {
            yield* another.close();
          }
          return {
            status: "PASS",
            purged_id_rejected: true,
            rejected_history_redacted: true,
          };
        }),
      (store) => Effect.orDie(store.close()),
    );
  });

export const proveSnapshotSchema = (directory: string) =>
  Effect.gen(function* () {
    const schemaDirectory = join(directory, "schema");
    yield* Effect.sync(() => mkdirSync(schemaDirectory, { recursive: true }));
    const path = join(schemaDirectory, "schema.db");
    return yield* Effect.acquireUseRelease(
      openStore({ path }),
      (store) =>
        Effect.gen(function* () {
          yield* store.putProfile(work);
          for (const id of ["personal", "archive"])
            yield* store.putProfile(
              Schema.decodeUnknownSync(Profile)({ ...work, id, name: id }),
            );
          yield* store.append({ actor, profile, event: created });
          yield* store.auth.setupOwner("scratch Snapshot schema passphrase");
          const session = yield* store.auth.signIn(
            "scratch Snapshot schema passphrase",
          );
          const empty = yield* store.snapshots.create("pre-no-tombstones");
          yield* store.auth.deleteProfile({
            ...session,
            profile: Schema.decodeUnknownSync(Profile.fields.id)("archive"),
            options: { with_tasks: false, dry_run: false },
          });
          const saved = yield* store.snapshots.create("pre-one-tombstone");
          const tombstones = (file: string) => {
            const db = new Database(file, { readonly: true });
            try {
              return db
                .query(
                  "SELECT profile,deleted_at FROM profile_deletions ORDER BY profile",
                )
                .all();
            } finally {
              db.close();
            }
          };
          const expected = tombstones(saved.path);
          assert.equal(expected.length, 1);
          yield* store.auth.deleteProfile({
            ...session,
            profile: Schema.decodeUnknownSync(Profile.fields.id)("personal"),
            options: { with_tasks: false, dry_run: false },
          });
          assert.equal(tombstones(path).length, 2);
          yield* store.snapshots.restore(saved.id);
          assert.deepEqual(tombstones(path), expected);
          yield* store.snapshots.restore(empty.id);
          assert.deepEqual(tombstones(path), []);
          const rewrite = (manifest: SnapshotManifest, version: number) => {
            const db = new Database(manifest.path);
            try {
              if (version < 6) db.exec("DROP TABLE attachment_cleanup;");
              if (version < 5)
                db.exec(
                  "DROP INDEX tasks_profile_external_id; ALTER TABLE tasks DROP COLUMN external_id;",
                );
              if (version === 3)
                db.exec(
                  "DROP TRIGGER profiles_reserved_insert; DROP TRIGGER profiles_reserved_update; DROP TABLE profile_deletions;",
                );
              db.exec(`PRAGMA user_version=${version}; VACUUM;`);
            } finally {
              db.close();
            }
            const bytes = readFileSync(manifest.path);
            writeFileSync(
              join(schemaDirectory, "snapshots", `${manifest.id}.json`),
              JSON.stringify({
                ...manifest,
                schema_version: version,
                size: bytes.length,
                sha256: createHash("sha256").update(bytes).digest("hex"),
              }),
            );
          };
          for (const version of [3, 4, 5]) {
            if (version === 4)
              yield* store.auth.deleteProfile({
                ...session,
                profile: Schema.decodeUnknownSync(Profile.fields.id)("archive"),
                options: { with_tasks: false, dry_run: false },
              });
            const legacy = yield* store.snapshots.create(
              `pre-schema-${version}`,
            );
            const expectedTombstones = tombstones(legacy.path);
            rewrite(legacy, version);
            const columns = (file: string) => {
              const db = new Database(file, { readonly: true });
              try {
                return db
                  .query("PRAGMA table_xinfo(tasks)")
                  .all()
                  .map(
                    (row) =>
                      Schema.decodeUnknownSync(
                        Schema.Struct({ name: Schema.String }),
                      )(row).name,
                  );
              } finally {
                db.close();
              }
            };
            assert.equal(
              columns(legacy.path).includes("external_id"),
              version >= 5,
            );
            const old = new Database(legacy.path, { readonly: true });
            try {
              assert.equal(
                old
                  .query(
                    "SELECT name FROM sqlite_master WHERE name='attachment_cleanup'",
                  )
                  .get(),
                null,
              );
            } finally {
              old.close();
            }
            yield* store.snapshots.restore(legacy.id);
            assert.equal(
              (yield* store.settings()).user_version,
              currentSchemaVersion,
            );
            assert.equal(columns(path).includes("external_id"), true);
            const migrated = new Database(path, { readonly: true });
            try {
              assert.deepEqual(
                migrated
                  .query(
                    "SELECT name FROM sqlite_master WHERE name='attachment_cleanup'",
                  )
                  .all(),
                [{ name: "attachment_cleanup" }],
              );
              assert.deepEqual(
                migrated
                  .query(
                    "SELECT name FROM sqlite_master WHERE type='index' AND name='tasks_profile_external_id'",
                  )
                  .all(),
                [{ name: "tasks_profile_external_id" }],
              );
            } finally {
              migrated.close();
            }
            assert.deepEqual(
              tombstones(path),
              version === 3 ? [] : expectedTombstones,
            );
            assert.deepEqual(
              (yield* store.tasks()).map((task) => task.title),
              ["Write the store"],
            );
          }
          const newerVersion = currentSchemaVersion + 1;
          const newer = yield* store.snapshots.create(
            `pre-schema-${newerVersion}`,
          );
          rewrite(newer, newerVersion);
          const failed = yield* store.snapshots
            .restore(newer.id)
            .pipe(Effect.catch((error) => Effect.succeed(error.cause)));
          assert.ok(failed instanceof SnapshotError);
          assert.equal(failed.code, "newer_schema");
          assert.equal(
            (yield* store.settings()).user_version,
            currentSchemaVersion,
          );
          return {
            status: "PASS",
            migrated_from: [3, 4, 5],
            migrated_to: currentSchemaVersion,
            newer_schema_refused: newerVersion,
            tombstones_restored_exactly: true,
          };
        }),
      (store) => Effect.orDie(store.close()),
    );
  });

export const proveSnapshotAttachments = (directory: string) =>
  Effect.gen(function* () {
    const owned = join(directory, "attachment-snapshots");
    yield* Effect.sync(() => mkdirSync(owned, { recursive: true }));
    return yield* Effect.acquireUseRelease(
      openStore({
        path: join(owned, "scratch.db"),
        attachmentRoot: join(owned, "attachments"),
      }),
      (store) =>
        Effect.gen(function* () {
          yield* store.putProfile(work);
          yield* store.append({ actor, profile, event: created });
          yield* store.auth.setupOwner(
            "scratch attachment Snapshot passphrase",
          );
          const session = yield* store.auth.signIn(
            "scratch attachment Snapshot passphrase",
          );
          const request = {
            credential: session.credential,
            profile,
            task_id: task.id,
          };
          const beforeAttachment =
            yield* store.snapshots.create("before attachment");
          const bytes =
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7QAAAABJRU5ErkJggg==";
          const uploaded = yield* new AttachmentCommands(store).upload(
            request,
            {
              from_version: task.row_version,
              mime_type: "image/png",
              data: bytes,
              label: "private attachment label",
            },
          );
          assert.equal(uploaded.outcome, "committed");
          if (uploaded.outcome !== "committed")
            throw new Error("Image upload failed");
          const image = uploaded.task.attachments?.[0];
          if (image?.kind !== "image") throw new Error("Managed image missing");
          const withAttachment =
            yield* store.snapshots.create("with attachment");
          yield* store.snapshots.restore(beforeAttachment.id);
          assert.deepEqual((yield* store.tasks())[0]?.attachments ?? [], []);
          assert.equal(existsSync(image.path), true);
          yield* store.snapshots.restore(withAttachment.id);
          assert.equal(attachmentExists(image), true);
          yield* Effect.sync(() => unlinkSync(image.path));
          yield* store.snapshots.restore(withAttachment.id);
          const missing = (yield* store.tasks())[0]?.attachments?.[0];
          assert.ok(missing);
          assert.equal(attachmentExists(missing), false);
          assert.equal(existsSync(image.path), false);
          yield* Effect.sync(() =>
            writeFileSync(image.path, Buffer.from(bytes, "base64")),
          );
          const commands = new TaskCommands(store);
          const deleted = yield* commands.delete(request, {
            from_version: Schema.decodeUnknownSync(Version)(2),
          });
          assert.equal(deleted.outcome, "committed");
          assert.equal(existsSync(image.path), true);
          const purged = yield* commands.purge(request, {
            from_version: Schema.decodeUnknownSync(Version)(3),
          });
          assert.equal(purged.outcome, "committed");
          assert.equal(existsSync(image.path), false);
          for (const snapshot of (yield* store.snapshots.list()).snapshots) {
            const content = readFileSync(snapshot.path);
            assert.equal(content.includes(Buffer.from(image.path)), false);
            assert.equal(
              content.includes(Buffer.from("private attachment label")),
              false,
            );
          }
          assert.equal(
            JSON.stringify(yield* store.history()).includes(image.path),
            false,
          );
          yield* store.snapshots.restore(withAttachment.id);
          assert.deepEqual(yield* store.tasks(), []);
          assert.equal(existsSync(image.path), false);
          return {
            status: "PASS",
            before_attachment_count: 0,
            restored_missing_file: true,
            purge_snapshot_paths_redacted: true,
            purge_erased_bytes: true,
            restored_purged_tasks: 0,
          };
        }),
      (store) => Effect.orDie(store.close()),
    );
  });

if (import.meta.main) {
  const [directory, evidence, mode] = process.argv.slice(2);
  if (
    !directory?.includes("todo-f13-verify-") ||
    !evidence ||
    (mode !== "privacy" &&
      mode !== "manifest" &&
      mode !== "schema" &&
      mode !== "attachments")
  )
    throw new Error(
      "Scratch, evidence and privacy|manifest|schema|attachments required",
    );
  const result =
    mode === "attachments"
      ? await Effect.runPromise(proveSnapshotAttachments(directory))
      : mode === "schema"
        ? await Effect.runPromise(proveSnapshotSchema(directory))
        : await Effect.runPromise(proveRestoredPurge(directory, mode));
  writeFileSync(join(evidence, `${mode}.json`), JSON.stringify(result));
}

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "@effect/vitest";
import { Effect, Schema } from "effect";
import { AttachmentCommands } from "../src/attachment-commands.ts";
import { UploadAttachment } from "../src/attachments.ts";
import { TaskCommands } from "../src/commands.ts";
import { Profile } from "../src/entities.ts";
import { ProfileId } from "../src/ids.ts";
import { diagnosticProfileName } from "../src/presentation.ts";
import { openStore } from "../src/store/store.ts";
import { CreateTask, EditTask } from "../src/task-commands.ts";

describe("bounded diagnostics", () => {
  it.live(
    "keeps 2048 request samples and 100 errors with literal nearest-rank percentiles",
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const directory = yield* Effect.acquireRelease(
            Effect.sync(() => mkdtempSync(join(tmpdir(), "todo-diagnostics-"))),
            (path) =>
              Effect.sync(() => rmSync(path, { recursive: true, force: true })),
          );
          const store = yield* Effect.acquireRelease(
            openStore({
              path: join(directory, "scratch.db"),
              attachmentRoot: join(directory, "attachments"),
            }),
            (store) => Effect.orDie(store.close()),
          );
          yield* store.auth.setupOwner("test diagnostics");
          const session = yield* store.auth.signIn("test diagnostics");
          for (let duration = 1; duration <= 2200; duration++)
            store.diagnostics.request("GET /health", duration, 409);
          const snapshot = yield* store.diagnostics.read({
            credential: session.credential,
          });
          expect(snapshot.latency.routes).toEqual([
            {
              route: "GET /health",
              count: 2048,
              p50_ms: 1176,
              p95_ms: 2098,
              p99_ms: 2180,
            },
          ]);
          expect(snapshot.latency.samples).toEqual(
            Array.from({ length: 60 }, (_, i) => 2141 + i),
          );
          expect(snapshot.errors.length).toBe(100);
          expect(snapshot.errors[0]?.code).toBe("conflict");
          expect(snapshot.storage.last_snapshot).toBe(null);
          expect(
            snapshot.credentials.map((credential) => [
              credential.kind,
              credential.scope,
              credential.revoked_at,
            ]),
          ).toEqual([["session", "read-write", null]]);
          expect(snapshot.operations.total).toBe(2);
        }),
      ),
  );
});

for (const prime of [false, true])
  it.live(
    `resets generation-scoped diagnostics after restore with a prior read: ${prime}`,
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const directory = yield* Effect.acquireRelease(
            Effect.sync(() =>
              mkdtempSync(join(tmpdir(), "todo-diagnostics-restore-")),
            ),
            (path) =>
              Effect.sync(() => rmSync(path, { recursive: true, force: true })),
          );
          const store = yield* Effect.acquireRelease(
            openStore({
              path: join(directory, "scratch.db"),
              attachmentRoot: join(directory, "attachments"),
            }),
            (store) => Effect.orDie(store.close()),
          );
          yield* store.auth.setupOwner("restore diagnostics");
          const session = yield* store.auth.signIn("restore diagnostics");
          if (prime) {
            const before = yield* store.diagnostics.read({
              credential: session.credential,
            });
            expect(before.storage.restore_generation).toBe("initial");
          }
          const saved = yield* store.snapshots.create("diagnostics proof");
          store.diagnostics.sample();
          yield* store.auth.signIn("restore diagnostics");
          store.diagnostics.sample();
          const profile = Schema.decodeUnknownSync(ProfileId)("work");
          const client = store.diagnostics.connect(profile, "cli", "3");
          store.diagnostics.request("GET /health", 4, 200);
          if (prime) {
            const traffic = yield* store.diagnostics.read({
              credential: session.credential,
            });
            expect(traffic.operations.total).toBe(3);
            expect(traffic.operations.samples.length).toBe(1);
            expect(traffic.clients[0]?.last_event_id).toBe("3");
          }
          yield* store.snapshots.restore(saved.id);
          const restored = yield* store.diagnostics.read({
            credential: session.credential,
          });
          expect(restored.storage.restore_generation).not.toBe("initial");
          expect(restored.operations.total).toBe(3);
          expect(
            restored.operations.recent.map((operation) => operation.type),
          ).toEqual(["DatabaseRestored", "AuthChanged", "AuthChanged"]);
          expect(restored.operations.samples).toEqual([]);
          expect(restored.clients[0]?.last_event_id).toBe(null);
          expect(restored.latency.routes).toEqual([
            { route: "GET /health", count: 1, p50_ms: 4, p95_ms: 4, p99_ms: 4 },
          ]);
          expect(
            Object.keys(restored.storage.last_snapshot ?? {}).sort(),
          ).toEqual(["created_at", "id", "schema_version", "seq", "size"]);
          store.diagnostics.disconnect(client);
        }),
      ),
  );

it.live(
  "counts a changed reminder instant at submillisecond precision without firing it during a read",
  () =>
    Effect.scoped(
      Effect.gen(function* () {
        const directory = yield* Effect.acquireRelease(
          Effect.sync(() =>
            mkdtempSync(join(tmpdir(), "todo-diagnostics-precise-")),
          ),
          (path) =>
            Effect.sync(() => rmSync(path, { recursive: true, force: true })),
        );
        const store = yield* Effect.acquireRelease(
          openStore({
            path: join(directory, "scratch.db"),
            attachmentRoot: join(directory, "attachments"),
          }),
          (store) => Effect.orDie(store.close()),
        );
        yield* store.auth.setupOwner("precise diagnostics");
        const session = yield* store.auth.signIn("precise diagnostics");
        yield* store.putProfile(
          Schema.decodeUnknownSync(Profile)({
            id: "work",
            name: "Work",
            created_at: "2026-10-20T00:00:00Z",
            updated_at: "2026-10-20T00:00:00Z",
          }),
        );
        const commands = new TaskCommands(store);
        const request = {
          credential: session.credential,
          profile: Schema.decodeUnknownSync(ProfileId)("work"),
        };
        const created = yield* commands.create(
          request,
          Schema.decodeUnknownSync(CreateTask)({
            title: "Precise reminder",
            due_at: {
              kind: "instant",
              utc: "2026-10-20T12:00:00.123Z",
              time_zone: "UTC",
            },
          }),
        );
        expect(created.outcome).toBe("committed");
        if (created.outcome !== "committed")
          throw new Error("Task fixture failed");
        expect(yield* store.scheduled.runDue()).toEqual({
          woken: 0,
          reminders: 1,
        });
        const edited = yield* commands.edit(
          { ...request, task_id: created.task.id },
          Schema.decodeUnknownSync(EditTask)({
            from_version: 1,
            changes: {
              due_at: {
                kind: "instant",
                utc: "2026-10-20T12:00:00.1234Z",
                time_zone: "UTC",
              },
            },
          }),
        );
        expect(edited.outcome).toBe("committed");
        const before = yield* store.history();
        const snapshot = yield* store.diagnostics.read({
          credential: session.credential,
        });
        expect(snapshot.scheduler.pending_reminders).toBe(1);
        expect((yield* store.history()).length).toBe(before.length);
        expect(yield* store.scheduled.runDue()).toEqual({
          woken: 0,
          reminders: 1,
        });
        expect(
          (yield* store.diagnostics.read({ credential: session.credential }))
            .scheduler.pending_reminders,
        ).toBe(0);
      }),
    ),
);

it.live(
  "excludes deleted Profiles from discovery while retaining their display names and operation labels",
  () =>
    Effect.scoped(
      Effect.gen(function* () {
        const directory = yield* Effect.acquireRelease(
          Effect.sync(() =>
            mkdtempSync(join(tmpdir(), "todo-diagnostics-tombstone-")),
          ),
          (path) =>
            Effect.sync(() => rmSync(path, { recursive: true, force: true })),
        );
        const store = yield* Effect.acquireRelease(
          openStore({
            path: join(directory, "scratch.db"),
            attachmentRoot: join(directory, "attachments"),
          }),
          (store) => Effect.orDie(store.close()),
        );
        yield* store.auth.setupOwner("diagnostics Profiles");
        const session = yield* store.auth.signIn("diagnostics Profiles");
        for (const [id, name] of [
          ["work", "Work"],
          ["personal", "Personal"],
        ])
          yield* store.putProfile(
            Schema.decodeUnknownSync(Profile)({
              id,
              name,
              created_at: "2026-10-20T00:00:00Z",
              updated_at: "2026-10-20T00:00:00Z",
            }),
          );
        const created = yield* new TaskCommands(store).create(
          {
            credential: session.credential,
            profile: Schema.decodeUnknownSync(ProfileId)("work"),
          },
          Schema.decodeUnknownSync(CreateTask)({
            title: "Private deleted Profile Task",
            external_id: "private-external-id-fixture",
          }),
        );
        expect(created.outcome).toBe("committed");
        if (created.outcome !== "committed")
          throw new Error("Task fixture failed");
        const image = yield* new AttachmentCommands(store).upload(
          {
            credential: session.credential,
            profile: Schema.decodeUnknownSync(ProfileId)("work"),
            task_id: created.task.id,
          },
          Schema.decodeUnknownSync(UploadAttachment)({
            from_version: 1,
            mime_type: "image/png",
            data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7QAAAABJRU5ErkJggg==",
            label: "private-image-label",
          }),
        );
        expect(image.outcome).toBe("committed");
        const indexed = yield* store.diagnostics.read({
          credential: session.credential,
        });
        expect(indexed.storage).toMatchObject({
          external_id_tasks: 1,
          attachments: 1,
          attachment_store_bytes: 67,
        });
        expect(JSON.stringify(indexed)).not.toContain("private-image-label");
        expect(indexed.operations.recent[0]?.type).toBe("AttachmentAdded");
        expect(JSON.stringify(indexed)).not.toContain(
          "private-external-id-fixture",
        );
        const refused = yield* store.auth.deleteProfile({
          credential: session.credential,
          profile: Schema.decodeUnknownSync(ProfileId)("work"),
          options: { with_tasks: false, dry_run: false },
        });
        expect(refused.outcome).toBe("refused");
        expect(
          (yield* store.diagnostics.read({ credential: session.credential }))
            .operations.recent[0]?.type,
        ).toBe("ProfileDeletionRejected");
        yield* store.auth.deleteProfile({
          credential: session.credential,
          profile: Schema.decodeUnknownSync(ProfileId)("work"),
          options: { with_tasks: true, dry_run: false },
        });
        const snapshot = yield* store.diagnostics.read({
          credential: session.credential,
        });
        expect(snapshot.profiles.map((p) => p.name)).toEqual(["Personal"]);
        expect(snapshot.deleted_profiles).toEqual([
          { id: "work", name: "Work" },
        ]);
        expect(diagnosticProfileName(snapshot, "work")).toBe("Work (deleted)");
        expect(snapshot.storage.entities.map((p) => p.profile)).toEqual([
          "personal",
        ]);
        expect(
          snapshot.storage.tables.find((t) => t.name === "profile_deletions")
            ?.count,
        ).toBe(1);
        expect(snapshot.operations.recent[0]?.type).toBe("ProfileDeleted");
        expect(JSON.stringify(snapshot)).not.toContain(
          "Private deleted Profile Task",
        );
      }),
    ),
);

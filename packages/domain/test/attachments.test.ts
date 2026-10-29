import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { expect, it } from "@effect/vitest";
import { openStore } from "@todo/domain/store";
import { Effect, Schema } from "effect";
import {
  actor,
  created,
  later,
  profile,
  task,
  work,
} from "./store-fixtures.ts";

it.effect(
  "Attachment operations survive snapshot replay and support Revert",
  () =>
    Effect.scoped(
      Effect.gen(function* () {
        const directory = yield* Effect.acquireRelease(
          Effect.sync(() => mkdtempSync(join(tmpdir(), "todo-f11-test-"))),
          (path) =>
            Effect.sync(() => rmSync(path, { recursive: true, force: true })),
        );
        const store = yield* Effect.acquireRelease(
          openStore({ path: join(directory, "scratch.db") }),
          (store) => Effect.orDie(store.close()),
        );
        yield* store.putProfile(work);
        yield* store.append({ actor, profile, event: created });
        const attachment = {
          id: "attachment-1",
          kind: "file",
          path: "/tmp/draft.md",
          label: "jira",
          added_at: later,
        };
        const after = {
          ...task,
          row_version: 2,
          updated_at: later,
          attachments: [attachment],
        };
        const attached = yield* store.append({
          actor,
          profile,
          event: {
            kind: "AttachmentAdded",
            entity_version: 1,
            occurred_at: later,
            before: task,
            after,
          },
        });
        expect(attached.outcome).toBe("committed");
        expect((yield* store.tasks())[0]).toMatchObject({
          row_version: 2,
          attachments: [attachment],
        });
        yield* store.takeSnapshot();
        yield* store.rebuild();
        expect((yield* store.tasks())[0]).toMatchObject({
          attachments: [attachment],
        });
        const reverted = yield* store.revert({
          actor,
          profile,
          seq: attached.seq,
          occurred_at: later,
        });
        expect(reverted.outcome).toBe("committed");
        expect((yield* store.tasks())[0]?.attachments ?? []).toEqual([]);
      }),
    ),
);

it("Purge refuses symlinks outside the attachment root and keeps the target", () => {
  const scratch = mkdtempSync(join(tmpdir(), "todo-f11-symlink-"));
  try {
    const root = join(scratch, "attachments");
    const outside = join(scratch, "outside");
    mkdirSync(root);
    mkdirSync(outside);
    writeFileSync(join(outside, "keep.txt"), "keep this file");
    const directory = attachmentDirectory(root, "work", "task-1");
    mkdirSync(dirname(directory), { recursive: true });
    symlinkSync(outside, directory);
    expect(() => eraseTaskAttachments(root, "work", "task-1")).toThrow(
      "escapes",
    );
    expect(readFileSync(join(outside, "keep.txt"), "utf8")).toBe(
      "keep this file",
    );
    expect(lstatSync(directory).isSymbolicLink()).toBe(true);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});

it("Uploads refuse a symlinked Profile before creating a Task directory outside the store", () => {
  const scratch = mkdtempSync(join(tmpdir(), "todo-f11-upload-link-"));
  try {
    const root = join(scratch, "attachments");
    const outside = join(scratch, "outside");
    mkdirSync(root);
    mkdirSync(outside);
    symlinkSync(outside, join(root, attachmentSegment("work")));
    expect(() =>
      writeImage(root, "work", "task-1", "image-1", png, "image/png"),
    ).toThrow();
    expect(readdirSync(outside)).toEqual([]);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});

it("An image reference cannot grant server reads of another Task's managed file", () => {
  const scratch = mkdtempSync(join(tmpdir(), "todo-f11-image-scope-"));
  try {
    const root = join(scratch, "attachments");
    const path = writeImage(
      root,
      "personal",
      "private-task",
      "private-image",
      png,
      "image/png",
    );
    const reference = Schema.decodeUnknownSync(Attachment)({
      id: "reference",
      kind: "image",
      path,
      added_at: later,
    });
    expect(() => readManagedImage(root, reference, "public-task")).toThrow();
    expect(readFileSync(path)).toEqual(png);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7QAAAABJRU5ErkJggg==",
  "base64",
);

import { Attachment } from "@todo/domain";
import {
  attachmentDirectory,
  attachmentSegment,
  eraseTaskAttachments,
  readManagedImage,
  writeImage,
} from "../src/attachment-store.ts";

it.effect(
  "Purge erases detached copied images, redacts paths, and preserves every other Profile Task",
  () =>
    Effect.scoped(
      Effect.gen(function* () {
        const scratch = yield* Effect.acquireRelease(
          Effect.sync(() => mkdtempSync(join(tmpdir(), "todo-f11-purge-"))),
          (path) =>
            Effect.sync(() => rmSync(path, { recursive: true, force: true })),
        );
        const root = join(scratch, "attachments");
        const store = yield* Effect.acquireRelease(
          openStore({
            path: join(scratch, "scratch.db"),
            attachmentRoot: root,
          }),
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
        yield* store.auth.setupOwner("scratch attachment proof");
        const session = yield* store.auth.signIn("scratch attachment proof");
        const request = { profile, credential: session.credential };
        const commands = new TaskCommands(store);
        const attachments = new AttachmentCommands(store);
        const task = yield* commands.create(request, {
          title: "Private copied image",
        });
        const other = yield* commands.create(
          {
            ...request,
            profile: Schema.decodeUnknownSync(ProfileId)("personal"),
          },
          { title: "Keep personal Task" },
        );
        if (task.outcome !== "committed" || other.outcome !== "committed")
          throw new Error("Expected created Tasks");
        const target = { ...request, task_id: task.task.id };
        const uploaded = yield* attachments.upload(target, {
          from_version: task.task.row_version,
          mime_type: "image/png",
          data: png.toString("base64"),
          label: "jira",
        });
        if (uploaded.outcome !== "committed")
          throw new Error("Expected uploaded image");
        const image = uploaded.task.attachments?.[0];
        if (image?.kind !== "image") throw new Error("Missing copied image");
        expect(existsSync(image.path)).toBe(true);
        const detached = yield* attachments.detach(target, {
          from_version: uploaded.task.row_version,
          attachment_id: image.id,
        });
        expect(detached.outcome).toBe("committed");
        expect(existsSync(image.path)).toBe(true);
        yield* store.takeSnapshot();
        yield* commands.delete(target, {
          from_version: Schema.decodeUnknownSync(Version)(3),
        });
        expect(existsSync(image.path)).toBe(true);
        const purged = yield* commands.purge(target, {
          from_version: Schema.decodeUnknownSync(Version)(4),
        });
        expect(purged.outcome).toBe("committed");
        expect(existsSync(image.path)).toBe(false);
        expect(JSON.stringify(yield* store.history())).not.toContain(
          image.path,
        );
        expect(JSON.stringify(yield* store.history())).not.toContain("jira");
        expect(
          (yield* store.tasks()).map((value) => ({
            title: value.title,
            profile: value.profile_id,
            version: value.row_version,
          })),
        ).toEqual([
          { title: "Keep personal Task", profile: "personal", version: 1 },
        ]);
        yield* store.rebuild({ useSnapshot: true });
        expect((yield* store.tasks()).map((value) => value.title)).toEqual([
          "Keep personal Task",
        ]);
      }),
    ),
);

import { existsSync } from "node:fs";
import { Profile, ProfileId, Version } from "@todo/domain";
import { AttachmentCommands } from "@todo/domain/attachments";
import { TaskCommands } from "@todo/domain/store";

it.effect(
  "Migration 0006 upgrades schema 5 transactionally without rewriting any existing row",
  () =>
    Effect.scoped(
      Effect.gen(function* () {
        const directory = yield* Effect.acquireRelease(
          Effect.sync(() => mkdtempSync(join(tmpdir(), "todo-f11-migration-"))),
          (path) =>
            Effect.sync(() => rmSync(path, { recursive: true, force: true })),
        );
        const path = join(directory, "scratch.db");
        const first = yield* openStore({ path });
        yield* first.putProfile(work);
        yield* first.append({ actor, profile, event: created });
        yield* first.close();
        const fixture = new Database(path);
        const before = fixture.query("SELECT * FROM op_log ORDER BY seq").all();
        const tasks = fixture
          .query("SELECT id,payload FROM tasks ORDER BY id")
          .all();
        fixture.exec("DROP TABLE attachment_cleanup; PRAGMA user_version=5");
        fixture.close();
        for (const _round of [1, 2]) {
          const store = yield* openStore({ path });
          expect((yield* store.settings()).user_version).toBe(6);
          yield* store.close();
          const check = new Database(path);
          try {
            expect(
              check.query("SELECT * FROM op_log ORDER BY seq").all(),
            ).toEqual(before);
            expect(
              check.query("SELECT id,payload FROM tasks ORDER BY id").all(),
            ).toEqual(tasks);
            expect(
              check
                .query("SELECT COUNT(*) AS count FROM attachment_cleanup")
                .get(),
            ).toEqual({ count: 0 });
          } finally {
            check.close();
          }
        }
      }),
    ),
);

import { Database } from "bun:sqlite";

it.effect(
  "Purge aborts before erasing an image when its pre-purge Snapshot fails",
  () =>
    attachmentPurgeFixture((store, image, before) =>
      Effect.gen(function* () {
        writeFileSync(
          store.snapshots.directory,
          "Snapshot directory is unavailable",
        );
        const outcome = yield* Effect.exit(
          store.append({
            actor,
            profile,
            event: {
              kind: "TaskPurged",
              entity_version: 1,
              occurred_at: later,
              task_id: before.id,
              before,
            },
          }),
        );
        expect(outcome._tag).toBe("Failure");
        expect(existsSync(image)).toBe(true);
        expect((yield* store.tasks()).map((value) => value.title)).toEqual([
          "Write the store",
        ]);
        expect(
          (yield* store.history()).some(
            (entry) => entry.event.kind === "TaskPurged",
          ),
        ).toBe(false);
      }),
    ),
);

it.effect(
  "A failed post-commit erasure retains its redacted Snapshot and retries at open",
  () =>
    attachmentPurgeFixture((store, image, before, directory) =>
      Effect.gen(function* () {
        const outside = join(directory, "outside");
        mkdirSync(outside);
        writeFileSync(join(outside, "keep.txt"), "keep outside content");
        const escapingLink = join(dirname(image), "escape");
        symlinkSync(outside, escapingLink);
        const outcome = yield* Effect.exit(
          store.append({
            actor,
            profile,
            event: {
              kind: "TaskPurged",
              entity_version: 1,
              occurred_at: later,
              task_id: before.id,
              before,
            },
          }),
        );
        expect(outcome._tag).toBe("Failure");
        expect(yield* store.tasks()).toEqual([]);
        expect(existsSync(image)).toBe(true);
        expect((yield* store.snapshots.list()).snapshots.length).toBe(1);
        expect(readFileSync(join(outside, "keep.txt"), "utf8")).toBe(
          "keep outside content",
        );
        unlinkSync(escapingLink);
        const reopened = yield* Effect.acquireRelease(
          openStore({ path: join(directory, "scratch.db") }),
          (value) => Effect.orDie(value.close()),
        );
        expect(yield* reopened.tasks()).toEqual([]);
        expect(existsSync(image)).toBe(false);
        expect((yield* reopened.snapshots.list()).snapshots.length).toBe(1);
      }),
    ),
);

const attachmentPurgeFixture = <A, E, R>(
  run: (
    store: OperationStore,
    image: string,
    before: Task,
    directory: string,
  ) => Effect.Effect<A, E, R>,
) =>
  Effect.scoped(
    Effect.gen(function* () {
      const directory = yield* Effect.acquireRelease(
        Effect.sync(() => mkdtempSync(join(tmpdir(), "todo-f11-snapshot-"))),
        (path) =>
          Effect.sync(() => rmSync(path, { recursive: true, force: true })),
      );
      const store = yield* Effect.acquireRelease(
        openStore({ path: join(directory, "scratch.db") }),
        (value) => Effect.orDie(value.close()),
      );
      yield* store.putProfile(work);
      yield* store.append({ actor, profile, event: created });
      const image = writeImage(
        store.attachmentRoot,
        "work",
        task.id,
        "image-1",
        png,
        "image/png",
      );
      const attachment = Schema.decodeUnknownSync(Attachment)({
        id: "image-1",
        kind: "image",
        path: image,
        added_at: later,
      });
      const attached = Schema.decodeUnknownSync(Task)({
        ...task,
        row_version: 2,
        updated_at: later,
        attachments: [attachment],
      });
      yield* store.append({
        actor,
        profile,
        event: {
          kind: "AttachmentAdded",
          entity_version: 1,
          occurred_at: later,
          before: task,
          after: attached,
        },
      });
      const before = Schema.decodeUnknownSync(Task)({
        ...attached,
        row_version: 3,
        deleted_at: later,
      });
      yield* store.append({
        actor,
        profile,
        event: {
          kind: "TaskDeleted",
          entity_version: 1,
          occurred_at: later,
          before: attached,
          after: before,
        },
      });
      return yield* run(store, image, before, directory);
    }),
  );

import { unlinkSync } from "node:fs";
import { Task } from "@todo/domain";
import type { OperationStore } from "@todo/domain/store";

it("Attachment links reject malformed URLs and embedded credentials", () => {
  expect(
    validAttachmentLocation({
      kind: "link",
      url: "https://example.com/issue/42",
    }),
  ).toBe(true);
  for (const url of [
    "https://[invalid",
    "https://owner:secret@example.com/",
    "javascript:alert(1)",
    "file:///tmp/draft.md",
  ])
    expect(validAttachmentLocation({ kind: "link", url })).toBe(false);
});

import { validAttachmentLocation } from "@todo/domain";

it("Copied images enforce the decoded 20 MiB limit and declared MIME type", () => {
  const maximum = Buffer.alloc(20 * 1024 * 1024);
  png.copy(maximum);
  expect(decodeImage(maximum.toString("base64"), "image/png").length).toBe(
    20971520,
  );
  expect(() =>
    decodeImage(Buffer.alloc(20971521).toString("base64"), "image/png"),
  ).toThrow("20 MiB");
  expect(() => decodeImage(png.toString("base64"), "image/jpeg")).toThrow(
    "MIME type",
  );
  expect(() => decodeImage("not base64!!!", "image/png")).toThrow("base64");
});

import { decodeImage } from "../src/attachment-store.ts";

it.effect(
  "Copy removes managed images after its database write fails and leaves source bytes intact",
  () =>
    Effect.scoped(
      Effect.gen(function* () {
        const scratch = yield* Effect.acquireRelease(
          Effect.sync(() => mkdtempSync(join(tmpdir(), "todo-f11-copy-"))),
          (path) =>
            Effect.sync(() => rmSync(path, { recursive: true, force: true })),
        );
        const databasePath = join(scratch, "scratch.db");
        const store = yield* Effect.acquireRelease(
          openStore({ path: databasePath }),
          (store) => Effect.orDie(store.close()),
        );
        yield* store.putProfile(work);
        const personal = Schema.decodeUnknownSync(ProfileId)("personal");
        yield* store.putProfile({ ...work, id: personal, name: "Personal" });
        yield* TestClock.setTime(Date.parse(later));
        yield* store.auth.setupOwner("scratch copy proof");
        const session = yield* store.auth.signIn("scratch copy proof");
        const request = { profile, credential: session.credential };
        const commands = new TaskCommands(store);
        const created = yield* commands.create(request, {
          title: "Copy failure",
        });
        if (created.outcome !== "committed") throw new Error("No source Task");
        const target = { ...request, task_id: created.task.id };
        const uploaded = yield* new AttachmentCommands(store).upload(target, {
          from_version: created.task.row_version,
          mime_type: "image/png",
          data: png.toString("base64"),
        });
        if (uploaded.outcome !== "committed")
          throw new Error("No source image");
        const image = uploaded.task.attachments?.[0];
        if (image?.kind !== "image") throw new Error("No image path");
        const sourceFiles = filesUnder(store.attachmentRoot);
        const database = new Database(databasePath);
        try {
          database.exec(
            "CREATE TRIGGER reject_copy BEFORE INSERT ON tasks WHEN NEW.profile_id='personal' BEGIN SELECT RAISE(ABORT,'copy write rejected'); END",
          );
        } finally {
          database.close();
        }
        const failed = yield* copyTask(store, target, {
          from_version: uploaded.task.row_version,
          destination_profile: personal,
        }).pipe(
          Effect.as("unexpected copy success"),
          Effect.catch((error) =>
            Effect.succeed(
              error instanceof StoreError ? String(error.cause) : error._tag,
            ),
          ),
        );
        expect(failed).toContain("copy write rejected");
        expect(filesUnder(store.attachmentRoot)).toEqual(sourceFiles);
        expect(readFileSync(image.path)).toEqual(png);
        expect(yield* store.tasks()).toEqual([uploaded.task]);
        const conflict = yield* copyTask(store, target, {
          from_version: Schema.decodeUnknownSync(Version)(1),
          destination_profile: personal,
        });
        expect(conflict.outcome).toBe("rejected");
        expect(filesUnder(store.attachmentRoot)).toEqual(sourceFiles);
        const writable = new Database(databasePath);
        try {
          writable.exec("DROP TRIGGER reject_copy");
        } finally {
          writable.close();
        }
        const preview = yield* store.fork();
        try {
          const copiedPreview = yield* copyTask(preview, target, {
            from_version: uploaded.task.row_version,
            destination_profile: personal,
          });
          expect(copiedPreview.outcome).toBe("committed");
          expect(filesUnder(store.attachmentRoot)).toEqual(sourceFiles);
          expect(yield* store.tasks()).toEqual([uploaded.task]);
        } finally {
          yield* preview.close();
        }
        const collisionId = "11111111-1111-1111-1111-111111111111";
        const existing = Schema.decodeUnknownSync(Task)({
          ...uploaded.task,
          id: collisionId,
          profile_id: personal,
          row_version: 1,
          attachments: [],
        });
        yield* store.auth.append({
          credential: session.credential,
          profile: personal,
          event: {
            kind: "TaskCreated",
            entity_version: 1,
            occurred_at: existing.updated_at,
            task: existing,
            series: null,
            project: null,
            tags: [],
          },
        });
        const beforeCollision = yield* store.tasks();
        const uuid = vi
          .spyOn(crypto, "randomUUID")
          .mockReturnValue(collisionId);
        try {
          const rejected = yield* copyTask(store, target, {
            from_version: uploaded.task.row_version,
            destination_profile: personal,
          });
          expect(rejected.outcome).toBe("rejected");
          expect(
            readdirSync(
              attachmentDirectory(store.attachmentRoot, personal, collisionId),
            ),
          ).toEqual([]);
          expect(filesUnder(store.attachmentRoot)).toEqual(sourceFiles);
          expect(yield* store.tasks()).toEqual(beforeCollision);
        } finally {
          uuid.mockRestore();
        }
      }),
    ),
);
function filesUnder(path: string): string[] {
  return readdirSync(path, { withFileTypes: true })
    .flatMap((entry) =>
      entry.isDirectory()
        ? filesUnder(join(path, entry.name))
        : [join(path, entry.name)],
    )
    .sort();
}

import { copyTask } from "@todo/domain/commands";
import { TestClock } from "effect/testing";
import { vi } from "vitest";
import { StoreError } from "../src/store/error.ts";

it.effect("Attachment label edits preserve Project and Tag definitions", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const scratch = yield* Effect.acquireRelease(
        Effect.sync(() =>
          mkdtempSync(join(tmpdir(), "todo-f11-label-metadata-")),
        ),
        (path) =>
          Effect.sync(() => rmSync(path, { recursive: true, force: true })),
      );
      const store = yield* Effect.acquireRelease(
        openStore({ path: join(scratch, "scratch.db") }),
        (store) => Effect.orDie(store.close()),
      );
      yield* store.putProfile(work);
      yield* TestClock.setTime(Date.parse(later));
      yield* store.auth.setupOwner("scratch label metadata proof");
      const session = yield* store.auth.signIn("scratch label metadata proof");
      const request = { profile, credential: session.credential };
      const created = yield* new TaskCommands(store).create(request, {
        title: "Label with metadata",
        project_name: "Client Project",
        tag_names: ["planning", "review"],
      });
      if (created.outcome !== "committed") throw new Error("No Task");
      const target = { ...request, task_id: created.task.id };
      const commands = new AttachmentCommands(store);
      const attached = yield* commands.attach(target, {
        from_version: created.task.row_version,
        location: { kind: "file", path: "/tmp/f11-label-metadata.md" },
      });
      if (attached.outcome !== "committed") throw new Error("No Attachment");
      const attachment = attached.task.attachments?.[0];
      if (!attachment) throw new Error("No Attachment reference");
      const labeled = yield* commands.label(target, {
        from_version: attached.task.row_version,
        attachment_id: attachment.id,
        label: "jira",
      });
      expect(labeled.outcome).toBe("committed");
      const entry = (yield* store.history()).at(-1);
      if (entry?.event.kind !== "TaskEdited")
        throw new Error("No label History");
      expect(entry.event.project_before?.name).toBe("Client Project");
      expect(entry.event.project_after?.name).toBe("Client Project");
      expect(entry.event.tags_before.map((tag) => tag.name)).toEqual([
        "planning",
        "review",
      ]);
      expect(entry.event.tags_after.map((tag) => tag.name)).toEqual([
        "planning",
        "review",
      ]);
      yield* store.rebuild();
      const durable = (yield* store.tasks()).find(
        (task) => task.id === created.task.id,
      );
      expect(durable?.attachments?.[0]?.label).toBe("jira");
      expect(durable?.project_id).toBe(created.task.project_id);
      expect(durable?.tags).toEqual(created.task.tags);
    }),
  ),
);

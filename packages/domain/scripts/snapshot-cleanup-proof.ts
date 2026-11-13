import { Database } from "bun:sqlite";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Effect } from "effect";
import { attachmentDirectory, writeImage } from "../src/attachment-store.ts";
import { OperationStore } from "../src/store/store.ts";
import {
  actor,
  created,
  profile,
  task,
  time,
  work,
} from "../test/store-fixtures.ts";

const pendingJob = { profile_id: "work", task_id: "queue-target" };
const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const remove = (store: OperationStore, id: string, purge: boolean) =>
  Effect.gen(function* () {
    const before = (yield* store.tasks()).find((row) => row.id === id);
    assert.ok(before);
    const after = {
      ...before,
      row_version: before.row_version + 1,
      deleted_at: time,
    };
    assert.equal(
      (yield* store.append({
        actor,
        profile,
        event: {
          kind: "TaskDeleted",
          entity_version: 1,
          occurred_at: time,
          before,
          after,
        },
      })).outcome,
      "committed",
    );
    if (purge)
      assert.equal(
        (yield* store.append({
          actor,
          profile,
          event: {
            kind: "TaskPurged",
            entity_version: 1,
            occurred_at: time,
            before: after,
            task_id: id,
          },
        })).outcome,
        "committed",
      );
  });
const queue = (path: string) => {
  const db = new Database(path, { readonly: true });
  try {
    return db
      .query("SELECT * FROM attachment_cleanup ORDER BY profile_id,task_id")
      .all();
  } finally {
    db.close();
  }
};
const scenarios = [
  {
    name: "warm-pre-pending",
    fresh: false,
    post: false,
    drained: false,
    expectedJob: true,
  },
  {
    name: "warm-post-pending",
    fresh: false,
    post: true,
    drained: false,
    expectedJob: true,
  },
  {
    name: "fresh-pre-pending",
    fresh: true,
    post: false,
    drained: false,
    expectedJob: false,
  },
  {
    name: "fresh-post-pending",
    fresh: true,
    post: true,
    drained: false,
    expectedJob: true,
  },
  {
    name: "warm-pre-drained",
    fresh: false,
    post: false,
    drained: true,
    expectedJob: false,
  },
  {
    name: "warm-post-drained",
    fresh: false,
    post: true,
    drained: true,
    expectedJob: true,
  },
  {
    name: "fresh-pre-drained",
    fresh: true,
    post: false,
    drained: true,
    expectedJob: false,
  },
  {
    name: "fresh-post-drained",
    fresh: true,
    post: true,
    drained: true,
    expectedJob: true,
  },
];

export async function proveSnapshotCleanup(
  root: string,
  scenarioName?: string,
  rootSource: "default" | "options" | "env" = "default",
) {
  const receipts = [];
  for (const scenario of scenarios.filter(
    (value) => scenarioName === undefined || value.name === scenarioName,
  )) {
    const directory = join(root, scenario.name);
    mkdirSync(directory, { recursive: true });
    const path = join(directory, "scratch.db");
    const defaultRoot = join(directory, "attachments");
    const attachmentRoot =
      rootSource === "default"
        ? defaultRoot
        : join(directory, `custom-${rootSource}`);
    const previousRoot = process.env.TODO_ATTACHMENT_ROOT;
    if (rootSource === "env") process.env.TODO_ATTACHMENT_ROOT = attachmentRoot;
    const open = () =>
      new OperationStore(
        rootSource === "env" ? { path } : { path, attachmentRoot },
      );
    let store = open();
    try {
      await Effect.runPromise(store.putProfile(work));
      const targetImage = writeImage(
        attachmentRoot,
        profile,
        "queue-target",
        "purged-image",
        png,
        "image/png",
      );
      const deletedImage = writeImage(
        attachmentRoot,
        profile,
        "deleted-only",
        "retained-image",
        png,
        "image/png",
      );
      for (const [id, title, image] of [
        ["queue-target", "Private image Task", targetImage],
        ["deleted-only", "Deleted but recoverable", deletedImage],
      ]) {
        assert.ok(id && title && image);
        const attachment = {
          kind: "image",
          id: `${id}-image`,
          path: image,
          added_at: time,
        };
        await Effect.runPromise(
          store.append({
            actor,
            profile,
            event: {
              ...created,
              task: { ...task, id, title, attachments: [attachment] },
            },
          }),
        );
      }
      const defaultImage =
        rootSource === "default"
          ? null
          : writeImage(
              defaultRoot,
              profile,
              "queue-target",
              "default-must-stay",
              png,
              "image/png",
            );
      const before = await Effect.runPromise(
        store.snapshots.create("before Purge"),
      );
      const child = Bun.spawnSync(
        import.meta.main
          ? [process.execPath, "--crash-purge", directory, attachmentRoot]
          : [
              process.execPath,
              fileURLToPath(import.meta.url),
              "--crash-purge",
              directory,
              attachmentRoot,
            ],
        {
          env: { ...process.env, HOME: directory, TODO_DB: path },
          stdout: "pipe",
          stderr: "pipe",
        },
      );
      assert.equal(child.exitCode, 73, child.stderr.toString());
      assert.deepEqual(queue(path), [pendingJob]);
      assert.equal(existsSync(targetImage), true);
      assert.deepEqual(
        (await Effect.runPromise(store.tasks())).map((row) => row.id),
        ["deleted-only"],
      );
      const after = await Effect.runPromise(
        store.snapshots.create("after commit before erasure"),
      );
      if (scenario.drained) {
        const cleanup = open();
        await Effect.runPromise(cleanup.close());
        assert.equal(existsSync(targetImage), false);
      }
      if (scenario.fresh) {
        await Effect.runPromise(store.close());
        store = open();
        assert.equal(existsSync(targetImage), false);
      }
      await Effect.runPromise(remove(store, "deleted-only", false));
      const sql = new Database(path);
      try {
        sql
          .query("INSERT INTO attachment_cleanup VALUES (?,?)")
          .run(profile, "deleted-only");
      } finally {
        sql.close();
      }
      const selected = scenario.post ? after : before;
      const beforeDryQueue = queue(path);
      const beforeDryImage = existsSync(targetImage);
      const preview = await Effect.runPromise(
        store.snapshots.restore(selected.id, { dryRun: true }),
      );
      assert.equal(preview.dry_run, true);
      assert.deepEqual(queue(path), beforeDryQueue);
      assert.equal(existsSync(targetImage), beforeDryImage);
      await Effect.runPromise(store.snapshots.restore(selected.id));
      assert.deepEqual(
        (await Effect.runPromise(store.tasks())).map((row) => [
          row.id,
          row.deleted_at,
          row.title,
        ]),
        [["deleted-only", null, "Deleted but recoverable"]],
      );
      assert.equal(existsSync(deletedImage), true);
      assert.equal(
        existsSync(targetImage),
        false,
        "erasure must finish before restore returns",
      );
      assert.deepEqual(queue(path), [], "job must be gone at restore return");
      if (defaultImage) assert.equal(existsSync(defaultImage), true);
      const queueAfterRestore = queue(path);
      await Effect.runPromise(store.close());
      store = open();
      assert.equal(existsSync(targetImage), false, scenario.name);
      assert.deepEqual(queueAfterRestore, []);
      assert.equal(existsSync(deletedImage), true, scenario.name);
      assert.deepEqual(queue(path), []);
      await Effect.runPromise(store.snapshots.restore(selected.id));
      assert.equal(existsSync(targetImage), false);
      assert.deepEqual(queue(path), []);
      assert.equal(existsSync(deletedImage), true);
      assert.deepEqual(queue(path), []);
      receipts.push({
        scenario: scenario.name,
        root_source: rootSource,
        erasure_at_restore_return: true,
        dry_run_erases_nothing: true,
        crash_exit: child.exitCode,
        queue_after_restore: queueAfterRestore,
        purged_image_after_cleanup: false,
        deleted_image_after_cleanup: true,
        restored_tasks: ["deleted-only"],
        repeat_restore: "PASS",
      });
    } finally {
      await Effect.runPromise(store.close());
      if (previousRoot === undefined) delete process.env.TODO_ATTACHMENT_ROOT;
      else process.env.TODO_ATTACHMENT_ROOT = previousRoot;
    }
  }
  return { status: "PASS", scenarios: receipts };
}

export async function proveSnapshotRedactionStability(directory: string) {
  mkdirSync(directory, { recursive: true });
  const store = new OperationStore({ path: join(directory, "scratch.db") });
  try {
    await Effect.runPromise(store.putProfile(work));
    await Effect.runPromise(store.append({ actor, profile, event: created }));
    await Effect.runPromise(store.takeSnapshot());
    const saved = await Effect.runPromise(
      store.snapshots.create("checksum stability"),
    );
    await Effect.runPromise(remove(store, task.id, true));
    const checksums = [
      (await Effect.runPromise(store.snapshots.show(saved.id))).sha256,
    ];
    const checksum = () =>
      createHash("sha256").update(readFileSync(saved.path)).digest("hex");
    assert.equal(checksums[0], checksum());
    for (let pass = 0; pass < 3; pass++) {
      store.snapshots.redactAllSync([task.id]);
      const manifest = await Effect.runPromise(store.snapshots.show(saved.id));
      assert.equal(manifest.sha256, checksum());
      assert.equal(manifest.size, statSync(saved.path).size);
      assert.deepEqual(
        manifest.task_counts.map((row) => row.count),
        [0],
      );
      checksums.push(checksum());
    }
    assert.equal(new Set(checksums).size, 1);
    return { status: "PASS", checksums, byte_idempotence: true };
  } finally {
    await Effect.runPromise(store.close());
  }
}

export const cleanupGuards = [
  "failed-erasure",
  "dry-run",
  "refused",
  "preview",
  "pending-preview",
  "membership",
  "rollback",
  "guarded-write",
] as const;
export async function proveSnapshotCleanupGuard(
  directory: string,
  mode: (typeof cleanupGuards)[number],
) {
  mkdirSync(directory, { recursive: true });
  const path = join(directory, "scratch.db"),
    attachmentRoot = join(directory, "images");
  const store = new OperationStore({ path, attachmentRoot });
  let previewStore: OperationStore | undefined;
  try {
    await Effect.runPromise(store.putProfile(work));
    const targetImage = writeImage(
      attachmentRoot,
      profile,
      "queue-target",
      "target-image",
      png,
      "image/png",
    );
    const keeperImage = writeImage(
      attachmentRoot,
      profile,
      "keeper",
      "keeper-image",
      png,
      "image/png",
    );
    for (const [id, title, image] of [
      ["queue-target", "Private image Task", targetImage],
      ["keeper", "Literal keeper", keeperImage],
    ]) {
      assert.ok(id && title && image);
      assert.equal(
        (
          await Effect.runPromise(
            store.append({
              actor,
              profile,
              event: {
                ...created,
                task: {
                  ...task,
                  id,
                  title,
                  attachments: [
                    { kind: "image", id, path: image, added_at: time },
                  ],
                },
              },
            }),
          )
        ).outcome,
        "committed",
      );
    }
    const saved = await Effect.runPromise(
      store.snapshots.create("cleanup guard"),
    );
    if (mode === "preview")
      previewStore = await Effect.runPromise(store.fork());
    const child = Bun.spawnSync(
      import.meta.main
        ? [process.execPath, "--crash-purge", directory, attachmentRoot]
        : [
            process.execPath,
            fileURLToPath(import.meta.url),
            "--crash-purge",
            directory,
            attachmentRoot,
          ],
      {
        env: { ...process.env, HOME: directory, TODO_DB: path },
        stdout: "pipe",
        stderr: "pipe",
      },
    );
    assert.equal(child.exitCode, 73, child.stderr.toString());
    assert.deepEqual(queue(path), [pendingJob]);
    assert.equal(existsSync(targetImage), true);
    if (mode === "failed-erasure") {
      const managed = attachmentDirectory(
          attachmentRoot,
          profile,
          "queue-target",
        ),
        blocked = join(directory, "blocked-image-directory");
      renameSync(managed, blocked);
      symlinkSync(blocked, managed);
      const report = await Effect.runPromise(store.snapshots.restore(saved.id));
      assert.equal(report.dry_run, false);
      assert.deepEqual(Object.keys(report).sort(), [
        "dry_run",
        "generation",
        "id",
        "safety_snapshot",
        "seq_after",
        "seq_before",
        "seq_delta",
        "task_counts",
      ]);
      assert.deepEqual(queue(path), [pendingJob]);
      assert.equal(existsSync(targetImage), true);
      assert.deepEqual(
        (await Effect.runPromise(store.tasks())).map((row) => row.title),
        ["Literal keeper"],
      );
      unlinkSync(managed);
      renameSync(blocked, managed);
      await Effect.runPromise(store.snapshots.restore(saved.id));
      assert.equal(existsSync(targetImage), false);
      assert.deepEqual(queue(path), []);
    } else if (mode === "pending-preview") {
      const preview = await Effect.runPromise(store.fork());
      try {
        assert.equal(preview.isPreview, true);
        assert.equal(existsSync(targetImage), true);
        assert.equal(existsSync(keeperImage), true);
        assert.deepEqual(queue(path), [pendingJob]);
      } finally {
        await Effect.runPromise(preview.close());
      }
      const live = new OperationStore({ path, attachmentRoot });
      try {
        assert.equal(existsSync(targetImage), false);
        assert.equal(existsSync(keeperImage), true);
        assert.deepEqual(queue(path), []);
      } finally {
        await Effect.runPromise(live.close());
      }
    } else if (mode === "preview") {
      const preview = previewStore;
      assert.ok(preview);
      try {
        await Effect.runPromise(remove(preview, "queue-target", true));
        assert.equal(existsSync(targetImage), true);
        assert.equal(preview.isPreview, true);
        assert.equal(preview.snapshots.persistent, false);
        Object.defineProperty(preview.snapshots, "directory", {
          value: store.snapshots.directory,
        });
        const refused = await Effect.runPromise(
          preview.snapshots.restore(saved.id).pipe(Effect.result),
        );
        assert.equal(refused._tag, "Failure");
        assert.equal(existsSync(targetImage), true);
        Object.defineProperty(preview.snapshots, "createSync", {
          value: () => saved,
        });
        const report = await Effect.runPromise(
          preview.snapshots.restore(saved.id),
        );
        assert.equal(report.dry_run, false);
        assert.deepEqual(
          (await Effect.runPromise(preview.tasks())).map((row) => row.title),
          ["Literal keeper"],
        );
        assert.equal(existsSync(targetImage), true);
        assert.deepEqual(queue(path), [pendingJob]);
      } finally {
        await Effect.runPromise(preview.close());
        previewStore = undefined;
      }
    } else if (mode === "dry-run") {
      const report = await Effect.runPromise(
        store.snapshots.restore(saved.id, { dryRun: true }),
      );
      assert.equal(report.dry_run, true);
      assert.equal(existsSync(targetImage), true);
      assert.deepEqual(queue(path), [pendingJob]);
    } else if (mode === "refused") {
      writeFileSync(saved.path, "checksum mismatch");
      const report = await Effect.runPromise(
        store.snapshots.restore(saved.id).pipe(Effect.result),
      );
      assert.equal(report._tag, "Failure");
      assert.equal(existsSync(targetImage), true);
      assert.deepEqual(queue(path), [pendingJob]);
    } else if (mode === "rollback") {
      Object.defineProperty(store.snapshots, "afterRestore", {
        value: () => {
          throw new Error("force restore rollback");
        },
      });
      const result = await Effect.runPromise(
        store.snapshots.restore(saved.id).pipe(Effect.result),
      );
      assert.equal(result._tag, "Failure");
      assert.equal(existsSync(targetImage), true);
      assert.deepEqual(queue(path), [pendingJob]);
    } else if (mode === "guarded-write") {
      const db = Reflect.get(store, "db");
      assert.ok(db instanceof Database);
      db.exec(
        "CREATE TRIGGER cleanup_guard BEFORE DELETE ON attachment_cleanup WHEN domain_write_allowed() != 1 BEGIN SELECT RAISE(ABORT, 'cleanup must use guarded transaction'); END;",
      );
      await Effect.runPromise(store.snapshots.restore(saved.id));
      assert.equal(existsSync(targetImage), false);
      assert.deepEqual(queue(path), []);
    } else {
      const original = Reflect.get(store.snapshots, "afterRestore");
      assert.equal(typeof original, "function");
      const db = Reflect.get(store, "db");
      assert.ok(db instanceof Database);
      Object.defineProperty(store.snapshots, "afterRestore", {
        value: () => {
          original();
          db.query("INSERT INTO attachment_cleanup VALUES (?,?)").run(
            profile,
            "keeper",
          );
        },
      });
      await Effect.runPromise(store.snapshots.restore(saved.id));
      assert.equal(existsSync(targetImage), false);
      assert.equal(existsSync(keeperImage), true);
      assert.deepEqual(queue(path), [
        { profile_id: "work", task_id: "keeper" },
      ]);
    }
    assert.equal(existsSync(keeperImage), true);
    return { mode, status: "PASS", crash_exit: 73, keeper_image_present: true };
  } finally {
    if (previewStore) await Effect.runPromise(previewStore.close());
    await Effect.runPromise(store.close());
  }
}

if (import.meta.main) {
  const [mode, directory, evidence] = process.argv.slice(2);
  if (
    !directory?.includes("todo-") ||
    (mode !== "--crash-purge" && mode !== "--drive")
  )
    throw new Error("Expected owned scratch directory and mode");
  if (mode === "--crash-purge") {
    const store = new OperationStore({
      path: join(directory, "scratch.db"),
      attachmentRoot: evidence ?? join(directory, "attachments"),
    });
    Object.defineProperty(store, "cleanupAttachmentsSync", {
      value: () => process.exit(73),
    });
    await Effect.runPromise(remove(store, "queue-target", true));
    throw new Error("Post-commit crash boundary was not reached");
  }
  if (mode === "--drive") {
    assert.ok(evidence);
    const result = await proveSnapshotCleanup(directory);
    const customRoots = [];
    for (const source of ["options", "env"] as const)
      customRoots.push(
        await proveSnapshotCleanup(
          join(directory, `custom-${source}`),
          "warm-pre-pending",
          source,
        ),
      );
    const guards = [];
    for (const mode of cleanupGuards)
      guards.push(
        await proveSnapshotCleanupGuard(join(directory, `guard-${mode}`), mode),
      );
    writeFileSync(
      join(evidence, "cleanup-guards.json"),
      JSON.stringify({ customRoots, guards }, null, 2),
    );
    const stability = await proveSnapshotRedactionStability(
      join(directory, "stability"),
    );
    writeFileSync(
      join(evidence, "redaction-stability.json"),
      JSON.stringify(stability, null, 2),
    );
    writeFileSync(
      join(evidence, "cleanup-recovery.json"),
      JSON.stringify(result, null, 2),
    );
  }
}

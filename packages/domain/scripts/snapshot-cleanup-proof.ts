import { Database } from "bun:sqlite";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Effect } from "effect";
import { writeImage } from "../src/attachment-store.ts";
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
) {
  const receipts = [];
  for (const scenario of scenarios.filter(
    (value) => scenarioName === undefined || value.name === scenarioName,
  )) {
    const directory = join(root, scenario.name);
    mkdirSync(directory, { recursive: true });
    const path = join(directory, "scratch.db");
    const attachmentRoot = join(directory, "attachments");
    const open = () => new OperationStore({ path, attachmentRoot });
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
      const before = await Effect.runPromise(
        store.snapshots.create("before Purge"),
      );
      const child = Bun.spawnSync(
        import.meta.main
          ? [process.execPath, "--crash-purge", directory]
          : [
              process.execPath,
              fileURLToPath(import.meta.url),
              "--crash-purge",
              directory,
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
      const queueAfterRestore = queue(path);
      await Effect.runPromise(store.close());
      store = open();
      assert.equal(existsSync(targetImage), false, scenario.name);
      assert.deepEqual(
        queueAfterRestore,
        scenario.expectedJob ? [pendingJob] : [],
      );
      assert.equal(existsSync(deletedImage), true, scenario.name);
      assert.deepEqual(queue(path), []);
      await Effect.runPromise(store.snapshots.restore(selected.id));
      await Effect.runPromise(store.close());
      store = open();
      assert.equal(existsSync(targetImage), false);
      assert.equal(existsSync(deletedImage), true);
      assert.deepEqual(queue(path), []);
      receipts.push({
        scenario: scenario.name,
        crash_exit: child.exitCode,
        queue_after_restore: queueAfterRestore,
        purged_image_after_cleanup: false,
        deleted_image_after_cleanup: true,
        restored_tasks: ["deleted-only"],
        repeat_restore: "PASS",
      });
    } finally {
      await Effect.runPromise(store.close());
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
      attachmentRoot: join(directory, "attachments"),
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

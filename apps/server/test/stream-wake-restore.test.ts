import { Database } from "bun:sqlite";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "@effect/vitest";
import { writeImage } from "@todo/domain/attachment-store";
import { OperationStore } from "@todo/domain/store";
import { Effect } from "effect";
import {
  actor,
  created,
  profile,
  task,
  time,
  work,
} from "../../../packages/domain/test/store-fixtures.ts";
import { StreamWake } from "../src/stream-wake.ts";
import { streamWakeStore } from "../src/stream-wake-store.ts";

const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

type Observation = {
  readonly image: boolean;
  readonly jobs: number;
  readonly inTransaction: boolean;
};

it("signals a restore only after its post-transaction erasure has finished", async () => {
  const directory = mkdtempSync(join(tmpdir(), "todo-wake-restore-"));
  const attachmentRoot = join(directory, "attachments");
  const path = join(directory, "scratch.db");
  const raw = new OperationStore({ path, attachmentRoot });
  const sql = new Database(path);
  const run = Effect.runPromise;
  try {
    await run(raw.putProfile(work));
    const image = () =>
      writeImage(
        attachmentRoot,
        profile,
        "purged",
        "private",
        png,
        "image/png",
      );
    const imagePath = image();
    for (const [id, title, attachments] of [
      [
        "purged",
        "Private image Task",
        [
          {
            kind: "image",
            id: "purged-image",
            path: imagePath,
            added_at: time,
          },
        ],
      ],
      ["keeper", "Keeper", []],
    ] as const) {
      const result = await run(
        raw.append({
          actor,
          profile,
          event: { ...created, task: { ...task, id, title, attachments } },
        }),
      );
      expect(result.outcome).toBe("committed");
    }
    const saved = await run(raw.snapshots.create("before Purge"));
    const before = (await run(raw.tasks())).find((row) => row.id === "purged");
    if (!before) throw new Error("missing Purge target");
    const deleted = {
      ...before,
      row_version: before.row_version + 1,
      deleted_at: time,
    };
    for (const event of [
      {
        kind: "TaskDeleted",
        entity_version: 1,
        occurred_at: time,
        before,
        after: deleted,
      },
      {
        kind: "TaskPurged",
        entity_version: 1,
        occurred_at: time,
        before: deleted,
        task_id: "purged",
      },
    ]) {
      const result = await run(raw.append({ actor, profile, event }));
      expect(result.outcome).toBe("committed");
    }
    // The erasure job an interrupted Purge leaves behind, as verify-snapshots'
    // crash-Purge proof produces it: the image is on disk and still queued.
    image();
    sql
      .query("INSERT INTO attachment_cleanup VALUES (?,?)")
      .run(profile, "purged");
    expect(existsSync(imagePath)).toBe(true);

    const connection: Database = Reflect.get(raw, "db");
    const wake = new StreamWake();
    const observations: Observation[] = [];
    const observe = (): Observation => ({
      image: existsSync(imagePath),
      jobs:
        sql
          .query<{ count: number }, []>(
            "SELECT count(*) AS count FROM attachment_cleanup",
          )
          .get()?.count ?? -1,
      inTransaction: connection.inTransaction,
    });
    const forward = wake.signal;
    Object.defineProperty(wake, "signal", {
      value: () => {
        observations.push(observe());
        forward();
      },
    });
    const store = streamWakeStore(raw, wake);
    const version = wake.version;
    await run(store.snapshots.restore(saved.id));

    // One signal, after the restore transaction and its erasure: the image is
    // gone and the job is drained when it fires. Nothing fired before.
    expect(observations).toEqual([
      { image: false, jobs: 0, inTransaction: false },
    ]);
    expect(wake.version).toBe(version + 1);
    expect((await run(raw.tasks())).map((row) => row.id)).toEqual(["keeper"]);
  } finally {
    sql.close();
    await run(raw.close());
    rmSync(directory, { recursive: true, force: true });
  }
});

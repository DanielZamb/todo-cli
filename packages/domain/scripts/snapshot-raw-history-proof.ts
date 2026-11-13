import { Database } from "bun:sqlite";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Effect, Schema } from "effect";
import { OpLogEntry } from "../src/events.ts";
import { OperationStore } from "../src/store/store.ts";
import {
  actor,
  created,
  profile,
  task,
  time,
  work,
} from "../test/store-fixtures.ts";

export const rawHistoryScopes = [
  "live-startup",
  "stored-copy",
  "restore-stage",
] as const;
export async function proveRawHistory(
  directory: string,
  scope: (typeof rawHistoryScopes)[number],
  metadataOnly = false,
) {
  mkdirSync(directory, { recursive: true });
  const path = join(directory, "scratch.db");
  const open = () =>
    new OperationStore({ path, attachmentRoot: join(directory, "images") });
  let store = open();
  try {
    await Effect.runPromise(store.putProfile(work));
    await Effect.runPromise(store.append({ actor, profile, event: created }));
    await Effect.runPromise(
      store.append({
        actor,
        profile,
        event: {
          ...created,
          task: { ...task, id: "keeper", title: "Literal keeper" },
        },
      }),
    );
    await Effect.runPromise(store.takeSnapshot());
    const saved = await Effect.runPromise(
      store.snapshots.create("raw History repair"),
    );
    const deleted = { ...task, row_version: 2, deleted_at: time };
    await Effect.runPromise(
      store.append({
        actor,
        profile,
        event: {
          kind: "TaskDeleted",
          entity_version: 1,
          occurred_at: time,
          before: task,
          after: deleted,
        },
      }),
    );
    await Effect.runPromise(
      store.append({
        actor,
        profile,
        event: {
          kind: "TaskPurged",
          entity_version: 1,
          occurred_at: time,
          before: deleted,
          task_id: task.id,
        },
      }),
    );
    const selected = scope === "live-startup" ? path : saved.path;
    if (scope === "live-startup") await Effect.runPromise(store.close());
    const canary = "Private dropped History key";
    const checkpointCanary = "Private dropped checkpoint key";
    const db = new Database(selected);
    let seq: number;
    try {
      const row = db
        .query<{ seq: number; event: string }, []>(
          "SELECT seq,event FROM op_log WHERE json_extract(event,'$.kind')='TaskHistoryRedacted' ORDER BY seq LIMIT 1",
        )
        .get();
      assert.ok(row);
      seq = row.seq;
      const event = JSON.parse(row.event);
      if (!metadataOnly) {
        event.legacy_secret = canary;
        event.replay.older_private_key = { description: canary };
      }
      const checkpoint = db
        .query<{ seq: number; payload: string }, []>(
          "SELECT seq,payload FROM snapshots LIMIT 1",
        )
        .get();
      assert.ok(checkpoint);
      const checkpointValue = JSON.parse(checkpoint.payload);
      checkpointValue.legacy_secret = checkpointCanary;
      const guards = db
        .query<{ sql: string }, []>(
          "SELECT sql FROM sqlite_master WHERE name IN ('op_log_no_update','snapshots_no_update') ORDER BY name",
        )
        .all();
      db.transaction(() => {
        db.exec(
          "DROP TRIGGER op_log_no_update; DROP TRIGGER snapshots_no_update;",
        );
        db.query("UPDATE op_log SET event=?,entity_version=2 WHERE seq=?").run(
          JSON.stringify(event),
          seq,
        );
        db.query("UPDATE snapshots SET payload=? WHERE seq=?").run(
          JSON.stringify(checkpointValue),
          checkpoint.seq,
        );
        for (const guard of guards) db.exec(guard.sql);
      }).immediate();
      const raw = db
        .query<{ event: string }, [number]>(
          "SELECT event FROM op_log WHERE seq=?",
        )
        .get(seq);
      const stored = db
        .query<Omit<OpLogEntry, "event"> & { event: string }, [number]>(
          "SELECT * FROM op_log WHERE seq=?",
        )
        .get(seq);
      assert.ok(stored);
      const decoded = Schema.decodeUnknownSync(OpLogEntry)({
        ...stored,
        event: JSON.parse(raw?.event ?? "null"),
      });
      assert.equal(JSON.stringify(decoded.event).includes(canary), false);
    } finally {
      db.close();
    }
    const checksum = () =>
      createHash("sha256").update(readFileSync(saved.path)).digest("hex");
    if (scope !== "live-startup") {
      const manifestPath = join(directory, "snapshots", `${saved.id}.json`);
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
      writeFileSync(
        manifestPath,
        JSON.stringify({
          ...manifest,
          sha256: checksum(),
          size: statSync(saved.path).size,
        }),
      );
    }
    if (scope === "live-startup") store = open();
    else if (scope === "stored-copy") store.snapshots.redactAllSync([task.id]);
    else await Effect.runPromise(store.snapshots.restore(saved.id));
    const result = new Database(scope === "restore-stage" ? path : selected);
    try {
      const raw = result
        .query<{ event: string; entity_version: number }, [number]>(
          "SELECT event,entity_version FROM op_log WHERE seq=?",
        )
        .get(seq);
      assert.ok(raw);
      assert.equal(raw.event.includes(canary), false, scope);
      assert.equal(raw.entity_version, 1, scope);
      assert.equal(
        result
          .query<{ payload: string }, []>(
            "SELECT payload FROM snapshots LIMIT 1",
          )
          .get()
          ?.payload.includes(checkpointCanary),
        false,
      );
      assert.deepEqual(result.query("PRAGMA foreign_key_check").all(), []);
      assert.throws(
        () => result.exec("UPDATE op_log SET event=event"),
        /append-only/,
      );
      assert.throws(
        () => result.exec("UPDATE snapshots SET payload=payload"),
        /immutable/,
      );
    } finally {
      result.close();
    }
    const stable = (await Effect.runPromise(store.snapshots.show(saved.id)))
      .sha256;
    for (let pass = 0; pass < 3; pass++) {
      store.snapshots.redactAllSync([task.id]);
      const manifest = await Effect.runPromise(store.snapshots.show(saved.id));
      assert.equal(manifest.sha256, checksum());
      assert.equal(manifest.sha256, stable);
    }
    return {
      scope,
      metadata_only: metadataOnly,
      private_raw_text: false,
      entity_version: 1,
      checkpoint_private_text: false,
      repeated_checksum_stable: true,
    };
  } finally {
    await Effect.runPromise(store.close());
  }
}

if (import.meta.main) {
  const [directory, evidence] = process.argv.slice(2);
  if (!directory?.includes("todo-") || !evidence)
    throw new Error("Expected owned scratch and evidence");
  const results = [];
  for (const scope of rawHistoryScopes)
    for (const metadataOnly of [false, true])
      results.push(
        await proveRawHistory(
          join(directory, `${scope}-${metadataOnly}`),
          scope,
          metadataOnly,
        ),
      );
  writeFileSync(
    join(evidence, "raw-history.json"),
    JSON.stringify({ status: "PASS", results }, null, 2),
  );
}

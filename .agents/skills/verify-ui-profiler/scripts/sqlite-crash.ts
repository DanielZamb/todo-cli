import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { RecordingDatabase } from "../../../../packages/domain/src/recordings-sqlite.ts";
import { validateRecordingBatch } from "../../../../packages/domain/src/diagnostic-recordings.ts";
import { modelBatch } from "../../../../packages/domain/test/fixtures/recording-authority.ts";
if (process.argv[2] === "child") {
  const root = resolve(process.argv[3] ?? ""),
    point = process.argv[4],
    kind = process.argv[5],
    input = JSON.parse(await readFile(join(root, "input"), "utf8"));
  let armed = false;
  const db = new RecordingDatabase(join(root, "db"), {
    ...(kind === "evict" ? { appBytes: 49152 } : {}),
    boundary: (at) => {
      if (armed && at === point) {
        writeFileSync(join(root, "held"), at);
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0);
      }
    },
  });
  db.ingest(input.peer, Date.now());
  db.ingest(input.seed, input.seed_time);
  armed = true;
  try {
    if (kind === "refuse") db.ingest(input.conflict, Date.now());
    else if (kind === "expire") db.maintenance(Date.now());
    else db.ingest(input.batch, Date.now());
  } catch {}
  writeFileSync(join(root, "finished"), "finished");
  db.close();
  process.exit(0);
}
const evidence = resolve(
  process.argv[2] ?? "docs/evidence/ui-speed/recordings-sqlite/crash",
);
mkdirSync(evidence, { recursive: true });
const rows: object[] = [];
for (const kind of ["ingest", "import", "refuse", "expire", "evict"])
  for (const point of [
    "before_begin",
    "after_begin",
    "before_commit",
    "after_commit",
  ]) {
    const root = await mkdtemp(join(tmpdir(), "todo-sql-kill-")),
      seed = modelBatch(),
      next = modelBatch(),
      p = modelBatch(),
      peer = validateRecordingBatch({
        ...p,
        run: { ...p.run, app: "cli" },
        events: p.events.map((e) => ({ ...e, process_role: "cli" })),
      }),
      seed_time = Date.now() - (kind === "expire" ? 8 * 86400000 : 0);
    const batch = validateRecordingBatch({
        ...next,
        run: {
          ...next.run,
          ...(kind === "import"
            ? {
                admission: {
                  schema_version: 1,
                  policy: "whole_batch",
                  refused_batches: 1,
                  unadmitted_events: 3,
                  incomplete: true,
                },
              }
            : {}),
        },
      }),
      conflict = validateRecordingBatch({
        ...seed,
        batch_id: randomUUID(),
        events: [{ ...seed.events[0], action_id: randomUUID() }],
      });
    await writeFile(
      join(root, "input"),
      JSON.stringify({ seed, batch, conflict, peer, seed_time }),
    );
    const child = spawn(
      resolve(".scratch/bin/sqlite-crash"),
      ["child", root, point, kind],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    let log = "";
    child.stderr.on("data", (x) => (log += x));
    try {
      const deadline = Date.now() + 60000;
      while (
        !existsSync(join(root, "held")) &&
        child.exitCode === null &&
        Date.now() < deadline
      )
        await Bun.sleep(5);
      assert.ok(existsSync(join(root, "held")), log);
      const ended = new Promise<void>((r) => child.once("exit", () => r()));
      child.kill("SIGKILL");
      await ended;
      const db = new RecordingDatabase(
          join(root, "db"),
          kind === "evict" ? { appBytes: 49152 } : {},
        ),
        committed = point === "after_commit";
      try {
        assert.equal(db.show(peer.run.run_id).summary[0]?.starts, 1);
        if (kind === "expire") {
          assert.deepEqual(
            db.db
              .query("SELECT count(*) n FROM events WHERE run=?")
              .get(seed.run.run_id),
            { n: committed ? 0 : 3 },
          );
          assert.equal(db.status().loss.expired_events, committed ? 3 : 0);
          db.maintenance(Date.now());
          assert.equal(db.status().loss.expired_events, 3);
          db.maintenance(Date.now());
          assert.equal(db.status().loss.expired_events, 3);
        } else if (kind === "refuse") {
          assert.equal(db.show(seed.run.run_id).summary[0]?.starts, 1);
          assert.equal(
            db.show(seed.run.run_id).run.admission?.incomplete,
            committed,
          );
          assert.throws(
            () => db.ingest(conflict, Date.now()),
            /Whole batch refused/,
          );
          assert.equal(
            db.show(seed.run.run_id).summary[0]?.fraction_by_20_ms,
            null,
          );
        } else {
          if (!committed)
            assert.throws(() => db.show(next.run.run_id), /run is missing/);
          else
            assert.equal(
              db.export(next.run.run_id).batches[0]?.events.length,
              3,
            );
          assert.equal(db.ingest(batch, Date.now()).accepted, true);
          assert.equal(db.ingest(batch, Date.now()).duplicate, true);
          assert.equal(db.export(next.run.run_id).batches[0]?.events.length, 3);
          if (kind === "import")
            assert.equal(
              db.show(next.run.run_id).summary[0]?.fraction_by_20_ms,
              null,
            );
          if (kind === "evict") {
            assert.equal(db.status().loss.capacity_events, 3);
            assert.equal(
              db.show(seed.run.run_id).run.admission?.incomplete,
              true,
            );
            assert.deepEqual(db.show(seed.run.run_id).summary, []);
          }
        }
        assert.equal(db.show(peer.run.run_id).summary[0]?.starts, 1);
        assert.deepEqual(db.db.query("PRAGMA foreign_key_check").all(), []);
        rows.push({ kind, point, result: "PASS" });
      } finally {
        db.close();
      }
    } finally {
      if (child.exitCode === null && child.signalCode === null)
        child.kill("SIGKILL");
      await rm(root, { recursive: true, force: true });
    }
    writeFileSync(
      join(evidence, "result.json"),
      JSON.stringify(
        { result: rows.length === 20 ? "PASS" : "RUNNING", rows },
        null,
        2,
      ),
    );
  }

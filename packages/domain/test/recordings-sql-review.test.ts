import { Database } from "bun:sqlite";
import { chmod, mkdir, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "@effect/vitest";
import { vi } from "vitest";
import { RecordingDatabase } from "../src/recordings-sqlite.ts";
import { modelBatch } from "./fixtures/recording-authority.ts";

it("SQL3 counts a refused valid run-capacity batch and its three events", async () => {
  const p = await mkdtemp(join(tmpdir(), "todo-sql3-")),
    s = new RecordingDatabase(p),
    a = modelBatch();
  try {
    s.db.transaction(() => {
      for (let i = 0; i < 5120; i++) {
        const id = `${i.toString(16).padStart(8, "0")}-0000-4000-8000-000000000000`;
        s.db.query("INSERT INTO runs VALUES(?,?,?,?,?)").run(
          id,
          a.run.app,
          JSON.stringify({ ...a.run, run_id: id }),
          JSON.stringify({
            schema_version: 1,
            policy: "whole_batch",
            refused_batches: 1,
            unadmitted_events: 1,
            incomplete: true,
          }),
          Date.now(),
        );
      }
    })();
    expect(() => s.ingest(a, Date.now())).toThrow("capacity");
    expect(s.status().loss.dropped_batches).toBe(1);
    expect(s.status().loss.dropped_events).toBe(3);
    expect(s.db.query("SELECT count(*) n FROM runs").get()).toEqual({
      n: 5120,
    });
  } finally {
    s.close();
    await rm(p, { recursive: true, force: true });
  }
});
it("SQL4 counts pinned-reader refusals as capacity and does not count maintenance retries as storage failures", async () => {
  const p = await mkdtemp(join(tmpdir(), "todo-sql4-")),
    s = new RecordingDatabase(p, { totalBytes: 2097152 });
  s.ingest(modelBatch(), 1);
  const reader = new Database(join(p, "recordings.db"));
  reader.exec("BEGIN");
  reader.query("SELECT count(*) FROM events").get();
  try {
    let dropped = 0;
    for (let i = 0; i < 200; i++)
      if (!s.ingest(modelBatch(), i + 2).accepted) dropped++;
    expect(dropped).toBeGreaterThan(0);
    expect(s.status().loss.capacity_events).toBe(dropped * 3);
    expect(s.status().loss.storage_failures).toBe(0);
    for (let i = 0; i < 10; i++) expect(s.maintenance(8 * 86400000)).toBe(-1);
    expect(s.status().loss.storage_failures).toBe(0);
  } finally {
    reader.exec("ROLLBACK");
    reader.close();
    s.close();
    await rm(p, { recursive: true, force: true });
  }
});
it("SQL4 materializes owned show, compare and export outside read snapshots", async () => {
  const p = await mkdtemp(join(tmpdir(), "todo-sql4-read-")),
    s = new RecordingDatabase(p),
    a = modelBatch(),
    b = modelBatch();
  s.ingest(a, 1);
  s.ingest(b, 1);
  let observed = 0;
  const parse = JSON.parse;
  const spy = vi.spyOn(JSON, "parse").mockImplementation((text: string) => {
    if (text.includes('"ui.action.started"')) {
      observed++;
      expect(s.db.inTransaction).toBe(false);
    }
    return parse(text);
  });
  try {
    expect(s.show(a.run.run_id).summary[0]?.starts).toBe(1);
    expect(s.compare(a.run.run_id, b.run.run_id).comparable).toBe(true);
    expect(s.export(a.run.run_id).batches[0]?.events.length).toBe(3);
    expect(observed).toBeGreaterThan(0);
  } finally {
    spy.mockRestore();
    s.close();
    await rm(p, { recursive: true, force: true });
  }
});
it("SQL5 issues no vacuum pragma and keeps the main file high-water allocation", async () => {
  const source = await readFile(
    new URL("../src/recording-database.ts", import.meta.url),
    "utf8",
  );
  expect(source).not.toContain("auto_vacuum=INCREMENTAL");
});
it("SQL6 refuses a foreign database without changing its bytes or directory and file modes", async () => {
  const p = await mkdtemp(join(tmpdir(), "todo-sql6-")),
    dir = join(p, "foreign");
  await mkdir(dir);
  const path = join(dir, "recordings.db"),
    db = new Database(path);
  db.exec("CREATE TABLE tasks(id TEXT)");
  db.close();
  await chmod(dir, 0o750);
  await chmod(path, 0o640);
  const bytes = await readFile(path);
  try {
    expect(() => new RecordingDatabase(dir)).toThrow(
      "Foreign database refused",
    );
    expect(await readFile(path)).toEqual(bytes);
    expect((await stat(path)).mode & 0o777).toBe(0o640);
    expect((await stat(dir)).mode & 0o777).toBe(0o750);
  } finally {
    await rm(p, { recursive: true, force: true });
  }
});
it("SQL5 leaves the main database at its high-water size after complete expiry", async () => {
  const p = await mkdtemp(join(tmpdir(), "todo-sql5-water-")),
    s = new RecordingDatabase(p);
  try {
    for (let i = 0; i < 100; i++) s.ingest(modelBatch(), 1);
    s.db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
    const before = (await stat(join(p, "recordings.db"))).size;
    while (s.maintenance(8 * 86400000) > 0) {}
    s.db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
    expect(s.status().bytes).toBe(0);
    expect((await stat(join(p, "recordings.db"))).size).toBe(before);
    const free =
      s.db.query<{ freelist_count: number }, []>("PRAGMA freelist_count").get()
        ?.freelist_count ?? 0;
    expect(free).toBeGreaterThan(0);
  } finally {
    s.close();
    await rm(p, { recursive: true, force: true });
  }
});

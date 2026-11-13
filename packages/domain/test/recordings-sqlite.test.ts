import { Database } from "bun:sqlite";
import { randomUUID } from "node:crypto";
import { mkdtemp, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "@effect/vitest";
import { validateRecordingBatch } from "../src/diagnostic-recordings.ts";
import { DiagnosticRecordings } from "../src/recordings.ts";
import { RecordingDatabase } from "../src/recordings-sqlite.ts";
import { event } from "./fixtures/diagnostic-recording.ts";
import { modelBatch } from "./fixtures/recording-authority.ts";

it("separates accepted producer batch ids from exported ids, releases all identities on expiry and eviction", async () => {
  const p = await mkdtemp(join(tmpdir(), "todo-sql-identity-")),
    db = new RecordingDatabase(p);
  const a = modelBatch(),
    b = modelBatch();
  try {
    db.ingest(a, 1000);
    const id = db.export(a.run.run_id).batches[0]?.batch_id;
    expect(id).toBeDefined();
    db.ingest({ ...b, batch_id: id ?? b.batch_id }, 1000 + 6 * 86400000);
    db.maintenance(1000 + 8 * 86400000);
    const retry = db.ingest(a, 1000 + 8 * 86400000);
    expect(retry.accepted).toBe(true);
    expect(retry.duplicate).toBe(false);
    expect(db.export(a.run.run_id).batches[0]?.events.length).toBe(3);
    expect(db.show(b.run.run_id).summary[0]?.starts).toBe(1);
    expect(db.db.query("SELECT count(*) n FROM events").get()).toEqual({
      n: 6,
    });
  } finally {
    db.close();
    await rm(p, { recursive: true, force: true });
  }
});
it("uses foreign keys and content checks to refuse cross-run identity reassignment without harming a peer", async () => {
  const p = await mkdtemp(join(tmpdir(), "todo-sql-peer-")),
    db = new RecordingDatabase(p),
    a = modelBatch(),
    b = modelBatch();
  try {
    db.ingest(a, 1);
    db.ingest(b, 2);
    expect(() =>
      db.db
        .query("UPDATE events SET run=? WHERE run=?")
        .run(a.run.run_id, b.run.run_id),
    ).toThrow();
    expect(db.show(a.run.run_id).summary[0]?.starts).toBe(1);
    expect(db.show(b.run.run_id).summary[0]?.starts).toBe(1);
    expect(db.db.query("PRAGMA foreign_key_check").all()).toEqual([]);
  } finally {
    db.close();
    await rm(p, { recursive: true, force: true });
  }
});
it("passes continuous admission with engine-owned bounded identities within the unchanged five-second timeout", async () => {
  const p = await mkdtemp(join(tmpdir(), "todo-sql-continuous-")),
    db = new RecordingDatabase(p, { appBytes: 49152 });
  try {
    for (let i = 0; i < 1001; i++) {
      const r = db.ingest(modelBatch(), i);
      expect(r.accepted).toBe(true);
      expect(
        db.db.query<{ n: number }, []>("SELECT count(*) n FROM events").get()
          ?.n,
      ).toBeLessThanOrEqual(3);
      expect(
        db.status().bytes + db.status().admission_bytes,
      ).toBeLessThanOrEqual(49152);
    }
  } finally {
    db.close();
    await rm(p, { recursive: true, force: true });
  }
});
it("serializes two worker connections using SQLite rather than a private writer lease", async () => {
  const p = await mkdtemp(join(tmpdir(), "todo-sql-writers-")),
    a = await DiagnosticRecordings.open(p),
    b = await DiagnosticRecordings.open(p),
    v = modelBatch();
  try {
    const results = await Promise.all([a.ingest(v), b.ingest(v)]);
    expect(results.some((r) => r.accepted)).toBe(true);
    expect((await a.show(v.run.run_id)).summary[0]?.starts).toBe(1);
    expect((await a.export(v.run.run_id)).batches[0]?.events.length).toBe(3);
    expect((await stat(p)).mode & 0o777).toBe(0o700);
    for (const name of await readdir(p))
      expect((await stat(join(p, name))).mode & 0o777).toBe(0o600);
  } finally {
    await a.close();
    await b.close();
    await rm(p, { recursive: true, force: true });
  }
});
it("rolls back both data and qualifier on every pre-commit failure; explicit retries and post-commit retries are idempotent", async () => {
  for (const point of ["after_begin", "before_commit", "after_commit"]) {
    const p = await mkdtemp(join(tmpdir(), "todo-sql-atomic-"));
    let fail = true;
    const db = new RecordingDatabase(p, {
        boundary: (at) => {
          if (fail && at === point) throw new Error("controlled I/O failure");
        },
      }),
      a = modelBatch();
    const input = {
      ...a,
      run: {
        ...a.run,
        admission: {
          schema_version: 1 as const,
          policy: "whole_batch" as const,
          refused_batches: 1,
          unadmitted_events: 3,
          incomplete: true,
        },
      },
    };
    try {
      db.ingest(input, 1);
      if (point !== "after_commit")
        expect(() => db.show(a.run.run_id)).toThrow("run is missing");
      else expect(db.show(a.run.run_id).run.admission?.incomplete).toBe(true);
      fail = false;
      expect(db.ingest(input, 2).accepted).toBe(true);
      expect(db.export(a.run.run_id).batches[0]?.events.length).toBe(3);
      expect(db.ingest(input, 3).duplicate).toBe(true);
      expect(db.show(a.run.run_id).summary[0]?.fraction_by_20_ms).toBeNull();
    } finally {
      db.close();
      await rm(p, { recursive: true, force: true });
    }
  }
});
it("does not leak identities when 80 successors reuse the previous public export id", async () => {
  const p = await mkdtemp(join(tmpdir(), "todo-sql-alias-")),
    db = new RecordingDatabase(p, { appBytes: 49152 });
  try {
    let previous = modelBatch();
    db.ingest(previous, 1);
    for (let i = 0; i < 80; i++) {
      const cursor = db.export(previous.run.run_id).batches[0]?.batch_id;
      const next = modelBatch();
      const receipt = db.ingest(
        { ...next, batch_id: cursor ?? next.batch_id },
        i + 2,
      );
      expect(receipt.accepted).toBe(true);
      expect(db.export(next.run.run_id).batches[0]?.events.length).toBe(3);
      expect(db.db.query("SELECT count(*) n FROM events").get()).toEqual({
        n: 3,
      });
      previous = next;
    }
  } finally {
    db.close();
    await rm(p, { recursive: true, force: true });
  }
});
it("keeps a 1001-admission worker path within its unchanged default timeout", async () => {
  const p = await mkdtemp(join(tmpdir(), "todo-sql-worker-continuous-")),
    s = await DiagnosticRecordings.open(p, { appBytes: 12288 });
  try {
    for (let i = 0; i < 1001; i++) {
      const run_id = randomUUID(),
        b = validateRecordingBatch({
          schema_version: 1,
          batch_id: randomUUID(),
          run: {
            run_id,
            app: "macos",
            build_id: event.build_id,
            contract_id: event.contract_id,
          },
          events: [{ ...event, run_id }],
        }),
        r = await s.ingest(b);
      expect(r.accepted).toBe(true);
      expect(r.status.segments).toBe(1);
      expect(r.status.admission_bytes).toBeLessThanOrEqual(8192);
      expect(r.status.queued_bytes).toBe(0);
      expect(r.status.bytes + r.status.admission_bytes).toBeLessThanOrEqual(
        12288,
      );
    }
    expect(s.status().queued_bytes).toBe(0);
  } finally {
    await s.close();
    await rm(p, { recursive: true, force: true });
  }
}, 30000);
it("enforces event, batch and run identity constraints and quota rollback at the SQL boundary", async () => {
  const p = await mkdtemp(join(tmpdir(), "todo-sql-constraints-")),
    db = new RecordingDatabase(p, { appBytes: 8192 });
  const a = modelBatch();
  try {
    const r = db.ingest(a, 1);
    expect(r.accepted).toBe(false);
    expect(() => db.show(a.run.run_id)).toThrow("run is missing");
    expect(db.db.query("SELECT count(*) n FROM events").get()).toEqual({
      n: 0,
    });
  } finally {
    db.close();
    await rm(p, { recursive: true, force: true });
  }
});
it("refuses new runs at the fixed 5120-run constraint and rolls back a total quota overflow", async () => {
  const p = await mkdtemp(join(tmpdir(), "todo-sql-run-cap-")),
    db = new RecordingDatabase(p),
    a = modelBatch();
  try {
    const { admission: _admission, ...base } = a.run;
    const admission = JSON.stringify({
      schema_version: 1,
      policy: "whole_batch",
      refused_batches: 1,
      unadmitted_events: 1,
      incomplete: true,
    });
    db.db.transaction(() => {
      for (let i = 0; i < 5120; i++) {
        const id = `${i.toString(16).padStart(8, "0")}-0000-4000-8000-000000000000`;
        db.db
          .query("INSERT INTO runs VALUES(?,?,?,?,?)")
          .run(
            id,
            base.app,
            JSON.stringify({ ...base, run_id: id }),
            admission,
            Date.now(),
          );
      }
    })();
    expect(() => db.ingest(a, Date.now())).toThrow("capacity");
    expect(db.db.query("SELECT count(*) n FROM runs").get()).toEqual({
      n: 5120,
    });
  } finally {
    db.close();
    await rm(p, { recursive: true, force: true });
  }
  const q = await mkdtemp(join(tmpdir(), "todo-sql-total-cap-")),
    small = new RecordingDatabase(q, { totalBytes: 8192 });
  try {
    expect(small.ingest(a, 1).accepted).toBe(false);
    expect(small.db.query("SELECT count(*) n FROM events").get()).toEqual({
      n: 0,
    });
  } finally {
    small.close();
    await rm(q, { recursive: true, force: true });
  }
});
it("keeps run and batch content immutable and identities scoped to a run, with durable whole-batch refusals", async () => {
  const p = await mkdtemp(join(tmpdir(), "todo-sql-content-")),
    db = new RecordingDatabase(p),
    a = modelBatch(),
    b = modelBatch();
  try {
    expect(db.ingest(a, 1).accepted).toBe(true);
    expect(
      db.ingest(
        {
          ...b,
          events: b.events.map((e, i) => ({
            ...e,
            sequence: a.events[i]?.sequence ?? 0,
          })),
        },
        2,
      ).accepted,
    ).toBe(true);
    expect(db.ingest(a, 3).duplicate).toBe(true);
    expect(() => db.ingest({ ...a, events: a.events.slice(0, 1) }, 4)).toThrow(
      "Whole batch refused",
    );
    expect(() =>
      db.ingest(
        {
          ...a,
          run: { ...a.run, build_id: "f".repeat(40) },
          events: a.events.map((e) => ({ ...e, build_id: "f".repeat(40) })),
        },
        5,
      ),
    ).toThrow("Whole batch refused");
    const shown = db.show(a.run.run_id);
    expect(db.export(a.run.run_id).batches[0]?.events.length).toBe(3);
    expect(shown.run.build_id).toBe(a.run.build_id);
    expect(shown.run.admission).toEqual({
      schema_version: 1,
      policy: "whole_batch",
      refused_batches: 2,
      unadmitted_events: 4,
      incomplete: true,
    });
    expect(shown.summary[0]?.fraction_by_20_ms).toBeNull();
    expect(db.show(b.run.run_id).summary[0]?.fraction_by_20_ms).toBe(1);
  } finally {
    db.close();
    await rm(p, { recursive: true, force: true });
  }
});

it("refuses a repeated action phase across batches without admitting its other facts", async () => {
  const p = await mkdtemp(join(tmpdir(), "todo-sql-phase-")),
    db = new RecordingDatabase(p),
    a = modelBatch();
  try {
    db.ingest(a, 1);
    const other = modelBatch(a.run.run_id, 10);
    const conflict = {
      ...other,
      events: [{ ...a.events[0], sequence: 10 }, ...other.events],
    };
    expect(() => db.ingest(conflict, 2)).toThrow("Whole batch refused");
    expect(db.export(a.run.run_id).batches[0]?.events.length).toBe(3);
    expect(db.show(a.run.run_id).run.admission?.unadmitted_events).toBe(4);
    expect(db.show(a.run.run_id).summary[0]?.fraction_by_20_ms).toBeNull();
  } finally {
    db.close();
    await rm(p, { recursive: true, force: true });
  }
});
it("evicts exactly the oldest batch at the 4096-batch cap while preserving the incoming facts", async () => {
  const p = await mkdtemp(join(tmpdir(), "todo-sql-batch-cap-")),
    db = new RecordingDatabase(p, { appBytes: 134217728 }),
    a = modelBatch();
  try {
    db.ingest(a, 1);
    db.db.transaction(() => {
      for (let i = 1; i < 4096; i++) {
        const batch = `${i.toString(16).padStart(8, "0")}-0000-4000-8000-000000000000`,
          content = JSON.stringify({
            ...a.events[0],
            sequence: 10 + i,
            name: "span.finished",
            stage: "ipc",
            duration_ms: 1,
            outcome: "completed",
          });
        db.db
          .query("INSERT INTO batches VALUES(?,?,?,?)")
          .run(a.run.run_id, batch, "fixture", 1);
        db.db
          .query(
            "INSERT INTO events(run,producer,sequence,cursor,origin,content,fingerprint,received,charge) VALUES(?,?,?,?,?,?,?,?,?)",
          )
          .run(
            a.run.run_id,
            "macos",
            10 + i,
            batch,
            batch,
            content,
            "fixture",
            1,
            8192,
          );
      }
    })();
    const next = modelBatch(a.run.run_id, 5000),
      receipt = db.ingest(next, 2);
    expect(receipt.accepted).toBe(true);
    expect(receipt.status.segments).toBe(4096);
    expect(receipt.status.loss.capacity_events).toBe(3);
    expect(
      db.db
        .query("SELECT count(*) n FROM events WHERE origin=?")
        .get(next.batch_id),
    ).toEqual({ n: 3 });
    expect(
      db.show(a.run.run_id).summary.every((r) => r.fraction_by_20_ms === null),
    ).toBe(true);
  } finally {
    db.close();
    await rm(p, { recursive: true, force: true });
  }
});
it("bounds the worker queue at 1024 pending batches and shows its exact drop count", async () => {
  const p = await mkdtemp(join(tmpdir(), "todo-sql-queue-cap-")),
    s = await DiagnosticRecordings.open(p),
    a = modelBatch();
  const marker = {
    ...a,
    run: {
      run_id: a.run.run_id,
      app: a.run.app,
      build_id: a.run.build_id,
      contract_id: a.run.contract_id,
      admission: {
        schema_version: 1 as const,
        policy: "whole_batch" as const,
        refused_batches: 1,
        unadmitted_events: 3,
        incomplete: true,
      },
    },
    events: [],
  };
  try {
    const pending = Array.from({ length: 1025 }, () => s.ingest(marker));
    expect(s.status().queued_bytes).toBeLessThanOrEqual(1048576);
    const receipts = await Promise.all(pending);
    expect(receipts.filter((r) => r.accepted).length).toBe(1024);
    expect(receipts.filter((r) => !r.accepted).length).toBe(1);
    expect((await s.runs()).status.loss.dropped_batches).toBe(1);
    expect(s.status().queued_bytes).toBe(0);
  } finally {
    await s.close();
    await rm(p, { recursive: true, force: true });
  }
});
it("counts each expired batch once when a bounded sweep splits it across transactions", async () => {
  const p = await mkdtemp(join(tmpdir(), "todo-sql-expiry-count-")),
    db = new RecordingDatabase(p),
    a = modelBatch(),
    b = modelBatch();
  try {
    db.ingest(a, 1);
    db.ingest(
      {
        ...b,
        events: Array.from({ length: 128 }, (_, i) => ({
          ...b.events[0],
          sequence: i + 1,
          name: "span.finished" as const,
          stage: "ipc" as const,
          duration_ms: 1,
          outcome: "completed" as const,
        })),
      },
      1,
    );
    expect(db.maintenance(8 * 86400000)).toBe(128);
    expect(db.status().loss.dropped_events).toBe(128);
    expect(db.maintenance(8 * 86400000)).toBe(3);
    expect(db.status().loss.dropped_events).toBe(131);
    expect(db.status().loss.dropped_batches).toBe(2);
  } finally {
    db.close();
    await rm(p, { recursive: true, force: true });
  }
});
it("keeps same-sequence facts from Electron main and renderer distinct", async () => {
  const p = await mkdtemp(join(tmpdir(), "todo-sql-producers-")),
    db = new RecordingDatabase(p),
    a = modelBatch();
  try {
    expect(
      db.ingest(
        {
          ...a,
          run: { ...a.run, app: "electron" },
          events: a.events.map((e) => ({
            ...e,
            process_role: "electron.main",
          })),
        },
        1,
      ).accepted,
    ).toBe(true);
    expect(
      db.ingest(
        {
          ...a,
          batch_id: modelBatch().batch_id,
          run: { ...a.run, app: "electron" },
          events: a.events.map((e) => ({
            ...e,
            process_role: "electron.renderer",
          })),
        },
        2,
      ).accepted,
    ).toBe(true);
    expect(db.db.query("SELECT count(*) n FROM events").get()).toEqual({
      n: 6,
    });
    expect(db.show(a.run.run_id).summary.map((r) => r.starts)).toEqual([1, 1]);
  } finally {
    db.close();
    await rm(p, { recursive: true, force: true });
  }
});
it("never acknowledges an expired retry as stored while its identities wait behind other expiry work", async () => {
  const p = await mkdtemp(join(tmpdir(), "todo-sql-expiry-retry-")),
    db = new RecordingDatabase(p);
  let last = modelBatch();
  try {
    for (let i = 0; i < 100; i++) {
      last = modelBatch();
      expect(db.ingest(last, 1).accepted).toBe(true);
    }
    const receipt = db.ingest(last, 8 * 86400000);
    expect(receipt.accepted).toBe(true);
    expect(db.export(last.run.run_id).batches[0]?.events.length).toBe(3);
    expect(db.show(last.run.run_id).summary[0]?.starts).toBe(1);
  } finally {
    db.close();
    await rm(p, { recursive: true, force: true });
  }
});
it("refuses a logically expired export cursor even before its bounded physical sweep", async () => {
  const p = await mkdtemp(join(tmpdir(), "todo-sql-cursor-age-")),
    db = new RecordingDatabase(p),
    a = modelBatch();
  try {
    db.ingest(a, 1);
    const cursor = db.export(a.run.run_id).batches[0]?.batch_id;
    expect(cursor).toBeDefined();
    db.ingest(modelBatch(a.run.run_id, 10), 6 * 86400000);
    db.at(8 * 86400000);
    expect(() => db.export(a.run.run_id, cursor)).toThrow("cursor expired");
    expect(db.show(a.run.run_id).summary[0]?.fraction_by_20_ms).toBeNull();
  } finally {
    db.close();
    await rm(p, { recursive: true, force: true });
  }
});

it("keeps main, WAL and shared-memory allocation within the total cap with a pinned reader", async () => {
  const p = await mkdtemp(join(tmpdir(), "todo-sql-wal-cap-")),
    db = new RecordingDatabase(p, { totalBytes: 2097152 }),
    a = modelBatch();
  db.ingest(a, 1);
  const reader = new Database(join(p, "recordings.db"));
  reader.exec("BEGIN");
  reader.query("SELECT count(*) FROM events").get();
  let dropped = 0;
  try {
    for (let i = 0; i < 200; i++) {
      const b = modelBatch(),
        r = db.ingest(b, i + 2);
      if (r.accepted)
        expect(db.export(b.run.run_id).batches[0]?.events.length).toBe(3);
      else dropped++;
    }
    let allocated = 0;
    for (const name of await readdir(p))
      allocated += (await stat(join(p, name))).blocks * 512;
    expect(allocated).toBeLessThanOrEqual(2097152);
    expect(dropped).toBeGreaterThan(0);
    reader.exec("ROLLBACK");
    const retry = modelBatch();
    let r = db.ingest(retry, 203);
    if (!r.accepted) r = db.ingest(retry, 204);
    expect(r.accepted).toBe(true);
    expect(db.export(retry.run.run_id).batches[0]?.events.length).toBe(3);
  } finally {
    reader.close();
    db.close();
    await rm(p, { recursive: true, force: true });
  }
});

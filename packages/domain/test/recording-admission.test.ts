import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "@effect/vitest";
import { validateRecordingBatch } from "../src/diagnostic-recordings.ts";
import { RecordingDatabase } from "../src/recordings-sqlite.ts";
import { modelBatch } from "./fixtures/recording-authority.ts";

it("durably marks whole refusal, admits its valid slow retry, and carries uncertainty through export/import and restart", async () => {
  const p = await mkdtemp(join(tmpdir(), "todo-sql-admission-"));
  let db = new RecordingDatabase(p);
  db.at(1002);
  const a = modelBatch();
  try {
    db.ingest(a, 1000);
    const start = {
      ...a.events[0],
      sequence: 4,
      action_id: randomUUID(),
      monotonic_ms: 40,
    };
    const bad = validateRecordingBatch({
      ...a,
      batch_id: randomUUID(),
      events: [
        { ...a.events[0], action_id: randomUUID() },
        start,
        {
          ...start,
          sequence: 5,
          name: "ui.result.committed",
          duration_ms: 10000,
          monotonic_ms: 10040,
          outcome: "completed",
          correct: true,
          render_stage: "layout_complete",
        },
      ],
    });
    expect(() => db.ingest(bad, 1001, true)).toThrow();
    expect(db.show(a.run.run_id).summary[0]?.fraction_by_20_ms).toBe(1);
    expect(() => db.ingest(bad, 1001)).toThrow("Whole batch refused");
    expect(db.show(a.run.run_id).run.admission).toEqual({
      schema_version: 1,
      policy: "whole_batch",
      refused_batches: 1,
      unadmitted_events: 3,
      incomplete: true,
    });
    expect(db.show(a.run.run_id).summary[0]?.fraction_by_20_ms).toBeNull();
    db.close();
    db = new RecordingDatabase(p);
    db.at(1002);
    expect(db.show(a.run.run_id).summary[0]?.fraction_by_300_ms).toBeNull();
    db.ingest(
      { ...bad, batch_id: randomUUID(), events: bad.events.slice(1) },
      1002,
    );
    expect(db.show(a.run.run_id).summary[0]?.p99_ms).toBe(10000);
    const copyPath = await mkdtemp(join(tmpdir(), "todo-sql-copy-")),
      copy = new RecordingDatabase(copyPath);
    try {
      let cursor: string | undefined;
      do {
        const page = db.export(a.run.run_id, cursor);
        copy.ingest(page.batches[0], 1003);
        cursor = page.next_cursor ?? undefined;
      } while (cursor);
      expect(copy.show(a.run.run_id).run.admission?.refused_batches).toBe(1);
      expect(copy.show(a.run.run_id).summary[0]?.fraction_by_20_ms).toBeNull();
      expect(() => copy.compare(a.run.run_id, a.run.run_id)).toThrow(
        "incomplete",
      );
    } finally {
      copy.close();
      await rm(copyPath, { recursive: true, force: true });
    }
  } finally {
    db.close();
    await rm(p, { recursive: true, force: true });
  }
});

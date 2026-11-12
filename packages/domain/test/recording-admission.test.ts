import { randomUUID } from "node:crypto";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "@effect/vitest";
import { validateRecordingBatch } from "../src/diagnostic-recordings.ts";
import { DiagnosticRecordings } from "../src/store/diagnostic-recordings.ts";
import { event, uuid } from "./fixtures/diagnostic-recording.ts";

const start = (run = uuid, sequence = 1) => ({
  ...event,
  run_id: run,
  sequence,
  action_id: randomUUID(),
  monotonic_ms: sequence * 10,
});
const complete = (
  a: ReturnType<typeof start>,
  sequence: number,
  duration_ms: number,
) => ({
  ...a,
  sequence,
  name: "ui.result.committed",
  monotonic_ms: a.monotonic_ms + duration_ms,
  duration_ms,
  outcome: "completed",
  correct: true,
  render_stage: "layout_complete",
});
const batch = (run: string, events: unknown[]) =>
  validateRecordingBatch({
    schema_version: 1,
    batch_id: randomUUID(),
    run: {
      run_id: run,
      app: "macos",
      build_id: event.build_id,
      contract_id: event.contract_id,
      comparison: {
        fixture_hash: "c".repeat(64),
        script_hash: "d".repeat(64),
        environment_hash: "e".repeat(64),
        configuration: "release",
        render_stage: "layout_complete",
        concurrency: 1,
      },
    },
    events,
  });
it("durably marks whole refusal, admits its valid slow retry, and carries uncertainty through eviction/export/import", async () => {
  const root = await mkdtemp(join(tmpdir(), "todo-admission-"));
  let store = await DiagnosticRecordings.open(join(root, "source"), {
    appBytes: 16384,
  });
  try {
    const a = start(),
      slow = start(uuid, 4),
      first = batch(uuid, [
        a,
        complete(a, 2, 8),
        {
          ...a,
          sequence: 3,
          name: "process.terminated",
          reason: "clean",
          monotonic_ms: 30,
        },
      ]);
    store.ingest(first);
    await store.flush();
    const bad = batch(uuid, [
      { ...a, action_id: randomUUID() },
      slow,
      complete(slow, 5, 10000),
    ]);
    expect(() => store.ingest(bad, true)).toThrow();
    await store.flush();
    expect((await store.show(uuid)).summary[0]?.fraction_by_20_ms).toBe(1);
    expect(() => store.ingest(bad)).toThrow("Whole batch refused");
    await store.flush();
    const marked = await store.show(uuid);
    expect(marked.run.admission).toEqual({
      schema_version: 1,
      policy: "whole_batch",
      refused_batches: 1,
      unadmitted_events: 3,
      incomplete: true,
    });
    expect(marked.summary[0]?.fraction_by_20_ms).toBeNull();
    expect(marked.summary[0]?.fraction_by_300_ms).toBeNull();
    expect(marked.summary[0]?.evidence).toBe("incomplete");
    store.ingest(batch(uuid, [slow, complete(slow, 5, 10000)]));
    await store.flush();
    const retried = await store.show(uuid);
    expect(retried.summary[0]?.p99_ms).toBe(10000);
    expect(retried.summary[0]?.fraction_by_300_ms).toBeNull();
    const page = await store.export(uuid);
    const copy = await DiagnosticRecordings.open(join(root, "copy"));
    try {
      for (const b of page.batches) copy.ingest(b);
      await copy.flush();
      expect((await copy.show(uuid)).run.admission?.refused_batches).toBe(1);
      expect((await copy.show(uuid)).summary[0]?.fraction_by_20_ms).toBeNull();
    } finally {
      await copy.close();
    }
    const cleanId = randomUUID(),
      clean = start(cleanId);
    store.ingest(batch(cleanId, [clean, complete(clean, 2, 8)]));
    await store.flush();
    expect((await store.show(cleanId)).summary[0]?.fraction_by_20_ms).toBe(1);
    await expect(store.compare(uuid, cleanId)).rejects.toThrow("incomplete");
    for (let n = 0; n < 6; n++) {
      const id = randomUUID(),
        a = start(id);
      store.ingest(batch(id, [a, complete(a, 2, 8)]));
      await store.flush();
    }
    expect((await store.show(uuid)).run.admission?.refused_batches).toBe(1);
    expect((await store.show(uuid)).summary).toEqual([]);
    await store.close();
    store = await DiagnosticRecordings.open(join(root, "source"), {
      appBytes: 16384,
    });
    expect((await store.show(uuid)).run.admission?.refused_batches).toBe(1);
    const empty = await store.export(uuid);
    expect(empty.batches[0]?.events).toEqual([]);
    const restored = await DiagnosticRecordings.open(join(root, "restored"));
    try {
      for (const b of empty.batches) restored.ingest(b);
      await restored.flush();
      expect((await restored.show(uuid)).run.admission?.refused_batches).toBe(
        1,
      );
    } finally {
      await restored.close();
    }
    expect(
      (await readdir(join(root, "source"))).some((name) =>
        name.endsWith(".admission.json"),
      ),
    ).toBe(true);
  } finally {
    await store.close();
    await rm(root, { recursive: true, force: true });
  }
});

it("bounds repeated refusal work, preserves metadata privacy, and expires only this run's mark", async () => {
  const root = await mkdtemp(join(tmpdir(), "todo-admission-burst-"));
  let now = 1000;
  const store = await DiagnosticRecordings.open(root, { now: () => now });
  try {
    const a = start(),
      first = batch(uuid, [a, complete(a, 2, 8)]);
    store.ingest(first);
    await store.flush();
    const bad = batch(uuid, [{ ...a, action_id: randomUUID() }]);
    for (let n = 0; n < 1000; n++)
      expect(() => store.ingest(bad)).toThrow("Whole batch refused");
    const jobs: unknown = Reflect.get(store, "admissionJobs");
    if (!(jobs instanceof Set)) throw new Error("Missing admission work");
    expect(jobs.size).toBe(1);
    await store.flush();
    expect((await store.show(uuid)).run.admission?.refused_batches).toBe(1000);
    expect((await store.show(uuid)).run.admission?.unadmitted_events).toBe(
      1000,
    );
    for (const key of ["title", "profile_name", "task_id", "path", "token"])
      expect(() =>
        validateRecordingBatch({
          ...first,
          run: {
            ...first.run,
            admission: {
              schema_version: 1,
              policy: "whole_batch",
              refused_batches: 1,
              unadmitted_events: 3,
              incomplete: true,
              [key]: "PRIVATE",
            },
          },
        }),
      ).toThrow();
    now += 7 * 86400000 + 1;
    expect((await store.runs()).runs).toEqual([]);
    expect(
      (await readdir(root)).some((name) => name.endsWith(".admission.json")),
    ).toBe(false);
  } finally {
    await store.close();
    await rm(root, { recursive: true, force: true });
  }
});

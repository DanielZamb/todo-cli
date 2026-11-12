import { randomUUID } from "node:crypto";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  unlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "@effect/vitest";
import { validateRecordingBatch } from "../src/diagnostic-recordings.ts";
import { DiagnosticRecordings } from "../src/store/diagnostic-recordings.ts";
import { RecordingAdmissions } from "../src/store/recording-admissions.ts";
import { event } from "./fixtures/diagnostic-recording.ts";

const make = (marked = false) => {
  const run_id = randomUUID();
  return validateRecordingBatch({
    schema_version: 1,
    batch_id: randomUUID(),
    run: {
      run_id,
      app: "macos",
      build_id: event.build_id,
      contract_id: event.contract_id,
      ...(marked
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
    events: [
      { ...event, run_id },
      {
        ...event,
        run_id,
        name: "ui.result.committed",
        sequence: 2,
        monotonic_ms: 18,
        duration_ms: 8,
        outcome: "completed",
        correct: true,
        render_stage: "layout_complete",
      },
      {
        ...event,
        run_id,
        name: "process.terminated",
        sequence: 3,
        monotonic_ms: 30,
        reason: "clean",
      },
    ],
  });
};
it("does not publish marked data after its mark fails, and an exact retry recovers", async () => {
  const root = await mkdtemp(join(tmpdir(), "todo-durability-import-"));
  const store = await DiagnosticRecordings.open(root);
  try {
    const batch = make(true),
      blocker = join(root, `${batch.run.run_id}.admission.json.tmp`);
    await mkdir(blocker);
    store.ingest(batch);
    await store.flush();
    expect(store.status().segments).toBe(0);
    expect(
      (await readdir(root)).filter((name) => /^\d{13}-/u.test(name)),
    ).toEqual([]);
    expect(store.admissionDurable(batch.run.run_id)).toBe(false);
    await rm(blocker, { recursive: true });
    const receipt = store.ingest(batch);
    await store.flush();
    expect(
      store.settledReceipt(receipt, batch.batch_id, batch.run.run_id)
        .durability,
    ).toBe("stored");
    expect(store.status().segments).toBe(1);
    const show = await store.show(batch.run.run_id);
    expect(show.run.admission).toEqual({
      schema_version: 1,
      policy: "whole_batch",
      refused_batches: 2,
      unadmitted_events: 6,
      incomplete: true,
    });
    expect(show.summary[0]?.fraction_by_20_ms).toBeNull();
    expect(show.summary[0]?.fraction_by_300_ms).toBeNull();
  } finally {
    await store.close();
    await rm(root, { recursive: true, force: true });
  }
});
it("an unchanged duplicate explicitly retries its dirty refusal mark once", async () => {
  const root = await mkdtemp(join(tmpdir(), "todo-durability-duplicate-"));
  const store = await DiagnosticRecordings.open(root);
  try {
    const batch = make(),
      blocker = join(root, `${batch.run.run_id}.admission.json.tmp`);
    store.ingest(batch);
    await store.flush();
    await mkdir(blocker);
    const conflict = validateRecordingBatch({
      ...batch,
      batch_id: randomUUID(),
      events: [{ ...batch.events[0], action_id: randomUUID() }],
    });
    expect(() => store.ingest(conflict)).toThrow("Whole batch refused");
    await store.flush();
    expect(store.admissionDurable(batch.run.run_id)).toBe(false);
    await rm(blocker, { recursive: true });
    const receipt = store.ingest(batch);
    await store.flush();
    expect(
      store.settledReceipt(receipt, batch.batch_id, batch.run.run_id)
        .durability,
    ).toBe("stored");
    expect(store.admissionDurable(batch.run.run_id)).toBe(true);
    expect(store.status().segments).toBe(1);
    expect(
      (await store.show(batch.run.run_id)).run.admission?.refused_batches,
    ).toBe(1);
  } finally {
    await store.close();
    await rm(root, { recursive: true, force: true });
  }
});
it("expires a never-written inactive mark idempotently without blocking a fresh run", async () => {
  const root = await mkdtemp(join(tmpdir(), "todo-durability-expiry-"));
  let now = 1000;
  const store = await DiagnosticRecordings.open(root, { now: () => now });
  try {
    await chmod(root, 0o500);
    const failed = make();
    store.ingest(failed);
    await store.flush();
    expect(store.admissionDurable(failed.run.run_id)).toBe(false);
    await chmod(root, 0o700);
    now += 6 * 86400000;
    const fresh = make();
    store.ingest(fresh);
    await store.flush();
    now += 2 * 86400000;
    for (let n = 0; n < 3; n++)
      expect((await store.runs()).runs.map((row) => row.run.run_id)).toEqual([
        fresh.run.run_id,
      ]);
    expect(
      (await store.show(fresh.run.run_id)).summary[0]?.fraction_by_20_ms,
    ).toBe(1);
    expect(store.status().admission_bytes).toBe(0);
    expect(store.status().segments).toBe(1);
  } finally {
    await chmod(root, 0o700);
    await store.close();
    await rm(root, { recursive: true, force: true });
  }
});

it("does not erase a new refusal that arrives while its old mark is expiring", async () => {
  const root = await mkdtemp(join(tmpdir(), "todo-durability-expiry-race-"));
  const admissions = new RecordingAdmissions(() => 4096),
    batch = make(true);
  try {
    admissions.merge(batch.run, 1000);
    await admissions.persist(batch.run.run_id, (name, text) =>
      writeFile(join(root, name), text),
    );
    const now = 1000 + 8 * 86400000;
    const expired = admissions.expire(root, now, () => new Set());
    admissions.refuse(batch.run, 3, now);
    await expired;
    expect(admissions.state(batch.run.run_id).refused_batches).toBe(2);
    expect(admissions.dirty(batch.run.run_id)).toBe(true);
    expect(admissions.bytes()).toBe(4096);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

it("retains and dirties an expiring mark when qualifying data arrives during unlink", async () => {
  const root = await mkdtemp(join(tmpdir(), "todo-durability-expiry-active-"));
  const admissions = new RecordingAdmissions(() => 4096),
    batch = make(true),
    active = new Set<string>();
  try {
    admissions.merge(batch.run, 1000);
    await admissions.persist(batch.run.run_id, (name, text) =>
      writeFile(join(root, name), text),
    );
    const expired = admissions.expire(root, 1000 + 8 * 86400000, () => active);
    active.add(batch.run.run_id);
    await expired;
    expect(admissions.state(batch.run.run_id).refused_batches).toBe(1);
    expect(admissions.dirty(batch.run.run_id)).toBe(true);
    expect(admissions.bytes()).toBe(4096);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

const dataStates = ["present", "absent", "partial_temp"] as const;
const markStates = [
  "present",
  "absent",
  "partial_temp",
  "corrupt_final",
] as const;
for (const dataState of dataStates)
  for (const markState of markStates)
    it(`recovers, exports, evicts and expires data=${dataState}, mark=${markState}`, async () => {
      const root = await mkdtemp(join(tmpdir(), "todo-durability-files-"));
      let now = 1000;
      let store = await DiagnosticRecordings.open(root, {
        appBytes: 16384,
        now: () => now,
      });
      try {
        const batch = make(true);
        store.ingest(batch);
        await store.flush();
        await store.close();
        const data = (await readdir(root)).find((name) =>
          /^\d{13}-/u.test(name),
        );
        if (!data) throw new Error("Missing committed data fixture");
        if (dataState !== "present") {
          const text = await readFile(join(root, data), "utf8");
          await unlink(join(root, data));
          if (dataState === "partial_temp")
            await writeFile(join(root, `${data}.tmp`), text.slice(0, 40));
        }
        const mark = join(root, `${batch.run.run_id}.admission.json`);
        if (markState !== "present") await unlink(mark);
        if (markState === "partial_temp")
          await writeFile(`${mark}.tmp`, '{"updated_at":');
        if (markState === "corrupt_final")
          await writeFile(mark, '{"updated_at":');
        store = await DiagnosticRecordings.open(root, {
          appBytes: 16384,
          now: () => now,
        });
        if (markState === "corrupt_final") {
          await expect(store.runs()).rejects.toThrow("metadata is unavailable");
          await expect(store.export(batch.run.run_id)).rejects.toThrow(
            "metadata is unavailable",
          );
          expect(store.status().loss.storage_failures).toBe(1);
          return;
        }
        expect(
          (await readdir(root)).filter((name) => name.endsWith(".tmp")),
        ).toEqual([]);
        const exists = dataState === "present" || markState === "present";
        if (exists) {
          const show = await store.show(batch.run.run_id);
          expect(show.run.admission?.incomplete).toBe(true);
          expect(show.run.admission?.refused_batches).toBe(1);
          expect(show.summary.length).toBe(dataState === "present" ? 1 : 0);
          if (dataState === "present")
            expect(show.summary[0]?.fraction_by_20_ms).toBeNull();
          const exported = await store.export(batch.run.run_id);
          expect(exported.batches[0]?.run.admission?.incomplete).toBe(true);
          expect(exported.batches[0]?.events.length).toBe(
            dataState === "present" ? 3 : 0,
          );
          expect(store.status().admission_bytes).toBe(4096);
        } else {
          expect((await store.runs()).runs).toEqual([]);
          await expect(store.export(batch.run.run_id)).rejects.toThrow(
            "run is missing",
          );
        }
        now += 6 * 86400000;
        for (let n = 0; n < 4; n++) {
          store.ingest(make());
          await store.flush();
        }
        if (exists) {
          expect((await store.show(batch.run.run_id)).summary).toEqual([]);
          expect(
            (await store.export(batch.run.run_id)).batches[0]?.events,
          ).toEqual([]);
          expect(
            (await store.export(batch.run.run_id)).batches[0]?.run.admission
              ?.incomplete,
          ).toBe(true);
        }
        now += 2 * 86400000;
        const runs = await store.runs();
        expect(
          runs.runs.some((row) => row.run.run_id === batch.run.run_id),
        ).toBe(false);
        expect(runs.runs.length).toBeGreaterThanOrEqual(1);
        expect(runs.status.admission_bytes).toBe(0);
        expect(
          (await readdir(root)).filter((name) =>
            name.endsWith(".admission.json"),
          ),
        ).toEqual([]);
      } finally {
        await store.close();
        await rm(root, { recursive: true, force: true });
      }
    });

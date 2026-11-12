import {
  mkdtemp,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "@effect/vitest";
import { validateRecordingBatch } from "../src/diagnostic-recordings.ts";
import {
  recordingsComparable,
  summarizeRecording,
} from "../src/diagnostic-run-summary.ts";
import { DiagnosticRecordings } from "../src/store/diagnostic-recordings.ts";
import { event, uuid } from "./fixtures/diagnostic-recording.ts";

const batch = (id = uuid) =>
  validateRecordingBatch({
    schema_version: 1,
    batch_id: id,
    run: {
      run_id: uuid,
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
    events: [event],
  });
it("refuses all content and nested unknown metadata without echo", () => {
  for (const key of [
    "title",
    "task_id",
    "profile_name",
    "search_text",
    "path",
    "token",
  ]) {
    expect(() =>
      validateRecordingBatch({ ...batch(), [key]: "private" }),
    ).toThrow();
    expect(() =>
      validateRecordingBatch({
        ...batch(),
        events: [{ ...event, metadata: { [key]: "private" } }],
      }),
    ).toThrow();
  }
});
it("counts unmatched starts, rendered actions, and loss in the denominator", () => {
  const second = "22222222-2222-4222-8222-222222222222";
  const events = validateRecordingBatch({
    ...batch(),
    events: [
      event,
      {
        ...event,
        sequence: 2,
        name: "ui.result.committed",
        duration_ms: 8,
        outcome: "completed",
        correct: true,
        render_stage: "layout_complete",
      },
      { ...event, sequence: 3, action_id: second, monotonic_ms: 20 },
    ],
  }).events;
  const row = summarizeRecording(events)[0];
  expect(row?.starts).toBe(2);
  expect(row?.by_outcome.pending).toBe(1);
  expect(row?.p50_ms).toBe(8);
  expect(row?.fraction_by_20_ms).toBe(0.5);
  expect(
    recordingsComparable(batch().run, {
      ...batch().run,
      build_id: "f".repeat(40),
    }),
  ).toBe(true);
  expect(
    recordingsComparable(batch().run, {
      ...batch().run,
      contract_id: "f".repeat(64),
    }),
  ).toBe(false);
});
it("bounds private storage, deduplicates retries, recovers and counts expired/evicted events", async () => {
  const root = await mkdtemp(join(tmpdir(), "todo-recording-test-"));
  let now = 1000;
  try {
    const store = await DiagnosticRecordings.open(join(root, "recordings"), {
      appBytes: 4096,
      totalBytes: 32768,
      now: () => now,
    });
    const one = batch();
    expect(store.ingest(one, true).dry_run).toBe(true);
    expect(store.status().queued_bytes).toBe(0);
    expect(store.ingest(one).accepted).toBe(true);
    await store.flush();
    expect(store.ingest(one).duplicate).toBe(true);
    now++;
    store.ingest(batch("22222222-2222-4222-8222-222222222222"));
    await store.flush();
    expect(store.status().bytes).toBeLessThanOrEqual(4096);
    expect(store.status().loss.capacity_events).toBe(1);
    expect((await stat(join(root, "recordings"))).mode & 0o777).toBe(0o700);
    for (const f of await readdir(join(root, "recordings")))
      expect((await stat(join(root, "recordings", f))).mode & 0o777).toBe(
        0o600,
      );
    const again = await DiagnosticRecordings.open(join(root, "recordings"), {
      now: () => now,
    });
    expect((await again.runs()).runs[0]?.events).toBe(1);
    now += 8 * 86400000;
    expect((await again.runs()).runs).toEqual([]);
    expect(again.status().loss.expired_events).toBe(1);
    await writeFile(join(root, "recordings", "orphan.tmp"), "bad");
    const recovered = await DiagnosticRecordings.open(join(root, "recordings"));
    expect(recovered.status().loss.corrupt_segments).toBe(1);
    expect(await readdir(join(root, "recordings"))).not.toContain("orphan.tmp");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
it("contains an unwritable journal and preserves an explicit loss receipt", async () => {
  const root = await mkdtemp(join(tmpdir(), "todo-recording-fault-"));
  try {
    const path = join(root, "blocked");
    await writeFile(path, "file");
    const store = await DiagnosticRecordings.open(path);
    expect(store.ingest(batch()).accepted).toBe(false);
    expect(store.status().loss.dropped_events).toBe(1);
    expect(await readFile(path, "utf8")).toBe("file");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
it("refuses a conflicting retry with the same batch id", async () => {
  const root = await mkdtemp(join(tmpdir(), "todo-recording-collision-"));
  try {
    const store = await DiagnosticRecordings.open(root);
    store.ingest(batch());
    await store.flush();
    expect(() =>
      store.ingest(
        validateRecordingBatch({
          ...batch(),
          events: [{ ...event, monotonic_ms: 999 }],
        }),
      ),
    ).toThrow();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
it("marks clock discontinuity and client loss explicitly", async () => {
  const root = await mkdtemp(join(tmpdir(), "todo-recording-clock-"));
  try {
    const store = await DiagnosticRecordings.open(root);
    store.ingest(
      validateRecordingBatch({
        ...batch(),
        events: [
          event,
          {
            ...event,
            sequence: 2,
            monotonic_ms: 5,
            name: "recording.loss",
            lost_starts: 3,
            dropped_events: 4,
          },
        ],
      }),
    );
    await store.flush();
    const show = await store.show(uuid);
    expect(show.clock_discontinuities).toBe(1);
    expect(show.summary[0]?.starts).toBe(4);
    expect(show.summary[0]?.by_outcome.lost).toBe(3);
    expect(show.summary[0]?.evidence).toBe("incomplete");
    expect(show.summary[0]?.oldest_incomplete_ms).toBe(null);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
it("contains a disk failure after admission and accounts every dropped event", async () => {
  const root = await mkdtemp(join(tmpdir(), "todo-recording-disk-"));
  const directory = join(root, "journal");
  try {
    const store = await DiagnosticRecordings.open(directory);
    await rm(directory, { recursive: true });
    await writeFile(directory, "blocked");
    expect(store.ingest(batch()).accepted).toBe(true);
    await store.flush();
    expect(store.status().loss.dropped_events).toBe(1);
    expect(store.status().loss.storage_failures).toBeGreaterThanOrEqual(1);
    expect(store.status().queued_bytes).toBe(0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
it("keeps an input swallowed before its handler in the denominator", () => {
  const events = validateRecordingBatch({
    ...batch(),
    events: [
      { ...event, name: "ui.input.observed" },
      {
        ...event,
        name: "process.terminated",
        reason: "crashed",
        sequence: 2,
        monotonic_ms: 40,
      },
    ],
  }).events;
  const row = summarizeRecording(events)[0];
  expect(row?.starts).toBe(1);
  expect(row?.by_outcome.crashed).toBe(1);
  expect(row?.p50_ms).toBe(null);
  expect(row?.fraction_by_20_ms).toBe(0);
});
it("does not mark a fresh complete run incomplete because a different run expired", async () => {
  const root = await mkdtemp(join(tmpdir(), "todo-recording-scoped-loss-"));
  let now = 1000;
  try {
    const store = await DiagnosticRecordings.open(root, { now: () => now });
    store.ingest(batch());
    await store.flush();
    now += 8 * 86400000;
    await store.runs();
    const id = "33333333-3333-4333-8333-333333333333";
    store.ingest(
      validateRecordingBatch({
        ...batch("44444444-4444-4444-8444-444444444444"),
        run: { ...batch().run, run_id: id },
        events: [
          { ...event, run_id: id },
          {
            ...event,
            run_id: id,
            name: "ui.result.committed",
            sequence: 2,
            monotonic_ms: 18,
            duration_ms: 8,
            outcome: "completed",
            correct: true,
            render_stage: "layout_complete",
          },
        ],
      }),
    );
    await store.flush();
    const show = await store.show(id);
    expect(show.status.loss.expired_events).toBe(1);
    expect(show.summary[0]?.evidence).toBe("sparse");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
it("recovers every accepted UUID spelling including uppercase batch ids", async () => {
  const root = await mkdtemp(join(tmpdir(), "todo-recording-uppercase-"));
  try {
    const value = batch("AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA");
    const store = await DiagnosticRecordings.open(root);
    store.ingest(value);
    await store.flush();
    const reopened = await DiagnosticRecordings.open(root);
    expect((await reopened.runs()).runs).toHaveLength(1);
    expect(reopened.ingest(value).duplicate).toBe(true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
it("does not invent an all-start deadline fraction after missing sequence data", async () => {
  const root = await mkdtemp(join(tmpdir(), "todo-recording-gap-"));
  try {
    const store = await DiagnosticRecordings.open(root);
    store.ingest(
      validateRecordingBatch({
        ...batch(),
        events: [
          { ...event, sequence: 100 },
          {
            ...event,
            name: "ui.result.committed",
            sequence: 101,
            monotonic_ms: 18,
            duration_ms: 8,
            outcome: "completed",
            correct: true,
            render_stage: "layout_complete",
          },
        ],
      }),
    );
    await store.flush();
    const show = await store.show(uuid);
    expect(show.sequence_gaps).toBe(99);
    expect(show.summary[0]?.starts).toBe(1);
    expect(show.summary[0]?.p50_ms).toBe(8);
    expect(show.summary[0]?.fraction_by_20_ms).toBe(null);
    expect(show.summary[0]?.fraction_by_300_ms).toBe(null);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
it("does not subtract monotonic clocks or infer a crash across producers", () => {
  const events = validateRecordingBatch({
    ...batch(),
    run: { ...batch().run, app: "electron" },
    events: [
      { ...event, process_role: "electron.renderer" },
      {
        ...event,
        process_role: "electron.main",
        name: "process.terminated",
        reason: "crashed",
        monotonic_ms: 100000,
      },
    ],
  }).events;
  const row = summarizeRecording(events)[0];
  expect(row?.oldest_incomplete_ms).toBe(0);
  expect(row?.by_outcome.pending).toBe(1);
  expect(row?.by_outcome.crashed).toBe(0);
});
it("the public pure summary also treats an unknown denominator as unknown", () => {
  const events = validateRecordingBatch({
    ...batch(),
    events: [
      { ...event, sequence: 100 },
      {
        ...event,
        name: "ui.result.committed",
        sequence: 101,
        monotonic_ms: 18,
        duration_ms: 8,
        outcome: "completed",
        correct: true,
        render_stage: "layout_complete",
      },
    ],
  }).events;
  expect(summarizeRecording(events)[0]?.fraction_by_20_ms).toBe(null);
});
it("counts a failed action without inventing a rendered completion", () => {
  const events = validateRecordingBatch({
    ...batch(),
    events: [
      event,
      {
        ...event,
        name: "ui.action.ended",
        sequence: 2,
        monotonic_ms: 18,
        duration_ms: 8,
        outcome: "failed",
      },
    ],
  }).events;
  const row = summarizeRecording(events)[0];
  expect(row?.starts).toBe(1);
  expect(row?.by_outcome.failed).toBe(1);
  expect(row?.completed_samples).toBe(0);
  expect(row?.p50_ms).toBe(null);
  expect(row?.fraction_by_20_ms).toBe(0);
});
it("compares declared conditions independently of JSON property order", () => {
  const original = batch().run;
  const c = original.comparison;
  const reordered = {
    ...original,
    comparison: {
      concurrency: c.concurrency,
      render_stage: c.render_stage,
      configuration: c.configuration,
      environment_hash: c.environment_hash,
      script_hash: c.script_hash,
      fixture_hash: c.fixture_hash,
    },
  };
  expect(recordingsComparable(original, reordered)).toBe(true);
});
it("recognizes an equivalent batch with reordered JSON keys as a retry", async () => {
  const root = await mkdtemp(join(tmpdir(), "todo-recording-key-order-"));
  const reverse = (value: unknown): unknown =>
    Array.isArray(value)
      ? value.map(reverse)
      : value !== null && typeof value === "object"
        ? Object.fromEntries(
            Object.entries(value)
              .reverse()
              .map(([key, item]) => [key, reverse(item)]),
          )
        : value;
  try {
    const store = await DiagnosticRecordings.open(root);
    store.ingest(batch());
    await store.flush();
    expect(
      store.ingest(validateRecordingBatch(reverse(batch()))).duplicate,
    ).toBe(true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

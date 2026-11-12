import { expect, it } from "@effect/vitest";
import { validateRecordingBatch } from "../src/diagnostic-recordings.ts";
import {
  recordingsComparable,
  summarizeRecording,
} from "../src/diagnostic-run-summary.ts";
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
  if (!c) throw new Error("The controlled fixture needs comparison metadata");
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

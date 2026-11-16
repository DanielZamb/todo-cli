import { expect, it } from "@effect/vitest";
import { summarizeInteractions } from "../src/client-diagnostics.ts";
import { validateRecordingBatch } from "../src/diagnostic-recordings.ts";
import {
  analyzeRecording,
  recordingClockDiscontinuities,
  recordingObservations,
  recordingSequenceGaps,
  summarizeRecording,
} from "../src/diagnostic-run-summary.ts";
import { uniqueRecordingEvents } from "../src/recording-event-identity.ts";
import { event, uuid } from "./fixtures/diagnostic-recording.ts";

const second = "22222222-2222-4222-8222-222222222222";
const events = (run_id: string, duration_ms: number, clock: number) =>
  validateRecordingBatch({
    schema_version: 1,
    batch_id: run_id,
    run: {
      run_id,
      app: "macos",
      build_id: event.build_id,
      contract_id: event.contract_id,
    },
    events: [
      { ...event, run_id, monotonic_ms: clock },
      {
        ...event,
        run_id,
        name: "ui.result.committed",
        sequence: 2,
        monotonic_ms: clock + duration_ms,
        duration_ms,
        outcome: "completed",
        correct: true,
        render_stage: "layout_complete",
      },
    ],
  }).events;
it("keeps 8 ms and 400 ms runs separate through every exported event reducer", () => {
  const input = [...events(uuid, 8, 100), ...events(second, 400, 1)];
  expect(uniqueRecordingEvents(input)).toHaveLength(4);
  expect(recordingObservations(input)).toHaveLength(2);
  for (const rows of [
    analyzeRecording(input).summary,
    summarizeRecording(input),
    summarizeInteractions(recordingObservations(input)),
  ]) {
    expect(
      rows.map((row) => [
        row.run_id,
        row.starts,
        row.p50_ms,
        row.fraction_by_20_ms,
        row.fraction_by_300_ms,
      ]),
    ).toEqual([
      [uuid, 1, 8, 1, 1],
      [second, 1, 400, 0, 0],
    ]);
  }
  expect(recordingClockDiscontinuities(input)).toBe(0);
  expect(recordingSequenceGaps(input)).toBe(0);
});
it("isolates crashes, pending ages and uncertainty by run", () => {
  const pending = events(uuid, 8, 100)[0];
  if (!pending) throw new Error("Missing fixture");
  const crashed = validateRecordingBatch({
    schema_version: 1,
    batch_id: second,
    run: {
      run_id: second,
      app: "macos",
      build_id: event.build_id,
      contract_id: event.contract_id,
    },
    events: [
      { ...pending, run_id: second, monotonic_ms: 1 },
      {
        ...pending,
        run_id: second,
        name: "process.terminated",
        sequence: 2,
        monotonic_ms: 500,
        reason: "crashed",
      },
    ],
  }).events;
  const rows = analyzeRecording([pending, ...crashed]).summary;
  expect(
    rows.map((row) => [
      row.run_id,
      row.by_outcome.pending,
      row.by_outcome.crashed,
      row.oldest_incomplete_ms,
    ]),
  ).toEqual([
    [uuid, 1, 0, 0],
    [second, 0, 1, 499],
  ]);
  const badClock = events(uuid, 8, 100).map((event, index) => ({
    ...event,
    monotonic_ms: index ? 90 : 100,
  }));
  const mixed = analyzeRecording([...badClock, ...events(second, 400, 1)]);
  expect(mixed.summary[0]?.fraction_by_20_ms).toBeNull();
  expect(mixed.summary[1]?.fraction_by_300_ms).toBe(0);
});

it("applies external admission uncertainty only to the matching run", () => {
  const input = [...events(uuid, 8, 100), ...events(second, 400, 1)];
  const marks = new Map([
    [
      uuid,
      {
        schema_version: 1 as const,
        policy: "whole_batch" as const,
        refused_batches: 1,
        unadmitted_events: 3,
        incomplete: true,
      },
    ],
  ]);
  for (const rows of [
    analyzeRecording(input, false, marks).summary,
    summarizeRecording(input, marks),
  ]) {
    expect(rows[0]?.fraction_by_20_ms).toBeNull();
    expect(rows[0]?.evidence).toBe("incomplete");
    expect(rows[1]?.fraction_by_20_ms).toBe(0);
    expect(rows[1]?.fraction_by_300_ms).toBe(0);
    expect(rows[1]?.p99_ms).toBe(400);
  }
});

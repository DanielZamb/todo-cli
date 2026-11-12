import { randomUUID } from "node:crypto";
import { expect, it } from "@effect/vitest";
import { validateRecordingBatch } from "../src/diagnostic-recordings.ts";
import {
  recordingComparisonRefusal,
  summarizeRecording,
} from "../src/diagnostic-run-summary.ts";
import { event, uuid } from "./fixtures/diagnostic-recording.ts";

const batch = (run = uuid) =>
  validateRecordingBatch({
    schema_version: 1,
    batch_id: randomUUID(),
    run: {
      run_id: run,
      app: "macos",
      build_id: event.build_id,
      contract_id: event.contract_id,
    },
    events: [{ ...event, run_id: run }],
  });
it("uses the same conflict rule in the public pure reducer", () => {
  const first = batch();
  const conflicting = validateRecordingBatch({
    ...batch(),
    events: [{ ...event, action_id: randomUUID() }],
  });
  expect(() =>
    summarizeRecording([...first.events, ...conflicting.events]),
  ).toThrow("Recording sequence conflicts");
  expect(
    summarizeRecording([...first.events, ...first.events])[0]?.starts,
  ).toBe(1);
});

it("refuses two contradictory results for one action instead of keeping the faster first one", () => {
  const events = validateRecordingBatch({
    ...batch(),
    events: [
      event,
      {
        ...event,
        sequence: 2,
        monotonic_ms: 18,
        name: "ui.result.committed",
        duration_ms: 8,
        outcome: "completed",
        correct: true,
        render_stage: "layout_complete",
      },
      {
        ...event,
        sequence: 3,
        monotonic_ms: 10010,
        name: "ui.result.committed",
        duration_ms: 10000,
        outcome: "failed",
        correct: false,
        render_stage: "layout_complete",
      },
    ],
  }).events;
  expect(() => summarizeRecording(events)).toThrow(
    "Recording action phases conflict",
  );
});

it("names each safe comparison refusal without returning any condition value", () => {
  const before = {
    ...batch().run,
    comparison: {
      fixture_hash: "c".repeat(64),
      script_hash: "d".repeat(64),
      environment_hash: "e".repeat(64),
      configuration: "release",
      render_stage: "layout_complete",
      concurrency: 1,
    } as const,
  };
  expect(recordingComparisonRefusal(before, before)).toBeUndefined();
  expect(recordingComparisonRefusal(before, batch().run)).toBe(
    "missing_comparison",
  );
  expect(
    recordingComparisonRefusal(before, { ...before, build_id: "dev" }),
  ).toBe("unknown_build");
  expect(
    recordingComparisonRefusal(before, { ...before, contract_id: "unknown" }),
  ).toBe("unknown_contract");
  expect(recordingComparisonRefusal(before, { ...before, app: "cli" })).toBe(
    "app_mismatch",
  );
  expect(
    recordingComparisonRefusal(before, {
      ...before,
      contract_id: "f".repeat(64),
    }),
  ).toBe("contract_mismatch");
  for (const [after, reason] of [
    [
      { ...before.comparison, fixture_hash: "f".repeat(64) },
      "fixture_mismatch",
    ],
    [{ ...before.comparison, script_hash: "f".repeat(64) }, "script_mismatch"],
    [
      { ...before.comparison, environment_hash: "f".repeat(64) },
      "environment_mismatch",
    ],
    [
      { ...before.comparison, configuration: "unknown" },
      "unknown_configuration",
    ],
    [
      { ...before.comparison, configuration: "debug" },
      "configuration_mismatch",
    ],
    [{ ...before.comparison, render_stage: "unknown" }, "unknown_render_stage"],
    [
      { ...before.comparison, render_stage: "unavailable" },
      "unknown_render_stage",
    ],
    [
      { ...before.comparison, render_stage: "presented_frame" },
      "render_stage_mismatch",
    ],
    [{ ...before.comparison, concurrency: 2 }, "concurrency_mismatch"],
  ] as const)
    expect(
      recordingComparisonRefusal(before, { ...before, comparison: after }),
    ).toBe(reason);
});

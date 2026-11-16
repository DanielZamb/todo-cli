import { randomUUID } from "node:crypto";
import { validateRecordingBatch } from "../../src/diagnostic-recordings.ts";
import { event } from "./diagnostic-recording.ts";
export const modelBatch = (run_id: string = randomUUID(), offset = 0) => {
  const a = {
    ...event,
    run_id,
    action_id: randomUUID(),
    sequence: offset + 1,
    monotonic_ms: offset * 1000 + 10,
  };
  return validateRecordingBatch({
    schema_version: 1,
    batch_id: randomUUID(),
    run: {
      run_id,
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
    events: [
      a,
      {
        ...a,
        sequence: offset + 2,
        name: "ui.result.committed",
        duration_ms: 8,
        monotonic_ms: a.monotonic_ms + 8,
        outcome: "completed",
        correct: true,
        render_stage: "layout_complete",
      },
      {
        ...a,
        sequence: offset + 3,
        name: "process.terminated",
        reason: "clean",
        monotonic_ms: a.monotonic_ms + 9,
      },
    ],
  });
};

import { Schema } from "effect";
import { DiagnosticCount } from "./client-diagnostics.ts";
import type { RecordingBatch } from "./diagnostic-recordings.ts";

const safeCount = DiagnosticCount.check(
  Schema.isLessThanOrEqualTo(Number.MAX_SAFE_INTEGER),
);
export const RecordingAdmission = Schema.Struct({
  schema_version: Schema.Literal(1),
  policy: Schema.Literal("whole_batch"),
  refused_batches: Schema.NullOr(safeCount),
  unadmitted_events: Schema.NullOr(safeCount),
  incomplete: Schema.Boolean,
});
export type RecordingAdmission = typeof RecordingAdmission.Type;
export const emptyRecordingAdmission = (): RecordingAdmission => ({
  schema_version: 1,
  policy: "whole_batch",
  refused_batches: 0,
  unadmitted_events: 0,
  incomplete: false,
});
export const admissionIncomplete = (state: RecordingAdmission | undefined) =>
  !!state &&
  (state.incomplete ||
    state.refused_batches === null ||
    state.unadmitted_events === null ||
    state.refused_batches > 0 ||
    state.unadmitted_events > 0);
export function recordingRunDefinition(run: RecordingBatch["run"]) {
  const { admission: _admission, ...definition } = run;
  return definition;
}

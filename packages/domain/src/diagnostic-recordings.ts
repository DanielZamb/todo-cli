import { Schema } from "effect";
import {
  DiagnosticCount,
  DiagnosticEvent,
  DiagnosticMetric,
  DiagnosticProcessRole,
  DiagnosticRunId,
  RenderStage,
} from "./client-diagnostics.ts";

export const recordingLimits = {
  batchBytes: 131072,
  batchEvents: 128,
  queueBytes: 1048576,
  appBytes: 32 * 1024 * 1024,
  totalBytes: 256 * 1024 * 1024,
  retentionMs: 7 * 86400000,
  segments: 4096,
} as const;
const hash = Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/u));
export const RecordingApp = Schema.Literals([
  "macos",
  "electron",
  "cli",
  "server",
]);
export const RecordingRun = Schema.Struct({
  run_id: DiagnosticRunId,
  app: RecordingApp,
  build_id: DiagnosticEvent.members[0].fields.build_id,
  contract_id: DiagnosticEvent.members[0].fields.contract_id,
  comparison: Schema.Struct({
    fixture_hash: hash,
    script_hash: hash,
    environment_hash: hash,
    configuration: Schema.Literals(["release", "debug", "unknown"]),
    render_stage: RenderStage,
    concurrency: Schema.Int.check(
      Schema.isBetween({ minimum: 1, maximum: 1024 }),
    ),
  }),
});
export const RecordingBatch = Schema.Struct({
  schema_version: Schema.Literal(1),
  batch_id: DiagnosticRunId,
  run: RecordingRun,
  events: Schema.Array(DiagnosticEvent).check(
    Schema.isMinLength(1),
    Schema.isMaxLength(recordingLimits.batchEvents),
  ),
}).annotate({ parseOptions: { onExcessProperty: "error" } });
export type RecordingBatch = typeof RecordingBatch.Type;
export const RecordingLoss = Schema.Struct({
  dropped_batches: DiagnosticCount,
  dropped_events: DiagnosticCount,
  expired_events: DiagnosticCount,
  capacity_events: DiagnosticCount,
  storage_failures: DiagnosticCount,
  corrupt_segments: DiagnosticCount,
  duplicate_batches: DiagnosticCount,
  uncertain_restarts: DiagnosticCount,
});
export const RecordingStatus = Schema.Struct({
  bytes: DiagnosticCount,
  queued_bytes: DiagnosticCount,
  segments: DiagnosticCount,
  loss: RecordingLoss,
});
export const RecordingReceipt = Schema.Struct({
  generated_at: Schema.String,
  accepted: Schema.Boolean,
  durability: Schema.Literals(["validated", "queued", "stored", "dropped"]),
  duplicate: Schema.Boolean,
  dry_run: Schema.Boolean,
  events: DiagnosticCount,
  status: RecordingStatus,
});
export const RecordingRunItem = Schema.Struct({
  run: RecordingRun,
  events: DiagnosticCount,
  bytes: DiagnosticCount,
  batches: DiagnosticCount,
});
export const RecordingRunList = Schema.Struct({
  generated_at: Schema.String,
  runs: Schema.Array(RecordingRunItem).check(Schema.isMaxLength(100)),
  next_cursor: Schema.NullOr(DiagnosticCount),
  status: RecordingStatus,
});
export const RecordingExport = Schema.Struct({
  generated_at: Schema.String,
  batches: Schema.Array(RecordingBatch).check(Schema.isMaxLength(1)),
  next_cursor: Schema.NullOr(DiagnosticRunId),
  status: RecordingStatus,
});
const outcomes = Schema.Struct({
  completed: DiagnosticCount,
  pending: DiagnosticCount,
  superseded: DiagnosticCount,
  refused: DiagnosticCount,
  conflicted: DiagnosticCount,
  failed: DiagnosticCount,
  cancelled: DiagnosticCount,
  unavailable: DiagnosticCount,
  crashed: DiagnosticCount,
  timed_out: DiagnosticCount,
  lost: DiagnosticCount,
});
export const RecordingSummaryRow = Schema.Struct({
  process_role: DiagnosticProcessRole,
  category: DiagnosticEvent.members[0].fields.category,
  mode: DiagnosticEvent.members[0].fields.mode,
  input_kind: DiagnosticEvent.members[0].fields.input_kind,
  workload: DiagnosticEvent.members[0].fields.workload,
  starts: DiagnosticCount,
  completed_samples: DiagnosticCount,
  by_outcome: outcomes,
  p50_ms: Schema.NullOr(DiagnosticMetric),
  p90_ms: Schema.NullOr(DiagnosticMetric),
  p99_ms: Schema.NullOr(DiagnosticMetric),
  max_ms: Schema.NullOr(DiagnosticMetric),
  by_20_ms: DiagnosticCount,
  by_300_ms: DiagnosticCount,
  fraction_by_20_ms: Schema.NullOr(DiagnosticMetric),
  fraction_by_300_ms: Schema.NullOr(DiagnosticMetric),
  oldest_incomplete_ms: Schema.NullOr(DiagnosticMetric),
  evidence: Schema.Literals(["incomplete", "unproven", "sparse", "complete"]),
});
export const RecordingShow = Schema.Struct({
  generated_at: Schema.String,
  run: RecordingRun,
  summary: Schema.Array(RecordingSummaryRow).check(Schema.isMaxLength(256)),
  omitted_groups: DiagnosticCount,
  clock_discontinuities: DiagnosticCount,
  sequence_gaps: DiagnosticCount,
  recovery_uncertain: Schema.Boolean,
  unattributed_lost_starts: DiagnosticCount,
  status: RecordingStatus,
});
export const RecordingCompare = Schema.Struct({
  generated_at: Schema.String,
  before: RecordingShow,
  after: RecordingShow,
  comparable: Schema.Literal(true),
});

export function validateRecordingBatch(input: unknown): RecordingBatch {
  const value = Schema.decodeUnknownSync(RecordingBatch, {
    onExcessProperty: "error",
  })(input);
  if (
    new TextEncoder().encode(JSON.stringify(value)).length >
    recordingLimits.batchBytes
  )
    throw new Error("Invalid recording");
  const roles =
    value.run.app === "electron"
      ? ["electron.main", "electron.renderer"]
      : value.run.app === "server"
        ? ["server", "scheduler"]
        : [value.run.app];
  const sequences = new Set<string>();
  for (const event of value.events) {
    if (
      event.sequence > 4294967295 ||
      (event.name === "recording.loss" &&
        (event.lost_starts > 1000000000 || event.dropped_events > 1000000000))
    )
      throw new Error("Invalid recording counters");
    if (
      event.run_id !== value.run.run_id ||
      event.build_id !== value.run.build_id ||
      event.contract_id !== value.run.contract_id ||
      !roles.includes(event.process_role) ||
      sequences.has(`${event.process_role}:${event.sequence}`)
    )
      throw new Error("Invalid recording");
    sequences.add(`${event.process_role}:${event.sequence}`);
  }
  return value;
}

export const RecordingImportResult = Schema.Struct({
  generated_at: Schema.String,
  dry_run: Schema.Boolean,
  accepted_batches: DiagnosticCount,
  events: DiagnosticCount,
  status: RecordingStatus,
});

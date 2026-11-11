import { Schema, Struct } from "effect";
import {
  DiagnosticCommitReceipt,
  DiagnosticCount,
  DiagnosticEnvelope,
  DiagnosticFrameId,
  DiagnosticMetric,
  DiagnosticOutcome,
  DiagnosticRequestId,
  DiagnosticRunId,
  DiagnosticStage,
  DiagnosticStreamId,
} from "./client-diagnostics.ts";

export const diagnosticBuckets = [
  1, 4, 8, 16, 20, 50, 100, 300, 1000, 5000,
] as const;
export const DiagnosticSpanSummary = Schema.Struct({
  key: Schema.String,
  started: DiagnosticCount,
  finished: DiagnosticCount,
  unfinished: DiagnosticCount,
  p50_ms: Schema.NullOr(DiagnosticMetric),
  p90_ms: Schema.NullOr(DiagnosticMetric),
  p99_ms: Schema.NullOr(DiagnosticMetric),
  outcomes: Schema.Array(DiagnosticCount).check(
    Schema.isMinLength(5),
    Schema.isMaxLength(5),
  ),
});
type Outcome = "completed" | "refused" | "conflicted" | "failed" | "cancelled";
const outcomes = [
  "completed",
  "refused",
  "conflicted",
  "failed",
  "cancelled",
] as const;
const state = () => ({
  started: 0,
  finished: 0,
  buckets: Array<number>(11).fill(0),
  outcomes: Array<number>(5).fill(0),
});
type State = ReturnType<typeof state>;
const project = (
  key: string,
  value: State,
): typeof DiagnosticSpanSummary.Type => {
  const quantile = (q: number) => {
    if (!value.finished) return null;
    let count = 0;
    for (let i = 0; i < value.buckets.length; i++) {
      count += value.buckets[i] ?? 0;
      if (count >= Math.ceil(value.finished * q))
        return diagnosticBuckets[i] ?? null;
    }
    return null;
  };
  return {
    key,
    started: value.started,
    finished: value.finished,
    unfinished: value.started - value.finished,
    p50_ms: quantile(0.5),
    p90_ms: quantile(0.9),
    p99_ms: quantile(0.99),
    outcomes: [...value.outcomes],
  };
};
export class DiagnosticSummaries {
  private readonly stages = new Map<string, State>();
  private readonly categories = new Map<string, State>();
  private readonly all = state();
  private entry(map: Map<string, State>, key: string) {
    const accepted = map.has(key) || map.size < 64 ? key : "unknown";
    let value = map.get(accepted);
    if (!value) {
      value = state();
      map.set(accepted, value);
    }
    return value;
  }
  start(
    stage: typeof DiagnosticStage.Type,
    category: typeof DiagnosticEnvelope.Type.category.inventory_id,
  ) {
    for (const value of [
      this.all,
      this.entry(this.stages, stage),
      this.entry(this.categories, category),
    ])
      value.started++;
  }
  finish(
    stage: typeof DiagnosticStage.Type,
    category: typeof DiagnosticEnvelope.Type.category.inventory_id,
    duration: number,
    outcome: Outcome,
  ) {
    const bucket = diagnosticBuckets.findIndex((bound) => duration <= bound);
    for (const value of [
      this.all,
      this.entry(this.stages, stage),
      this.entry(this.categories, category),
    ]) {
      value.finished++;
      const at = bucket === -1 ? 10 : bucket;
      value.buckets[at] = (value.buckets[at] ?? 0) + 1;
      const index = outcomes.indexOf(outcome);
      value.outcomes[index] = (value.outcomes[index] ?? 0) + 1;
    }
  }
  snapshot() {
    return {
      unit: "span" as const,
      quantiles: "histogram_upper_bound" as const,
      outcome_order: [...outcomes],
      histogram: {
        upper_ms: [...diagnosticBuckets, null],
        counts: [...this.all.buckets],
      },
      stages: [...this.stages]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, value]) => project(key, value)),
      categories: [...this.categories]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, value]) => project(key, value)),
    };
  }
}

export const DiagnosticProfilerDetail = Schema.Struct({
  schema_version: Schema.Literal(1),
  run_id: DiagnosticRunId,
  enabled: Schema.Boolean,
  capacity: DiagnosticCount,
  active_capacity: DiagnosticCount,
  started: DiagnosticCount,
  finished: DiagnosticCount,
  lost_starts: DiagnosticCount,
  dropped_events: DiagnosticCount,
  recording_failures: DiagnosticCount,
  active: Schema.Array(
    Schema.Struct({
      ...DiagnosticEnvelope.fields,
      name: Schema.Literal("span.started"),
      stage: DiagnosticStage,
    }),
  ),
  recent: Schema.Array(
    Schema.Struct({
      ...DiagnosticEnvelope.fields,
      name: Schema.Literal("span.finished"),
      stage: DiagnosticStage,
      duration_ms: Schema.Finite.check(Schema.isGreaterThanOrEqualTo(0)),
      outcome: DiagnosticOutcome,
    }),
  ),
  deliveries: Schema.Array(
    Schema.Struct({
      ...DiagnosticEnvelope.fields,
      name: Schema.Literal("stream.delivery"),
      stream_id: DiagnosticStreamId,
      frame_id: DiagnosticFrameId,
      commit_receipt: DiagnosticCommitReceipt,
      stage: Schema.Literals(["commit_seen", "transport_handoff"]),
      bytes: Schema.NullOr(DiagnosticCount),
    }),
  ),
  unobserved: Schema.Array(
    Schema.Literals([
      "socket_accept_to_entry",
      "worker_queue",
      "socket_handoff",
      "body_completion",
      "client_receipt",
      "cross_process_commit",
      "encoding",
      "database_other",
      "graph_computation",
      "search_preparation",
      "search_meter",
      "command_startup",
      "stdout_drain",
    ]),
  ),
});

export const SlowSpan = Schema.Struct({
  stage: DiagnosticStage,
  duration_ms: DiagnosticMetric,
  outcome: DiagnosticOutcome,
  request_id: Schema.optionalKey(DiagnosticRequestId),
});
export const diagnosticDeliverySampleCapacity = 16;
const runFields = ["run_id", "build_id", "contract_id"] as const;
export const DiagnosticProfilerSample = Schema.Struct({
  schema_version: Schema.Literal(1),
  run_id: DiagnosticRunId,
  build_id: DiagnosticEnvelope.fields.build_id,
  contract_id: DiagnosticEnvelope.fields.contract_id,
  total_active: DiagnosticCount,
  total_recent: DiagnosticCount,
  total_deliveries: DiagnosticCount,
  active: Schema.Array(
    Schema.Struct(
      Struct.omit(
        DiagnosticProfilerDetail.fields.active.value.fields,
        runFields,
      ),
    ),
  ).check(Schema.isMaxLength(4)),
  recent: Schema.Array(
    Schema.Struct(
      Struct.omit(
        DiagnosticProfilerDetail.fields.recent.value.fields,
        runFields,
      ),
    ),
  ).check(Schema.isMaxLength(32)),
  deliveries: Schema.Array(
    Schema.Struct(
      Struct.omit(
        DiagnosticProfilerDetail.fields.deliveries.value.fields,
        runFields,
      ),
    ),
  ).check(Schema.isMaxLength(diagnosticDeliverySampleCapacity)),
});
export const DiagnosticProfiler = Schema.Struct({
  schema_version: Schema.Literal(2),
  run_id: DiagnosticRunId,
  enabled: Schema.Boolean,
  capacity: DiagnosticCount,
  active_capacity: DiagnosticCount,
  started: DiagnosticCount,
  finished: DiagnosticCount,
  lost_starts: DiagnosticCount,
  dropped_events: DiagnosticCount,
  recording_failures: DiagnosticCount,
  active: DiagnosticCount,
  unit: Schema.Literal("span"),
  quantiles: Schema.Literal("histogram_upper_bound"),
  outcome_order: Schema.Array(
    Schema.Literals([
      "completed",
      "refused",
      "conflicted",
      "failed",
      "cancelled",
    ]),
  ).check(Schema.isMinLength(5), Schema.isMaxLength(5)),
  histogram: Schema.Struct({
    upper_ms: Schema.Array(Schema.NullOr(Schema.Finite)).check(
      Schema.isMinLength(11),
      Schema.isMaxLength(11),
    ),
    counts: Schema.Array(DiagnosticCount).check(
      Schema.isMinLength(11),
      Schema.isMaxLength(11),
    ),
  }),
  stages: Schema.Array(DiagnosticSpanSummary).check(Schema.isMaxLength(65)),
  categories: Schema.Array(DiagnosticSpanSummary).check(Schema.isMaxLength(65)),
  slow: Schema.Array(SlowSpan).check(Schema.isMaxLength(8)),
  budget_bytes: Schema.Literals([49152, 65536]),
  omitted: Schema.Record(Schema.String, DiagnosticCount),
  detail: Schema.optionalKey(DiagnosticProfilerSample),
  unobserved: DiagnosticProfilerDetail.fields.unobserved,
});

// Shared event schemas and frozen-run summaries define one versioned vocabulary.
import { Option, Schema } from "effect";
import { InteractionCategory } from "./interaction-categories.ts";

export const DiagnosticMetric = Schema.Finite.check(
  Schema.isGreaterThanOrEqualTo(0),
);
export const DiagnosticCount = Schema.Int.check(
  Schema.isGreaterThanOrEqualTo(0),
);
const uuid = Schema.String.check(
  Schema.isPattern(
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu,
  ),
);
export const DiagnosticRunId = uuid.pipe(Schema.brand("DiagnosticRunId"));
export const DiagnosticActionId = uuid.pipe(Schema.brand("DiagnosticActionId"));
export const DiagnosticTraceId = uuid.pipe(Schema.brand("DiagnosticTraceId"));
export const DiagnosticSpanId = uuid.pipe(Schema.brand("DiagnosticSpanId"));
export const DiagnosticRequestId = uuid.pipe(
  Schema.brand("DiagnosticRequestId"),
);
export const DiagnosticRefreshId = uuid.pipe(
  Schema.brand("DiagnosticRefreshId"),
);
export const DiagnosticStreamId = uuid.pipe(Schema.brand("DiagnosticStreamId"));
export const DiagnosticFrameId = uuid.pipe(Schema.brand("DiagnosticFrameId"));
export const DiagnosticCommitReceipt = uuid.pipe(
  Schema.brand("DiagnosticCommitReceipt"),
);
export const DiagnosticProcessRole = Schema.Literals([
  "server",
  "cli",
  "scheduler",
  "electron.main",
  "electron.renderer",
  "macos",
  "unknown",
]);
export const DiagnosticOutcome = Schema.Literals([
  "completed",
  "pending",
  "superseded",
  "refused",
  "conflicted",
  "failed",
  "cancelled",
  "unavailable",
  "crashed",
  "timed_out",
  "lost",
]);
export const RenderStage = Schema.Literals([
  "input_echo",
  "model_published",
  "layout_complete",
  "paint_opportunity",
  "presented_frame",
  "stdout_drain",
  "unknown",
  "unavailable",
]);
export const DiagnosticCapability = Schema.Literals([
  "observed",
  "unavailable",
  "unknown",
]);
export const DiagnosticReason = Schema.Literals([
  "signedOut",
  "outdatedServer",
  "initialLoad",
  "query",
  "write",
  "offline",
  "ready",
  "cancelled",
  "cleanEnd",
  "timeout",
  "transport",
  "authorization",
  "deletedProfile",
  "reload",
  "contractMismatch",
  "unsupported",
  "not_observed",
  "other",
  "unknown",
]);
export const DiagnosticStage = Schema.Literals([
  "entry",
  "authentication",
  "writer_lock_wait",
  "handler",
  "domain",
  "database",
  "projection",
  "graph",
  "search_preparation",
  "search_evaluation",
  "search_meter",
  "encoding",
  "response_handoff",
  "body_completion",
  "worker_queue",
  "command",
  "job",
  "stdout",
  "ipc",
  "decode",
]);
export const DiagnosticRouteOperation = Schema.Literals([
  "health",
  "diagnostics",
  "auth",
  "profiles",
  "tasks.list",
  "tasks.show",
  "tasks.write",
  "history",
  "graph",
  "search",
  "stream",
  "snapshots",
  "attachments",
  "discovery",
  "other",
  "unmatched",
]);
export const DiagnosticStatement = Schema.Literals([
  "auth.credential",
  "store.read",
  "store.write",
  "store.begin",
  "store.commit",
  "store.rollback",
  "store.projection",
  "store.graph",
  "stream.tail",
  "scheduler.due",
  "unknown",
]);
export const DiagnosticMetadata = Schema.Struct({
  operation: Schema.optionalKey(DiagnosticRouteOperation),
  statement: Schema.optionalKey(DiagnosticStatement),
  rows: Schema.optionalKey(DiagnosticCount),
  bytes: Schema.optionalKey(DiagnosticCount),
  work_units: Schema.optionalKey(DiagnosticMetric),
  cache: Schema.optionalKey(
    Schema.Literals(["hit", "miss", "bypass", "unknown"]),
  ),
  error: Schema.optionalKey(
    Schema.Literals([
      "unauthorized",
      "forbidden",
      "conflict",
      "validation",
      "not_found",
      "internal",
      "aborted",
      "unknown",
    ]),
  ),
});
const identity = {
  run_id: DiagnosticRunId,
  process_role: DiagnosticProcessRole,
  build_id: Schema.String.check(Schema.isPattern(/^(?:[a-f0-9]{8,64}|dev)$/u)),
  contract_id: Schema.String.check(
    Schema.isPattern(/^(?:[a-f0-9]{64}|unknown)$/u),
  ),
  mode: Schema.Literals(["full", "compact", "terminal", "headless", "unknown"]),
  input_kind: Schema.Literals([
    "pointer",
    "keyboard",
    "menu",
    "accessibility",
    "notification",
    "command",
    "background",
    "unknown",
  ]),
  workload: Schema.Literals([
    "cold",
    "warm",
    "empty",
    "error",
    "refusal",
    "large",
    "diagnostics_open",
    "diagnostics_closed",
    "catch_up",
    "unknown",
  ]),
};
export const DiagnosticCategory = Schema.Union([
  InteractionCategory,
  Schema.Struct({
    inventory_id: Schema.Literal("unknown"),
    subtype: Schema.Literal("unknown"),
  }),
]).annotate({ identifier: "DiagnosticCategory" });
export const DiagnosticEnvelope = Schema.Struct({
  schema_version: Schema.Literal(1),
  ...identity,
  category: DiagnosticCategory,
  request_id: Schema.optionalKey(DiagnosticRequestId),
  refresh_id: Schema.optionalKey(DiagnosticRefreshId),
  sequence: DiagnosticCount,
  monotonic_ms: DiagnosticMetric,
  clock_unit: Schema.Literal("ms"),
  wall_anchor_ms: Schema.optionalKey(DiagnosticMetric),
  trace_id: DiagnosticTraceId,
  span_id: DiagnosticSpanId,
  parent_span_id: Schema.optionalKey(DiagnosticSpanId),
  action_id: Schema.optionalKey(DiagnosticActionId),
  metadata: Schema.optionalKey(DiagnosticMetadata),
});
const trigger = Schema.Literals([
  "startup",
  "profileSwitch",
  "viewChange",
  "filterChange",
  "search",
  "ownWrite",
  "streamOperation",
  "streamReady",
  "reconnect",
  "manual",
  "dayChange",
  "clockChange",
  "wake",
  "activation",
  "unknown",
]);
const action = { action_id: DiagnosticActionId };
const duration = { duration_ms: DiagnosticMetric };
const request = { request_id: DiagnosticRequestId };
const refresh = { refresh_id: DiagnosticRefreshId };
const generation = { generation: DiagnosticCount };
const stream = { stream_id: DiagnosticStreamId };
const event = <const Fields extends Schema.Struct.Fields>(fields: Fields) => {
  const merged: Omit<typeof DiagnosticEnvelope.fields, keyof Fields> & Fields =
    {
      ...DiagnosticEnvelope.fields,
      ...fields,
    };
  return Schema.Struct(merged);
};
const payloads = [
  event({ name: Schema.Literal("ui.input.observed"), ...action }),
  event({ name: Schema.Literal("ui.action.started"), ...action }),
  event({
    name: Schema.Literal("ui.result.committed"),
    ...action,
    ...duration,
    outcome: DiagnosticOutcome,
    render_stage: RenderStage,
    correct: Schema.Boolean,
  }),
  event({
    name: Schema.Literal("ui.action.ended"),
    ...action,
    ...duration,
    outcome: DiagnosticOutcome,
  }),
  event({
    name: Schema.Literal("model.published"),
    ...generation,
    visible_rows: DiagnosticCount,
    total_rows: DiagnosticCount,
  }),
  event({
    name: Schema.Literal("ui.layout.finished"),
    ...generation,
    ...duration,
  }),
  event({
    name: Schema.Literal("ui.layout.committed"),
    ...generation,
    ...duration,
  }),
  event({
    name: Schema.Literal("ui.selection.committed"),
    ...action,
    ...generation,
  }),
  event({
    name: Schema.Literal("ui.inspector.committed"),
    ...action,
    ...generation,
  }),
  event({
    name: Schema.Literal("ui.stall"),
    ...duration,
    expected_cadence_ms: DiagnosticMetric,
  }),
  event({
    name: Schema.Literal("refresh.started"),
    ...refresh,
    trigger,
  }),
  event({
    name: Schema.Literal("refresh.finished"),
    ...refresh,
    ...duration,
    outcome: DiagnosticOutcome,
    request_count: DiagnosticCount,
  }),
  event({
    name: Schema.Literal("request.started"),
    ...request,
    method: Schema.Literals([
      "GET",
      "POST",
      "PATCH",
      "DELETE",
      "PUT",
      "HEAD",
      "OPTIONS",
    ]),
    operation: DiagnosticRouteOperation,
  }),
  event({
    name: Schema.Literal("request.headers"),
    ...request,
    ...duration,
    status: DiagnosticCount,
  }),
  event({
    name: Schema.Literal("request.finished"),
    ...request,
    ...duration,
    outcome: DiagnosticOutcome,
  }),
  event({
    name: Schema.Literal("decode.finished"),
    ...request,
    ...duration,
  }),
  event({
    name: Schema.Literal("server.handled"),
    ...request,
    ...duration,
    status: DiagnosticCount,
  }),
  event({ name: Schema.Literal("stream.connected"), ...stream }),
  event({
    name: Schema.Literal("stream.dropped"),
    ...stream,
    reason: DiagnosticReason,
  }),
  event({
    name: Schema.Literal("stream.delivery"),
    ...stream,
    frame_id: DiagnosticFrameId,
    commit_receipt: DiagnosticCommitReceipt,
    stage: Schema.Literals(["commit_seen", "transport_handoff"]),
    bytes: Schema.NullOr(DiagnosticCount),
  }),
  event({
    name: Schema.Literal("span.started"),
    stage: DiagnosticStage,
  }),
  event({
    name: Schema.Literal("span.finished"),
    stage: DiagnosticStage,
    ...duration,
    outcome: DiagnosticOutcome,
  }),
  event({
    name: Schema.Literal("resources.sampled"),
    capability: DiagnosticCapability,
    reason: DiagnosticReason,
    descriptors: Schema.optionalKey(DiagnosticCount),
    sockets: Schema.optionalKey(DiagnosticCount),
    soft_limit: Schema.optionalKey(DiagnosticCount),
    hard_limit: Schema.optionalKey(DiagnosticCount),
    sample_ms: Schema.optionalKey(DiagnosticMetric),
  }),
  event({
    name: Schema.Literal("availability.changed"),
    loading: Schema.Boolean,
    busy: Schema.Boolean,
    data_ready: Schema.Boolean,
    write_allowed: Schema.Boolean,
    reason: DiagnosticReason,
  }),
  event({
    name: Schema.Literal("recording.loss"),
    lost_starts: DiagnosticCount,
    dropped_events: DiagnosticCount,
  }),
  event({
    name: Schema.Literal("process.terminated"),
    reason: Schema.Literals(["clean", "crashed", "unknown"]),
  }),
] as const;
export const DiagnosticEvent = Schema.Union(payloads);
export type DiagnosticEvent = typeof DiagnosticEvent.Type;
export type DiagnosticEventOf<Name extends DiagnosticEvent["name"]> = Extract<
  DiagnosticEvent,
  { readonly name: Name }
>;
type RequiredEnvelopeKeys = {
  [Key in keyof typeof DiagnosticEnvelope.Type]-?: Pick<
    typeof DiagnosticEnvelope.Type,
    Key
  > extends Required<Pick<typeof DiagnosticEnvelope.Type, Key>>
    ? Key
    : never;
}[keyof typeof DiagnosticEnvelope.Type];
export type DiagnosticPayloads = {
  readonly [Name in DiagnosticEvent["name"]]: Omit<
    DiagnosticEventOf<Name>,
    RequiredEnvelopeKeys
  >;
};
export const makeDiagnosticEvent = (value: DiagnosticEvent): DiagnosticEvent =>
  Schema.decodeUnknownSync(DiagnosticEvent, { onExcessProperty: "error" })(
    value,
  );
export const UnknownDiagnosticRecord = Schema.Struct({
  kind: Schema.Literal("unknown"),
  reason: Schema.Literals([
    "unknown_event",
    "unknown_version",
    "invalid_record",
  ]),
});
const header = Schema.Struct({
  schema_version: Schema.Number,
  name: Schema.String,
});
export function decodeDiagnosticEvent(
  input: unknown,
):
  | { readonly kind: "known"; readonly event: DiagnosticEvent }
  | typeof UnknownDiagnosticRecord.Type {
  const decoded = Schema.decodeUnknownOption(DiagnosticEvent, {
    onExcessProperty: "error",
  })(input);
  if (Option.isSome(decoded)) return { kind: "known", event: decoded.value };
  const identity = Schema.decodeUnknownOption(header)(input);
  const reason =
    Option.isSome(identity) && identity.value.schema_version !== 1
      ? "unknown_version"
      : Option.isSome(identity) &&
          !payloads.some((x) => x.fields.name.literal === identity.value.name)
        ? "unknown_event"
        : "invalid_record";
  return { kind: "unknown", reason };
}
export const decodeRenderStage = (input: unknown) =>
  Option.getOrElse(
    Schema.decodeUnknownOption(RenderStage)(input),
    () => "unknown" as const,
  );
export const decodeDiagnosticCapability = (input: unknown) =>
  Option.getOrElse(
    Schema.decodeUnknownOption(DiagnosticCapability)(input),
    () => "unknown" as const,
  );

const observationScope = { ...identity, category: InteractionCategory };
const renderedOutcome = Schema.Literals([
  "completed",
  "refused",
  "conflicted",
  "failed",
]);
export const DiagnosticObservation = Schema.Union([
  Schema.Struct({
    ...observationScope,
    kind: Schema.Literal("rendered"),
    outcome: renderedOutcome,
    duration_ms: DiagnosticMetric,
    correct: Schema.Boolean,
    render_stage: RenderStage,
  }),
  Schema.Struct({
    ...observationScope,
    kind: Schema.Literal("unfinished"),
    outcome: Schema.Literals([
      "pending",
      "superseded",
      "cancelled",
      "unavailable",
      "crashed",
      "timed_out",
      "lost",
    ]),
    age_ms: Schema.NullOr(DiagnosticMetric),
    count: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)),
  }),
]);
export type DiagnosticObservation = typeof DiagnosticObservation.Type;
const quantile = (sorted: readonly number[], q: number) =>
  sorted[Math.ceil(sorted.length * q) - 1] ?? null;
const strongStage = (stage: typeof RenderStage.Type) =>
  [
    "layout_complete",
    "paint_opportunity",
    "presented_frame",
    "stdout_drain",
  ].includes(stage);
export function summarizeInteractions(
  observations: readonly DiagnosticObservation[],
) {
  const groups = new Map<string, DiagnosticObservation[]>();
  for (const sample of observations) {
    const key = JSON.stringify([
      sample.run_id,
      sample.process_role,
      sample.build_id,
      sample.contract_id,
      sample.category.inventory_id,
      sample.category.subtype,
      sample.mode,
      sample.input_kind,
      sample.workload,
    ]);
    const group = groups.get(key);
    if (group) group.push(sample);
    else groups.set(key, [sample]);
  }
  return [...groups.values()].map((samples) => {
    const first = samples[0];
    if (!first) throw new Error("Empty diagnostic group");
    const by_outcome = {
      completed: 0,
      pending: 0,
      superseded: 0,
      refused: 0,
      conflicted: 0,
      failed: 0,
      cancelled: 0,
      unavailable: 0,
      crashed: 0,
      timed_out: 0,
      lost: 0,
    };
    const durations: number[] = [];
    let by_20_ms = 0,
      by_300_ms = 0,
      starts = 0,
      oldest_incomplete_ms: number | null = null;
    let unfinished = false,
      unproven = false;
    for (const sample of samples) {
      const count = sample.kind === "rendered" ? 1 : sample.count;
      starts += count;
      by_outcome[sample.outcome] += count;
      if (sample.kind === "rendered") {
        durations.push(sample.duration_ms);
        if (
          sample.outcome === "failed" ||
          !sample.correct ||
          !strongStage(sample.render_stage)
        )
          unproven = true;
        else {
          if (sample.duration_ms <= 20) by_20_ms++;
          if (sample.duration_ms <= 300) by_300_ms++;
        }
      } else {
        unfinished = true;
        if (sample.age_ms !== null)
          oldest_incomplete_ms = Math.max(
            oldest_incomplete_ms ?? 0,
            sample.age_ms,
          );
      }
    }
    durations.sort((a, b) => a - b);
    return {
      run_id: first.run_id,
      process_role: first.process_role,
      build_id: first.build_id,
      contract_id: first.contract_id,
      category: first.category,
      mode: first.mode,
      input_kind: first.input_kind,
      workload: first.workload,
      starts,
      completed_samples: durations.length,
      by_outcome,
      p50_ms: quantile(durations, 0.5),
      p90_ms: quantile(durations, 0.9),
      p99_ms: quantile(durations, 0.99),
      max_ms: durations.at(-1) ?? null,
      by_20_ms,
      by_300_ms,
      fraction_by_20_ms: by_20_ms / starts,
      fraction_by_300_ms: by_300_ms / starts,
      oldest_incomplete_ms,
      evidence: unfinished
        ? "incomplete"
        : unproven
          ? "unproven"
          : starts < 1000
            ? "sparse"
            : "complete",
    };
  });
}

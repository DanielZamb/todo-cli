import { randomUUID } from "node:crypto";
import { Context, Effect, Exit, Fiber, Option, Schema } from "effect";
import {
  DiagnosticActionId,
  DiagnosticCommitReceipt,
  DiagnosticCount,
  DiagnosticEnvelope,
  type DiagnosticEventOf,
  DiagnosticFrameId,
  type DiagnosticMetadata,
  DiagnosticOutcome,
  DiagnosticRequestId,
  DiagnosticRunId,
  DiagnosticSpanId,
  DiagnosticStage,
  DiagnosticStreamId,
  DiagnosticTraceId,
} from "./client-diagnostics.ts";

const id = <S extends Schema.Top & { readonly DecodingServices: never }>(
  schema: S,
  value?: string,
): S["Type"] =>
  Option.getOrElse(Schema.decodeUnknownOption(schema)(value), () =>
    Schema.decodeUnknownSync(schema)(randomUUID()),
  );
const recordingFailures = new WeakMap<DiagnosticRecorder, number>();
const failedStarts = new WeakMap<DiagnosticRecorder, number>();
const failedEvents = new WeakMap<DiagnosticRecorder, number>();
export function observeDiagnostic<A>(
  recorder: DiagnosticRecorder,
  observation: () => A,
  loss: "start" | "event" = "event",
): A | undefined {
  try {
    return observation();
  } catch {
    recordingFailures.set(recorder, (recordingFailures.get(recorder) ?? 0) + 1);
    const losses = loss === "start" ? failedStarts : failedEvents;
    losses.set(recorder, (losses.get(recorder) ?? 0) + 1);
    return undefined;
  }
}
type FinishedSpan = DiagnosticEventOf<"span.finished">;
type ActiveSpan = DiagnosticEventOf<"span.started">;
type Delivery = DiagnosticEventOf<"stream.delivery">;
type Scope = {
  readonly recorder: DiagnosticRecorder;
  readonly envelope: typeof DiagnosticEnvelope.Type;
};
const CurrentDiagnostic = Context.Reference<Scope | undefined>(
  "todo/DiagnosticContext",
  { defaultValue: () => undefined },
);
const current = () => {
  const fiber = Fiber.getCurrent();
  return fiber ? Context.get(fiber.context, CurrentDiagnostic) : undefined;
};
export const DiagnosticProfiler = Schema.Struct({
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

export class DiagnosticRecorder {
  readonly runId = id(DiagnosticRunId);
  enabled: boolean;
  readonly capacity: number;
  readonly activeCapacity: number;
  private buildId: string;
  private contractId: string;
  private sequence = 0;
  private started = 0;
  private finished = 0;
  private lostStarts = 0;
  private droppedEvents = 0;
  private readonly receipts = new Map<
    string,
    typeof DiagnosticCommitReceipt.Type
  >();
  private readonly pendingFrames = new Map<
    string,
    Omit<Delivery, "bytes" | "stage">
  >();
  private readonly states = new WeakMap<
    object,
    { owner: boolean; timings: Map<typeof DiagnosticStage.Type, number> }
  >();
  private readonly active = new Map<string, ActiveSpan>();
  private readonly recent: FinishedSpan[] = [];
  private readonly deliveries: Delivery[] = [];
  private recentCursor = 0;
  private deliveryCursor = 0;
  constructor(
    options: {
      readonly capacity?: number;
      readonly active_capacity?: number;
      readonly enabled?: boolean;
      readonly build_id?: string;
      readonly contract_id?: string;
    } = {},
  ) {
    this.enabled = options.enabled ?? true;
    this.buildId = Schema.decodeUnknownSync(DiagnosticEnvelope.fields.build_id)(
      options.build_id ?? "dev",
    );
    this.contractId = Schema.decodeUnknownSync(
      DiagnosticEnvelope.fields.contract_id,
    )(options.contract_id ?? "unknown");
    this.capacity = Math.max(
      1,
      Math.min(2048, Math.floor(options.capacity ?? 2048)),
    );
    this.activeCapacity = Math.max(
      1,
      Math.min(256, Math.floor(options.active_capacity ?? 256)),
    );
  }
  authorize(envelope: typeof DiagnosticEnvelope.Type) {
    const state = this.states.get(envelope);
    if (state) state.owner = true;
  }
  serverTiming(envelope: typeof DiagnosticEnvelope.Type, duration: number) {
    const state = this.states.get(envelope);
    if (!state?.owner) return undefined;
    const metrics = [["todo-handler", duration]] satisfies Array<
      [string, number]
    >;
    for (const [stage, name] of [
      ["authentication", "todo-auth"],
      ["writer_lock_wait", "todo-queue"],
      ["domain", "todo-domain"],
      ["database", "todo-db"],
      ["encoding", "todo-encode"],
    ] as const) {
      const time = state.timings.get(stage);
      if (time !== undefined) metrics.push([name, time]);
    }
    return metrics
      .map(([name, time]) => name + ";dur=" + Number(time.toFixed(3)))
      .join(", ");
  }
  configure(options: {
    readonly enabled: boolean;
    readonly build_id: string;
    readonly contract_id: string;
  }) {
    this.enabled = options.enabled;
    this.buildId = Schema.decodeUnknownSync(DiagnosticEnvelope.fields.build_id)(
      options.build_id,
    );
    this.contractId = Schema.decodeUnknownSync(
      DiagnosticEnvelope.fields.contract_id,
    )(options.contract_id);
  }
  root(
    headers: {
      readonly trace?: string | undefined;
      readonly request?: string | undefined;
      readonly action?: string | undefined;
    },
    role: typeof DiagnosticEnvelope.Type.process_role = "server",
  ) {
    const root = {
      schema_version: 1,
      run_id: this.runId,
      process_role: role,
      build_id: this.buildId,
      contract_id: this.contractId,
      category: { inventory_id: "unknown", subtype: "unknown" },
      mode: "headless",
      input_kind: "background",
      workload: "unknown",
      trace_id: id(DiagnosticTraceId, headers.trace),
      request_id: id(DiagnosticRequestId, headers.request),
      action_id: id(DiagnosticActionId, headers.action),
      span_id: id(DiagnosticSpanId),
      sequence: ++this.sequence,
      monotonic_ms: performance.now(),
      clock_unit: "ms",
    } satisfies typeof DiagnosticEnvelope.Type;
    this.states.set(root, { owner: false, timings: new Map() });
    return root;
  }
  start(
    envelope: typeof DiagnosticEnvelope.Type,
    stage: typeof DiagnosticStage.Type,
    metadata?: typeof DiagnosticMetadata.Type,
  ) {
    if (!this.enabled) return undefined;
    this.started++;
    if (this.active.size >= this.activeCapacity) {
      this.lostStarts++;
      return undefined;
    }
    const event: ActiveSpan = {
      ...envelope,
      span_id: id(DiagnosticSpanId),
      parent_span_id: envelope.span_id,
      sequence: ++this.sequence,
      monotonic_ms:
        stage === "entry" ? envelope.monotonic_ms : performance.now(),
      name: "span.started",
      stage,
      ...(metadata ? { metadata } : {}),
    };
    const state = this.states.get(envelope);
    if (state) this.states.set(event, state);
    this.active.set(event.span_id, event);
    return event;
  }
  end(
    start: ActiveSpan | undefined,
    outcome: "completed" | "refused" | "conflicted" | "failed" | "cancelled",
    end = performance.now(),
  ) {
    if (!start || !this.active.delete(start.span_id)) return;
    this.finished++;
    const state = this.states.get(start);
    state?.timings.set(
      start.stage,
      (state.timings.get(start.stage) ?? 0) +
        Math.max(0, end - start.monotonic_ms),
    );
    const event: FinishedSpan = {
      ...start,
      name: "span.finished",
      outcome,
      duration_ms: Math.max(0, end - start.monotonic_ms),
      monotonic_ms: end,
      sequence: ++this.sequence,
    };
    if (this.recent.length === this.capacity) this.droppedEvents++;
    this.recent[this.recentCursor] = event;
    this.recentCursor = (this.recentCursor + 1) % this.capacity;
  }
  run<A, E, R>(
    envelope: typeof DiagnosticEnvelope.Type,
    effect: Effect.Effect<A, E, R>,
  ) {
    return effect.pipe(
      Effect.provideService(CurrentDiagnostic, { recorder: this, envelope }),
    );
  }
  withRoot<A, E, R>(
    envelope: typeof DiagnosticEnvelope.Type,
    effect: Effect.Effect<A, E, R>,
    stage: typeof DiagnosticStage.Type = "entry",
  ) {
    return diagnosticSpan(stage, effect).pipe(
      Effect.provideService(CurrentDiagnostic, { recorder: this, envelope }),
    );
  }
  delivery(
    envelope: typeof DiagnosticEnvelope.Type,
    stream_id: typeof DiagnosticStreamId.Type,
    frame_id: typeof DiagnosticFrameId.Type,
    commit_receipt: typeof DiagnosticCommitReceipt.Type,
    stage: Delivery["stage"],
    bytes: number | null,
  ) {
    if (!this.enabled) return;
    if (this.deliveries.length === this.capacity) this.droppedEvents++;
    this.deliveries[this.deliveryCursor] = {
      ...envelope,
      name: "stream.delivery",
      stream_id,
      frame_id,
      commit_receipt,
      stage,
      bytes,
      sequence: ++this.sequence,
      monotonic_ms: performance.now(),
    };
    this.deliveryCursor = (this.deliveryCursor + 1) % this.capacity;
  }
  commitReceipt(seq: number, generation: string) {
    const key = `${generation}:${seq}`;
    let receipt = this.receipts.get(key);
    if (!receipt) {
      receipt = id(DiagnosticCommitReceipt);
      if (this.receipts.size >= this.capacity) {
        const first = this.receipts.keys().next();
        if (!first.done) this.receipts.delete(first.value);
      }
      this.receipts.set(key, receipt);
    }
    return receipt;
  }
  awaitTransport(seq: number, delivery: Omit<Delivery, "bytes" | "stage">) {
    if (!this.enabled || !delivery.request_id) return;
    const key = delivery.request_id + ":" + seq;
    if (this.pendingFrames.size >= this.capacity) {
      this.droppedEvents++;
      return;
    }
    this.pendingFrames.set(key, delivery);
  }
  transport(request: string, chunk: Uint8Array) {
    if (!this.enabled) return;
    const prefix = new TextDecoder().decode(chunk.subarray(0, 64));
    const seq = /^id: ([0-9]+)\nevent: operation\n/u.exec(prefix)?.[1];
    if (!seq) return;
    const key = request + ":" + seq;
    const pending = this.pendingFrames.get(key);
    if (!pending) return;
    this.pendingFrames.delete(key);
    this.delivery(
      pending,
      pending.stream_id,
      pending.frame_id,
      pending.commit_receipt,
      "transport_handoff",
      chunk.byteLength,
    );
  }
  releaseStream(request: string) {
    for (const key of this.pendingFrames.keys())
      if (key.startsWith(request + ":")) this.pendingFrames.delete(key);
  }
  snapshot(): typeof DiagnosticProfiler.Type {
    return {
      schema_version: 1,
      run_id: this.runId,
      enabled: this.enabled,
      capacity: this.capacity,
      active_capacity: this.activeCapacity,
      started: this.started + (failedStarts.get(this) ?? 0),
      finished: this.finished,
      lost_starts: this.lostStarts + (failedStarts.get(this) ?? 0),
      dropped_events: this.droppedEvents + (failedEvents.get(this) ?? 0),
      recording_failures: recordingFailures.get(this) ?? 0,
      active: [...this.active.values()],
      recent: [
        ...this.recent.slice(this.recentCursor),
        ...this.recent.slice(0, this.recentCursor),
      ],
      deliveries: [
        ...this.deliveries.slice(this.deliveryCursor),
        ...this.deliveries.slice(0, this.deliveryCursor),
      ],
      unobserved: [
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
      ],
    };
  }
}
type Timing = {
  readonly recorder: DiagnosticRecorder;
  readonly start: ActiveSpan | undefined;
  readonly envelope: typeof DiagnosticEnvelope.Type;
};
export function beginDiagnosticSpan(
  stage: typeof DiagnosticStage.Type,
  metadata?: typeof DiagnosticMetadata.Type,
): Timing | undefined {
  const scope = current();
  if (!scope) return undefined;
  return observeDiagnostic(
    scope.recorder,
    () => {
      if (!scope.recorder.enabled) return undefined;
      return {
        recorder: scope.recorder,
        start: scope.recorder.start(scope.envelope, stage, metadata),
        envelope: scope.envelope,
      };
    },
    "start",
  );
}
export function finishDiagnosticSpan(
  timing: Timing | undefined,
  outcome: "completed" | "refused" | "conflicted" | "failed" | "cancelled",
) {
  if (timing)
    observeDiagnostic(timing.recorder, () =>
      timing.recorder.end(timing.start, outcome),
    );
}
export function provideDiagnosticContext<A, E, R>(
  scope: Scope | undefined,
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> {
  return scope
    ? Effect.provideService(effect, CurrentDiagnostic, scope)
    : effect;
}
export function withDiagnosticRoot<A, E, R>(
  options: {
    readonly recorder: DiagnosticRecorder;
    readonly role: typeof DiagnosticEnvelope.Type.process_role;
    readonly stage: typeof DiagnosticStage.Type;
  },
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> {
  return Effect.suspend(() => {
    const envelope = observeDiagnostic(
      options.recorder,
      () => options.recorder.root({}, options.role),
      "start",
    );
    return envelope
      ? provideDiagnosticContext(
          { recorder: options.recorder, envelope },
          diagnosticSpan(options.stage, effect),
        )
      : effect;
  });
}
export function diagnosticSync<A>(
  stage: typeof DiagnosticStage.Type,
  operation: () => A,
  metadata?: typeof DiagnosticMetadata.Type,
): A {
  const timing = beginDiagnosticSpan(stage, metadata);
  try {
    const value = operation();
    finishDiagnosticSpan(timing, "completed");
    return value;
  } catch (error) {
    finishDiagnosticSpan(timing, "failed");
    throw error;
  }
}
export function diagnosticSpan<A, E, R>(
  stage: typeof DiagnosticStage.Type,
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> {
  return Effect.suspend(() => {
    const timing = beginDiagnosticSpan(stage);
    if (!timing) return effect;
    return effect.pipe(
      Effect.provideService(CurrentDiagnostic, {
        recorder: timing.recorder,
        envelope: timing.start ?? timing.envelope,
      }),
      Effect.onExit((exit) =>
        Effect.sync(() =>
          finishDiagnosticSpan(
            timing,
            Exit.isSuccess(exit)
              ? "completed"
              : Exit.hasInterrupts(exit)
                ? "cancelled"
                : "failed",
          ),
        ),
      ),
    );
  });
}
export const diagnosticContext = current;
export const diagnosticOwnerAuthenticated = () => {
  const scope = current();
  if (scope)
    observeDiagnostic(scope.recorder, () =>
      scope.recorder.authorize(scope.envelope),
    );
};

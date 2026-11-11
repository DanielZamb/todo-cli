import { expect, it } from "@effect/vitest";
import { Schema } from "effect";
import { expectTypeOf } from "vitest";
import {
  DiagnosticActionId,
  DiagnosticCommitReceipt,
  DiagnosticEnvelope,
  DiagnosticEvent,
  type DiagnosticEventOf,
  DiagnosticFrameId,
  type DiagnosticPayloads,
  DiagnosticRefreshId,
  DiagnosticRequestId,
  DiagnosticStreamId,
  makeDiagnosticEvent,
} from "../src/client-diagnostics.ts";

const uuid = "11111111-1111-4111-8111-111111111111";
const base = Schema.decodeUnknownSync(DiagnosticEnvelope)({
  schema_version: 1,
  run_id: uuid,
  process_role: "macos",
  build_id: "dev",
  contract_id: "b".repeat(64),
  category: { inventory_id: "I07", subtype: "task.selection.pointer" },
  mode: "compact",
  input_kind: "pointer",
  workload: "warm",
  sequence: 1,
  monotonic_ms: 10,
  clock_unit: "ms",
  trace_id: uuid,
  span_id: uuid,
});
const action_id = Schema.decodeUnknownSync(DiagnosticActionId)(uuid);
const request_id = Schema.decodeUnknownSync(DiagnosticRequestId)(uuid);
const refresh_id = Schema.decodeUnknownSync(DiagnosticRefreshId)(uuid);
const stream_id = Schema.decodeUnknownSync(DiagnosticStreamId)(uuid);
const frame_id = Schema.decodeUnknownSync(DiagnosticFrameId)(uuid);
const commit_receipt = Schema.decodeUnknownSync(DiagnosticCommitReceipt)(uuid);
const examples = [
  { name: "ui.input.observed", action_id },
  { name: "ui.action.started", action_id },
  {
    name: "ui.result.committed",
    action_id,
    duration_ms: 1,
    outcome: "completed",
    correct: true,
    render_stage: "layout_complete",
  },
  { name: "ui.action.ended", action_id, duration_ms: 1, outcome: "cancelled" },
  { name: "model.published", generation: 1, visible_rows: 1, total_rows: 1 },
  { name: "ui.layout.finished", generation: 1, duration_ms: 1 },
  { name: "ui.layout.committed", generation: 1, duration_ms: 1 },
  { name: "ui.selection.committed", action_id, generation: 1 },
  { name: "ui.inspector.committed", action_id, generation: 1 },
  { name: "ui.stall", duration_ms: 1, expected_cadence_ms: 16 },
  { name: "refresh.started", refresh_id, trigger: "manual" },
  {
    name: "refresh.finished",
    refresh_id,
    duration_ms: 1,
    outcome: "completed",
    request_count: 1,
  },
  {
    name: "request.started",
    request_id,
    method: "GET",
    operation: "tasks.list",
  },
  { name: "request.headers", request_id, duration_ms: 1, status: 200 },
  {
    name: "request.finished",
    request_id,
    duration_ms: 1,
    outcome: "completed",
  },
  { name: "decode.finished", request_id, duration_ms: 1 },
  { name: "server.handled", request_id, duration_ms: 1, status: 200 },
  { name: "stream.connected", stream_id },
  { name: "stream.dropped", stream_id, reason: "transport" },
  {
    name: "stream.delivery",
    stream_id,
    frame_id,
    commit_receipt,
    stage: "commit_seen",
    bytes: 1,
  },
  { name: "span.started", stage: "ipc" },
  { name: "span.finished", stage: "ipc", duration_ms: 1, outcome: "completed" },
  { name: "resources.sampled", capability: "unknown", reason: "unsupported" },
  {
    name: "availability.changed",
    loading: false,
    busy: false,
    data_ready: true,
    write_allowed: true,
    reason: "ready",
  },
  { name: "recording.loss", lost_starts: 1, dropped_events: 2 },
  { name: "process.terminated", reason: "clean" },
] as const satisfies ReadonlyArray<DiagnosticPayloads[DiagnosticEvent["name"]]>;

it("constructs and narrows every public variant with required payload overrides", () => {
  expect(examples.map((x) => x.name)).toEqual(
    DiagnosticEvent.members.map((x) => x.fields.name.literal),
  );
  for (const payload of examples) {
    const event = makeDiagnosticEvent({ ...base, ...payload });
    switch (event.name) {
      case "ui.input.observed":
      case "ui.action.started":
        expectTypeOf(event.action_id).toEqualTypeOf<typeof action_id>();
        break;
      case "ui.result.committed":
        expectTypeOf(event.correct).toBeBoolean();
        break;
      case "ui.action.ended":
        expectTypeOf(event.duration_ms).toBeNumber();
        break;
      case "model.published":
        expectTypeOf(event.total_rows).toBeNumber();
        break;
      case "ui.layout.finished":
      case "ui.layout.committed":
        expectTypeOf(event.duration_ms).toBeNumber();
        break;
      case "ui.selection.committed":
      case "ui.inspector.committed":
        expectTypeOf(event.generation).toBeNumber();
        break;
      case "ui.stall":
        expectTypeOf(event.expected_cadence_ms).toBeNumber();
        break;
      case "refresh.started":
        expectTypeOf(event.refresh_id).toEqualTypeOf<typeof refresh_id>();
        break;
      case "refresh.finished":
        expectTypeOf(event.request_count).toBeNumber();
        break;
      case "request.started":
        expectTypeOf(event.request_id).toEqualTypeOf<typeof request_id>();
        break;
      case "request.headers":
        expectTypeOf(event.status).toBeNumber();
        break;
      case "request.finished":
        if (event.request_id) expectTypeOf(event.duration_ms).toBeNumber();
        break;
      case "decode.finished":
        expectTypeOf(event.duration_ms).toBeNumber();
        break;
      case "server.handled":
        expectTypeOf(event.status).toBeNumber();
        break;
      case "stream.connected":
        expectTypeOf(event.stream_id).toEqualTypeOf<typeof stream_id>();
        break;
      case "stream.dropped":
        expect(event.reason).toBe("transport");
        break;
      case "stream.delivery":
        expectTypeOf(event.commit_receipt).toEqualTypeOf<
          typeof commit_receipt
        >();
        break;
      case "span.started":
        expect(event.stage).toBe("ipc");
        break;
      case "span.finished":
        expectTypeOf(event.duration_ms).toBeNumber();
        break;
      case "resources.sampled":
        expect(event.capability).toBe("unknown");
        break;
      case "availability.changed":
        expectTypeOf(event.write_allowed).toBeBoolean();
        break;
      case "recording.loss":
        expectTypeOf(event.lost_starts).toBeNumber();
        break;
      case "process.terminated":
        expect(event.reason).toBe("clean");
        break;
      default: {
        const exhaustive: never = event;
        throw new Error(String(exhaustive));
      }
    }
  }
  expectTypeOf<
    DiagnosticPayloads["request.finished"]["request_id"]
  >().toEqualTypeOf<typeof request_id>();
  expectTypeOf<
    DiagnosticPayloads["refresh.finished"]["refresh_id"]
  >().toEqualTypeOf<typeof refresh_id>();
  expectTypeOf<
    Omit<DiagnosticEventOf<"request.finished">, "request_id">
  >().not.toExtend<Parameters<typeof makeDiagnosticEvent>[0]>();
  makeDiagnosticEvent({
    ...base,
    name: "span.started",
    stage: "ipc",
    request_id,
  });
});

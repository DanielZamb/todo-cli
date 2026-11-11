import { describe, expect, it } from "@effect/vitest";
import { Schema } from "effect";
import { expectTypeOf } from "vitest";
import {
  DiagnosticEvent,
  type DiagnosticEventOf,
  DiagnosticMetadata,
  DiagnosticObservation,
  type DiagnosticPayloads,
  decodeDiagnosticEvent,
  RenderStage,
  summarizeInteractions,
} from "../src/client-diagnostics.ts";
import {
  InteractionCategory,
  interactionCategories,
} from "../src/interaction-categories.ts";

const scope = {
  run_id: "11111111-1111-4111-8111-111111111111",
  process_role: "electron.renderer",
  build_id: "a".repeat(40),
  contract_id: "b".repeat(64),
  category: { inventory_id: "I07", subtype: "task.selection.pointer" },
  mode: "compact",
  input_kind: "pointer",
  workload: "warm",
};
const envelope = {
  schema_version: 1,
  ...scope,
  sequence: 1,
  monotonic_ms: 10,
  clock_unit: "ms",
  trace_id: "22222222-2222-4222-8222-222222222222",
  span_id: "33333333-3333-4333-8333-333333333333",
};
const observation = (value: object) =>
  Schema.decodeUnknownSync(DiagnosticObservation)({ ...scope, ...value });

describe("shared Diagnostics vocabulary", () => {
  it("registers every inventory row and rejects mismatched or unknown subtypes", () => {
    expect(interactionCategories.map((x) => x.id)).toEqual([
      "I01",
      "I02",
      "I03",
      "I04",
      "I05",
      "I06",
      "I07",
      "I08",
      "I09",
      "I10",
      "I11",
      "I12",
      "I13",
      "I14",
      "I15",
      "I16",
      "I17",
      "I18",
      "I19",
      "I20",
      "I21",
      "I22",
      "I23",
      "I24",
      "I25",
      "I26",
      "I27",
      "I28",
      "I29",
      "I30",
      "C01",
      "C02",
      "C03",
      "C04",
      "C05",
      "C06",
      "C07",
      "C08",
    ]);
    expect(() =>
      Schema.decodeUnknownSync(InteractionCategory)({
        inventory_id: "I07",
        subtype: "save",
      }),
    ).toThrow();
    expect(() =>
      Schema.decodeUnknownSync(InteractionCategory)({
        inventory_id: "unknown",
        subtype: "private title",
      }),
    ).toThrow();
  });
  it("decodes each named event with its required scalar payload", () => {
    const variants = [
      ["ui.input.observed", { action_id: scope.run_id }],
      ["ui.action.started", { action_id: scope.run_id }],
      [
        "ui.result.committed",
        {
          action_id: scope.run_id,
          outcome: "completed",
          render_stage: "layout_complete",
          duration_ms: 12,
          correct: true,
        },
      ],
      [
        "ui.action.ended",
        { action_id: scope.run_id, outcome: "superseded", duration_ms: 12 },
      ],
      ["model.published", { generation: 2, visible_rows: 4, total_rows: 8 }],
      ["ui.layout.finished", { generation: 2, duration_ms: 4 }],
      ["ui.layout.committed", { generation: 2, duration_ms: 4 }],
      ["ui.selection.committed", { action_id: scope.run_id, generation: 2 }],
      ["ui.inspector.committed", { action_id: scope.run_id, generation: 2 }],
      ["ui.stall", { duration_ms: 40, expected_cadence_ms: 16 }],
      [
        "refresh.started",
        { refresh_id: scope.run_id, trigger: "profileSwitch" },
      ],
      [
        "refresh.finished",
        {
          refresh_id: scope.run_id,
          outcome: "completed",
          request_count: 2,
          duration_ms: 10,
        },
      ],
      [
        "request.started",
        { request_id: scope.run_id, method: "GET", operation: "tasks.list" },
      ],
      [
        "request.headers",
        { request_id: scope.run_id, status: 200, duration_ms: 3 },
      ],
      [
        "request.finished",
        { request_id: scope.run_id, outcome: "completed", duration_ms: 9 },
      ],
      ["decode.finished", { request_id: scope.run_id, duration_ms: 2 }],
      [
        "server.handled",
        { request_id: scope.run_id, status: 403, duration_ms: 3 },
      ],
      ["stream.connected", { stream_id: scope.run_id }],
      ["stream.dropped", { stream_id: scope.run_id, reason: "transport" }],
      [
        "stream.delivery",
        {
          stream_id: scope.run_id,
          frame_id: scope.run_id,
          commit_receipt: scope.run_id,
          stage: "transport_handoff",
          bytes: 20,
        },
      ],
      ["span.started", { stage: "authentication" }],
      [
        "span.finished",
        { stage: "authentication", duration_ms: 4, outcome: "refused" },
      ],
      [
        "resources.sampled",
        { capability: "unavailable", reason: "unsupported" },
      ],
      [
        "availability.changed",
        {
          loading: false,
          busy: true,
          data_ready: true,
          write_allowed: false,
          reason: "write",
        },
      ],
      ["recording.loss", { lost_starts: 3, dropped_events: 4 }],
      ["process.terminated", { reason: "crashed" }],
    ] as const;
    for (const [name, payload] of variants)
      expect(
        Schema.decodeUnknownSync(DiagnosticEvent)({
          ...envelope,
          name,
          ...payload,
        }).name,
      ).toBe(name);
  });
  it("rejects content anywhere in new records and metadata", () => {
    for (const key of [
      "title",
      "description",
      "task_id",
      "profile_name",
      "search_text",
      "path",
      "token",
      "sql",
      "parameters",
      "message",
    ])
      expect(() =>
        Schema.decodeUnknownSync(DiagnosticEvent, {
          onExcessProperty: "error",
        })({
          ...envelope,
          name: "ui.action.started",
          action_id: scope.run_id,
          [key]: "private",
        }),
      ).toThrow();
    for (const value of [
      { operation: "GET /tasks/private" },
      { statement: "SELECT secret" },
      { error: "private failure" },
      { path: "/private" },
    ])
      expect(() =>
        Schema.decodeUnknownSync(DiagnosticMetadata, {
          onExcessProperty: "error",
        })(value),
      ).toThrow();
    expect(() =>
      Schema.decodeUnknownSync(DiagnosticEvent)({
        ...envelope,
        name: "ui.input.observed",
        action_id: "private task id",
      }),
    ).toThrow();
  });
  it("decodes lifecycle refresh causes without treating them as unknown records", () => {
    for (const trigger of ["dayChange", "clockChange", "wake", "activation"]) {
      expect(
        decodeDiagnosticEvent({
          ...envelope,
          name: "refresh.started",
          refresh_id: scope.run_id,
          trigger,
        }),
      ).toEqual({
        kind: "known",
        event: {
          ...envelope,
          name: "refresh.started",
          refresh_id: scope.run_id,
          trigger,
        },
      });
    }
  });
  it("makes unknown variants and capabilities explicit without retaining their content", () => {
    expect(
      decodeDiagnosticEvent({
        ...envelope,
        name: "private-new-event",
        title: "private",
      }),
    ).toEqual({ kind: "unknown", reason: "unknown_event" });
    expect(
      decodeDiagnosticEvent({
        ...envelope,
        schema_version: 9,
        name: "ui.stall",
      }),
    ).toEqual({ kind: "unknown", reason: "unknown_version" });
    expect(Schema.decodeUnknownSync(RenderStage)("unknown")).toBe("unknown");
    expect(
      decodeDiagnosticEvent({
        ...envelope,
        name: "ui.action.started",
        action_id: scope.run_id,
        path: "/private",
      }),
    ).toEqual({ kind: "unknown", reason: "invalid_record" });
  });
  it("uses nearest rank raw durations and keeps all starts in deadline denominators", () => {
    const samples = [10, 20, 300, 900].map((duration_ms) =>
      observation({
        kind: "rendered",
        outcome: "completed",
        duration_ms,
        correct: true,
        render_stage: "layout_complete",
      }),
    );
    for (const outcome of [
      "pending",
      "lost",
      "crashed",
      "timed_out",
      "superseded",
      "unavailable",
    ])
      samples.push(
        observation({ kind: "unfinished", outcome, age_ms: 400, count: 1 }),
      );
    const [result] = summarizeInteractions(samples);
    expect(result).toMatchObject({
      starts: 10,
      completed_samples: 4,
      p50_ms: 20,
      p90_ms: 900,
      p99_ms: 900,
      max_ms: 900,
      by_outcome: {
        completed: 4,
        pending: 1,
        lost: 1,
        crashed: 1,
        timed_out: 1,
        superseded: 1,
        unavailable: 1,
        refused: 0,
        conflicted: 0,
        failed: 0,
        cancelled: 0,
      },
      by_20_ms: 2,
      by_300_ms: 3,
      fraction_by_20_ms: 0.2,
      fraction_by_300_ms: 0.3,
      evidence: "incomplete",
      oldest_incomplete_ms: 400,
    });
    expect(
      summarizeInteractions([
        observation({
          kind: "unfinished",
          outcome: "lost",
          age_ms: null,
          count: 5,
        }),
      ])[0],
    ).toMatchObject({
      starts: 5,
      p50_ms: null,
      p99_ms: null,
      max_ms: null,
      evidence: "incomplete",
    });
    expect(summarizeInteractions([])).toEqual([]);
  });
  it("keeps modes separate and cannot pass using fast failures or weak render evidence", () => {
    const result = summarizeInteractions([
      observation({
        kind: "rendered",
        outcome: "failed",
        duration_ms: 1,
        correct: false,
        render_stage: "layout_complete",
      }),
      observation({
        kind: "rendered",
        outcome: "completed",
        duration_ms: 2,
        correct: true,
        render_stage: "unknown",
      }),
      observation({
        kind: "rendered",
        mode: "full",
        outcome: "refused",
        duration_ms: 10,
        correct: true,
        render_stage: "layout_complete",
      }),
    ]);
    expect(
      result.map((x) => [x.mode, x.starts, x.by_20_ms, x.evidence]),
    ).toEqual([
      ["compact", 2, 0, "unproven"],
      ["full", 1, 1, "sparse"],
    ]);
  });
});

it("never counts a failed outcome as a correct deadline result even if a producer sets correct", () => {
  expect(
    summarizeInteractions([
      observation({
        kind: "rendered",
        outcome: "failed",
        duration_ms: 1,
        correct: true,
        render_stage: "layout_complete",
      }),
    ])[0]?.by_20_ms,
  ).toBe(0);
});

it("exports payload fields as a discriminated TypeScript union", () => {
  const base = Schema.decodeUnknownSync(DiagnosticEvent)({
    ...envelope,
    name: "ui.action.started",
    action_id: scope.run_id,
  });
  const started: typeof DiagnosticEvent.Type = {
    ...base,
    name: "span.started",
    stage: "ipc",
  };
  if (started.name === "span.started") expect(started.stage).toBe("ipc");
});

it("checks variant-specific keys without accepting another variant's fields", () => {
  expectTypeOf<DiagnosticEventOf<"span.started">>().toHaveProperty("stage");
  expectTypeOf<DiagnosticEventOf<"request.started">>().toHaveProperty(
    "request_id",
  );
  expectTypeOf<"status">().not.toExtend<
    keyof DiagnosticEventOf<"span.started">
  >();
  expectTypeOf<DiagnosticPayloads["span.started"]["stage"]>().toEqualTypeOf<
    typeof import("../src/client-diagnostics.ts").DiagnosticStage.Type
  >();
});

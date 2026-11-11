import { expect, it } from "@effect/vitest";
import { Effect, Fiber } from "effect";
import {
  DiagnosticRecorder,
  diagnosticSpan,
  diagnosticSync,
} from "../src/diagnostic-context.ts";

it.effect(
  "joins children to the caller ids and records failures, interruptions and bounded losses",
  () =>
    Effect.gen(function* () {
      const recorder = new DiagnosticRecorder({
        capacity: 3,
        active_capacity: 4,
      });
      const root = recorder.root({
        trace: "11111111-1111-4111-8111-111111111111",
        request: "22222222-2222-4222-8222-222222222222",
        action: "33333333-3333-4333-8333-333333333333",
      });
      yield* recorder.withRoot(
        root,
        diagnosticSpan(
          "handler",
          Effect.sync(() =>
            diagnosticSync("database", () => 7, { statement: "store.read" }),
          ),
        ),
      );
      const snapshot = recorder.snapshot();
      expect(snapshot.started).toBe(3);
      expect(snapshot.finished).toBe(3);
      expect(snapshot.active).toEqual([]);
      expect(snapshot.dropped_events).toBe(0);
      expect(snapshot.recent.map((x) => x.trace_id)).toEqual([
        root.trace_id,
        root.trace_id,
        root.trace_id,
      ]);
      expect(
        snapshot.recent.every(
          (x) =>
            x.request_id === root.request_id && x.action_id === root.action_id,
        ),
      ).toBe(true);
      const fiber = yield* recorder
        .withRoot(recorder.root({}), diagnosticSpan("handler", Effect.never))
        .pipe(Effect.forkChild);
      yield* Effect.yieldNow;
      yield* Fiber.interrupt(fiber);
      expect(recorder.snapshot().recent.at(-1)?.outcome).toBe("cancelled");
      const malformed = recorder.root({
        trace: "private",
        request: "private",
        action: "private",
      });
      expect(malformed.trace_id).toMatch(/^[a-f0-9-]{36}$/);
      expect(JSON.stringify(recorder.snapshot())).not.toContain("private");
    }),
);

it.effect("isolates concurrently yielding trace contexts", () =>
  Effect.gen(function* () {
    const recorder = new DiagnosticRecorder();
    const first = recorder.root({});
    const second = recorder.root({});
    yield* Effect.all(
      [first, second].map((root) =>
        recorder.withRoot(
          root,
          Effect.gen(function* () {
            yield* Effect.yieldNow;
            diagnosticSync("authentication", () => 1);
          }),
        ),
      ),
      { concurrency: "unbounded" },
    );
    const records = recorder
      .snapshot()
      .recent.filter((x) => x.stage === "authentication");
    expect(records.map((x) => x.trace_id).sort()).toEqual(
      [first.trace_id, second.trace_id].sort(),
    );
  }),
);

it.effect(
  "counts active-start loss and ring eviction without claiming zero-duration work",
  () =>
    Effect.gen(function* () {
      const recorder = new DiagnosticRecorder({
        capacity: 1,
        active_capacity: 1,
      });
      yield* recorder.withRoot(
        recorder.root({}),
        diagnosticSpan("handler", Effect.void),
      );
      const snapshot = recorder.snapshot();
      expect(snapshot.started).toBe(2);
      expect(snapshot.finished).toBe(1);
      expect(snapshot.lost_starts).toBe(1);
      yield* recorder
        .withRoot(recorder.root({}), Effect.fail("private failure"))
        .pipe(Effect.exit);
      expect(recorder.snapshot().recent.at(-1)?.outcome).toBe("failed");
      expect(recorder.snapshot().dropped_events).toBe(1);
      expect(recorder.commitReceipt(1, "epoch-a")).not.toBe(
        recorder.commitReceipt(1, "epoch-b"),
      );
    }),
);

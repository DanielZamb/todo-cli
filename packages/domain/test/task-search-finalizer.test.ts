import { expect, it } from "@effect/vitest";
import { Cause, Effect, Exit } from "effect";
import { runTaskRecordSteps } from "../src/task-filters.ts";
import type { TaskRead } from "../src/task-read.ts";

function tracked(fail = false) {
  const state = { cleaned: false, returns: 0, continued: false };
  const steps = (function* (): Generator<void, TaskRead[]> {
    try {
      if (fail) throw new Error("next failed");
      yield;
      state.continued = true;
      return [];
    } finally {
      state.cleaned = true;
    }
  })();
  const finish = steps.return.bind(steps);
  steps.return = (value) => {
    state.returns++;
    return finish(value);
  };
  return { steps, state };
}
it("closes a suspended generator exactly once on interruption", async () => {
  const { steps, state } = tracked();
  const controller = new AbortController();
  const interrupt = setImmediate(() => controller.abort());
  try {
    const exit = await Effect.runPromiseExit(runTaskRecordSteps(steps), {
      signal: controller.signal,
    });
    expect(Exit.isFailure(exit) && Cause.hasInterruptsOnly(exit.cause)).toBe(
      true,
    );
    expect(state).toEqual({ cleaned: true, returns: 1, continued: false });
  } finally {
    clearImmediate(interrupt);
  }
});
it("closes a suspended generator exactly once on runner failure", async () => {
  const { steps, state } = tracked();
  expect(
    await Effect.runPromise(
      Effect.flip(runTaskRecordSteps(steps, Effect.fail("checkpoint failed"))),
    ),
  ).toBe("checkpoint failed");
  expect(state).toEqual({ cleaned: true, returns: 1, continued: false });
});
it("does not return a normally completed generator again", async () => {
  const { steps, state } = tracked();
  expect(
    await Effect.runPromise(runTaskRecordSteps(steps, Effect.void)),
  ).toEqual([]);
  expect(state).toEqual({ cleaned: true, returns: 0, continued: true });
});
it("does not return a generator whose next already threw", async () => {
  const { steps, state } = tracked(true);
  const exit = await Effect.runPromiseExit(runTaskRecordSteps(steps));
  expect(Exit.isFailure(exit)).toBe(true);
  expect(state).toEqual({ cleaned: true, returns: 0, continued: false });
});

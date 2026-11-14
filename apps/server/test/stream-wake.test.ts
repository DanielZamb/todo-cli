import { expect, it } from "@effect/vitest";
import { Effect, Fiber } from "effect";
import { TestClock } from "effect/testing";
import { StreamWake } from "../src/stream-wake.ts";

it.effect(
  "remembers a commit after History was read and coalesces a burst",
  () =>
    Effect.gen(function* () {
      const wake = new StreamWake();
      const beforePass = wake.version;
      for (let i = 0; i < 300; i++) wake.signal();
      yield* wake.wait(beforePass);
      expect(wake.version).toBe(300);
      expect(wake.waiting).toBe(0);
      const nextPass = yield* wake.wait(wake.version).pipe(Effect.forkScoped);
      yield* Effect.yieldNow;
      expect(wake.waiting).toBe(1);
      yield* TestClock.adjust("249 millis");
      expect(wake.waiting).toBe(1);
      yield* TestClock.adjust("1 millis");
      yield* Fiber.join(nextPass);
      expect(wake.waiting).toBe(0);
    }),
);

it.effect(
  "broadcasts to every waiter and releases closed and reopened waits",
  () =>
    Effect.gen(function* () {
      const wake = new StreamWake();
      const streams = yield* Effect.all(
        Array.from({ length: 5 }, () => wake.wait(0).pipe(Effect.forkScoped)),
      );
      yield* Effect.yieldNow;
      expect(wake.waiting).toBe(5);
      const closed = streams.shift();
      if (!closed) throw new Error("Missing stream");
      yield* Fiber.interrupt(closed);
      expect(wake.waiting).toBe(4);
      const reopened = yield* wake.wait(0).pipe(Effect.forkScoped);
      yield* Effect.yieldNow;
      expect(wake.waiting).toBe(5);
      wake.signal();
      yield* Effect.all(streams.map(Fiber.join));
      yield* Fiber.join(reopened);
      expect(wake.waiting).toBe(0);
    }),
);

it.effect(
  "does not wake a newly registered wait again in the same broadcast",
  () =>
    Effect.gen(function* () {
      const wake = new StreamWake();
      const twoPasses = yield* Effect.gen(function* () {
        yield* wake.wait(0);
        yield* wake.wait(wake.version);
      }).pipe(Effect.forkScoped);
      yield* Effect.yieldNow;
      wake.signal();
      yield* Effect.yieldNow;
      expect(wake.waiting).toBe(1);
      expect(twoPasses.pollUnsafe()).toBeUndefined();
      wake.signal();
      yield* Fiber.join(twoPasses);
      expect(wake.waiting).toBe(0);
    }),
);

import { setSystemTime } from "bun:test";
import { readFileSync } from "node:fs";
import { setTimeout as pause } from "node:timers/promises";
import { BunRuntime } from "@effect/platform-bun";
import { Clock, Effect, Layer } from "effect";
import { serverLayer } from "../src/server.ts";

const fixed = process.env.READ_CONTROL_REAL_TIME !== "1";
if (fixed) setSystemTime(new Date("2026-11-11T18:00:00Z"));

Effect.gen(function* () {
  const live = yield* Clock.Clock;
  const time = Date.parse("2026-11-11T18:00:00Z");
  const current = () =>
    process.env.READ_CONTROL_CLOCK_FILE === undefined
      ? time
      : Number(readFileSync(process.env.READ_CONTROL_CLOCK_FILE, "utf8"));
  const gate = process.env.READ_CONTROL_POLL_GATE;
  yield* Layer.launch(
    serverLayer({ path: process.env.TODO_DB ?? "", port: 0 }),
  ).pipe(
    Effect.provideService(
      Clock.Clock,
      fixed
        ? {
            monotonicTimeNanosUnsafe: () => live.monotonicTimeNanosUnsafe(),
            monotonicTimeNanos: live.monotonicTimeNanos,
            sleep: (duration) =>
              gate === undefined
                ? live.sleep(duration)
                : live.sleep(duration).pipe(
                    Effect.flatMap(() =>
                      Effect.promise(async () => {
                        while (readFileSync(gate, "utf8") !== "open")
                          await pause(10);
                      }),
                    ),
                  ),
            currentTimeMillisUnsafe: current,
            currentTimeMillis: Effect.sync(current),
            currentTimeNanosUnsafe: () => BigInt(current()) * 1_000_000n,
            currentTimeNanos: Effect.sync(() => BigInt(current()) * 1_000_000n),
          }
        : live,
    ),
  );
}).pipe(BunRuntime.runMain);

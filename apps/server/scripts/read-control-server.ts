import { setSystemTime } from "bun:test";
import { BunRuntime } from "@effect/platform-bun";
import { Clock, Effect, Layer } from "effect";
import { serverLayer } from "../src/server.ts";

setSystemTime(new Date("2026-11-11T18:00:00Z"));

Effect.gen(function* () {
  const live = yield* Clock.Clock;
  const time = Date.parse("2026-11-11T18:00:00Z");
  yield* Layer.launch(
    serverLayer({ path: process.env.TODO_DB ?? "", port: 0 }),
  ).pipe(
    Effect.provideService(Clock.Clock, {
      ...live,
      currentTimeMillisUnsafe: () => time,
      currentTimeMillis: Effect.succeed(time),
      currentTimeNanosUnsafe: () => BigInt(time) * 1_000_000n,
      currentTimeNanos: Effect.succeed(BigInt(time) * 1_000_000n),
    }),
  );
}).pipe(BunRuntime.runMain);

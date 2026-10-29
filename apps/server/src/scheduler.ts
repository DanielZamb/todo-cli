import type { OperationStore } from "@todo/domain/store";
import { Clock, Effect, Schedule } from "effect";

export const scheduler = (store: OperationStore) =>
  Effect.gen(function* () {
    yield* store.scheduled.runDue();
    yield* store.auth.cleanupExpired();
    const daily = yield* store.snapshots.runDaily();
    if (daily) yield* store.snapshots.prune();
    const task = yield* store.scheduled.nextAt();
    const credential = yield* store.auth.nextExpiry();
    const now = yield* Clock.currentTimeMillis;
    const next = Math.min(task ?? Infinity, credential ?? Infinity);
    const delay = Math.max(1, Math.min(1000, next - now));
    store.diagnostics.schedulerWake(now + delay);
    store.diagnostics.sample();
    yield* Effect.sleep(delay);
  }).pipe(
    Effect.catch((error) =>
      Effect.logError("Scheduled work failed", error).pipe(
        Effect.andThen(Effect.sleep("1 second")),
      ),
    ),
    Effect.repeat(Schedule.spaced(0)),
  );

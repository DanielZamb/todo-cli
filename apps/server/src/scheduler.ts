import { observeDiagnostic, withDiagnosticRoot } from "@todo/domain";
import type { OperationStore } from "@todo/domain/store";
import { Clock, Effect, Schedule } from "effect";

export const scheduler = (store: OperationStore) =>
  withDiagnosticRoot(
    { recorder: store.diagnostics.profiler, role: "scheduler", stage: "job" },
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
      observeDiagnostic(store.diagnostics.profiler, () =>
        store.diagnostics.schedulerWake(now + delay),
      );
      observeDiagnostic(store.diagnostics.profiler, () =>
        store.diagnostics.sample(),
      );
      return delay;
    }),
  ).pipe(
    Effect.flatMap((delay) => Effect.sleep(delay)),
    Effect.catch((error) =>
      Effect.logError("Scheduled work failed", error).pipe(
        Effect.andThen(Effect.sleep("1 second")),
      ),
    ),
    Effect.repeat(Schedule.spaced(0)),
  );

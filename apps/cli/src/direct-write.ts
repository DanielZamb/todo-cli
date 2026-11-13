import type { OperationStore } from "@todo/domain/store";
import { Effect, Exit, Option } from "effect";
import type { ProvenServer } from "./server-connection.ts";

export const observeDirectWrite = <A, E, R>(
  store: OperationStore,
  command: Effect.Effect<A, E, R>,
  server: ProvenServer | undefined,
  changesFiles: boolean,
) =>
  Effect.gen(function* () {
    if (!server) return yield* command;
    const before = yield* Effect.option(store.snapshots.generation());
    return yield* command.pipe(
      Effect.onExit((exit) =>
        Effect.gen(function* () {
          const after = yield* Effect.option(store.snapshots.generation());
          const changed =
            Option.isSome(before) &&
            Option.isSome(after) &&
            (before.value.seq !== after.value.seq ||
              before.value.generation !== after.value.generation);
          if (changed || (changesFiles && Exit.isSuccess(exit)))
            yield* Effect.promise(() => server.nudge());
        }),
      ),
    );
  });

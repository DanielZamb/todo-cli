import { Effect } from "effect";
import type { ProvenServer } from "./server-connection.ts";

export const nudgeAfterWrite = <A, E, R>(
  command: Effect.Effect<A, E, R>,
  server: ProvenServer | undefined,
) =>
  command.pipe(
    Effect.ensuring(
      Effect.promise(async () => {
        if (server) await server.nudge();
      }),
    ),
  );

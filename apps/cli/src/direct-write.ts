import { Effect } from "effect";
import type { ProvenServer } from "./server-connection.ts";

// Runs as the store's release: a writing command that opened the store nudges
// its proven server exactly once after the connection closes, whatever the
// outcome. A command that never opened a store sends nothing.
export const closeThenNudge = (
  close: Effect.Effect<void>,
  server: ProvenServer | undefined,
) =>
  close.pipe(
    Effect.ensuring(
      Effect.promise(async () => {
        if (server) await server.nudge();
      }),
    ),
  );

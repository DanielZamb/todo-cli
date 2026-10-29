import { Effect } from "effect";
import { openStore } from "../../src/store/store.ts";

const path = process.argv[2];
if (!path?.includes("todo-f10-upgrade-race-"))
  throw new Error("Scratch database required");
process.stdout.write("opening\n");
await Effect.runPromise(
  Effect.acquireUseRelease(
    openStore({ path }),
    (store) => store.settings(),
    (store) => Effect.orDie(store.close()),
  ),
);

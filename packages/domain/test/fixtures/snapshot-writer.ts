import { Effect } from "effect";
import { openStore } from "../../src/store/store.ts";

const [path, reason] = process.argv.slice(2);
if (!path?.includes("todo-f13-test-") || !reason)
  throw new Error("Scratch database required");
await Effect.runPromise(
  Effect.acquireUseRelease(
    openStore({ path }),
    (store) => store.snapshots.create(reason),
    (store) => Effect.orDie(store.close()),
  ),
);

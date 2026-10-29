import { isAbsolute } from "node:path";
import { openStore } from "@todo/domain/store";
import { Effect } from "effect";

const path = process.argv[2];
if (!path || !isAbsolute(path) || process.argv.length !== 3)
  throw new Error(
    "Usage: bun packages/domain/scripts/migrate.ts /absolute/path/to/existing.db",
  );
const settings = await Effect.runPromise(
  Effect.acquireUseRelease(
    openStore({ path, create: false }),
    (store) => store.settings(),
    (store) => Effect.orDie(store.close()),
  ),
);
process.stdout.write(`${JSON.stringify(settings)}\n`);

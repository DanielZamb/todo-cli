import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "@effect/vitest";
import { Effect } from "effect";
import {
  dagCases,
  proveMigrationAndGuards,
  provePurgeEndpoint,
  runDagCase,
} from "../scripts/dag-proof.ts";

const scratch = (run: (path: string) => Effect.Effect<void, unknown>) =>
  Effect.acquireUseRelease(
    Effect.sync(() => mkdtempSync(join(tmpdir(), "todo-dag-test-"))),
    (directory) => run(join(directory, "scratch.db")),
    (directory) =>
      Effect.sync(() => rmSync(directory, { recursive: true, force: true })),
  );
describe("Dependency storage and replay", () => {
  for (const [name, run] of Object.entries(dagCases))
    it.effect(name, () => scratch((path) => runDagCase(path, run)));
  for (const endpoint of ["A", "B"] as const)
    it.effect(`Purge endpoint ${endpoint}`, () =>
      scratch((path) =>
        runDagCase(path, (store) => provePurgeEndpoint(store, endpoint, path)),
      ),
    );
  it.effect("migration twice, Snapshot before upgrade and SQL refusals", () =>
    scratch(proveMigrationAndGuards),
  );
});

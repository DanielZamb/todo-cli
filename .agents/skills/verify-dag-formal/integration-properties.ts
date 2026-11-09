import { Database } from "bun:sqlite";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { Effect } from "effect";
import {
  dagCases,
  provePurgeEndpoint,
  runDagCase,
} from "../packages/domain/scripts/dag-proof.ts";
import { migrationSql } from "../packages/domain/src/store/0002.ts";
import { createProjection } from "../packages/domain/src/store/projection.ts";
const directory = process.argv[2];
assert.ok(directory);
const mode = process.argv[3] ?? "all";
const scratch = mkdtempSync(join(directory, "todo-dag-f-integration-"));
let property = "integration-n1";
const passed: string[] = [];
try {
  if (mode === "all" || mode === "n1") {
    const db = new Database(":memory:");
    try {
      db.function("domain_write_allowed", () => 1);
      db.exec(migrationSql);
      db.exec("PRAGMA user_version=1");
      createProjection(db);
      assert.deepEqual(
        db.query("PRAGMA user_version").get(),
        { user_version: 1 },
        "BEHAVIORAL_FAILURE:integration-n1",
      );
      passed.push("projection-preserves-user-version");
    } finally {
      db.close();
    }
  }
  for (const [name, run] of Object.entries(dagCases)) {
    if (mode !== "all" && mode !== name) continue;
    property = `integration-${name}`;
    const directory = join(scratch, name);
    mkdirSync(directory);
    const path = join(directory, "scratch.db");
    await Effect.runPromise(
      runDagCase(path, (store) =>
        Effect.gen(function* () {
          yield* run(store);
          const db = new Database(path, { readonly: true });
          try {
            assert.deepEqual(db.query("PRAGMA foreign_key_check").all(), []);
          } finally {
            db.close();
          }
        }),
      ),
    );
    passed.push(name);
  }
  for (const target of ["A", "B"] satisfies ("A" | "B")[]) {
    if (mode !== "all" && mode !== `purge-${target}`) continue;
    property = `integration-purge-${target}`;
    const directory = join(scratch, `purge-${target}`);
    mkdirSync(directory);
    const path = join(directory, "scratch.db");
    await Effect.runPromise(
      runDagCase(path, (store) => provePurgeEndpoint(store, target, path)),
    );
    passed.push(`purge-${target}`);
  }
  console.log(
    JSON.stringify({
      status: "pass",
      mode,
      passed,
      source:
        "unchanged candidate dag-proof.ts assertions plus independent FK and N1 checks",
    }),
  );
} catch (error) {
  console.error(`BEHAVIORAL_FAILURE:${property}`);
  console.log(
    JSON.stringify({ status: "fail", property, error: String(error), passed }),
  );
  process.exitCode = 1;
} finally {
  rmSync(scratch, { recursive: true, force: true });
}

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect } from "effect";
import { proveProjectionTagSets, proveTagLinks } from "./tag-link-proof.ts";

const evidence = process.argv[2];
assert.ok(evidence, "Usage: verify-tag-links <evidence-directory>");
mkdirSync(evidence, { recursive: true });
const scratch = mkdtempSync(join(tmpdir(), "todo-tag-proof-"));
try {
  proveProjectionTagSets();
  const result = await Effect.runPromise(
    proveTagLinks(join(scratch, "scratch.db")),
  );
  writeFileSync(
    join(evidence, "tag-links.json"),
    `${JSON.stringify(result, null, 2)}\n`,
  );
  process.stdout.write(
    "PASS Tag set projection, payloads, full/checkpoint replay, rollback, guards, Move, Delete and Revert\n",
  );
} finally {
  rmSync(scratch, { recursive: true, force: true });
}

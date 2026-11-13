import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, it } from "@effect/vitest";
import {
  auditFlagInventory,
  captureFlagInventory,
  flagGolden,
} from "../scripts/flag-inventory.ts";
import {
  proveMutationFlags,
  proveMutationUsageEarly,
} from "../scripts/mutation-flags-proof.ts";

const scratch = mkdtempSync(join(tmpdir(), "todo-cli-flags-"));
const binary = process.env.TODO_CLI_BINARY || join(scratch, "todo");
const evidence = process.env.TODO_CLI_EVIDENCE || join(scratch, "evidence");
beforeAll(() => {
  mkdirSync(evidence, { recursive: true });
  if (!process.env.TODO_CLI_BINARY) {
    const built = Bun.spawnSync(
      [
        "bun",
        "build",
        "--compile",
        resolve(import.meta.dirname, "../src/main.ts"),
        "--outfile",
        binary,
      ],
      { cwd: scratch, stdout: "pipe", stderr: "pipe" },
    );
    assert.equal(built.exitCode, 0, built.stderr.toString());
  }
});
afterAll(() => rmSync(scratch, { recursive: true, force: true }));
it("rejects every unsupported mutation flag before changing any table or database bytes", async () => {
  assert.deepEqual(
    await proveMutationFlags(binary, join(scratch, "mutation-cases"), evidence),
    { status: "PASS", cases: 64 },
  );
}, 60000);
it("keeps every compiled help flag and published schema at its reviewed contract", () => {
  const inventory = captureFlagInventory(binary, join(scratch, "inventory"));
  const audit = auditFlagInventory(inventory);
  writeFileSync(
    join(evidence, "flag-inventory.json"),
    JSON.stringify(inventory, null, 2),
  );
  writeFileSync(
    join(evidence, "flag-consumers.json"),
    JSON.stringify(audit, null, 2),
  );
  assert.deepEqual(
    flagGolden(inventory),
    JSON.parse(
      readFileSync(
        new URL("fixtures/cli-flag-contract.json", import.meta.url),
        "utf8",
      ),
    ),
  );
}, 60000);

it("rejects Delete-only flags in md and JSON before opening a store or asking for credentials", () => {
  assert.deepEqual(
    proveMutationUsageEarly(binary, join(scratch, "cold"), evidence),
    { status: "PASS", cases: 32 },
  );
}, 60000);

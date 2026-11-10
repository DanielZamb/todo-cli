import { mkdirSync, writeFileSync } from "node:fs";
import { expect, it } from "@effect/vitest";
import {
  repositoryPath,
  verificationRoot,
} from "../../../scripts/verification-inputs.ts";
import {
  type DesignReceipt,
  runDesignRecipes,
} from "../scripts/verify-design-runner.ts";

const recipes = ["first", "second", "third"];
const skipped = (id: string, reason: string): DesignReceipt => ({
  id,
  argv: ["fake", id],
  exit: null,
  status: "SKIPPED",
  evidence: id,
  reason,
});
function save(name: string, value: unknown) {
  if (!process.env.TODO_VERIFICATION_CONTROLS_DIR) return;
  const evidence = repositoryPath(
    verificationRoot(import.meta.dirname),
    process.env.TODO_VERIFICATION_CONTROLS_DIR,
    "runner control evidence",
  );
  mkdirSync(evidence, { recursive: true });
  writeFileSync(`${evidence}/${name}.json`, JSON.stringify(value, null, 2));
}
it("preserves hard Disk Stop 3 and never starts a later recipe", async () => {
  const called: string[] = [];
  const receipts: DesignReceipt[] = [];
  const exit = await runDesignRecipes(
    recipes,
    async (id) => {
      called.push(id);
      return { id, argv: ["fake", id], exit: 3, status: "FAIL", evidence: id };
    },
    skipped,
    (receipt) => receipts.push(receipt),
  );
  save("aggregate-disk-stop", { exit, called, receipts });
  expect(exit).toBe(3);
  expect(called).toEqual(["first"]);
  expect(receipts.map((item) => [item.id, item.status, item.exit])).toEqual([
    ["first", "FAIL", 3],
    ["second", "SKIPPED", null],
    ["third", "SKIPPED", null],
  ]);
  expect(receipts[1]?.reason).toBe(
    "DISK STOP: a constituent exited 3. No later recipe was started.",
  );
});
it("continues ordinary failures and preserves all constituent exits and missing scope", async () => {
  const receipts: DesignReceipt[] = [];
  const exit = await runDesignRecipes(
    recipes,
    async (id) => ({
      id,
      argv: ["fake", id],
      exit: id === "first" ? 7 : id === "second" ? 0 : null,
      status: id === "first" ? "FAIL" : id === "second" ? "PASS" : "MISSING",
      evidence: id,
    }),
    skipped,
    (receipt) => receipts.push(receipt),
  );
  save("aggregate-ordinary-failure", { exit, receipts });
  expect(exit).toBe(1);
  expect(receipts.map((item) => item.exit)).toEqual([7, 0, null]);
  expect(receipts.map((item) => item.status)).toEqual([
    "FAIL",
    "PASS",
    "MISSING",
  ]);
});

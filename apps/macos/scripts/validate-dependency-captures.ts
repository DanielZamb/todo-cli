import assert from "node:assert/strict";
import { existsSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { isAbsolute, join, relative } from "node:path";
import { Schema } from "effect";
import {
  repositoryInput,
  verificationRoot,
} from "../../../scripts/verification-inputs";

const root = verificationRoot(import.meta.dirname);
const evidence = process.argv[2] ?? "";
const directory = repositoryInput(root, evidence, "capture evidence");
const Row = Schema.Struct({
  png: Schema.NonEmptyString,
  behavior_status: Schema.Literals(["pending", "passed"]),
  behavior_receipt: Schema.NullOr(Schema.NonEmptyString),
});
const Receipt = Schema.Struct({
  command: Schema.Union([
    Schema.NonEmptyString,
    Schema.Array(Schema.NonEmptyString).check(Schema.isMinLength(1)),
  ]),
  exit: Schema.Literal(0),
  log: Schema.NonEmptyString,
});
function input(path: string, name: string) {
  assert.ok(!isAbsolute(path), `${name}: use an evidence-relative path`);
  const target = repositoryInput(root, join(evidence, path), name);
  const scoped = relative(realpathSync(directory), realpathSync(target));
  assert.ok(
    scoped !== ".." && !scoped.startsWith("../") && !isAbsolute(scoped),
    `${name}: must stay inside capture evidence`,
  );
  return target;
}
let pending = 0;
let passed = 0;
for (const name of [
  "dag-capture-manifest.json",
  "dag-graph-capture-manifest.json",
]) {
  if (!existsSync(join(directory, name))) continue;
  const rows = Schema.decodeUnknownSync(Schema.Array(Row))(
    JSON.parse(readFileSync(input(name, "capture manifest"), "utf8")),
  );
  for (const row of rows) {
    input(row.png, "capture PNG");
    if (row.behavior_status === "pending") {
      assert.equal(
        row.behavior_receipt,
        null,
        "Pending behavior cannot name a future receipt",
      );
      pending++;
    } else {
      assert.ok(
        row.behavior_receipt,
        "Passed behavior requires an actual command receipt",
      );
      const receipt = Schema.decodeUnknownSync(Receipt)(
        JSON.parse(
          readFileSync(input(row.behavior_receipt, "behavior receipt"), "utf8"),
        ),
      );
      input(receipt.log, "behavior log");
      passed++;
    }
  }
}
assert.ok(pending + passed > 0, "No Dependency capture manifest was found");
const result = {
  pending,
  passed,
  status: "PASS",
  receiptReferencesVerified: true,
};
writeFileSync(
  join(directory, "capture-inputs.json"),
  `${JSON.stringify(result, null, 2)}\n`,
);
process.stdout.write(`${JSON.stringify(result)}\n`);

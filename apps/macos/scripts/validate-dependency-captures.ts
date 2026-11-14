import assert from "node:assert/strict";
import {
  copyFileSync,
  existsSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
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
const Provenance = Schema.Struct({
  head: Schema.NonEmptyString,
  sources: Schema.Record(Schema.String, Schema.NonEmptyString),
});
const stateProof = process.argv[3];
if (stateProof) {
  const receiptPath = repositoryInput(
    root,
    stateProof,
    "successful state command",
  );
  const receipt = Schema.decodeUnknownSync(
    Schema.Struct({
      ...Receipt.fields,
      source: Schema.NonEmptyString,
      state_proof: Schema.NonEmptyString,
    }),
  )(JSON.parse(readFileSync(receiptPath, "utf8")));
  const proofInput = (name: string) =>
    repositoryInput(root, join(receipt.state_proof, name), "state proof");
  const result = Schema.decodeUnknownSync(
    Schema.Struct({ status: Schema.Literal("PASS") }),
  )(JSON.parse(readFileSync(proofInput("result.json"), "utf8")));
  Schema.decodeUnknownSync(
    Schema.Array(Schema.Struct({ exit: Schema.Literal(0) })),
  )(JSON.parse(readFileSync(proofInput("commands.json"), "utf8")));
  const source = Schema.decodeUnknownSync(Provenance)(
    JSON.parse(readFileSync(proofInput("source-provenance.json"), "utf8")),
  );
  const capture = Schema.decodeUnknownSync(Provenance)(
    JSON.parse(
      readFileSync(
        input("source-provenance.json", "capture provenance"),
        "utf8",
      ),
    ),
  );
  assert.equal(
    source.head,
    receipt.source,
    "State command source differs from its proof",
  );
  assert.equal(
    capture.head,
    source.head,
    "State and captures require the same committed source",
  );
  for (const [path, hash] of Object.entries(source.sources)) {
    assert.equal(
      capture.sources[path],
      hash,
      `State and capture source bytes differ: ${path}`,
    );
  }
  const log = readFileSync(proofInput("state-tests.log"), "utf8");
  const cases = [
    "DependencyStateTests",
    "DependencyDeleteStateTests",
    "DependencyBatchStateTests",
    "DependencyProtocolTests",
    "DependencyResponseTests",
    "DependencyReviewSnapshots",
  ];
  for (const name of cases)
    assert.ok(
      log.includes(`Suite ${name} passed`),
      `Missing successful ${name}`,
    );
  copyFileSync(
    repositoryInput(root, receipt.log, "state command log"),
    join(directory, "behavior-command.log"),
  );
  writeFileSync(join(directory, "behavior-state-tests.log"), log);
  writeFileSync(
    join(directory, "behavior-state-command.json"),
    `${JSON.stringify({ ...receipt, log: "behavior-state-tests.log", original_receipt: stateProof, result: result.status, cases }, null, 2)}\n`,
  );
  for (const name of [
    "dag-capture-manifest.json",
    "dag-graph-capture-manifest.json",
  ]) {
    if (!existsSync(join(directory, name))) continue;
    const rows = Schema.decodeUnknownSync(
      Schema.Array(Schema.Record(Schema.String, Schema.Unknown)),
    )(JSON.parse(readFileSync(input(name, "capture manifest"), "utf8")));
    const linked = rows.map((row) => {
      Schema.decodeUnknownSync(Row)(row);
      return {
        ...row,
        behavior_status: "passed",
        behavior_receipt: "behavior-state-command.json",
        behavior_scope:
          "production TodoModel state/HTTP suite; fixture assertions are in render.log; native dispatch and VoiceOver held",
        behavior_cases: cases,
      };
    });
    writeFileSync(
      join(directory, name),
      `${JSON.stringify(linked, null, 2)}\n`,
    );
  }
}
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

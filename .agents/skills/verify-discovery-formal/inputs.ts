import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { Schema } from "effect";
import { repositoryInput } from "../../../scripts/verification-inputs";

const sha256 = Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/));
const commit = Schema.String.check(Schema.isPattern(/^[a-f0-9]{40}$/));
const file = Schema.Struct({ path: Schema.String, sha256 });
export const discoveryManifest = Schema.Struct({
  candidateCommit: commit,
  backend: Schema.Struct({
    builtHead: commit,
    sourceHash: sha256,
    sourceFiles: Schema.Array(file),
    binaries: Schema.Struct({ cli: file, server: file, seed: file }),
  }),
  receipts: Schema.Array(
    Schema.Struct({
      label: Schema.String,
      path: Schema.String,
      sha256,
      actualExit: Schema.Literal(0),
    }),
  ),
});
export const inputDefault =
  "docs/evidence/discovery-formal/current-inputs.json";
export function discoveryInputs(root: string, candidate: string) {
  const path = repositoryInput(
    root,
    process.env.TODO_DISCOVERY_INPUTS ?? inputDefault,
    "TODO_DISCOVERY_INPUTS",
  );
  const inputs = Schema.decodeUnknownSync(discoveryManifest)(
    JSON.parse(readFileSync(path, "utf8")),
  );
  assert.equal(
    inputs.candidateCommit,
    candidate,
    "Run prepare-inputs.ts for this immutable candidate",
  );
  const hash = (bytes: Uint8Array) =>
    createHash("sha256").update(bytes).digest("hex");
  assert.ok(
    inputs.backend.sourceFiles.length > 0,
    "Backend source inventory is empty",
  );
  const producerHash = createHash("sha256");
  for (const source of inputs.backend.sourceFiles) {
    const path = repositoryInput(root, source.path, "backend source");
    const captured = execFileSync(
      "git",
      ["show", `${candidate}:${source.path}`],
      { cwd: root, maxBuffer: 32 * 1024 * 1024 },
    );
    assert.equal(
      hash(captured),
      source.sha256,
      `Candidate source drift: ${source.path}`,
    );
    assert.equal(
      hash(readFileSync(path)),
      source.sha256,
      `Live source drift: ${source.path}`,
    );
    producerHash.update(source.path).update(captured);
  }
  assert.equal(
    producerHash.digest("hex"),
    inputs.backend.sourceHash,
    "Backend source inventory drift",
  );
  assert.deepEqual(
    inputs.receipts.map((receipt) => receipt.label).sort(),
    [
      "domain",
      "scope-control",
      "build",
      "compiled",
      "boundaries",
      "enrichment-history",
    ].sort(),
    "Fresh discovery stages are missing",
  );
  for (const receipt of inputs.receipts) {
    const path = repositoryInput(root, receipt.path, receipt.label);
    assert.equal(
      hash(readFileSync(path)),
      receipt.sha256,
      `Fresh receipt drift: ${receipt.label}`,
    );
    assert.equal(
      Number(readFileSync(path, "utf8").trim()),
      0,
      `Fresh stage failed: ${receipt.label}`,
    );
  }
  const binary = (value: typeof inputs.backend.binaries.cli) => {
    const path = repositoryInput(root, value.path, "backend binary");
    assert.equal(
      hash(readFileSync(path)),
      value.sha256,
      `Backend binary drift: ${value.path}`,
    );
    return { ...value, path };
  };
  return {
    ...inputs,
    backend: {
      ...inputs.backend,
      binaries: {
        cli: binary(inputs.backend.binaries.cli),
        server: binary(inputs.backend.binaries.server),
        seed: binary(inputs.backend.binaries.seed),
      },
    },
  };
}

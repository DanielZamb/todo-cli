import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import inputs from "./carried-inputs.json";

const root = resolve(import.meta.dirname, "../../..");
const base = join(root, "docs/evidence/discovery-formal");
mkdirSync(base, { recursive: true });
const evidence = mkdtempSync(join(base, "inputs-"));
const hash = (path: string) =>
  createHash("sha256").update(readFileSync(path)).digest("hex");
const record = (name: string, value: unknown) =>
  writeFileSync(
    join(evidence, `${name}.json`),
    `${JSON.stringify(value, null, 2)}\n`,
  );
function equivalent(
  label: string,
  left: string,
  right: string,
  paths: string[],
) {
  const args = ["diff", "--exit-code", left, right, "--", ...paths];
  const result = spawnSync("git", args, {
    cwd: root,
    encoding: "utf8",
    timeout: 60_000,
  });
  record(label, {
    command: "git",
    args,
    actualExit: result.status,
    signal: result.signal,
    error: result.error?.message,
    stdout: result.stdout,
    stderr: result.stderr,
  });
  assert.equal(result.status, 0, `${label}: immutable reviewed input mismatch`);
}
try {
  equivalent("electron", inputs.electronCommit, inputs.candidateCommit, [
    "apps/electron",
  ]);
  equivalent("swift", inputs.swiftProofCommit, inputs.candidateCommit, [
    "apps/macos",
  ]);
  equivalent(
    "backend",
    inputs.backend.builtHead,
    inputs.candidateCommit,
    inputs.backend.sourceEquivalencePaths,
  );
  const files = inputs.receipts.map((receipt) => ({
    ...receipt,
    observed: hash(receipt.path),
  }));
  record("receipts", files);
  assert.ok(
    files.every((file) => file.sha256 === file.observed),
    "Archived reviewed receipt drift",
  );
  for (const file of files)
    if ("actualExit" in file) {
      assert.equal(
        Number(readFileSync(file.path, "utf8").trim()),
        file.actualExit,
      );
      assert.equal(file.actualExit, 0);
    }
  const binaries = Object.entries(inputs.backend.binaries).map(
    ([name, binary]) => ({ name, ...binary, observed: hash(binary.path) }),
  );
  record("binaries", { ...inputs.backend, binaries });
  assert.ok(
    binaries.every((binary) => binary.sha256 === binary.observed),
    "Fixed root backend artifact drift",
  );
  record("result", {
    passed: true,
    candidate: inputs.candidateCommit,
    evidence,
    scope:
      "carried reviewed regressions by immutable source equivalence; original exits and build identity retained",
  });
  console.log(JSON.stringify({ passed: true, evidence }));
} catch (error) {
  record("result", { passed: false, evidence, error: String(error) });
  console.error(error);
  process.exitCode = 1;
}

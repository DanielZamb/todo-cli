import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { verificationRoot } from "../../../scripts/verification-inputs";
import coverage from "./coverage.json";
import { discoveryInputs } from "./inputs";

const root = verificationRoot(import.meta.dirname);
const base = join(root, "docs/evidence/discovery-formal");
mkdirSync(base, { recursive: true });
const evidence = mkdtempSync(join(base, "inputs-"));
try {
  const inputs = discoveryInputs(
    root,
    process.argv[2] ?? coverage.candidateCommit,
  );
  writeFileSync(
    join(evidence, "result.json"),
    JSON.stringify({ passed: true, inputs, evidence }, null, 2),
  );
  console.log(JSON.stringify({ passed: true, evidence }));
} catch (error) {
  writeFileSync(
    join(evidence, "result.json"),
    JSON.stringify({ passed: false, evidence, error: String(error) }, null, 2),
  );
  console.error(error);
  process.exitCode = 1;
}

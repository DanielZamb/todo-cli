import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { beforeCompile, DiskStop } from "./compile-safety.mjs";
import { digest } from "./candidate-inputs.mjs";
const evidence = process.argv[2];
assert.ok(evidence);
const directory = mkdtempSync(join(evidence, "stop-sentinel-"));
const original = readFileSync(new URL("./DagAcyclic.tla", import.meta.url));
const scratch = join(directory, "isolated-input.tla"),
  stop = join(directory, "sentinel.json");
writeFileSync(scratch, original);
writeFileSync(
  stop,
  JSON.stringify({
    stdout: "injected stop sentinel; not a physical disk observation",
    exitCode: 3,
  }),
);
process.env.DAG_F_DISK_STOP_FILE = stop;
let compilerReached = false,
  observed = false;
try {
  writeFileSync(scratch, "isolated mutation");
  beforeCompile({ evidence, label: "stop-sentinel" });
  compilerReached = true;
} catch (error) {
  assert.ok(error instanceof DiskStop);
  observed = true;
} finally {
  writeFileSync(scratch, original);
}
assert.equal(observed, true);
assert.equal(compilerReached, false);
assert.equal(digest(readFileSync(scratch)), digest(original));
writeFileSync(
  join(evidence, "disk-safety-self-check.json"),
  JSON.stringify(
    {
      status: "pass",
      scope: "synthetic prior-stop sentinel only; no compiler called",
      compilerReached,
      byteExactRestore: true,
    },
    null,
    2,
  ),
);
rmSync(directory, { recursive: true });
console.log("PASS stop sentinel and exact isolated restore; no compile");

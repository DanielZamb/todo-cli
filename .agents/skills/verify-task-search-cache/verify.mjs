import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  copyFileSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
const root = resolve(import.meta.dirname, "../../..");
mkdirSync(join(root, "docs/evidence/perf-cache"), { recursive: true });
const evidence = mkdtempSync(join(root, "docs/evidence/perf-cache/verify-"));
const receipts = [];
const run = (label, command, args) => {
  const r = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    timeout: 600000,
    maxBuffer: 8 * 1024 * 1024,
  });
  writeFileSync(join(evidence, label + ".stdout"), r.stdout ?? "");
  writeFileSync(join(evidence, label + ".stderr"), r.stderr ?? "");
  receipts.push({ label, command, args, exit: r.status, signal: r.signal });
  writeFileSync(
    join(evidence, "commands.json"),
    JSON.stringify(receipts, null, 2),
  );
  assert.equal(r.status, 0, `${label}: ${evidence}`);
};
run("properties", "bun", [
  join(import.meta.dirname, "check.mjs"),
  ...process.argv.slice(2),
]);
run("disk", "sh", ["/Users/zambamon/Work/todo-cli/scripts/disk-guard.sh"]);
run("binaries", "bun", [".agents/skills/verify-cli/scripts/cache-binaries.ts"]);
const manifest = join(root, ".scratch/bin/build.json");
copyFileSync(manifest, join(evidence, "binary-provenance.json"));
const beforeManifest = join(
  root,
  "docs/evidence/perf-cache/before-binaries.json",
);
let oracle;
try {
  oracle = JSON.parse(readFileSync(beforeManifest, "utf8")).cli;
} catch {
  oracle = JSON.parse(readFileSync(manifest, "utf8")).cli;
}
run("lifecycle", "bun", [
  join(import.meta.dirname, "lifecycle.mjs"),
  manifest,
  join(evidence, "compiled"),
  oracle,
]);
writeFileSync(
  join(evidence, "result.json"),
  JSON.stringify(
    {
      status: "PASS",
      receipts,
      oracle,
      oracleLimit:
        oracle === JSON.parse(readFileSync(manifest, "utf8")).cli
          ? "Direct uncached generated matcher path is the oracle; no prior binary supplied."
          : "Unchanged baseline compiled CLI.",
      cleanup:
        "compiled child server exited; scratch HOME/database removed; evidence retained",
    },
    null,
    2,
  ),
);
console.log(evidence);

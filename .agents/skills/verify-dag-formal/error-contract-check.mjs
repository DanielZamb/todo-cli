import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { guardedCompiler } from "./compile-artifacts.mjs";
import { guardContext } from "./compile-safety.mjs";
import { digest, materialize } from "./candidate-inputs.mjs";
const skill = dirname(fileURLToPath(import.meta.url)), root = resolve(skill, "../../..");
const commit = process.argv[2];
assert.match(commit ?? "", /^[a-f0-9]{40}$/);
const base = join(root, "docs/evidence/dag-formal");
mkdirSync(base, { recursive: true });
const evidence = mkdtempSync(join(base, "error-contract-")), source = join(evidence, "source");
mkdirSync(source); guardContext(evidence);
const manifest = materialize(root, source, { commit });
symlinkSync(join(root, "node_modules"), join(source, "node_modules"));
symlinkSync(join(root, "packages/domain/node_modules"), join(source, "packages/domain/node_modules"));
const original = new Map(manifest.files.map(file => [file.path, readFileSync(join(source, file.path))]));
const receipts = [];
const record = () => writeFileSync(join(evidence, "result.json"), JSON.stringify({ commit, receipts, scope: "Compiled current-source error format controls and legacy decoding; not a graph or transaction theorem" }, null, 2));
async function drive(label, expected, witness) {
  const binary = join(evidence, label), imports = [];
  const result = await guardedCompiler(Bun.build.bind(Bun), { evidence, label })({
    entrypoints: [join(skill, "error-contract-properties.ts")], compile: { outfile: binary },
    plugins: [{ name: "immutable-error-contract", setup(builder) {
      builder.onResolve({ filter: /^@todo\/domain$/ }, () => ({ path: join(source, "packages/domain/src/index.ts") }));
      builder.onResolve({ filter: /^@candidate-fixtures$/ }, () => ({ path: join(source, "packages/domain/test/store-fixtures.ts") }));
      builder.onLoad({ filter: /\.(ts|js|mjs|json)$/ }, ({ path }) => {
        const actual = realpathSync(path);
        assert.ok(actual.startsWith(source + "/") || actual === join(skill, "error-contract-properties.ts") || actual.includes("/node_modules/"), "Source escaped capture");
        imports.push({ path: actual, sha256: digest(readFileSync(actual)) });
      });
    }}],
  });
  assert.equal(result.success, true);
  const run = spawnSync(binary, [], { encoding: "utf8", timeout: 60000 });
  writeFileSync(join(evidence, label + ".stdout"), run.stdout ?? "");
  writeFileSync(join(evidence, label + ".stderr"), run.stderr ?? "");
  const receipt = { label, compiled: result.success, exit: run.status, signal: run.signal, error: run.error?.message, imports, binarySha256: digest(readFileSync(binary)) };
  receipts.push(receipt); record();
  assert.equal(run.status, expected);
  if (witness) assert.match(run.stderr, witness);
  const open = spawnSync("lsof", ["-F", "pftn", "--", binary], { encoding: "utf8" });
  if (open.status === 1 && !open.stdout) { unlinkSync(binary); receipt.retired = true; record(); }
}
try {
  await drive("clean", 0);
  for (const [name, path, from, to, witness] of [
    ["missing-exit-pair", "packages/domain/src/dependency-rules.ts", "...exitStatus(2),", "", /DAG error exit pair/],
    ["schema-accepts-no-pair", "packages/domain/src/dependencies.ts", "...exitStatusFields(2),", "", /DAG public schema requires exit pair/],
  ]) {
    const target = join(source, path), bytes = original.get(path);
    assert.ok(bytes.toString().includes(from));
    try { writeFileSync(target, bytes.toString().replaceAll(from, to)); await drive(name, 1, witness); }
    finally { writeFileSync(target, bytes); }
    await drive(name + "-restored", 0);
  }
  for (const file of manifest.files) assert.equal(digest(readFileSync(join(source, file.path))), file.sha256);
  writeFileSync(join(evidence, "source-inputs.json"), JSON.stringify(manifest, null, 2));
  console.log(JSON.stringify({ passed: true, commit, evidence }));
} finally {
  for (const [path, bytes] of original) writeFileSync(join(source, path), bytes);
  record();
}

// Self-test for pin-audit.mjs: a scratch tree with every pin shape the
// correctness seat used to make the first version miss (review 3, R5), each
// with a wrong hash, plus controls. Every wrong pin must come out as drift or
// unknown, the audit must exit 1, and the controls must come out as expected.
// Usage, from the checkout root: node .agents/skills/verify-cli-routing/scripts/pin-audit-selftest.mjs
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const audit = resolve(dirname(fileURLToPath(import.meta.url)), "pin-audit.mjs");
const root = mkdtempSync(join(tmpdir(), "todo-pin-audit-"));
const sha = (text) => createHash("sha256").update(text).digest("hex");
const wrong = "0".repeat(63) + "1";
const put = (path, text) => {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), text);
};
try {
  const product = "export const product = 1;\n";
  put("apps/x.ts", product);
  put("packages/domain/src/y.ts", "export const y = 2;\n");
  put("docs/notes.md", "notes\n");
  put("packages/api/src/contract.ts", `export const CONTRACT_ID =\n  "${"c".repeat(64)}";\n`);
  const s = ".agents/skills/verify-shapes";
  const shapes = {
    source: { source: "apps/x.ts", sha256: wrong },
    map: { "apps/x.ts": wrong },
    digest: { path: "apps/x.ts", digest: wrong },
    dotSlash: { path: "./apps/x.ts", sha256: wrong },
    dotDot: { path: "../../../apps/x.ts", sha256: wrong },
    absolute: { path: join(root, "apps/x.ts"), sha256: wrong },
    nowhere: { path: "no/such/file.ts", sha256: sha(product) },
    docs: { path: "docs/notes.md", sha256: wrong },
    upper: { path: "apps/x.ts", sha256: wrong.toUpperCase() },
    domainRelative: { path: "y.ts", sha256: wrong },
    // A change record whose key is not an exact name (verify-occ-atomicity's
    // mergeReview.previousStoreSha256 beside an evidence path), and a pin whose
    // key mentions after but sits beside a path, so must still be compared.
    previousKey: { mergeReview: { previousStoreSha256: wrong, evidence: "apps/x.ts" } },
    fromOld: { from_sha256: wrong, old_hash: wrong, path: "apps/x.ts" },
    afterPin: { path: "apps/x.ts", afterRenewalSha256: wrong },
    toNoPath: { toSha256: wrong },
  };
  for (const [name, pin] of Object.entries(shapes))
    put(`${s}/${name}.json`, `${JSON.stringify(pin, null, 2)}\n`);
  put(`${s}/pins.yaml`, `pins:\n  - path: apps/x.ts\n    sha256: ${wrong.replace(/1$/, "2")}\n`);
  put(".agents/skills/not-verify/coverage.json", `${JSON.stringify({ files: [{ path: "apps/x.ts", sha256: wrong.replace(/1$/, "3") }] }, null, 2)}\n`);
  // Controls: a correct pin in upper case, a change record, a top-level contract.
  put(`${s}/controls.json`, `${JSON.stringify({
    contract: "c".repeat(64),
    files: [{ path: "apps/x.ts", sha256: sha(product).toUpperCase() }],
    review: { changes: [{ path: "apps/x.ts", sha256: "d".repeat(64) }] },
  }, null, 2)}\n`);

  const run = spawnSync(process.execPath, [audit, "--worktree", join(root, "out.json")], { cwd: root, encoding: "utf8" });
  const result = JSON.parse(run.stdout);
  const records = JSON.parse(spawnSync("cat", [join(root, "out.json")], { encoding: "utf8" }).stdout).records;
  const by = (file) => records.filter((r) => r.file === file).map((r) => r.status ?? r.class);
  const expectations = {
    [`${s}/source.json`]: ["drift"],
    [`${s}/map.json`]: ["drift"],
    [`${s}/digest.json`]: ["drift"],
    [`${s}/dotSlash.json`]: ["drift"],
    [`${s}/dotDot.json`]: ["drift"],
    [`${s}/absolute.json`]: ["drift"],
    [`${s}/nowhere.json`]: ["unknown"],
    [`${s}/docs.json`]: ["drift"],
    [`${s}/upper.json`]: ["drift"],
    [`${s}/domainRelative.json`]: ["drift"],
    [`${s}/pins.yaml`]: ["unknown"],
    [".agents/skills/not-verify/coverage.json"]: ["drift"],
    [`${s}/controls.json`]: ["match", "match", "historical"],
    [`${s}/previousKey.json`]: ["historical"],
    [`${s}/fromOld.json`]: ["historical", "historical"],
    [`${s}/afterPin.json`]: ["drift"],
    [`${s}/toNoPath.json`]: ["historical"],
  };
  const observed = Object.fromEntries(Object.keys(expectations).map((file) => [file, by(file)]));
  assert.deepEqual(observed, expectations);
  assert.equal(run.status, 1);
  assert.equal(result.unknown, 2);
  assert.equal(result.compared.drift, 11);
  // --ledger: a ledger read from elsewhere classifies a value in this tree.
  const yamlValue = wrong.replace(/1$/, "2");
  const outside = join(root, "..", `${root.split("/").pop()}-ledger.json`);
  writeFileSync(outside, JSON.stringify({ entries: [{ file: `${s}/pins.yaml`, value: yamlValue, reason: "self-test" }] }));
  const withLedger = spawnSync(process.execPath, [audit, "--worktree", "--ledger", outside], { cwd: root, encoding: "utf8" });
  rmSync(outside, { force: true });
  assert.equal(JSON.parse(withLedger.stdout).unknown, 1);
  console.log(JSON.stringify({ pass: true, exit: run.status, observed, unknownWithExternalLedger: 1 }, null, 2));
} finally {
  rmSync(root, { recursive: true, force: true });
}

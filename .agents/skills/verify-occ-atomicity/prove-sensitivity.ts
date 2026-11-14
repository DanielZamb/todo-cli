import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import coverage from "./coverage.json";

const root = resolve(import.meta.dirname, "../../..");
const path = join(root, "packages/domain/src/store/store.ts");
const original = readFileSync(path, "utf8");
const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
assert.equal(
  digest(original),
  coverage.files.find(({ path }) => path.endsWith("/store.ts"))?.sha256,
  "Sensitivity proof requires the confirmed source, with no existing store edits",
);
const base = join(root, "docs/evidence/fv01");
mkdirSync(base, { recursive: true });
const evidence = mkdtempSync(join(base, "sensitivity-"));
writeFileSync(join(evidence, "store-original.ts"), original);
const guard =
  'if (!same(current, change.before)) throw new Rejection("conflict");';
const apply = "        applyEvent(this.db, event, input.profile);";
assert.equal(
  original.split(guard).length,
  3,
  "Expected Task and Series before checks",
);
assert.equal(original.split(apply).length, 2);
const variants = [
  {
    name: "missing-task-before-check",
    source: original.replace(guard, ""),
    expectedFailure:
      /"expectedCommit":false.*"observed":\{"outcome":"committed"/s,
  },
  {
    name: "missing-edit-projection",
    source: original.replace(
      apply,
      '        if (event.kind !== "TaskEdited") applyEvent(this.db, event, input.profile);',
    ),
    expectedFailure: /ERR_ASSERTION|AssertionError/,
  },
];
const results: { name: string; exitCode: number | null; restored: boolean }[] =
  [];
for (const variant of variants) {
  try {
    writeFileSync(path, variant.source);
    const diff = spawnSync(
      "git",
      ["diff", "--", "packages/domain/src/store/store.ts"],
      { cwd: root, encoding: "utf8" },
    );
    assert.equal(diff.status, 0);
    writeFileSync(join(evidence, `${variant.name}.patch`), diff.stdout);
    const result = spawnSync("bun", [join(import.meta.dirname, "check.ts")], {
      cwd: root,
      encoding: "utf8",
      timeout: 60000,
      maxBuffer: 8 * 1024 * 1024,
    });
    writeFileSync(
      join(evidence, `${variant.name}.stdout`),
      result.stdout ?? "",
    );
    writeFileSync(
      join(evidence, `${variant.name}.stderr`),
      result.stderr ?? "",
    );
    assert.equal(result.status, 1, `${variant.name} must fail the one command`);
    const match = result.stderr.match(/FAIL: evidence: ([^\n]+)/);
    const runEvidence = match?.[1];
    assert.ok(runEvidence, "Failed run must preserve its evidence");
    const observed = readFileSync(
      join(runEvidence, "enumerate.stderr"),
      "utf8",
    );
    assert.match(
      observed,
      variant.expectedFailure,
      "The real code must violate the property before the source-drift gate",
    );
    results.push({
      name: variant.name,
      exitCode: result.status,
      restored: false,
    });
  } finally {
    writeFileSync(path, original);
    assert.equal(digest(readFileSync(path, "utf8")), digest(original));
    const last = results.at(-1);
    if (last?.name === variant.name) last.restored = true;
    writeFileSync(
      join(evidence, "result.json"),
      `${JSON.stringify(results, null, 2)}\n`,
    );
  }
}
const restored = spawnSync("bun", [join(import.meta.dirname, "check.ts")], {
  cwd: root,
  encoding: "utf8",
  timeout: 60000,
  maxBuffer: 8 * 1024 * 1024,
});
writeFileSync(join(evidence, "restored.stdout"), restored.stdout ?? "");
writeFileSync(join(evidence, "restored.stderr"), restored.stderr ?? "");
results.push({
  name: "restored",
  exitCode: restored.status,
  restored: digest(readFileSync(path, "utf8")) === digest(original),
});
writeFileSync(
  join(evidence, "result.json"),
  `${JSON.stringify(results, null, 2)}\n`,
);
assert.equal(
  restored.status,
  0,
  "The restored code must pass the same command",
);
console.log(
  `PASS: both real-code breaks failed with exit 1; restored command exited 0. Evidence: ${evidence}`,
);

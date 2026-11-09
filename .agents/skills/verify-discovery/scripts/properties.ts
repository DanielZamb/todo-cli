import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "../../../..");
const evidence = process.argv[2];
assert.ok(evidence?.startsWith("/"));
mkdirSync(evidence, { recursive: true });
const file = resolve(root, "packages/domain/src/auth/auth.ts");
const original = readFileSync(file);
const text = original.toString();
const predicate = "credential.profile === null || profile.id === credential.profile";
const readScope = /access !== "profiles" &&\s+value.profile !== null &&\s+value.profile !== profile/u;
assert.equal(text.split(predicate).length, 2);
assert.match(text, readScope);
const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const checkpoints: { stage: string; liveSha256: string }[] = [];
const unchanged = (stage: string) => {
  const liveSha256 = hash(readFileSync(file));
  assert.equal(liveSha256, hash(original));
  checkpoints.push({ stage, liveSha256 });
};
const scratch = mkdtempSync(join(tmpdir(), "todo-discovery-mutant-"));
const copy = join(scratch, "packages/domain");
const mutantFile = join(copy, "src/auth/auth.ts");
const run = (name: string, cwd: string, expected: number) => {
  unchanged(`before ${name}`);
  const result = spawnSync("bun", ["--bun", join(root, "packages/domain/node_modules/vitest/vitest.mjs"), "run", "test/discovery.test.ts", "-t", "generated authorized"], { cwd, encoding: "utf8", timeout: 120000 });
  unchanged(`after ${name}`);
  writeFileSync(join(evidence, `${name}.log`), result.stdout + result.stderr);
  assert.equal(result.status, expected);
  if (expected !== 0) assert.match(result.stdout + result.stderr, /AssertionError/);
  return result.status;
};
try {
  mkdirSync(join(copy, "test"), { recursive: true });
  copyFileSync(join(root, "tsconfig.base.json"), join(scratch, "tsconfig.base.json"));
  for (const name of ["package.json", "tsconfig.json"]) copyFileSync(join(root, "packages/domain", name), join(copy, name));
  for (const name of ["discovery.test.ts", "store-fixtures.ts"]) copyFileSync(join(root, "packages/domain/test", name), join(copy, "test", name));
  cpSync(join(root, "packages/domain/src"), join(copy, "src"), { recursive: true });
  symlinkSync(join(root, "node_modules"), join(scratch, "node_modules"), "dir");
  symlinkSync(join(root, "packages/domain/node_modules"), join(copy, "node_modules"), "dir");
  assert.equal(hash(readFileSync(mutantFile)), hash(original));
  const baseline = run("baseline", join(root, "packages/domain"), 0);
  writeFileSync(mutantFile, text.replace(predicate, "true").replace(readScope, "false"));
  unchanged("mutant created only in source copy");
  assert.notEqual(hash(readFileSync(mutantFile)), hash(original));
  const mutation = run("scope-removal", copy, 1);
  writeFileSync(mutantFile, original);
  assert.equal(hash(readFileSync(mutantFile)), hash(original));
  const restored = run("restored", copy, 0);
  const clean = run("clean-worktree", join(root, "packages/domain"), 0);
  unchanged("finished");
  writeFileSync(join(evidence, "result.json"), JSON.stringify({ baseline, mutation, restored, clean, isolatedSourceCopy: scratch, originalTrackedBytesUnchanged: true, originalSha256: hash(original), checkpoints }, null, 2));
} finally {
  unchanged("cleanup");
  rmSync(scratch, { recursive: true, force: true });
}

import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
const root = resolve(import.meta.dirname, "../../../..");
const evidence = mkdtempSync(
  join(root, "docs/evidence/perf-cache/admission-code-"),
);
const source = join(evidence, "source");
mkdirSync(source);
const sec =
  process.argv[2] ??
  execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  }).trim();
assert.match(sec, /^[a-f0-9]{40}$/);
const archive = join(evidence, "sec-api.tar");
assert.equal(
  spawnSync(
    "git",
    [
      "archive",
      "--format=tar",
      `--output=${archive}`,
      sec,
      "packages/domain/src",
      "packages/domain/test/store-fixtures.ts",
    ],
    { cwd: root },
  ).status,
  0,
);
assert.equal(spawnSync("tar", ["-xf", archive, "-C", source]).status, 0);
symlinkSync(join(root, "node_modules"), join(source, "node_modules"));
symlinkSync(
  join(root, "packages/domain/node_modules"),
  join(source, "packages/domain/node_modules"),
);
const cachePath = join(source, "packages/domain/src/task-search-cache.ts");
const candidate = process.argv[3] ?? cachePath;
if (candidate !== cachePath) copyFileSync(candidate, cachePath);
copyFileSync(
  join(import.meta.dirname, "properties.ts"),
  join(source, "properties.ts"),
);
const original = readFileSync(cachePath, "utf8");
const hash = (value) => createHash("sha256").update(value).digest("hex");
const matcherPath = join(
  root,
  ".agents/skills/verify-task-search-formal/matcher-properties.ts",
);
const generatorSource = readFileSync(matcherPath, "utf8");
const atoms = /const atoms = (\[[\s\S]*?\]);/.exec(generatorSource)?.[1];
assert.ok(atoms);
const corpusEnv = {
  ...process.env,
  CACHE_ATOMS: JSON.stringify(Function(`return (${atoms})`)()),
};
const receipts = [];
const run = (label, args) => {
  const r = spawnSync("bun", ["properties.ts", ...args], {
    cwd: source,
    env: corpusEnv,
    encoding: "utf8",
    timeout: 120000,
    maxBuffer: 8 * 1024 * 1024,
  });
  writeFileSync(join(evidence, label + ".stdout"), r.stdout ?? "");
  writeFileSync(join(evidence, label + ".stderr"), r.stderr ?? "");
  receipts.push({ label, exit: r.status, signal: r.signal });
  writeFileSync(
    join(evidence, "commands.json"),
    JSON.stringify(receipts, null, 2),
  );
  return r;
};
assert.equal(run("clean", []).status, 0, evidence);
const controls = [
  {
    name: "no-eviction",
    from: "!this.reserve(bytes, entryLimit - 1)",
    to: "false",
    witness: "EntryBound after eviction",
    mode: "capacity",
  },
  {
    name: "key-without-text",
    from: "`${profile.length}:${profile}${text}`",
    to: "`${profile.length}:${profile}`",
    witness: "text key",
  },
  {
    name: "key-without-profile",
    from: "`${profile.length}:${profile}${text}`",
    to: "text",
    witness: "Profile isolation",
  },
  {
    name: "insert-incomplete",
    from: "const token = this.register(read, key, bytes);",
    to: "const token = this.register(read, key, bytes); if (token) this.retain(key, token, { words: [], preparedUnits: 0 });",
    witness: "HitIsComplete",
  },
  {
    name: "no-admission",
    from: "token && this.pending.get(key) === token && this.canAdmit(read)",
    to: "token && this.canAdmit(read)",
    witness: "NoInsertAfterEvict",
  },
  {
    name: "pending-after-eviction",
    from: "if (token) this.dropPending(key, token);",
    to: "",
    witness: "Evict removes pending slot and charge",
  },
  {
    name: "interrupt-leak",
    from: "finally {\n      if (token) this.dropPending(key, token);",
    to: "finally {",
    witness: "interrupt cleanup clears own token and charge",
  },
  {
    name: "no-generation",
    from: "read.generation === (this.purgeGen.get(read.profile) ?? 0)",
    to: "true",
    witness: "NoStaleReadRetention",
  },
  {
    name: "unconditional-cleanup",
    from: "if (this.pending.get(key) === token) {",
    to: "if (this.pending.has(key)) {",
    witness: "OwnSlotCleanup",
  },
];
controls.push(
  {
    name: "no-epoch",
    from: "read.epoch === this.epoch",
    to: "true",
    witness: "NoStaleReadRetention ClearAll pending and slotless reads",
  },
  {
    name: "clear-pending-leak",
    mode: "clear-only",
    from: "this.pending.clear();",
    to: "",
    witness: "ClearAll removes pending slot and charge",
  },
);
for (const c of controls) {
  const count = original.split(c.from).length - 1;
  assert.ok(count >= 1, c.name);
  try {
    let changed = original;
    if (c.name === "pending-after-eviction") {
      const start = changed.indexOf("  evict(profile:");
      const end = changed.indexOf("  evictProfile(", start);
      assert.ok(start >= 0 && end > start);
      changed =
        changed.slice(0, start) +
        changed.slice(start, end).replace(c.from, c.to) +
        changed.slice(end);
    } else changed = changed.replace(c.from, c.to);
    writeFileSync(cachePath, changed);
    const r = run(c.name, [c.mode ?? "controls"]);
    assert.equal(r.status, 1, c.name);
    assert.match(r.stderr, /AssertionError/);
    assert.ok(r.stderr.includes(c.witness), c.name + " literal witness");
  } finally {
    writeFileSync(cachePath, original);
    assert.equal(hash(readFileSync(cachePath)), hash(original));
  }
}
assert.equal(run("restored", []).status, 0, evidence);
writeFileSync(
  join(source, "tsconfig.json"),
  JSON.stringify({
    extends: join(root, "tsconfig.base.json"),
    compilerOptions: {
      types: ["bun"],
      typeRoots: [
        join(root, "packages/domain/node_modules/@types"),
        join(root, "node_modules/@types"),
      ],
    },
    include: [
      "properties.ts",
      "packages/domain/src/**/*.ts",
      "packages/domain/test/store-fixtures.ts",
    ],
  }),
);
const typecheck = spawnSync(
  "bun",
  [
    "--bun",
    join(root, "node_modules/typescript/bin/tsc"),
    "--noEmit",
    "-p",
    join(source, "tsconfig.json"),
  ],
  { cwd: source, encoding: "utf8", timeout: 120000 },
);
writeFileSync(join(evidence, "typecheck.stdout"), typecheck.stdout ?? "");
writeFileSync(join(evidence, "typecheck.stderr"), typecheck.stderr ?? "");
assert.equal(typecheck.status, 0, evidence);
writeFileSync(
  join(evidence, "result.json"),
  JSON.stringify(
    {
      status: "PASS",
      sourceCommit: sec,
      candidateHash: hash(original),
      candidate,
      receipts,
      limits:
        "Immutable integrated cache and SEC runner; finite real Effect controls and accounting bounds, not unbounded safety/RSS proof",
    },
    null,
    2,
  ),
);
console.log(evidence);

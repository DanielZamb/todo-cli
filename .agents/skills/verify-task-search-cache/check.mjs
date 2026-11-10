import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
  symlinkSync,
} from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "../../..");
const evidence = mkdtempSync(join(root, "docs/evidence/perf-cache/generated-"));
const source = join(evidence, "source");
const commit = process.argv[2];
mkdirSync(source);
const run = (label, command, args, env = process.env) => {
  const result = spawnSync(command, args, {
    cwd: source,
    env,
    encoding: "utf8",
    timeout: 240000,
    maxBuffer: 8 * 1024 * 1024,
  });
  writeFileSync(join(evidence, label + ".stdout"), result.stdout ?? "");
  writeFileSync(join(evidence, label + ".stderr"), result.stderr ?? "");
  writeFileSync(
    join(evidence, label + ".json"),
    JSON.stringify({
      command,
      args,
      exit: result.status,
      signal: result.signal,
    }),
  );
  return result;
};
if (commit) {
  assert.match(commit, /^[a-f0-9]{40}$/);
  const archive = join(evidence, "candidate.tar");
  assert.equal(
    spawnSync(
      "git",
      [
        "archive",
        "--format=tar",
        `--output=${archive}`,
        commit,
        "packages/domain/src",
        "packages/domain/test/store-fixtures.ts",
      ],
      { cwd: root },
    ).status,
    0,
  );
  assert.equal(spawnSync("tar", ["-xf", archive, "-C", source]).status, 0);
} else {
  cpSync(
    join(root, "packages/domain/src"),
    join(source, "packages/domain/src"),
    { recursive: true },
  );
  mkdirSync(join(source, "packages/domain/test"), { recursive: true });
  cpSync(
    join(root, "packages/domain/test/store-fixtures.ts"),
    join(source, "packages/domain/test/store-fixtures.ts"),
  );
}
symlinkSync(join(root, "node_modules"), join(source, "node_modules"));
symlinkSync(
  join(root, "packages/domain/node_modules"),
  join(source, "packages/domain/node_modules"),
);
cpSync(
  join(import.meta.dirname, "properties.ts"),
  join(source, "properties.ts"),
);
cpSync(
  join(import.meta.dirname, "meter-properties.ts"),
  join(source, "meter-properties.ts"),
);
const matcherGenerators = readFileSync(
  join(root, ".agents/skills/verify-task-search-formal/matcher-properties.ts"),
  "utf8",
);
const atoms = /const atoms = (\[[\s\S]*?\]);/.exec(matcherGenerators)?.[1];
assert.ok(atoms);
const env = {
  ...process.env,
  CACHE_ATOMS: JSON.stringify(Function(`return (${atoms})`)()),
  CACHE_WITNESS: join(evidence, "witness.json"),
};
const hash = (p) => createHash("sha256").update(readFileSync(p)).digest("hex");
const paths = [
  "task-search-cache.ts",
  "task-search.ts",
  "task-filters.ts",
  "commands.ts",
  "store/store.ts",
  "store/snapshots.ts",
  "store/search-cache-events.ts",
];
const hashes = Object.fromEntries(
  paths.map((p) => [p, hash(join(source, "packages/domain/src", p))]),
);
writeFileSync(
  join(evidence, "sources.json"),
  JSON.stringify(
    {
      commit: commit ?? "worktree candidate",
      hashes,
      corpusSourceHash: hash(
        join(
          root,
          ".agents/skills/verify-task-search-formal/matcher-properties.ts",
        ),
      ),
    },
    null,
    2,
  ),
);
assert.equal(
  run("clean-before", "bun", ["properties.ts"], env).status,
  0,
  evidence,
);
assert.equal(
  run("meter", "bun", ["meter-properties.ts"], env).status,
  0,
  evidence,
);
const mutations = [
  {
    name: "key-without-text",
    path: "task-search-cache.ts",
    from: "`${profile.length}:${profile}${text}`",
    to: "`${profile.length}:${profile}`",
    witness: "text-key edit witness",
  },
  {
    name: "key-without-profile",
    path: "task-search-cache.ts",
    from: "`${profile.length}:${profile}${text}`",
    to: "text",
    witness: "profile-isolation",
  },
  {
    name: "no-eviction",
    path: "task-search-cache.ts",
    from: "!this.reserve(bytes, entryLimit - 1)",
    to: "false",
    witness: "entry-limit after eviction",
  },
  {
    name: "purge-without-eviction",
    path: "store/store.ts",
    from: "this.searchWords.clearAll();",
    to: "",
    witness: "purge-hygiene",
  },
  {
    name: "restore-without-clear",
    path: "store/snapshots.ts",
    from: "this.afterRestore();",
    to: "",
    witness: "restore-hygiene",
  },
  {
    name: "profile-without-eviction",
    path: "store/store.ts",
    from: "this.searchWords.evictProfile(profile.id);",
    to: "",
    witness: "profile-delete-hygiene",
  },
  {
    name: "close-without-cleanup",
    path: "store/store.ts",
    from: "this.searchWords.close();",
    to: "",
    witness: "close-hygiene",
  },
];
const controls = [];
for (const m of mutations) {
  const path = join(source, "packages/domain/src", m.path);
  const original = readFileSync(path, "utf8");
  assert.equal(original.split(m.from).length, 2, m.name);
  try {
    writeFileSync(path, original.replace(m.from, m.to));
    const result = run(m.name, "bun", ["properties.ts"], env);
    assert.equal(result.status, 1, m.name);
    assert.match(result.stderr, /AssertionError/);
    assert.ok(
      result.stderr.includes(m.witness),
      m.name + " must reach the intended behavioral assertion",
    );
    controls.push({ name: m.name, exit: result.status, witness: m.witness });
  } finally {
    writeFileSync(path, original);
    assert.equal(hash(path), hashes[m.path]);
  }
}
assert.equal(
  run("clean-restored", "bun", ["properties.ts"], env).status,
  0,
  evidence,
);
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
      "meter-properties.ts",
      "packages/domain/src/**/*.ts",
      "packages/domain/test/store-fixtures.ts",
    ],
  }),
);
assert.equal(
  run("typecheck", "bun", [
    "--bun",
    join(root, "node_modules/typescript/bin/tsc"),
    "--noEmit",
    "-p",
    join(source, "tsconfig.json"),
  ]).status,
  0,
  evidence,
);
const coverage = JSON.parse(
  readFileSync(join(import.meta.dirname, "coverage.json"), "utf8"),
);
writeFileSync(
  join(evidence, "behavior-result.json"),
  JSON.stringify(
    {
      status: "PASS_BEFORE_MAPPING_GATE",
      hashes,
      controls,
      restored: true,
      strictTypecheck: 0,
    },
    null,
    2,
  ),
);
for (const file of coverage.files)
  assert.equal(
    hashes[file.path],
    file.sha256,
    `Source mapping changed: ${file.path}. Review conformance and sensitivity before renewal.`,
  );
writeFileSync(
  join(evidence, "result.json"),
  JSON.stringify(
    {
      status: "PASS",
      commit,
      controls,
      restored: true,
      limits:
        "finite generated corpus and deterministic accounting, no unbounded safety or RSS theorem",
    },
    null,
    2,
  ),
);
console.log(evidence);

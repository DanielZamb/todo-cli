import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cpSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
const root = resolve(import.meta.dirname, "../../..");
const evidence = mkdtempSync(join(root, "docs/evidence/perf-cache/hygiene-"));
const source = join(evidence, "source");
mkdirSync(source);
const commit = process.argv[2];
if (commit) {
  assert.match(commit, /^[a-f0-9]{40}$/);
  const archive = join(evidence, "source.tar");
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
        "apps/server/src",
      ],
      { cwd: root },
    ).status,
    0,
  );
  assert.equal(spawnSync("tar", ["-xf", archive, "-C", source]).status, 0);
} else
  for (const path of [
    "packages/domain/src",
    "packages/domain/test/store-fixtures.ts",
    "apps/server/src",
  ])
    cpSync(join(root, path), join(source, path), { recursive: true });
symlinkSync(join(root, "node_modules"), join(source, "node_modules"));
symlinkSync(
  join(root, "packages/domain/node_modules"),
  join(source, "packages/domain/node_modules"),
);
copyFileSync(
  join(import.meta.dirname, "hygiene-properties.ts"),
  join(source, "hygiene-properties.ts"),
);
const receipts = [];
const run = (label) => {
  const r = spawnSync("bun", ["hygiene-properties.ts"], {
    cwd: source,
    encoding: "utf8",
    timeout: 60000,
  });
  writeFileSync(join(evidence, `${label}.stdout`), r.stdout ?? "");
  writeFileSync(join(evidence, `${label}.stderr`), r.stderr ?? "");
  receipts.push({ label, exit: r.status, signal: r.signal });
  writeFileSync(
    join(evidence, "commands.json"),
    JSON.stringify(receipts, null, 2),
  );
  return r;
};
assert.equal(run("clean").status, 0, evidence);
const mutants = [
  {
    name: "without-hook",
    path: "apps/server/src/task-search-cache-hygiene.ts",
    from: "store.searchWords.clearAll();",
    to: ";",
    witness: "external Purge hook clears retained and pending",
  },
  {
    name: "without-generation-clear",
    path: "apps/server/src/task-search-cache-hygiene.ts",
    from: "current.generation !== cursor.generation",
    to: "false",
    witness: "restore generation clears even Purge below old cursor",
  },
  {
    name: "include-rejected",
    path: "packages/domain/src/store/search-cache-events.ts",
    from: " AND outcome='committed'",
    to: "",
    witness: "committed-only narrow tail",
  },
];
const sha = (x) => createHash("sha256").update(x).digest("hex");
for (const mutant of mutants) {
  const path = join(source, mutant.path),
    original = readFileSync(path, "utf8");
  assert.equal(original.split(mutant.from).length, 2, mutant.name);
  try {
    writeFileSync(path, original.replace(mutant.from, mutant.to));
    const r = run(mutant.name);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /AssertionError/);
    assert.ok(r.stderr.includes(mutant.witness), mutant.name);
  } finally {
    writeFileSync(path, original);
    assert.equal(sha(readFileSync(path)), sha(original));
  }
}
assert.equal(run("restored").status, 0, evidence);
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
      paths: {
        "@todo/domain/store": [
          join(source, "packages/domain/src/store/store.ts"),
        ],
      },
    },
    include: [
      "hygiene-properties.ts",
      "packages/domain/src/**/*.ts",
      "packages/domain/test/store-fixtures.ts",
      "apps/server/src/task-search-cache-hygiene.ts",
    ],
  }),
);
const typed = spawnSync(
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
writeFileSync(join(evidence, "typecheck.stdout"), typed.stdout ?? "");
writeFileSync(join(evidence, "typecheck.stderr"), typed.stderr ?? "");
assert.equal(typed.status, 0, evidence);
const coverage = JSON.parse(
  readFileSync(join(import.meta.dirname, "coverage.json"), "utf8"),
);
for (const file of coverage.hygieneFiles.filter(
  (x) => !x.path.startsWith("apps/cli/"),
))
  assert.equal(
    sha(readFileSync(join(source, file.path))),
    file.sha256,
    "Hygiene source mapping drift: " + file.path,
  );
writeFileSync(
  join(evidence, "result.json"),
  JSON.stringify(
    {
      status: "PASS",
      commit: commit ?? "working candidate",
      receipts,
      scope:
        "real production observer/query, two stores on one scratch DB; bounded transport latency is proved separately through compiled CLI/server",
    },
    null,
    2,
  ),
);
console.log(evidence);

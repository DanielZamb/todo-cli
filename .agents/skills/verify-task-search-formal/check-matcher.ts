import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { Schema } from "effect";
import candidate from "./matcher-candidate.json";
import { verificationRoot } from "../../../scripts/verification-inputs";

const skill = import.meta.dirname;
const root = verificationRoot(skill);
const base = join(root, "docs/evidence/task-search-formal");
mkdirSync(base, { recursive: true });
const evidence = mkdtempSync(join(base, "matcher-"));
const source = join(evidence, "source");
mkdirSync(source);
const commit = process.argv[2] ?? candidate.commit;
const status =
  commit === candidate.commit
    ? candidate.status
    : "explicit-commit-check; integration provenance belongs to caller";
const sha256 = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");
const record = (name: string, value: unknown) =>
  writeFileSync(
    join(evidence, `${name}.json`),
    `${JSON.stringify(value, null, 2)}\n`,
  );
function execute(label: string, command: string, args: string[], cwd = root) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    timeout: 60000,
    maxBuffer: 8 * 1024 * 1024,
  });
  writeFileSync(join(evidence, `${label}.stdout`), result.stdout ?? "");
  writeFileSync(join(evidence, `${label}.stderr`), result.stderr ?? "");
  record(label, {
    command,
    args,
    cwd,
    exit: result.status,
    signal: result.signal,
    error: result.error?.message,
  });
  return result;
}
function success(label: string, command: string, args: string[], cwd = root) {
  const result = execute(label, command, args, cwd);
  assert.equal(result.status, 0, `${label} failed; inspect ${evidence}`);
  return result.stdout;
}
const Outcome = Schema.Struct({
  passed: Schema.Boolean,
  kind: Schema.optionalKey(Schema.String),
  property: Schema.optionalKey(Schema.String),
});
const mutations = [
  {
    property: "normalization",
    path: "task-search-case-fold.ts",
    from: '["A", "a"]',
    to: '["A", "B"]',
  },
  {
    property: "positive-and",
    path: "task-search.ts",
    from: "if (!occurrences.length) return { accepted: false, matches: [] };",
    to: "if (!occurrences.length && clauses.length === 1) return { accepted: false, matches: [] };",
  },
  {
    property: "phrase-subset",
    path: "task-search.ts",
    from: "phrase.words.every((word, index) =>",
    to: "phrase.words.some((word, index) =>",
  },
  {
    property: "prefix",
    path: "task-filters.ts",
    from: ".startsWith(prefix)",
    to: ".includes(prefix)",
  },
  {
    property: "spans",
    path: "task-search.ts",
    from: "end: last.end",
    to: "end: last.end - 1",
  },
];

try {
  assert.match(commit, /^[0-9a-f]{40}$/, "Pass a full immutable commit SHA");
  assert.equal(
    success("commit-type", "git", ["cat-file", "-t", commit]).trim(),
    "commit",
  );
  success("archive", "git", [
    "archive",
    "--format=tar",
    `--output=${join(evidence, "candidate.tar")}`,
    commit,
    "packages/domain/src",
    "packages/domain/package.json",
  ]);
  success("extract", "tar", [
    "-xf",
    join(evidence, "candidate.tar"),
    "-C",
    source,
  ]);
  symlinkSync(
    join(root, "packages/domain/node_modules"),
    join(source, "packages/domain/node_modules"),
  );
  symlinkSync(join(root, "node_modules"), join(source, "node_modules"));
  const paths = success("source-list", "git", [
    "ls-tree",
    "-r",
    "--name-only",
    commit,
    "--",
    "packages/domain/src",
  ])
    .trim()
    .split("\n");
  const hashes = paths.map((path) => ({
    path,
    sha256: sha256(readFileSync(join(source, path))),
  }));
  for (const path of paths) {
    assert.equal(lstatSync(join(source, path)).isSymbolicLink(), false);
    assert.notEqual(
      lstatSync(join(source, path)).ino,
      lstatSync(join(root, path)).ino,
    );
  }
  record("provenance", {
    ...candidate,
    commit,
    status,
    runtime: process.versions,
    capturedVia: "git archive",
    files: hashes,
    driverHash: sha256(readFileSync(join(skill, "matcher-properties.ts"))),
  });
  copyFileSync(
    join(skill, "matcher-properties.ts"),
    join(source, "matcher-properties.ts"),
  );
  writeFileSync(
    join(source, "tsconfig.json"),
    JSON.stringify(
      {
        extends: join(root, "tsconfig.base.json"),
        compilerOptions: {
          types: ["bun"],
          typeRoots: [
            join(root, "packages/domain/node_modules/@types"),
            join(root, "node_modules/@types"),
          ],
        },
        include: ["matcher-properties.ts", "packages/domain/src/**/*.ts"],
      },
      null,
      2,
    ),
  );
  const clean = success(
    "clean",
    "bun",
    [join(source, "matcher-properties.ts")],
    source,
  );
  const observed: unknown = JSON.parse(clean);
  assert.equal(Schema.decodeUnknownSync(Outcome)(observed).passed, true);
  for (const mutation of mutations) {
    const path = join(source, "packages/domain/src", mutation.path);
    const original = readFileSync(path, "utf8");
    assert.equal(
      original.split(mutation.from).length,
      2,
      `Mutation anchor changed: ${mutation.property}`,
    );
    try {
      const broken = original.replace(mutation.from, mutation.to);
      writeFileSync(path, broken);
      record(`mutation-${mutation.property}`, {
        ...mutation,
        originalHash: sha256(original),
        mutatedHash: sha256(broken),
      });
      copyFileSync(path, join(evidence, `broken-${mutation.property}.ts`));
      const result = execute(
        `broken-${mutation.property}`,
        "bun",
        [join(source, "matcher-properties.ts"), mutation.property],
        source,
      );
      assert.equal(
        result.status,
        1,
        `${mutation.property} did not fail on its production-code break`,
      );
      const value: unknown = JSON.parse(result.stdout);
      const failure = Schema.decodeUnknownSync(Outcome)(value);
      assert.equal(failure.passed, false);
      assert.equal(failure.kind, "behavior-assertion");
      assert.equal(failure.property, mutation.property);
    } finally {
      writeFileSync(path, original);
      assert.equal(
        sha256(readFileSync(path)),
        sha256(original),
        "Scratch source restoration failed",
      );
      success(
        `restored-${mutation.property}`,
        "bun",
        [join(source, "matcher-properties.ts"), mutation.property],
        source,
      );
    }
  }
  success("restored", "bun", [join(source, "matcher-properties.ts")], source);
  assert.ok(
    hashes.every(
      ({ path, sha256: expected }) =>
        sha256(readFileSync(join(source, path))) === expected,
    ),
    "Captured source changed",
  );
  success(
    "typecheck-properties",
    "bun",
    [
      "--bun",
      join(root, "node_modules/typescript/bin/tsc"),
      "-p",
      join(source, "tsconfig.json"),
    ],
    source,
  );
  success("typecheck-runner", "bun", [
    "--bun",
    "node_modules/typescript/bin/tsc",
    "-p",
    join(skill, "tsconfig.json"),
  ]);
  record("result", {
    passed: true,
    commit,
    evidence,
    candidateStatus: status,
    clean: observed,
    sensitivity: mutations.map(({ property }) => ({
      property,
      exit: 1,
      restored: true,
    })),
    integrationCheck:
      process.argv[2] === undefined
        ? "pinned-reviewed-commit"
        : "explicit-immutable-commit",
    clientOrdering: "Separate bounded model and production mapping in check.ts",
  });
  console.log(
    JSON.stringify({
      passed: true,
      commit,
      evidence,
      clientOrdering:
        "Separate bounded model and production mapping in check.ts",
    }),
  );
} catch (error) {
  record("result", { passed: false, commit, evidence, error: String(error) });
  console.error(error);
  process.exitCode = 1;
}

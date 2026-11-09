import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";

const skill = import.meta.dirname;
const root = resolve(skill, "../../..");
const commit = process.argv[2];
assert.match(
  commit ?? "",
  /^[a-f0-9]{40}$/,
  "Pass the reviewed full candidate SHA",
);
const base = join(root, "docs/evidence/discovery-formal");
mkdirSync(base, { recursive: true });
const evidence = mkdtempSync(join(base, "electron-"));
const source = join(evidence, "source");
mkdirSync(source);
const sha = (data: string | Buffer) =>
  createHash("sha256").update(data).digest("hex");
const record = (name: string, value: unknown) =>
  writeFileSync(
    join(evidence, `${name}.json`),
    `${JSON.stringify(value, null, 2)}\n`,
  );
function run(label: string, command: string, args: string[], cwd = root) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    timeout: 120_000,
    maxBuffer: 8 * 1024 * 1024,
    env: { ...process.env, VITEST_MAX_WORKERS: "1" },
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
  assert.equal(
    result.error,
    undefined,
    `${label}: execution/timeout is not sensitivity`,
  );
  assert.equal(result.signal, null, `${label}: interrupted`);
  return result;
}
const mutations = [
  {
    name: "publication",
    from: "if (!this.current(requestedIdentity)) return;",
    to: "if (false) return;",
    witness: "discards late lookup after ABA at the production controller",
  },
  {
    name: "prepare",
    from: "if (!(await actions.prepare()) || !authorized()) return;",
    to: "if (!(await actions.prepare())) return;",
    witness: "prepared Show publishes nothing after credential replacement",
  },
  {
    name: "show-credential",
    from: "if (!current()) return;",
    to: "if (false) return;",
    witness:
      "Show discards task after credential replacement during the exact-id read",
  },
  {
    name: "show-generation",
    from: "showGeneration === this.generation",
    to: "showGeneration === showGeneration",
    witness:
      "Show's extra generation guard rejects Close/reopen during the exact read",
  },
  {
    name: "exact-id",
    from: "result.task.id === source.task",
    to: "result.task.id !== source.task",
    witness: "Show rejects an exact read with the wrong id",
  },
  {
    name: "exact-profile",
    from: "result.task.profile_id === source.profile",
    to: "result.task.profile_id !== source.profile",
    witness: "Show rejects an exact read with the wrong profile_id",
  },
  {
    name: "close-clear",
    from: 'this.publish({ kind: "Closed" });',
    to: "this.publish(this.state);",
    witness:
      "Show captures the source before Close and opens only the authorized exact Task",
  },
];
try {
  console.log(`Evidence: ${evidence}`);
  assert.equal(
    run("archive", "git", [
      "archive",
      `--output=${join(evidence, "source.tar")}`,
      commit ?? "",
      "packages",
      "apps/electron",
      "package.json",
      "tsconfig.base.json",
    ]).status,
    0,
  );
  assert.equal(
    run("extract", "tar", ["-xf", join(evidence, "source.tar"), "-C", source])
      .status,
    0,
  );
  for (const path of ["", "packages/domain", "packages/api", "apps/electron"])
    symlinkSync(
      join(root, path, "node_modules"),
      join(source, path, "node_modules"),
    );
  const file = join(source, "apps/electron/src/discovery-state.ts");
  assert.equal(lstatSync(file).isSymbolicLink(), false);
  assert.notEqual(
    lstatSync(file).ino,
    lstatSync(join(root, "apps/electron/src/discovery-state.ts")).ino,
  );
  const original = readFileSync(file, "utf8");
  const liveHash = sha(
    readFileSync(join(root, "apps/electron/src/discovery-state.ts")),
  );
  assert.equal(
    sha(original),
    liveHash,
    "Live candidate differs from captured immutable source",
  );
  const test = join(source, "apps/electron/test/discovery.test.ts");
  const testOriginal = readFileSync(test, "utf8");
  writeFileSync(
    test,
    testOriginal + readFileSync(join(skill, "electron-extra.ts.txt"), "utf8"),
  );
  const config = join(source, "discovery.config.mjs");
  writeFileSync(
    config,
    `export default ${JSON.stringify({ resolve: { alias: { "@todo/domain": join(source, "packages/domain/src/index.ts"), "@todo/api": join(source, "packages/api/src/index.ts") } }, test: { include: ["test/discovery.test.ts"], maxWorkers: 1 } })};\n`,
  );
  const args = [
    "--bun",
    join(root, "apps/electron/node_modules/vitest/vitest.mjs"),
    "run",
    "--config",
    config,
  ];
  const testRun = (label: string) =>
    run(
      label,
      "bun",
      [
        ...args,
        "--reporter=json",
        `--outputFile=${join(evidence, `${label}-tests.json`)}`,
      ],
      join(source, "apps/electron"),
    );
  assert.equal(testRun("clean").status, 0);
  const outcomes = [];
  for (const mutation of mutations) {
    assert.equal(
      original.split(mutation.from).length,
      2,
      `${mutation.name}: anchor drift`,
    );
    try {
      const broken = original.replace(mutation.from, mutation.to);
      writeFileSync(file, broken);
      record(`mutation-${mutation.name}`, {
        ...mutation,
        originalHash: sha(original),
        mutatedHash: sha(broken),
      });
      writeFileSync(join(evidence, `broken-${mutation.name}.ts`), broken);
      const result = testRun(`broken-${mutation.name}`);
      assert.equal(
        result.status,
        1,
        `${mutation.name}: expected assertion exit1`,
      );
      const resultText = readFileSync(
        join(evidence, `broken-${mutation.name}-tests.json`),
        "utf8",
      );
      const observed: unknown = JSON.parse(resultText);
      assert.ok(
        observed &&
          typeof observed === "object" &&
          "testResults" in observed &&
          Array.isArray(observed.testResults),
      );
      const assertions: unknown[] = observed.testResults.flatMap(
        (suite: unknown) =>
          suite &&
          typeof suite === "object" &&
          "assertionResults" in suite &&
          Array.isArray(suite.assertionResults)
            ? suite.assertionResults
            : [],
      );
      assert.ok(
        assertions.some(
          (item: unknown) =>
            item &&
            typeof item === "object" &&
            "title" in item &&
            item.title === mutation.witness &&
            "status" in item &&
            item.status === "failed" &&
            "failureMessages" in item &&
            Array.isArray(item.failureMessages) &&
            item.failureMessages.some(
              (message: unknown) =>
                typeof message === "string" &&
                (message.startsWith("AssertionError: expected ") ||
                  message.startsWith("Error: expected ")),
            ),
        ),
        "Intended assertion failure missing; parser/compiler/timeout failures are not sensitivity",
      );
      outcomes.push({ ...mutation, exit: result.status });
    } finally {
      writeFileSync(file, original);
      assert.equal(sha(readFileSync(file)), sha(original));
      assert.equal(
        sha(readFileSync(join(root, "apps/electron/src/discovery-state.ts"))),
        liveHash,
      );
      assert.equal(
        testRun(`restored-${mutation.name}`).status,
        0,
        "Clean restoration must pass after every mutant",
      );
    }
  }
  record("result", {
    passed: true,
    commit,
    evidence,
    kind: "pure-real-controller-regression-and-sensitivity",
    sourceHash: sha(original),
    regressionHash: sha(testOriginal),
    fixtureHash: sha(readFileSync(join(skill, "electron-extra.ts.txt"))),
    outcomes,
    liveSourceUnchanged: true,
    swift: "not run; disk floor",
    host401: "separate carried production regression",
    nativeUI: false,
  });
  console.log(JSON.stringify({ passed: true, evidence, commit }));
} catch (error) {
  record("result", { passed: false, commit, evidence, error: String(error) });
  console.error(error);
  process.exitCode = 1;
}

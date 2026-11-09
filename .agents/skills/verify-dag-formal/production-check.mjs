import { guardedCompiler } from "./compile-artifacts.mjs";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  realpathSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import mutants from "./production-mutants.mjs";
import {
  digest,
  materialize,
  workspaceTypePaths,
} from "./candidate-inputs.mjs";
import {
  beforeCompile,
  DiskStop,
  diskStopped,
  guardContext,
  retiredArtifact,
} from "./compile-safety.mjs";
const skill = dirname(fileURLToPath(import.meta.url));
const root = resolve(skill, "../../..");
const evidence = mkdtempSync(
  join(root, "docs/evidence/dag-formal/conformance-"),
);
const candidate = join(evidence, "candidate");
mkdirSync(candidate);
guardContext(evidence);
const pin = JSON.parse(
  readFileSync(join(skill, "production-pin.json"), "utf8"),
);
const receipts = [];
let provenance;
class AwaitMergedSource extends Error {}
const record = (name, value) =>
  writeFileSync(
    join(evidence, `${name}.json`),
    JSON.stringify(value, null, 2) + "\n",
  );
async function run(label, command, args, timeout = 180000) {
  if (args.some((arg) => arg.includes("typescript/bin/tsc")))
    beforeCompile({ evidence, label });
  const started = performance.now();
  const child = spawn(command, args, {
    cwd: candidate,
    stdio: ["ignore", "pipe", "pipe"],
  });
  record(label + "-started", { pid: child.pid, command, args });
  let stdout = "",
    stderr = "",
    timedOut = false;
  child.stdout.on("data", (d) => {
    stdout += d;
  });
  child.stderr.on("data", (d) => {
    stderr += d;
  });
  const timer = setTimeout(() => {
    timedOut = true;
    child.kill("SIGKILL");
  }, timeout);
  const outcome = await new Promise((resolveDone, reject) => {
    child.on("error", reject);
    child.on("close", (exitCode, signal) => resolveDone({ exitCode, signal }));
  }).finally(() => clearTimeout(timer));
  const result = {
    label,
    pid: child.pid,
    command,
    args,
    ...outcome,
    timedOut,
    seconds: (performance.now() - started) / 1000,
  };
  receipts.push(result);
  record("commands", receipts);
  writeFileSync(join(evidence, label + ".stdout"), stdout);
  writeFileSync(join(evidence, label + ".stderr"), stderr);
  if (result.exitCode === 3)
    throw new DiskStop({ stdout: stdout + stderr, exitCode: 3 });
  assert.equal(timedOut, false, `Incomplete timeout: ${label}`);
  return { ...result, stdout, stderr };
}
async function build(label, filename) {
  const imports = [];
  const packageExports = JSON.parse(
    readFileSync(join(candidate, "packages/domain/package.json"), "utf8"),
  ).exports;
  const temporary = label.startsWith("mutant-");
  const sourceHash = digest(
    JSON.stringify({
      commit: pin.commit,
      filename,
      driver: digest(readFileSync(join(candidate, "verify", filename))),
      files: provenance.files
        .filter((file) => file.path.startsWith("packages/domain/src/"))
        .map((file) => [
          file.path,
          digest(readFileSync(join(candidate, file.path))),
        ]),
    }),
  );
  const output = temporary
    ? join(root, ".scratch/bin", `dag-f-${label}-${sourceHash}`)
    : join(evidence, label);
  mkdirSync(dirname(output), { recursive: true });
  const result = await guardedCompiler(Bun.build.bind(Bun), {
    evidence,
    label,
  })({
    entrypoints: [join(candidate, "verify", filename)],
    target: "bun",
    compile: { outfile: output },
    plugins: [
      {
        name: "immutable-candidate-imports",
        setup(builder) {
          builder.onResolve(
            { filter: /^@todo\/domain(?:\/|$)/ },
            ({ path }) => {
              const key =
                path === "@todo/domain"
                  ? "."
                  : "." + path.slice("@todo/domain".length);
              assert.ok(packageExports[key], `Unmapped domain export ${path}`);
              return {
                path: resolve(
                  candidate,
                  "packages/domain",
                  packageExports[key],
                ),
              };
            },
          );
          builder.onLoad({ filter: /\.(?:ts|js|mjs|json)$/ }, ({ path }) => {
            const actual = realpathSync(path);
            assert.ok(
              actual.startsWith(candidate + "/") ||
                actual.includes("/node_modules/"),
              `Source-resolution mismatch: ${actual}`,
            );
            imports.push({
              path: actual,
              sha256: digest(readFileSync(actual)),
            });
            return undefined;
          });
        },
      },
    ],
  });
  const compiled = {
    success: result.success,
    logs: result.logs.map(String),
    imports,
    sourceHash,
    productCommit: pin.commit,
    ...(result.success ? { binarySha256: digest(readFileSync(output)) } : {}),
  };
  record(label + "-build", compiled);
  if (temporary && result.success)
    writeFileSync(
      output + ".provenance.json",
      JSON.stringify(compiled, null, 2) + "\n",
    );
  assert.equal(result.success, true, `Compiler failure: ${label}`);
  return output;
}
try {
  if (pin.awaitMergedIntegration)
    throw new AwaitMergedSource(
      "Await L1 exact merged integration SHA; superseded source compilation held",
    );
  const coverage = JSON.parse(
    readFileSync(join(skill, "coverage.json"), "utf8"),
  );
  assert.equal(
    pin.commit,
    coverage.confirmedCommit,
    "Candidate changed without mapping review",
  );
  provenance = materialize(root, candidate, pin);
  record("candidate-inputs", provenance);
  for (const file of coverage.files)
    assert.equal(
      digest(readFileSync(join(candidate, file.path))),
      file.sha256,
      "Reviewed candidate drift: " + file.path,
    );
  record("verification-inputs", {
    productCommit: pin.commit,
    files: [
      "production-check.mjs",
      "candidate-inputs.mjs",
      "production-pin.json",
      "production-mutants.mjs",
      "compile-safety.mjs",
      "compile-artifacts.mjs",
      "compile-preload.mjs",
      "nested-runtime.mjs",
      "nested-guard-check.mjs",
      "guarded-runtime.mjs",
      "graph-properties.ts",
      "replay-properties.ts",
      "integration-properties.ts",
    ].map((path) => ({
      path,
      sha256: digest(readFileSync(join(skill, path))),
    })),
  });
  const versions = [];
  const domainPackage = JSON.parse(
    readFileSync(join(candidate, "packages/domain/package.json"), "utf8"),
  );
  for (const [name, expected] of Object.entries(domainPackage.dependencies)) {
    const path = realpathSync(
      join(root, "packages/domain/node_modules", name, "package.json"),
    );
    const installed = JSON.parse(readFileSync(path, "utf8"));
    assert.equal(
      installed.version,
      expected,
      "Installed version mismatch: " + name,
    );
    versions.push({
      name,
      version: installed.version,
      path,
      sha256: digest(readFileSync(path)),
    });
  }
  record("installed-dependencies", { bun: Bun.version, versions });
  symlinkSync(join(root, "node_modules"), join(candidate, "node_modules"));
  symlinkSync(
    join(root, "packages/domain/node_modules"),
    join(candidate, "packages/domain/node_modules"),
  );
  mkdirSync(join(candidate, "verify"));
  symlinkSync(
    join(root, "packages/domain/node_modules"),
    join(candidate, "verify/node_modules"),
  );
  for (const name of [
    "graph-properties.ts",
    "replay-properties.ts",
    "integration-properties.ts",
  ])
    copyFileSync(join(skill, name), join(candidate, "verify", name));
  writeFileSync(
    join(candidate, "verify/tsconfig.json"),
    JSON.stringify({
      extends: "../tsconfig.base.json",
      compilerOptions: {
        types: ["bun"],
        noEmit: true,
        paths: workspaceTypePaths(candidate, ["domain"]),
      },
      include: ["*.ts"],
    }),
  );
  const binary = await build("graph-baseline", "graph-properties.ts");
  const baseline = await run("graph-baseline-run", binary, [
    process.argv.includes("--literal") ? "literals" : "all",
    join(evidence, "graph-corpus.json"),
  ]);
  assert.equal(baseline.exitCode, 0, `Behavior failed: ${evidence}`);
  const graphResult = JSON.parse(baseline.stdout);
  record("graph-result", graphResult);
  assert.equal(graphResult.seed, pin.seed);
  if (!process.argv.includes("--literal"))
    for (const [key, expected] of Object.entries({
      directedGraphs: 4165,
      dags: 572,
      statusCases: 140660,
      weightCases: 709242,
      randomDags: pin.randomDags,
    }))
      assert.equal(
        graphResult.counts[key],
        expected,
        "Incomplete corpus: " + key,
      );
  const replay = await build("replay-baseline", "replay-properties.ts");
  const replayRun = await run("replay-baseline-run", replay, [
    evidence,
    ...(process.argv.includes("--literal") ? ["--literal"] : []),
  ]);
  assert.equal(replayRun.exitCode, 0, `Replay behavior failed ${evidence}`);
  record("replay-result", JSON.parse(replayRun.stdout));
  if (!process.argv.includes("--literal"))
    assert.equal(
      JSON.parse(replayRun.stdout).cases,
      93,
      "Incomplete replay corpus",
    );
  const integration = await build(
    "integration-baseline",
    "integration-properties.ts",
  );
  const integrationRun = await run("integration-baseline-run", integration, [
    evidence,
    process.argv.includes("--literal") ? "n1" : "all",
  ]);
  assert.equal(integrationRun.exitCode, 0, "Integration behavior failed");
  record("integration-result", JSON.parse(integrationRun.stdout));
  if (!process.argv.includes("--literal")) {
    const tools = join(candidate, "docs/evidence/fv01/tools");
    mkdirSync(tools, { recursive: true });
    copyFileSync(
      join(root, "docs/evidence/dag-formal/tools/tla2tools-1.7.4.jar"),
      join(tools, "tla2tools-1.7.4.jar"),
    );
    process.env.DAG_F_GUARD_EVIDENCE = evidence;
    process.env.DAG_F_REAL_BUN = process.execPath;
    beforeCompile({ evidence, label: "atomiccas-launch" });
    const atomic = await run("candidate-atomiccas", "bun", [
      join(skill, "guarded-runtime.mjs"),
      "--preload",
      join(skill, "compile-preload.mjs"),
      join(candidate, ".agents/skills/verify-occ-atomicity/check.ts"),
    ]);
    assert.equal(
      atomic.exitCode,
      0,
      "Candidate AtomicCAS command failed; maintenance belongs to B",
    );
    const nestedTsc = readdirSync(evidence)
      .filter(
        (name) => name.startsWith("runtime-command-") && name.endsWith(".json"),
      )
      .map((name) => ({
        path: join(evidence, name),
        ...JSON.parse(readFileSync(join(evidence, name), "utf8")),
      }))
      .filter((row) =>
        row.args.some((arg) => arg.includes("typescript/bin/tsc")),
      );
    assert.equal(
      nestedTsc.length,
      1,
      "AtomicCAS real nested tsc must have exactly one command receipt",
    );
    const tsc = nestedTsc[0];
    assert.equal(tsc.parentExit, 0);
    assert.equal(tsc.effectiveExit, 0);
    assert.equal(tsc.guard.exitCode, 0);
    assert.ok(tsc.guard.time <= tsc.startedAt);
    assert.equal(realpathSync(tsc.executable), realpathSync(process.execPath));
    assert.equal(
      JSON.parse(readFileSync(tsc.guard.receiptPath, "utf8")).exitCode,
      0,
    );
    record("candidate-atomiccas-typecheck-guard", tsc);
    const n1 = await build(
      "candidate-migrations",
      "../packages/domain/scripts/verify-import-migrations.ts",
    );
    const migrationEvidence = join(evidence, "migration");
    mkdirSync(migrationEvidence);
    const migration = await run("candidate-migrations-run", n1, [
      migrationEvidence,
      join(candidate, "packages/domain/test/fixtures/v2-recurrence.sql"),
    ]);
    assert.equal(
      migration.exitCode,
      0,
      "Candidate N1 migration behavior failed",
    );
    const originalDag = await build(
      "candidate-dag",
      "../packages/domain/scripts/verify-dag.ts",
    );
    const scratch = mkdtempSync(join(evidence, "todo-dag-"));
    const dagEvidence = join(evidence, "candidate-dag-proof");
    mkdirSync(dagEvidence);
    try {
      const dag = await run("candidate-dag-run", originalDag, [
        "drive",
        scratch,
        dagEvidence,
      ]);
      assert.equal(
        dag.exitCode,
        0,
        "Candidate existing compiled DAG drive failed",
      );
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  }
  const types = await run("typecheck", "bun", [
    "--bun",
    join(root, "node_modules/typescript/bin/tsc"),
    "-p",
    join(candidate, "verify/tsconfig.json"),
  ]);
  assert.equal(types.exitCode, 0, `Typecheck failed ${evidence}`);
  const outcomes = [];
  if (!process.argv.includes("--skip-sensitivity"))
    for (const mutant of mutants) {
      const path = join(candidate, "packages/domain/src", mutant.file);
      const original = readFileSync(path);
      const source = original.toString();
      assert.equal(
        source.split(mutant.from).length,
        2,
        "Changed mutation point: " + mutant.name,
      );
      const changed = source.replace(mutant.from, mutant.to);
      const label = "mutant-" + mutant.name;
      writeFileSync(join(evidence, label + "-source.ts"), changed);
      let mutantResult, produced;
      try {
        writeFileSync(path, changed);
        const driver = mutant.driver ?? "graph";
        const binary = await build(label, driver + "-properties.ts");
        produced = binary;
        const args =
          driver === "graph"
            ? ["literals"]
            : driver === "replay"
              ? [evidence, "--literal"]
              : [evidence, mutant.mode];
        const observed = await run(label + "-run", binary, args);
        mutantResult = JSON.parse(observed.stdout);
        assert.equal(observed.exitCode, 1, label + ": behavior must fail");
        assert.equal(mutantResult.status, "fail");
        assert.equal(
          mutantResult.property,
          mutant.property,
          label + ": wrong property",
        );
        assert.match(
          mutantResult.error,
          /AssertionError/,
          label + ": compiler/runtime/hash failure is not sensitivity",
        );
        assert.match(
          observed.stderr,
          new RegExp("BEHAVIORAL_FAILURE:" + mutant.property),
        );
      } finally {
        writeFileSync(path, original);
        assert.equal(
          digest(readFileSync(path)),
          digest(original),
          "Byte restoration failed",
        );
        retiredArtifact({ root, evidence, label, binary: produced });
      }
      const driver = mutant.driver ?? "graph";
      const cleanBinary =
        driver === "graph"
          ? binary
          : driver === "replay"
            ? replay
            : integration;
      const cleanArgs =
        driver === "graph"
          ? ["literals"]
          : driver === "replay"
            ? [evidence, "--literal"]
            : [evidence, mutant.mode];
      if (diskStopped())
        throw new DiskStop({
          stdout: "disk guard stopped the current mutation",
          exitCode: 3,
        });
      const clean = await run(label + "-restored", cleanBinary, cleanArgs);
      assert.equal(clean.exitCode, 0, label + ": restored behavior must pass");
      outcomes.push({
        name: mutant.name,
        file: mutant.file,
        expectedProperty: mutant.property,
        observedProperty: mutantResult.property,
        brokenExit: 1,
        restoredExit: 0,
        originalSha256: digest(original),
        mutatedSha256: digest(changed),
        restoredByteIdentical: true,
      });
      record("sensitivity", outcomes);
      console.log(label + ": behavior 1, exact restore 0");
    }
  for (const file of provenance.files)
    assert.equal(
      digest(readFileSync(join(candidate, file.path))),
      file.sha256,
      "Candidate bytes drifted: " + file.path,
    );
  if (!process.argv.includes("--skip-sensitivity")) {
    const graphClean = await build("graph-clean", "graph-properties.ts");
    const graphRun = await run("graph-clean-run", graphClean, [
      "all",
      join(evidence, "graph-clean-corpus.json"),
    ]);
    assert.equal(graphRun.exitCode, 0);
    record("graph-clean-result", JSON.parse(graphRun.stdout));
    if (!process.argv.includes("--literal"))
      assert.equal(
        digest(readFileSync(join(evidence, "graph-corpus.json"))),
        digest(readFileSync(join(evidence, "graph-clean-corpus.json"))),
        "Restored corpus changed",
      );
    const replayClean = await build("replay-clean", "replay-properties.ts");
    const replayRun = await run("replay-clean-run", replayClean, [evidence]);
    assert.equal(replayRun.exitCode, 0);
    record("replay-clean-result", JSON.parse(replayRun.stdout));
  }
  const diagnostic =
    process.argv.includes("--literal") ||
    process.argv.includes("--skip-sensitivity");
  if (!diagnostic)
    assert.equal(
      outcomes.length,
      mutants.length,
      "Incomplete sensitivity suite",
    );
  record("result", {
    status: diagnostic ? "diagnostic-pass" : "pass",
    diagnosticFlags: process.argv.slice(2),
    sensitivity: outcomes,
    candidate: pin.commit,
    evidence,
    scope:
      "algorithm/replay conformance checkpoint; public commands and clients pending",
    commands: receipts,
  });
  console.log(
    `${diagnostic ? "DIAGNOSTIC PASS" : "PASS committed production conformance checkpoint"}: ${evidence}`,
  );
} catch (error) {
  record("result", {
    status:
      error instanceof DiskStop
        ? "DISK STOP"
        : error instanceof AwaitMergedSource
          ? "awaiting-merged-source"
          : "fail",
    candidate: pin.commit,
    error: String(error),
    commands: receipts,
  });
  console.error(error);
  console.error(evidence);
  process.exitCode =
    error instanceof DiskStop ? 3 : error instanceof AwaitMergedSource ? 2 : 1;
}

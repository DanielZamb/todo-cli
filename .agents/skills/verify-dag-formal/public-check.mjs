import { guardedCompiler } from "./compile-artifacts.mjs";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
  copyFileSync,
  symlinkSync,
  realpathSync,
  existsSync,
} from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  digest,
  materialize,
  object,
  workspaceTypePaths,
} from "./candidate-inputs.mjs";
import mutants from "./public-mutants.mjs";
import retainedMutants from "./production-mutants.mjs";
import boundaryMutants from "./boundary-mutants.mjs";
import responseMutants from "./response-mutants.mjs";
import clientMutants from "./client-mutants.mjs";
import { verifyContractArtifacts } from "./contract-properties.mjs";
import {
  beforeCompile,
  DiskStop,
  diskStopped,
  retiredArtifact,
  guardContext,
} from "./compile-safety.mjs";
const skill = dirname(fileURLToPath(import.meta.url)),
  root = resolve(skill, "../../..");
const pin = JSON.parse(readFileSync(join(skill, "public-pin.json"), "utf8"));
const evidence = mkdtempSync(join(root, "docs/evidence/dag-formal/public-"));
const candidate = join(evidence, "candidate");
mkdirSync(candidate);
guardContext(evidence);
const records = [];
const mode = process.argv[2] ?? "all";
const record = (name, value) =>
  writeFileSync(
    join(evidence, name + ".json"),
    JSON.stringify(value, null, 2) + "\n",
  );
let manifest;
class AwaitMergedSource extends Error {}
async function run(label, executable, args, timeout = 180000) {
  if (args.some((arg) => arg.includes("typescript/bin/tsc")))
    beforeCompile({ evidence, label });
  const child = spawn(executable, args, {
    cwd: candidate,
    stdio: ["ignore", "pipe", "pipe"],
  });
  record(label + "-started", { pid: child.pid, executable, args });
  let stdout = "",
    stderr = "",
    timedOut = false;
  child.stdout.on("data", (d) => (stdout += d));
  child.stderr.on("data", (d) => (stderr += d));
  const timer = setTimeout(() => {
    timedOut = true;
    child.kill("SIGKILL");
  }, timeout);
  const outcome = await new Promise((done, reject) => {
    child.on("error", reject);
    child.on("close", (exitCode, signal) => done({ exitCode, signal }));
  }).finally(() => clearTimeout(timer));
  const receipt = {
    label,
    pid: child.pid,
    executable,
    args,
    ...outcome,
    timedOut,
  };
  records.push(receipt);
  record("commands", records);
  writeFileSync(join(evidence, label + ".stdout"), stdout);
  writeFileSync(join(evidence, label + ".stderr"), stderr);
  assert.equal(timedOut, false, "Timeout is not proof");
  return { ...receipt, stdout, stderr };
}
async function build(
  label,
  entry,
  product = false,
  force = false,
  options = {},
) {
  const inputs = manifest.files
    .filter((f) =>
      /^(packages\/(domain|api)\/src|apps\/(cli|server)\/src)/.test(f.path),
    )
    .map((f) => [f.path, digest(readFileSync(join(candidate, f.path)))]);
  const sourceHash = digest(
    JSON.stringify({
      commit: pin.commit,
      compiler: Bun.version,
      defines: { TODO_BUILD_ID: pin.commit.slice(0, 8) },
      contract: pin.contract,
      inputs,
      ...(options.temporary ? { entry } : {}),
    }),
  );
  const binary =
    product || options.temporary
      ? join(root, ".scratch/bin", `dag-f-${label}-${sourceHash}`)
      : join(evidence, label);
  mkdirSync(dirname(binary), { recursive: true });
  const metadata = binary + ".provenance.json";
  if (product && !force && existsSync(binary) && existsSync(metadata)) {
    const old = JSON.parse(readFileSync(metadata, "utf8"));
    assert.equal(old.sourceHash, sourceHash);
    assert.equal(old.binarySha256, digest(readFileSync(binary)));
    record(label + "-build", { ...old, cacheHit: true });
    return binary;
  }
  const imports = [];
  const result = await guardedCompiler(Bun.build.bind(Bun), {
    evidence,
    label,
  })({
    entrypoints: [join(candidate, entry)],
    target: "bun",
    compile: { outfile: binary },
    define: { TODO_BUILD_ID: JSON.stringify(pin.commit.slice(0, 8)) },
    plugins: [
      {
        name: "immutable-public-imports",
        setup(builder) {
          builder.onResolve(
            { filter: /^@todo\/(domain|api)(?:\/|$)/ },
            ({ path }) => {
              const name = path.split("/")[1];
              assert.ok(name);
              const packagePath = join(candidate, "packages", name);
              const exports = JSON.parse(
                readFileSync(join(packagePath, "package.json"), "utf8"),
              ).exports;
              const key =
                path === `@todo/${name}`
                  ? "."
                  : "." + path.slice(`@todo/${name}`.length);
              assert.ok(exports[key], "Unknown workspace export " + path);
              return { path: resolve(packagePath, exports[key]) };
            },
          );
          builder.onLoad({ filter: /\.(?:ts|js|mjs|json)$/ }, ({ path }) => {
            const actual = realpathSync(path);
            assert.ok(
              actual.startsWith(candidate + "/") ||
                actual.includes("/node_modules/"),
              "Source resolution escaped: " + actual,
            );
            const bytes = readFileSync(actual);
            imports.push({
              path: actual,
              sha256: digest(bytes),
            });
            if (
              options.countReachability &&
              actual.endsWith("/packages/domain/src/graph-model.ts")
            ) {
              const source = bytes.toString(),
                point = "  const seen = new Set<TaskId>([start]);";
              assert.equal(source.split(point).length, 2);
              const contents = source.replace(
                point,
                '  if(process.env.DAG_F_COUNT_REACHABILITY === "1") process.env.DAG_F_REACHABILITY_CALLS = String(Number(process.env.DAG_F_REACHABILITY_CALLS ?? "0") + 1);\n' +
                  point,
              );
              writeFileSync(
                join(evidence, label + "-instrumented-reachable.ts"),
                contents,
              );
              record(label + "-instrumentation", {
                scope:
                  "count-only side effect in separate binary; original on-disk module untouched",
                originalSha256: digest(bytes),
                instrumentedSha256: digest(contents),
              });
              return { contents, loader: "ts" };
            }
            return undefined;
          });
        },
      },
    ],
  });
  const receipt = {
    success: result.success,
    logs: result.logs.map(String),
    sourceHash,
    productCommit: pin.commit,
    imports,
    ...(result.success ? { binarySha256: digest(readFileSync(binary)) } : {}),
  };
  record(label + "-build", receipt);
  assert.equal(result.success, true, "Compilation failed " + label);
  if (product || options.temporary)
    writeFileSync(metadata, JSON.stringify(receipt, null, 2));
  return binary;
}
try {
  assert.equal(Bun.version, "1.4.4", "Unreviewed Bun compiler version");
  if (pin.awaitMergedIntegration)
    throw new AwaitMergedSource(
      "Await L1 exact merged integration SHA; no superseded candidate compilation",
    );
  if (
    (mode === "all" || mode === "response-controls") &&
    pin.pendingCorrections?.length
  )
    throw new Error(
      "Awaiting explicit combined candidate: " +
        pin.pendingCorrections.join(", "),
    );
  manifest = materialize(root, candidate, pin);
  record("candidate-inputs", manifest);
  const coverage = JSON.parse(
    readFileSync(join(skill, "public-coverage.json"), "utf8"),
  );
  assert.equal(coverage.confirmedCommit, pin.commit);
  assert.equal(
    coverage.modelSha256,
    digest(readFileSync(join(skill, "DagAcyclic.tla"))),
  );
  for (const file of coverage.files)
    assert.equal(
      digest(readFileSync(join(candidate, file.path))),
      file.sha256,
      "Coverage drift: " + file.path,
    );
  for (const file of coverage.unchangedCore) {
    assert.equal(digest(readFileSync(join(candidate, file.path))), file.sha256);
    assert.equal(
      digest(object(root, file.previousCommit, file.path)),
      file.sha256,
      "Core algorithm changed since the retained proof: " + file.path,
    );
  }
  record("coverage", coverage);
  for (const name of [
    "packages/domain",
    "packages/api",
    "apps/cli",
    "apps/server",
    "apps/electron",
  ])
    symlinkSync(
      join(root, name, "node_modules"),
      join(candidate, name, "node_modules"),
    );
  symlinkSync(join(root, "node_modules"), join(candidate, "node_modules"));
  mkdirSync(join(candidate, "verify"));
  symlinkSync(
    join(root, "packages/domain/node_modules"),
    join(candidate, "verify/node_modules"),
  );
  for (const name of [
    "public-properties.ts",
    "replay-properties.ts",
    "integration-properties.ts",
    ...(mode === "all" || mode === "response-controls"
      ? [
          "graph-response-properties.ts",
          "root-response-fixture.mjs",
          "contract-properties.mjs",
          "candidate-inputs.mjs",
        ]
      : []),
  ])
    copyFileSync(join(skill, name), join(candidate, "verify", name));
  const installed = [];
  for (const name of [
    "packages/domain",
    "packages/api",
    "apps/cli",
    "apps/server",
    "apps/electron",
  ])
    for (const [dependency, version] of Object.entries(
      JSON.parse(readFileSync(join(candidate, name, "package.json"), "utf8"))
        .dependencies ?? {},
    )) {
      if (version === "workspace:*") continue;
      const path = realpathSync(
        join(root, name, "node_modules", dependency, "package.json"),
      );
      const actual = JSON.parse(readFileSync(path, "utf8")).version;
      assert.equal(actual, version, "Installed dependency mismatch");
      installed.push({ package: name, dependency, version: actual, path });
    }
  record("installed-versions", installed);
  record("verification-inputs", {
    pin,
    files: [
      "public-check.mjs",
      "public-pin.json",
      "public-coverage.json",
      "public-mutants.mjs",
      "boundary-mutants.mjs",
      "compile-safety.mjs",
      "compile-artifacts.mjs",
      "compile-preload.mjs",
      "contract-properties.mjs",
      "response-mutants.mjs",
      "client-mutants.mjs",
      "graph-response-properties.ts",
      "production-mutants.mjs",
      "public-properties.ts",
      "replay-properties.ts",
      "integration-properties.ts",
      "candidate-inputs.mjs",
      "root-response-fixture.mjs",
    ].map((path) => ({
      path,
      sha256: digest(readFileSync(join(skill, path))),
    })),
  });
  const cli = await build("todo", "apps/cli/src/main.ts", true),
    server = await build("todo-server", "apps/server/src/main.ts", true),
    driver = await build("public-driver", "verify/public-properties.ts");
  const baselineDirectory = join(evidence, "baseline");
  mkdirSync(baselineDirectory);
  const baseline = await run("baseline", driver, [
    cli,
    server,
    baselineDirectory,
    mode,
  ]);
  assert.equal(baseline.exitCode, 0, "Public baseline failed: " + evidence);
  if (mode === "all" || mode === "boundary-controls") {
    const matrix = await build(
      "candidate-input-matrix-driver",
      "packages/domain/scripts/dag-cli-input-proof.ts",
    );
    const matrixDirectory = join(evidence, "candidate-input-matrix");
    mkdirSync(matrixDirectory);
    const outcome = await run("candidate-input-matrix-run", matrix, [
      cli,
      matrixDirectory,
    ]);
    assert.equal(outcome.exitCode, 0);
    const rows = JSON.parse(
      readFileSync(join(matrixDirectory, "result.json"), "utf8"),
    );
    assert.equal(rows.cases.length, 31);
    assert.ok(rows.cases.every((row) => row.passed));
  }
  let responseDriver, countDriver, beforeCli;
  if (mode === "all" || mode === "response-controls") {
    verifyContractArtifacts(candidate, evidence);
    beforeCli = join(
      root,
      ".scratch/bin/dag-f-todo-1aa1db7f8ede6a9401d4f9eaf5e52823ed8ec52a3275cd02b71e71040c95713b",
    );
    const beforeMetadata = JSON.parse(
      readFileSync(beforeCli + ".provenance.json", "utf8"),
    );
    assert.equal(
      beforeMetadata.productCommit,
      "e7170510a376b51eaf3525bb9933cb0dd588b233",
    );
    assert.equal(digest(readFileSync(beforeCli)), beforeMetadata.binarySha256);
    record("preserved-before-binary", beforeMetadata);
    process.env.DAG_F_PRODUCT_SHA = pin.commit;
    process.env.DAG_F_PRODUCT_CONTRACT = pin.contract;
    responseDriver = await build(
      "graph-response-driver",
      "verify/graph-response-properties.ts",
    );
    countDriver = await build(
      "graph-response-counts-driver",
      "verify/graph-response-properties.ts",
      false,
      false,
      { countReachability: true },
    );
    for (const [label, binary, responseMode] of [
      ["graph-response", responseDriver, "all"],
      ["closure-call-counts", countDriver, "counts"],
    ]) {
      const directory = join(evidence, label);
      mkdirSync(directory);
      const response = await run(label, binary, [
        cli,
        server,
        directory,
        responseMode,
        beforeCli,
      ]);
      assert.equal(response.exitCode, 0, label + " failed");
    }
  }
  writeFileSync(
    join(candidate, "verify/tsconfig.json"),
    JSON.stringify({
      extends: "../tsconfig.base.json",
      compilerOptions: {
        types: ["bun"],
        noEmit: true,
        allowJs: true,
        paths: workspaceTypePaths(candidate, ["domain", "api"]),
      },
      include: ["*.ts"],
    }),
  );
  const typecheck = await run("typecheck", "bun", [
    "--bun",
    join(root, "node_modules/typescript/bin/tsc"),
    "-p",
    join(candidate, "verify/tsconfig.json"),
  ]);
  assert.equal(typecheck.exitCode, 0, "Strict types failed");
  const sensitivity = [];
  if (
    mode === "unaffected" ||
    mode === "all" ||
    mode === "boundary-controls" ||
    mode === "response-controls"
  ) {
    const controls =
      mode === "response-controls"
        ? [...responseMutants, ...clientMutants(candidate)]
        : mode === "boundary-controls"
          ? boundaryMutants
          : [
              ...mutants,
              ...boundaryMutants,
              ...responseMutants,
              ...clientMutants(candidate),
              ...retainedMutants
                .filter((item) => item.driver)
                .map((item) => ({
                  ...item,
                  file: "packages/domain/src/" + item.file,
                })),
            ];
    for (const mutant of controls) {
      const source = join(candidate, mutant.file),
        original = readFileSync(source),
        text = original.toString();
      assert.equal(
        text.split(mutant.from).length,
        2,
        "Mutation source mismatch: " + mutant.name,
      );
      const directory = join(evidence, "mutations", mutant.name);
      mkdirSync(directory, { recursive: true });
      let outcome, restoredExitCode;
      const retired = [];
      const targetDriver =
        mutant.driver === "graph-response"
          ? mutant.mode === "counts"
            ? countDriver
            : responseDriver
          : mutant.driver
            ? await build(
                mutant.driver + "-driver",
                "verify/" + mutant.driver + "-properties.ts",
              )
            : driver;
      const argumentsFor = (
        directory,
        mutationCli = cli,
        mutationServer = server,
      ) =>
        mutant.driver === "graph-response"
          ? [mutationCli, mutationServer, directory, mutant.mode, beforeCli]
          : mutant.driver
            ? [
                directory,
                ...(mutant.driver === "integration" ? [mutant.mode] : []),
              ]
            : [mutationCli, mutationServer, directory, mutant.mode];
      try {
        writeFileSync(source, text.replace(mutant.from, mutant.to));
        copyFileSync(source, join(directory, "broken-source.txt"));
        const mutationCli =
          mutant.driver || mutant.binaries === "server"
            ? cli
            : await build("todo", "apps/cli/src/main.ts", true);
        if (mutationCli !== cli) retired.push(mutationCli);
        const mutationServer =
          mutant.driver || mutant.binaries === "cli"
            ? server
            : await build("todo-server", "apps/server/src/main.ts", true);
        if (mutationServer !== server) retired.push(mutationServer);
        const brokenDriver = mutant.driver
          ? await build(
              "isolated-" + mutant.name + "-driver",
              "verify/" + mutant.driver + "-properties.ts",
              false,
              false,
              { temporary: true, countReachability: mutant.mode === "counts" },
            )
          : driver;
        if (brokenDriver !== driver) retired.push(brokenDriver);
        const result = await run(
          "mutant-" + mutant.name,
          brokenDriver,
          argumentsFor(directory, mutationCli, mutationServer),
        );
        const behavioral = mutant.driver
          ? JSON.parse(result.stdout)
          : JSON.parse(readFileSync(join(directory, "result.json"), "utf8"));
        assert.equal(result.exitCode, 1, "Mutant did not fail: " + mutant.name);
        assert.equal(
          behavioral.property,
          mutant.property,
          "Wrong failing property: " + mutant.name,
        );
        assert.match(
          behavioral.error,
          /AssertionError/,
          "Compiler/schema failures are not sensitivity: " + mutant.name,
        );
        outcome = {
          name: mutant.name,
          file: mutant.file,
          property: mutant.property,
          compilation: true,
          brokenSha256: digest(readFileSync(source)),
          exitCode: result.exitCode,
          observed: behavioral,
        };
      } finally {
        writeFileSync(source, original);
        assert.equal(
          digest(readFileSync(source)),
          digest(original),
          "Restoration mismatch",
        );
        record("restored-" + mutant.name, {
          file: mutant.file,
          sha256: digest(original),
          byteExact: true,
        });
        for (const binary of retired)
          retiredArtifact({
            root,
            evidence,
            label: mutant.name,
            binary,
            keep: [cli, server],
          });
        if (!diskStopped()) {
          const restored = join(directory, "restored");
          mkdirSync(restored);
          const clean = await run(
            "restored-" + mutant.name,
            targetDriver,
            argumentsFor(restored),
          );
          restoredExitCode = clean.exitCode;
          assert.equal(clean.exitCode, 0, "Restored baseline failed");
        }
      }
      sensitivity.push({
        ...outcome,
        restoredExitCode,
        restoredSha256: digest(readFileSync(source)),
      });
      record("sensitivity", sensitivity);
    }
    for (const name of ["replay", "integration"]) {
      const binary = await build(
        name + "-driver",
        "verify/" + name + "-properties.ts",
      );
      const directory = join(evidence, name);
      mkdirSync(directory);
      const result = await run(name, binary, [directory]);
      assert.equal(result.exitCode, 0, name + " failed");
    }
    const cleanCli = await build("todo", "apps/cli/src/main.ts", true, true),
      cleanServer = await build(
        "todo-server",
        "apps/server/src/main.ts",
        true,
        true,
      ),
      cleanDriver = await build(
        "public-clean-driver",
        "verify/public-properties.ts",
      );
    const cleanDirectory = join(evidence, "clean");
    mkdirSync(cleanDirectory);
    const clean = await run("clean", cleanDriver, [
      cleanCli,
      cleanServer,
      cleanDirectory,
      mode,
    ]);
    assert.equal(clean.exitCode, 0, "Final clean public baseline failed");
  }
  for (const file of manifest.files)
    assert.equal(
      digest(readFileSync(join(candidate, file.path))),
      file.sha256,
      "Source bytes changed",
    );
  record("result", {
    status: mode === "all" ? "pass" : "diagnostic-pass",
    productCommit: pin.commit,
    commands: records,
    sensitivity,
    baseline: JSON.parse(baseline.stdout),
    scope:
      "merged public/read conformance; final E/S runtime mapping and F review pending",
  });
  console.log(
    (mode === "all"
      ? "PASS corrected public/read conformance checkpoint: "
      : "PASS diagnostic public checkpoint: ") + evidence,
  );
} catch (error) {
  record("result", {
    status:
      error instanceof DiskStop
        ? "DISK STOP"
        : error instanceof AwaitMergedSource
          ? "awaiting-merged-source"
          : "fail",
    productCommit: pin.commit,
    error: String(error),
    commands: records,
  });
  console.error(error);
  console.error(evidence);
  process.exitCode =
    error instanceof DiskStop ? 3 : error instanceof AwaitMergedSource ? 2 : 1;
}

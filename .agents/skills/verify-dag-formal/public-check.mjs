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
import { digest, materialize, object } from "./candidate-inputs.mjs";
import mutants from "./public-mutants.mjs";
import retainedMutants from "./production-mutants.mjs";
const skill = dirname(fileURLToPath(import.meta.url)),
  root = resolve(skill, "../../..");
const pin = JSON.parse(readFileSync(join(skill, "public-pin.json"), "utf8"));
const evidence = mkdtempSync(join(root, "docs/evidence/dag-formal/public-"));
const candidate = join(evidence, "candidate");
mkdirSync(candidate);
const records = [];
const record = (name, value) =>
  writeFileSync(
    join(evidence, name + ".json"),
    JSON.stringify(value, null, 2) + "\n",
  );
let manifest;
async function run(label, executable, args, timeout = 180000) {
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
async function build(label, entry, product = false, force = false) {
  const inputs = manifest.files
    .filter((f) =>
      /^(packages\/(domain|api)\/src|apps\/(cli|server)\/src)/.test(f.path),
    )
    .map((f) => [f.path, digest(readFileSync(join(candidate, f.path)))]);
  const sourceHash = digest(JSON.stringify({ commit: pin.commit, inputs }));
  const binary = product
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
  const result = await Bun.build({
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
  if (product) writeFileSync(metadata, JSON.stringify(receipt, null, 2));
  return binary;
}
try {
  assert.equal(Bun.version, "1.4.4", "Unreviewed Bun compiler version");
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
  ])
    copyFileSync(join(skill, name), join(candidate, "verify", name));
  const installed = [];
  for (const name of [
    "packages/domain",
    "packages/api",
    "apps/cli",
    "apps/server",
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
  const mode = process.argv[2] ?? "all";
  const baseline = await run("baseline", driver, [
    cli,
    server,
    baselineDirectory,
    mode,
  ]);
  assert.equal(baseline.exitCode, 0, "Public baseline failed: " + evidence);
  writeFileSync(
    join(candidate, "verify/tsconfig.json"),
    JSON.stringify({
      extends: "../tsconfig.base.json",
      compilerOptions: { types: ["bun"], noEmit: true },
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
  if (mode === "unaffected" || mode === "all") {
    const controls = [
      ...mutants,
      ...retainedMutants
        .filter((item) => item.driver)
        .map((item) => ({ ...item, file: "packages/domain/src/" + item.file })),
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
      const targetDriver = mutant.driver
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
        mutant.driver
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
        const mutationServer =
          mutant.driver || mutant.binaries === "cli"
            ? server
            : await build("todo-server", "apps/server/src/main.ts", true);
        const brokenDriver = mutant.driver
          ? await build(
              mutant.driver + "-mutant-driver",
              "verify/" + mutant.driver + "-properties.ts",
            )
          : driver;
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
    status: "diagnostic-pass",
    productCommit: pin.commit,
    commands: records,
    sensitivity,
    baseline: JSON.parse(baseline.stdout),
    knownFailure:
      "malformed CLI Version 0 usage boundary remains failing in default all mode",
    graphResponse:
      "paused for root-only amendment; not final public acceptance",
  });
  console.log("PASS diagnostic public checkpoint: " + evidence);
} catch (error) {
  record("result", {
    status: "fail",
    productCommit: pin.commit,
    error: String(error),
    commands: records,
  });
  console.error(error);
  console.error(evidence);
  process.exitCode = 1;
}

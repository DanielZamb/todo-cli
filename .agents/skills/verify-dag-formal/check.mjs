import assert from "node:assert/strict";
import { digest, object } from "./candidate-inputs.mjs";
import { spawn } from "node:child_process";
import { DiskStop, guardContext } from "./compile-safety.mjs";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const skill = dirname(fileURLToPath(import.meta.url));
const root = resolve(skill, "../../..");
const base = join(root, "docs/evidence/dag-formal");
mkdirSync(base, { recursive: true });
const evidence = mkdtempSync(join(base, "check-"));
guardContext(evidence);
const sha = (path) =>
  createHash("sha256").update(readFileSync(path)).digest("hex");
const json = (name, value) =>
  writeFileSync(
    join(evidence, `${name}.json`),
    `${JSON.stringify(value, null, 2)}\n`,
  );
const pin = JSON.parse(readFileSync(join(skill, "tool.json"), "utf8"));
const suite = JSON.parse(readFileSync(join(skill, "suite.json"), "utf8"));
const results = [];
async function execute(label, command, args, timeout = 120000) {
  const start = performance.now();
  const child = spawn(command, args, {
    cwd: root,
    stdio: ["ignore", "pipe", "pipe"],
  });
  json(`${label}-started`, { pid: child.pid, command, args });
  let stdout = "",
    stderr = "",
    timedOut = false;
  child.stdout.on("data", (data) => {
    stdout += data;
  });
  child.stderr.on("data", (data) => {
    stderr += data;
  });
  const timer = setTimeout(() => {
    timedOut = true;
    child.kill("SIGKILL");
  }, timeout);
  const outcome = await new Promise((resolveDone, reject) => {
    child.on("error", reject);
    child.on("close", (exitCode, signal) => resolveDone({ exitCode, signal }));
  }).finally(() => clearTimeout(timer));
  writeFileSync(join(evidence, `${label}.stdout`), stdout);
  writeFileSync(join(evidence, `${label}.stderr`), stderr);
  const receipt = {
    label,
    pid: child.pid,
    command,
    args,
    ...outcome,
    timedOut,
    seconds: (performance.now() - start) / 1000,
  };
  json(label, receipt);
  if (receipt.exitCode === 3)
    throw new DiskStop({ stdout: stdout + stderr, exitCode: 3 });
  assert.equal(timedOut, false, `${label}: timeout is incomplete proof`);
  return { ...receipt, stdout, stderr };
}
let exitCode = 1;
class AwaitMergedSource extends Error {}
try {
  const currentPin = JSON.parse(
    readFileSync(join(skill, "public-pin.json"), "utf8"),
  );
  const productionPin = JSON.parse(
    readFileSync(join(skill, "production-pin.json"), "utf8"),
  );
  assert.equal(currentPin.commit, productionPin.commit, "Product pins differ");
  assert.equal(
    currentPin.awaitMergedIntegration,
    productionPin.awaitMergedIntegration,
  );
  if (
    !process.argv.includes("--model-only") &&
    currentPin.awaitMergedIntegration
  )
    throw new AwaitMergedSource(
      "Await L1's exact merged integration SHA; no superseded candidate compilation is authorized",
    );
  const head = await execute("git-head", "git", ["rev-parse", "HEAD"]);
  const branch = await execute("git-branch", "git", [
    "branch",
    "--show-current",
  ]);
  json("provenance", {
    head: head.stdout.trim(),
    branch: branch.stdout.trim(),
    bun: Bun.version,
    tool: pin,
    files: Object.fromEntries(
      ["DagAcyclic.tla", "suite.json", "check.mjs", "coverage.json"].map(
        (name) => [name, sha(join(skill, name))],
      ),
    ),
  });
  const coverage = JSON.parse(
    readFileSync(join(skill, "coverage.json"), "utf8"),
  );
  for (const file of coverage.files)
    assert.equal(
      digest(object(root, coverage.confirmedCommit, file.path)),
      file.sha256,
      `Reviewed source drift: ${file.path}`,
    );
  assert.equal(
    sha(join(skill, "DagAcyclic.tla")),
    coverage.modelSha256,
    "Reviewed model drift",
  );
  const stopCheck = await execute("disk-safety-self-check", "node", [
    join(skill, "disk-safety-self-check.mjs"),
    evidence,
  ]);
  assert.equal(stopCheck.exitCode, 0);
  let jar = join(base, "tools/tla2tools-1.7.4.jar");
  const existing = join(root, "docs/evidence/fv01/tools/tla2tools-1.7.4.jar");
  if (!existsSync(jar) && existsSync(existing)) jar = existing;
  if (!existsSync(jar)) {
    const disk = await execute("disk-guard", "sh", [
      join(root, "scripts/disk-guard.sh"),
    ]);
    assert.equal(disk.exitCode, 0);
    mkdirSync(dirname(jar), { recursive: true });
    const download = await execute("download", "curl", [
      "--fail",
      "--location",
      "--proto",
      "=https",
      "--tlsv1.2",
      pin.url,
      "-o",
      jar,
    ]);
    assert.equal(download.exitCode, 0);
  }
  assert.equal(sha(jar), pin.sha256, "TLC pin mismatch");
  copyFileSync(jar, join(evidence, "tla2tools-1.7.4.jar"));
  copyFileSync(join(skill, "tool.json"), join(evidence, "tool.json"));
  const model = join(evidence, "DagAcyclic.tla");
  copyFileSync(join(skill, "DagAcyclic.tla"), model);
  for (const item of suite) {
    const cfg = join(evidence, `${item.name}.cfg`);
    copyFileSync(join(skill, "configs", `${item.name}.cfg`), cfg);
    const result = await execute(
      item.name,
      "java",
      [
        "-XX:+UseParallelGC",
        "-Xmx768m",
        "-cp",
        jar,
        "tlc2.TLC",
        "-workers",
        "1",
        "-fp",
        "0",
        "-seed",
        "26",
        "-metadir",
        join(evidence, `states-${item.name}`),
        "-config",
        cfg,
        model,
      ],
      item.timeoutMs ?? 120000,
    );
    const stats = result.stdout.match(
      /([\d,]+) states generated, ([\d,]+) distinct states found, ([\d,]+) states left on queue/,
    );
    const depth = result.stdout.match(
      /depth of the complete state graph search is (\d+)/,
    );
    const violation = result.stdout.match(/Invariant (\w+) is violated/);
    const initial = result.stdout.match(
      /Finished computing initial states: ([\d,]+) distinct/,
    );
    const entry = {
      name: item.name,
      initialStates: initial?.[1],
      bounds: {
        tasks: item.n,
        degree: item.limit,
        writers: item.n === 15 ? 1 : 2,
        revert: item.revert,
      },
      purpose: item.purpose ?? (item.mutation === "none" ? "safety" : "mutant"),
      exitCode: result.exitCode,
      signal: result.signal,
      seconds: result.seconds,
      generated: stats?.[1],
      distinct: stats?.[2],
      queue: stats?.[3],
      depth: depth?.[1],
      violation: violation?.[1],
      configSha256: sha(cfg),
      expected: item.expected,
    };
    results.push(entry);
    json("progress", results);
    console.log(
      `${item.name}: exit ${result.exitCode}, ${entry.distinct ?? "?"} distinct, ${entry.violation ?? "no violation"}`,
    );
    if (item.expected === "pass") {
      assert.equal(result.exitCode, 0, `${item.name}: inspect ${evidence}`);
      assert.match(
        result.stdout,
        /Model checking completed\. No error has been found\./,
      );
      assert.equal(entry.queue, "0", `${item.name}: queue must be empty`);
      assert.ok(depth, `${item.name}: missing depth`);
    } else {
      assert.equal(
        result.exitCode,
        12,
        `${item.name}: only intended invariant failure counts`,
      );
      assert.equal(
        entry.violation,
        item.expected,
        `${item.name}: wrong safety property`,
      );
      assert.match(result.stdout, /behavior up to this point is/);
    }
  }
  const original = sha(join(skill, "DagAcyclic.tla"));
  assert.equal(original, sha(model), "Model changed during run");
  const modelOnly = process.argv.includes("--model-only");
  let production = null;
  let publicConformance = null;
  if (!modelOnly) {
    const artifactCheck = await execute("compiler-artifacts-check", "bun", [
      join(skill, "compiler-artifacts-check.mjs"),
      evidence,
    ]);
    assert.equal(
      artifactCheck.exitCode,
      0,
      "Compiler artifact cleanup check failed",
    );
    const result = await execute(
      "production-conformance",
      "bun",
      [join(skill, "production-check.mjs")],
      600000,
    );
    assert.equal(
      result.exitCode,
      0,
      "Production conformance or sensitivity failed",
    );
    const path = result.stdout.match(
      /PASS committed production conformance checkpoint: (.+)/,
    )?.[1];
    assert.ok(path, "Missing production evidence path");
    production = { exitCode: result.exitCode, evidence: path };
    const publicResult = await execute(
      "public-conformance",
      "bun",
      [join(skill, "public-check.mjs")],
      3600000,
    );
    assert.equal(
      publicResult.exitCode,
      0,
      "Public/read conformance or sensitivity failed",
    );
    const publicPath = publicResult.stdout.match(
      /PASS corrected public\/read conformance checkpoint: (.+)/,
    )?.[1];
    assert.ok(publicPath, "Missing current public/read evidence path");
    publicConformance = {
      exitCode: publicResult.exitCode,
      evidence: publicPath,
    };
  }
  exitCode = process.argv.includes("--full") ? 2 : 0;
  json("result", {
    status: modelOnly ? "model-checkpoint-pass" : "conformance-checkpoint-pass",
    exitCode,
    scope: modelOnly
      ? "finite transaction model only"
      : "finite model plus merged production/public/read conformance; final clients and independent review pending",
    results,
    production,
    publicConformance,
    pending: [
      "final-client source mapping",
      "fresh Claude discovery",
      "independent final review seats",
    ],
    toolSha256: sha(jar),
    sourceMapping: coverage.confirmedCommit,
  });
  console.log(
    `${modelOnly ? "MODEL CHECKPOINT PASS" : "CONFORMANCE CHECKPOINT PASS"}; final clients and independent review PENDING. Evidence: ${evidence}`,
  );
} catch (error) {
  if (error instanceof DiskStop) exitCode = 3;
  if (error instanceof AwaitMergedSource) exitCode = 2;
  json("result", {
    status:
      error instanceof DiskStop
        ? "DISK STOP"
        : error instanceof AwaitMergedSource
          ? "awaiting-merged-source"
          : "fail",
    exitCode,
    error: String(error),
    results,
  });
  console.error(error);
  console.error(`Evidence: ${evidence}`);
}
process.exitCode = exitCode;

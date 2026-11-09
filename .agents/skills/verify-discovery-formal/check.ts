import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  appendFileSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import coverage from "./coverage.json";
import pin from "./tool.json";

const skill = import.meta.dirname;
const root = resolve(skill, "../../..");
const base = join(root, "docs/evidence/discovery-formal");
mkdirSync(base, { recursive: true });
const evidence = mkdtempSync(join(base, "check-"));
const hash = (path: string) =>
  createHash("sha256").update(readFileSync(path)).digest("hex");
const record = (name: string, value: unknown) =>
  writeFileSync(
    join(evidence, `${name}.json`),
    `${JSON.stringify(value, null, 2)}\n`,
  );

async function execute(
  label: string,
  command: string,
  args: string[],
  cwd = root,
) {
  const started = new Date().toISOString();
  const child = spawn(command, args, {
    cwd,
    stdio: ["ignore", "pipe", "pipe"],
  });
  record(`${label}-started`, { command, args, cwd, started, pid: child.pid });
  const stop = () => {
    child.kill("SIGTERM");
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  let out = "";
  let err = "";
  child.stdout.on("data", (chunk: Buffer) => {
    out += chunk.toString();
    appendFileSync(join(evidence, `${label}.stdout`), chunk);
  });
  child.stderr.on("data", (chunk: Buffer) => {
    err += chunk.toString();
    appendFileSync(join(evidence, `${label}.stderr`), chunk);
  });
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    child.kill("SIGKILL");
  }, 600_000);
  try {
    const result = await new Promise<{
      exit: number | null;
      signal: string | null;
    }>((done, reject) => {
      child.on("error", reject);
      child.on("close", (exit, signal) => done({ exit, signal }));
    });
    writeFileSync(join(evidence, `${label}.stdout`), out);
    writeFileSync(join(evidence, `${label}.stderr`), err);
    record(label, { command, args, cwd, started, ...result, timedOut });
    assert.equal(timedOut, false, `${label}: timeout is incomplete proof`);
    assert.equal(result.signal, null, `${label}: interrupted proof`);
    return { ...result, out, err };
  } finally {
    clearTimeout(timer);
    process.removeListener("SIGINT", stop);
    process.removeListener("SIGTERM", stop);
  }
}

const invariants = [
  "TypeOK",
  "CurrentCredentialProvenance",
  "CurrentDialogProvenance",
  "LatestPublication",
  "AppliedIsCurrent",
  "ClosedIsEmpty",
  "SignedOutIsEmpty",
  "ShowIsAuthorized",
];
const mutations = [
  { broken: "credential", property: "CurrentCredentialProvenance" },
  { broken: "dialog", property: "CurrentDialogProvenance" },
  { broken: "latest", property: "AppliedIsCurrent" },
  { broken: "error", property: "LatestPublication" },
  { broken: "close-clear", property: "ClosedIsEmpty" },
  { broken: "signout-clear", property: "SignedOutIsEmpty" },
  { broken: "edit-clear", property: "AppliedIsCurrent" },
  { broken: "show-guard", property: "ShowIsAuthorized" },
  { broken: "show-source", property: "ShowIsAuthorized" },
  { broken: "show-credential", property: "ShowIsAuthorized" },
];
const bounds = {
  credentials: ["Owner", "Scoped"],
  dialogs: ["Directory", "Lookup"],
  prefixes: ["a", "b"],
  maxRequests: 2,
  generationColors: 4,
  maxRetainedShowCallbacks: 1,
  maxShowReads: 1,
  replyLimitIncludes: "discovery replies plus Show exact-id reply",
  symmetry: "only permutations of generation colors",
  rows: ["work", "personal"],
  lifetimeRequests: "no bound",
  fairness: "none; safety only",
};
const stages: unknown[] = [];

try {
  console.log(`Evidence: ${evidence}`);
  const jar = join(base, "tool-cache/tla2tools.jar");
  if (!existsSync(jar)) {
    const disk = await execute("disk-guard", "sh", [
      "/Users/zambamon/Work/todo-cli/scripts/disk-guard.sh",
    ]);
    assert.equal(disk.exit, 0, "Disk guard refused tool download");
    mkdirSync(join(base, "tool-cache"), { recursive: true });
    const download = await execute("download", "curl", [
      "--fail",
      "--location",
      "--retry",
      "2",
      "--output",
      jar,
      pin.url,
    ]);
    assert.equal(download.exit, 0, "Tool download failed");
  }
  assert.equal(hash(jar), pin.sha256, "TLC tool hash mismatch");
  copyFileSync(join(skill, "tool.json"), join(evidence, "tool.json"));
  const source = readFileSync(join(skill, "Discovery.tla"), "utf8");
  const head = await execute("git-head", "git", ["rev-parse", "HEAD"]);
  assert.equal(head.exit, 0);
  const contract = await execute("contract-source", "git", [
    "show",
    `${coverage.contractCommit}:${coverage.contract.path}`,
  ]);
  assert.equal(contract.exit, 0, "Immutable approved contract missing");
  assert.equal(
    createHash("sha256").update(contract.out).digest("hex"),
    coverage.contract.sha256,
    "Approved contract mapping drifted",
  );
  assert.equal(
    hash(join(root, coverage.contract.path)),
    coverage.contract.sha256,
    "Contract changed; review model semantics before renewing coverage",
  );
  copyFileSync(join(skill, "coverage.json"), join(evidence, "coverage.json"));
  record("provenance", {
    head: head.out.trim(),
    scope: "approved-contract-model-only; production mapping pending C/D",
    bounds,
    modelHash: hash(join(skill, "Discovery.tla")),
    runnerHash: hash(join(skill, "check.ts")),
    runtime: process.versions,
    coverage,
  });
  async function tlc(label: string, broken = "", property = "") {
    const directory = join(evidence, label);
    mkdirSync(directory);
    writeFileSync(join(directory, "Discovery.tla"), source);
    writeFileSync(
      join(directory, "Discovery.cfg"),
      [
        "CONSTANTS",
        "  Slots = {g1, g2, g3, g4}",
        "  MaxRequests = 2",
        "  NoIdentity = NoIdentity",
        `  Broken = "${broken}"`,
        "SPECIFICATION Spec",
        "SYMMETRY GenerationSymmetry",
        `INVARIANTS ${property ? `TypeOK ${property}` : invariants.join(" ")}`,
        "CHECK_DEADLOCK FALSE",
        "",
      ].join("\n"),
    );
    const result = await execute(
      label,
      "java",
      [
        "-Xmx2g",
        "-XX:+UseParallelGC",
        "-Dtlc2.tool.fp.FPSet.impl=tlc2.tool.fp.MemFPSet1",
        "-cp",
        jar,
        "tlc2.TLC",
        "-workers",
        "1",
        "-fp",
        "17",
        "-seed",
        "1",
        "-metadir",
        join(directory, "states"),
        "-config",
        "Discovery.cfg",
        "Discovery.tla",
      ],
      directory,
    );
    if (broken) {
      assert.equal(
        result.exit,
        12,
        `${label}: expected a behavioral counterexample`,
      );
      assert.ok(
        result.out.includes(`Invariant ${property} is violated`),
        `${label}: wrong failure`,
      );
      assert.match(result.out, /State 1:/);
    } else {
      assert.equal(result.exit, 0, `${label} failed; read its stdout`);
      assert.match(
        result.out,
        /Model checking completed\. No error has been found/,
      );
    }
    const counts = result.out.match(
      /([\d,]+) states generated, ([\d,]+) distinct states found, ([\d,]+) states left on queue/,
    );
    assert.ok(counts, `${label}: missing queue receipt`);
    const [, generated, distinct, queue] = counts;
    if (!broken) assert.equal(queue, "0", `${label}: incomplete queue`);
    stages.push({
      label,
      bounds,
      broken,
      property: property || invariants,
      exit: result.exit,
      generated,
      distinct,
      queue,
    });
    record("stages", stages);
    console.log(`${label}: exit ${result.exit}; ${counts[0]}`);
  }
  await tlc("safety");
  for (const mutation of mutations)
    await tlc(`broken-${mutation.broken}`, mutation.broken, mutation.property);
  await tlc("restored");
  const typecheck = await execute("typecheck", "bun", [
    "--bun",
    "node_modules/typescript/bin/tsc",
    "-p",
    join(skill, "tsconfig.json"),
  ]);
  assert.equal(typecheck.exit, 0, "Runner typecheck failed");
  assert.equal(
    hash(join(skill, "Discovery.tla")),
    createHash("sha256").update(source).digest("hex"),
    "Model changed during proof",
  );
  record("result", {
    passed: true,
    scope: "bounded approved-contract model only",
    productionConformance:
      "unproven; await C/D immutable source and behavioral sensitivity",
    head: head.out.trim(),
    stages,
    evidence,
  });
  console.log(
    "PASS: bounded discovery model and restored sensitivity; production conformance UNPROVEN",
  );
} catch (error) {
  record("result", { passed: false, stages, error: String(error), evidence });
  console.error(error);
  process.exitCode = 1;
}

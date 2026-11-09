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
import { join } from "node:path";
import coverage from "./coverage.json";
import pin from "./tool.json";
import {
  repositoryInput,
  repositoryPath,
  verificationRoot,
} from "../../../scripts/verification-inputs";

const skill = import.meta.dirname;
const root = verificationRoot(skill);
const base = join(root, "docs/evidence/task-search-formal");
mkdirSync(base, { recursive: true });
const evidence = mkdtempSync(join(base, "check-"));
const sha256 = (path: string) =>
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
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  child.stdout.on("data", (chunk: Buffer) => {
    stdout.push(chunk);
    appendFileSync(join(evidence, `${label}.stdout`), chunk);
  });
  child.stderr.on("data", (chunk: Buffer) => {
    stderr.push(chunk);
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
    const out = Buffer.concat(stdout).toString("utf8");
    const err = Buffer.concat(stderr).toString("utf8");
    writeFileSync(join(evidence, `${label}.stdout`), out);
    writeFileSync(join(evidence, `${label}.stderr`), err);
    record(label, { command, args, cwd, started, ...result, timedOut });
    assert.equal(timedOut, false, `${label} timed out; proof incomplete`);
    return { ...result, out, err };
  } finally {
    clearTimeout(timer);
    process.removeListener("SIGINT", stop);
    process.removeListener("SIGTERM", stop);
  }
}

type Bounds = {
  profiles: number;
  views: number;
  texts: number;
  filters: number;
  slots: number;
};
const set = (n: number) =>
  `{${Array.from({ length: n }, (_, i) => i + 1).join(", ")}}`;
const controls = [
  "BrokenSnapshot",
  "BrokenLatest",
  "BrokenStale",
  "BrokenProgress",
  "BrokenFallback",
  "BrokenCatalogOwed",
  "BrokenCatalogPromotion",
];
function config(
  bounds: Bounds,
  live: boolean,
  broken = "",
  semanticOnly = false,
) {
  return [
    "CONSTANTS",
    `  Profiles = ${set(bounds.profiles)}`,
    `  Views = ${set(bounds.views)}`,
    `  Texts = ${set(bounds.texts)}`,
    `  Filters = ${set(bounds.filters)}`,
    `  Slots = ${set(bounds.slots + 1)}`,
    `  MaxRequests = ${bounds.slots}`,
    "  EmptyText = 1",
    "  EmptyFilter = 1",
    "  InitialProfile = 1",
    "  InitialView = 1",
    "  NoIdentity = NoIdentity",
    ...controls.map(
      (name) => `  ${name} = ${name === broken ? "TRUE" : "FALSE"}`,
    ),
    `SPECIFICATION ${live ? "FairSpec" : "Spec"}`,
    semanticOnly
      ? "INVARIANTS TypeOK OneSnapshot ShowingIsCurrent ExactStale QueryHasCatalog CatalogOwedUntilPublish NoOwedQueryPublication"
      : "INVARIANTS TypeOK OneSnapshot LatestPublication ShowingIsCurrent ExactStale QueryHasCatalog CatalogOwedUntilPublish NoOwedQueryPublication",
    ...(live ? ["PROPERTY Convergence"] : []),
    "CHECK_DEADLOCK FALSE",
    "",
  ].join("\n");
}

const stages: unknown[] = [];
try {
  console.log(`Evidence: ${evidence}`);
  const toolCache = repositoryPath(
    root,
    process.env.TODO_TASK_SEARCH_TOOL_CACHE ??
      "docs/evidence/task-search-formal/tool-cache",
    "TODO_TASK_SEARCH_TOOL_CACHE",
  );
  for (const file of coverage.files)
    repositoryInput(root, file.path, "TaskSearch source mapping");
  if (process.argv.includes("--inputs-only")) {
    record("result", { passed: true, scope: "input validation only" });
    process.exit(0);
  }
  const jar = join(toolCache, "tla2tools.jar");
  const paths = await execute("input-path-controls", "bun", [
    join(root, "scripts/check-verification-paths.ts"),
    "task-search",
  ]);
  assert.equal(paths.exit, 0, "Required-input path controls failed");
  if (!existsSync(jar)) {
    const disk = await execute("disk-guard", "sh", [
      join(root, "scripts/disk-guard.sh"),
    ]);
    assert.equal(disk.exit, 0, "Disk guard refused the tool download");
    mkdirSync(toolCache, { recursive: true });
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
  assert.equal(sha256(jar), pin.sha256, "TLC tool hash mismatch");
  copyFileSync(join(skill, "tool.json"), join(evidence, "tool.json"));
  const source = readFileSync(join(skill, "TaskSearch.tla"), "utf8");
  const head = await execute("git-head", "git", ["rev-parse", "HEAD"]);
  assert.equal(head.exit, 0);
  record("provenance", {
    head: head.out.trim(),
    modelHash: sha256(join(skill, "TaskSearch.tla")),
    runnerHash: sha256(join(skill, "check.ts")),
    runtime: process.versions,
  });
  const full: Bounds = {
    profiles: 2,
    views: 2,
    texts: 3,
    filters: 2,
    slots: 2,
  };
  const race: Bounds = {
    profiles: 1,
    views: 1,
    texts: 3,
    filters: 2,
    slots: 3,
  };
  const small: Bounds = {
    profiles: 1,
    views: 1,
    texts: 2,
    filters: 2,
    slots: 2,
  };
  async function tlc(
    label: string,
    bounds: Bounds,
    live: boolean,
    broken: string,
    failure: string,
    semanticOnly = false,
  ) {
    const directory = join(evidence, label);
    mkdirSync(directory);
    mkdirSync(join(directory, "tmp"));
    writeFileSync(join(directory, "TaskSearch.tla"), source);
    const cfg = config(bounds, live, broken, semanticOnly);
    writeFileSync(
      join(directory, "TaskSearch.cfg"),
      broken === "NoRetryFairness"
        ? cfg.replace(
            "SPECIFICATION FairSpec",
            "SPECIFICATION FairSpecWithoutRetry",
          )
        : cfg,
    );
    const result = await execute(
      label,
      "java",
      [
        "-Xmx2g",
        `-Djava.io.tmpdir=${join(directory, "tmp")}`,
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
        ...(live ? ["-coverage", "99999"] : []),
        "-metadir",
        join(directory, "states"),
        "-config",
        "TaskSearch.cfg",
        "TaskSearch.tla",
      ],
      directory,
    );
    if (failure) {
      assert.equal(
        result.exit,
        live ? 13 : 12,
        `${label} did not find the required counterexample`,
      );
      assert.match(result.out, new RegExp(failure));
      assert.match(result.out, /State 1:/);
    } else {
      assert.equal(result.exit, 0, `${label} failed; read ${label}.stdout`);
      assert.match(
        result.out,
        /Model checking completed\. No error has been found/,
      );
      assert.match(result.out, /0 states left on queue/);
    }
    const counts = result.out.match(
      /([\d,]+) states generated, ([\d,]+) distinct states found, ([\d,]+) states left on queue/,
    );
    const stage = {
      label,
      bounds,
      live,
      broken,
      exit: result.exit,
      generated: counts?.[1],
      distinct: counts?.[2],
      queue: counts?.[3],
    };
    stages.push(stage);
    record("stages", stages);
    console.log(
      `${label}: exit ${result.exit}; ${counts?.[0] ?? "counterexample recorded"}`,
    );
  }
  await tlc("safety-full", full, false, "", "");
  await tlc("safety-three-requests", race, false, "", "");
  await tlc("liveness", small, true, "", "");
  await tlc(
    "broken-snapshot",
    small,
    false,
    "BrokenSnapshot",
    "Invariant OneSnapshot is violated",
  );
  await tlc(
    "broken-latest",
    small,
    false,
    "BrokenLatest",
    "Invariant LatestPublication is violated",
  );
  await tlc(
    "broken-latest-showing",
    small,
    false,
    "BrokenLatest",
    "Invariant ShowingIsCurrent is violated",
    true,
  );
  await tlc(
    "broken-stale",
    small,
    false,
    "BrokenStale",
    "Invariant ExactStale is violated",
  );
  await tlc(
    "broken-progress",
    small,
    true,
    "BrokenProgress",
    "Temporal properties were violated",
  );
  await tlc(
    "no-retry-fairness",
    small,
    true,
    "NoRetryFairness",
    "Temporal properties were violated",
  );
  await tlc(
    "broken-fallback",
    small,
    false,
    "BrokenFallback",
    "Invariant QueryHasCatalog is violated",
  );
  await tlc(
    "broken-catalog-clear",
    small,
    false,
    "BrokenCatalogOwed",
    "Invariant CatalogOwedUntilPublish is violated",
  );
  await tlc(
    "broken-catalog-promotion",
    small,
    false,
    "BrokenCatalogPromotion",
    "Invariant NoOwedQueryPublication is violated",
  );
  await tlc("restored", small, true, "", "");
  const typecheck = await execute("typecheck", "bun", [
    "--bun",
    "node_modules/typescript/bin/tsc",
    "-p",
    join(skill, "tsconfig.json"),
  ]);
  assert.equal(typecheck.exit, 0, "Verification runner typecheck failed");
  const files = coverage.files.map((file) => ({
    ...file,
    observed: sha256(join(root, file.path)),
  }));
  record("source-mapping", { ...coverage, files });
  assert.ok(
    files.every((file) => file.sha256 === file.observed),
    "Reviewed production mapping drifted. Inspect the actual functions before renewing coverage.json.",
  );
  assert.equal(
    sha256(join(skill, "TaskSearch.tla")),
    createHash("sha256").update(source).digest("hex"),
    "Model changed during proof",
  );
  const matcher = await execute("matcher-check", "bun", [
    join(skill, "check-matcher.ts"),
    ...(process.argv[2] === undefined ? [] : [process.argv[2]]),
  ]);
  assert.equal(matcher.exit, 0, "Real candidate matcher checks failed");
  const matcherOutcome: unknown = JSON.parse(matcher.out);
  record("result", {
    passed: true,
    scope: coverage.status,
    sourceCommit: head.out.trim(),
    stages,
    productionMatcher:
      "generated-inputs-passed on the recorded immutable commit",
    matcherOutcome,
    clientMapping: coverage.clientRefinement,
    evidence,
  });
  console.log(
    "PASS: bounded C1 safety/liveness, reviewed production mapping and real matcher properties",
  );
} catch (error) {
  record("result", { passed: false, stages, error: String(error), evidence });
  console.error(error);
  process.exitCode = 1;
}

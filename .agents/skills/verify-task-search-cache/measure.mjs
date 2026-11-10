import { Schema } from "effect";
import {
  taskView,
  TaskViewSchema,
} from "../../../packages/domain/src/presentation.ts";
import assert from "node:assert/strict";
import { execFileSync, spawnSync, spawn } from "node:child_process";
import { gzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
  cpSync,
  rmSync,
  existsSync,
} from "node:fs";
import { tmpdir, cpus, loadavg } from "node:os";
import { join, resolve } from "node:path";
import { once } from "node:events";

const [manifestPath, evidence, runLabel = "baseline"] = process.argv.slice(2);
assert.ok(manifestPath && evidence);
const binaries = JSON.parse(readFileSync(manifestPath, "utf8"));
const root = resolve(import.meta.dirname, "../../..");
mkdirSync(evidence, { recursive: true });
const scratch = mkdtempSync(join(tmpdir(), "todo-cache-measure-"));
const env = {
  ...process.env,
  HOME: join(scratch, "home"),
  TODO_DB: join(scratch, "todo.db"),
  TODO_ATTACHMENT_ROOT: join(scratch, "attachments"),
  TODO_PORT: "0",
};
mkdirSync(env.HOME);
const actions = [];
const samples = [];
const oracleWork = [];
const validationWork = [];
let server;
let log = "";
const startedLoad = loadavg();
const driverCpuStart = process.cpuUsage();
const serverResources = () =>
  server
    ? execFileSync(
        "ps",
        ["-p", String(server.pid), "-o", "time=", "-o", "rss="],
        { encoding: "utf8" },
      ).trim()
    : null;
let cpuStart;
function cli(binary, args, input) {
  const r = spawnSync(
    binary,
    [
      "--format",
      "json",
      ...(args.includes("--profile") ? [] : ["--profile", "work"]),
      ...args,
    ],
    { env, input, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  actions.push({ args, exit: r.status });
  assert.equal(r.status, 0, r.stderr || r.stdout);
  return JSON.parse(r.stdout);
}
const fixture = JSON.parse(
  readFileSync(join(import.meta.dirname, "measurement-fixture.json"), "utf8"),
);
const fixtureHash = createHash("sha256")
  .update(JSON.stringify(fixture))
  .digest("hex");
try {
  cli(
    binaries.cli,
    ["init", "--password-stdin"],
    "cache measurement passphrase\n",
  );
  cli(
    binaries.cli,
    ["login", "--password-stdin"],
    "cache measurement passphrase\n",
  );
  const fixtureDb = join(root, ".scratch/cache-fixture.db");
  if (existsSync(fixtureDb)) cpSync(fixtureDb, env.TODO_DB);
  else {
    const seed = spawnSync(
      process.env.CACHE_SEED,
      [join(import.meta.dirname, "measurement-fixture.json")],
      { env, encoding: "utf8" },
    );
    assert.equal(seed.status, 0, seed.stderr);
    cpSync(env.TODO_DB, fixtureDb);
  }
  for (const scenario of fixture.scenarios)
    cli(
      binaries.cli,
      ["--profile", scenario.name, "login", "--password-stdin"],
      "cache measurement passphrase\n",
    );
  server = spawn(binaries.server, [], {
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  writeFileSync(
    join(evidence, "owned-process.json"),
    JSON.stringify({
      pid: server.pid,
      binary: binaries.server,
      database: env.TODO_DB,
    }),
  );
  for (const stream of [server.stdout, server.stderr])
    stream.on("data", (x) => {
      log += x;
    });
  const deadline = Date.now() + 60000;
  while (!/Listening on (http:\/\/127\.0\.0\.1:\d+)/.test(log)) {
    assert.ok(Date.now() < deadline, log);
    await new Promise((r) => setTimeout(r, 20));
  }
  const base = /Listening on (http:\/\/127\.0\.0\.1:\d+)/.exec(log)[1];
  const auth = await fetch(`${base}/auth/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ passphrase: "cache measurement passphrase" }),
  });
  assert.equal(auth.status, 200);
  const { credential } = await auth.json();
  cpuStart = serverResources();
  for (const scenario of fixture.scenarios) {
    const oracles = new Map();
    let oracleRevision = 0;
    const prepareOracles = () => {
      oracleRevision++;
      for (const query of fixture.queries) {
        const started = performance.now();
        const oracle = cli(process.env.CACHE_ORACLE_CLI ?? binaries.cli, [
          "--profile",
          scenario.name,
          "list",
          "--text",
          query,
        ]);
        const exact = JSON.stringify(oracle.tasks ?? []);
        const sha256 = createHash("sha256").update(exact).digest("hex");
        const path = `${scenario.name}-oracle-${oracleRevision}-${fixture.queries.indexOf(query)}.json.gz`;
        writeFileSync(join(evidence, path), gzipSync(exact));
        oracles.set(query, { exact, sha256, path });
        oracleWork.push({
          scenario: scenario.name,
          query,
          ms: performance.now() - started,
          bytes: Buffer.byteLength(exact),
          sha256,
          path,
        });
      }
    };
    prepareOracles();
    for (let i = 0; i < fixture.operations + fixture.warmup + 1; i++) {
      const query = fixture.queries[i % fixture.queries.length];
      if (scenario.name === "mixed" && i > 0 && i % 5 === 0) {
        const all = cli(binaries.cli, ["--profile", scenario.name, "list"]);
        const target = all.tasks[0];
        cli(binaries.cli, [
          "--profile",
          scenario.name,
          "edit",
          target.id,
          "--title",
          `Rent changed ${i}`,
          "--expected-version",
          String(target.row_version),
        ]);
        prepareOracles();
      }
      const load = loadavg();
      const cpuBefore = serverResources();
      const started = performance.now();
      const response = await fetch(
        `${base}/profiles/${scenario.name}/tasks?text=${encodeURIComponent(query)}`,
        { headers: { Authorization: `Bearer ${credential}` } },
      );
      const body = await response.json();
      const ms = performance.now() - started;
      const cpuAfter = serverResources();
      actions.push({
        surface: "HTTP",
        scenario: scenario.name,
        iteration: i,
        query,
        status: response.status,
        load,
        cpuBefore,
        cpuAfter,
      });
      assert.equal(response.status, 200);
      const validationStarted = performance.now();
      const observed = JSON.stringify(
        body.map((t) => Schema.encodeSync(TaskViewSchema)(taskView(t, [], []))),
      );
      assert.equal(
        observed,
        oracles.get(query)?.exact,
        `Full ordered Task strings/spans: ${scenario.name}/${i}`,
      );
      validationWork.push({
        scenario: scenario.name,
        query,
        ms: performance.now() - validationStarted,
        bytes: Buffer.byteLength(observed),
        sha256: createHash("sha256").update(observed).digest("hex"),
        oracle: oracles.get(query)?.path,
        fullEquality: true,
      });
      if (i === 0 || i > fixture.warmup)
        samples.push({
          scenario: scenario.name,
          phase: i === 0 ? "cold" : "warm",
          query,
          ms,
          rows: body.length,
          load,
          cpuBefore,
          cpuAfter,
        });
    }
  }
  writeFileSync(
    join(evidence, "result.json"),
    JSON.stringify(
      {
        status: "PASS",
        runLabel,
        binaries,
        fixtureHash,
        driverHash: createHash("sha256")
          .update(readFileSync(import.meta.filename))
          .digest("hex"),
        operations: fixture.operations,
        errors: 0,
        cpu: cpus()[0]?.model,
        load: loadavg(),
        startedLoad,
        serverResources: {
          start: cpuStart,
          end: serverResources(),
          format: "ps combined CPU time and RSS KiB",
        },
        driverCpu: process.cpuUsage(driverCpuStart),
        samples,
        actions,
        oracleWork,
        validationWork,
      },
      null,
      2,
    ),
  );
} catch (error) {
  writeFileSync(
    join(evidence, "failure.json"),
    JSON.stringify(
      {
        status: "FAIL",
        error: String(error),
        load: loadavg(),
        actions,
        samples,
        oracleWork,
        validationWork,
      },
      null,
      2,
    ),
  );
  throw error;
} finally {
  if (server) {
    server.kill("SIGTERM");
    await once(server, "exit");
  }
  writeFileSync(join(evidence, "server.log"), log);
  writeFileSync(
    join(evidence, "actions.json"),
    JSON.stringify(actions, null, 2),
  );
  rmSync(scratch, { recursive: true, force: true });
}

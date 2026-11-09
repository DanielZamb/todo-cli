import { Schema } from "effect";
import {
  taskView,
  TaskViewSchema,
} from "../../../packages/domain/src/presentation.ts";
import assert from "node:assert/strict";
import { spawnSync, spawn } from "node:child_process";
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
  for (const scenario of fixture.scenarios) {
    const oracles = new Map();
    const prepareOracles = () => {
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
        oracles.set(query, exact);
        oracleWork.push({
          scenario: scenario.name,
          query,
          ms: performance.now() - started,
          bytes: Buffer.byteLength(exact),
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
      const started = performance.now();
      const response = await fetch(
        `${base}/profiles/${scenario.name}/tasks?text=${encodeURIComponent(query)}`,
        { headers: { Authorization: `Bearer ${credential}` } },
      );
      const body = await response.json();
      const ms = performance.now() - started;
      assert.equal(response.status, 200);
      const validationStarted = performance.now();
      const observed = JSON.stringify(
        body.map((t) => Schema.encodeSync(TaskViewSchema)(taskView(t, [], []))),
      );
      assert.equal(
        observed,
        oracles.get(query),
        `Full ordered Task strings/spans: ${scenario.name}/${i}`,
      );
      validationWork.push({
        scenario: scenario.name,
        query,
        ms: performance.now() - validationStarted,
        bytes: Buffer.byteLength(observed),
      });
      if (i === 0 || i > fixture.warmup)
        samples.push({
          scenario: scenario.name,
          phase: i === 0 ? "cold" : "warm",
          query,
          ms,
          rows: body.length,
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
        samples,
        actions,
        oracleWork,
        validationWork,
      },
      null,
      2,
    ),
  );
} finally {
  if (server) {
    server.kill("SIGTERM");
    await once(server, "exit");
  }
  writeFileSync(join(evidence, "server.log"), log);
  rmSync(scratch, { recursive: true, force: true });
}

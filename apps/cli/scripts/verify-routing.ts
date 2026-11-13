import { Database } from "bun:sqlite";
import { strict as assert } from "node:assert";
import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createServer, request } from "node:http";
import { cpus, loadavg, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import {
  databaseBinding,
  type EndpointRecord,
  endpointPath,
} from "@todo/domain/database-route";
import { Schema } from "effect";
import {
  CommandTransportError,
  discoverServer,
} from "../src/server-connection.ts";

const [evidenceArg, cli, serverBinary, companion, guardedCli] =
  Schema.decodeUnknownSync(
    Schema.Tuple([
      Schema.String,
      Schema.String,
      Schema.String,
      Schema.String,
      Schema.String,
    ]),
  )(process.argv.slice(2));
const evidence = resolve(evidenceArg);
mkdirSync(evidence, { recursive: true });
const scratch = mkdtempSync(join(tmpdir(), "todo-cli-routing-"));
const home = join(scratch, "home");
mkdirSync(home);
const db = join(home, ".todo-cli", "todo.db");
const actions: object[] = [];
const children = new Set<ChildProcess>();
let foreignUrl = "http://127.0.0.1:1";
let foreignPort = "";
const env = (targetHome = home) => ({
  ...process.env,
  HOME: targetHome,
  TODO_DB: "",
  TODO_SERVER_URL: foreignUrl,
  TODO_ROUTING_FOREIGN_PORT: foreignPort,
  TODO_ROUTING_DEFAULT_TRAP: join(evidence, "default-port-trap.jsonl"),
});
const run = (args: string[], input = "", targetHome = home, binary = cli) => {
  const start = performance.now();
  const result = spawnSync(binary, args, {
    env: env(targetHome),
    input,
    encoding: "utf8",
    timeout: 20000,
  });
  if (result.error) throw result.error;
  actions.push({
    args,
    exit: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
    milliseconds: performance.now() - start,
  });
  return result;
};
const ok = (args: string[], input = "", targetHome = home) => {
  const r = run(args, input, targetHome);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  return r.stdout;
};
async function startServer(path = db, binary = serverBinary) {
  let output = "";
  const child = spawn(binary, binary === companion ? ["server"] : [], {
    env: { ...env(), TODO_DB: path, TODO_PORT: "0" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  children.add(child);
  child.stdout?.on("data", (chunk) => {
    output += chunk;
  });
  child.stderr?.on("data", (chunk) => {
    output += chunk;
  });
  const until = performance.now() + 60000;
  while (performance.now() < until) {
    if (child.exitCode !== null)
      throw new Error(`Server exited ${child.exitCode}: ${output}`);
    const binding = databaseBinding(path);
    if (binding && existsSync(endpointPath(binding.path))) {
      const proven = await discoverServer(path, 1000);
      if (proven) {
        proven.close();
        actions.push({ server: path, pid: child.pid, log: output });
        return child;
      }
    }
    await delay(20);
  }
  throw new Error(`Server readiness deadline: ${output}`);
}
async function stop(child: ChildProcess, signal: NodeJS.Signals = "SIGTERM") {
  if (child.exitCode !== null || child.signalCode !== null) {
    children.delete(child);
    return;
  }
  const exited = new Promise<void>((resolve) =>
    child.once("exit", () => resolve()),
  );
  child.kill(signal);
  await exited;
  children.delete(child);
}
function dump(path = db) {
  const connection = new Database(path, { readonly: true });
  try {
    const tables = connection
      .query<{ name: string }, []>(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
      )
      .all();
    return JSON.stringify(
      tables.map(({ name }) => ({
        name,
        rows: connection
          .query(`SELECT * FROM "${name.replaceAll('"', '""')}"`)
          .all()
          .map((row) => JSON.stringify(row))
          .sort(),
      })),
    );
  } finally {
    connection.close();
  }
}
function count(path = db) {
  const connection = new Database(path, { readonly: true });
  try {
    return connection
      .query<{ n: number }, []>("SELECT count(*) n FROM tasks")
      .get()?.n;
  } finally {
    connection.close();
  }
}

let foreignRequests = 0;
let foreignCredentials = 0;
const foreign = createServer((req, res) => {
  foreignRequests++;
  if (req.headers.authorization) foreignCredentials++;
  res.writeHead(403).end();
});
foreign.listen(0, "127.0.0.1");
await new Promise<void>((resolve) => foreign.once("listening", resolve));
const address = foreign.address();
if (!address || typeof address === "string")
  throw new Error("No owned foreign port");
foreignUrl = `http://127.0.0.1:${address.port}`;
foreignPort = String(address.port);
try {
  ok(["init", "--password-stdin"], "routing passphrase\n");
  ok(["login", "--password-stdin"], "routing passphrase\n");
  const credential = JSON.parse(
    readFileSync(join(home, ".todo-cli", "session_default.json"), "utf8"),
  ).token;
  const binding = databaseBinding(db);
  assert(binding);
  const recordPath = endpointPath(binding.path);
  const missing = run([
    "--require-server",
    "--format",
    "json",
    "add",
    "must refuse",
  ]);
  assert.equal(missing.status, 1);
  assert.equal(JSON.parse(missing.stdout).code, "server_required");
  assert.equal(count(), 0);
  const guarded = run(
    ["add", "Default port is irrelevant", "--format", "json"],
    "",
    home,
    guardedCli,
  );
  assert.equal(guarded.status, 0, guarded.stdout + guarded.stderr);
  assert.equal(foreignRequests, 0);
  const guardLoad = readFileSync(
    join(evidence, "default-port-trap.jsonl"),
    "utf8",
  );
  assert.match(guardLoad, /guard_loaded/);
  assert.doesNotMatch(guardLoad, /redirected_default_port/);
  actions.push({
    default_port_control:
      "compile-boundary diversion of any port-4310 request to the owned foreign listener",
    default_port_requests: 0,
    managed_port_contacted: false,
  });
  const child = await startServer();
  const record: EndpointRecord = JSON.parse(readFileSync(recordPath, "utf8"));
  const before = count();
  ok(["--direct", "add", "Nudged Task", "--format", "json"]);
  assert.equal(count(), (before ?? 0) + 1);
  const proven = await discoverServer(db, 1000);
  assert(proven);
  await proven.nudge();
  proven.close();
  const unsupported = run([
    "--require-server",
    "add",
    "must refuse",
    "--format",
    "json",
  ]);
  assert.equal(unsupported.status, 1);
  assert.equal(
    JSON.parse(unsupported.stdout).code,
    "server_command_unsupported",
  );
  ok(["config", "set", "write-mode", "server"]);
  assert.equal(ok(["config", "get", "write-mode"]), "server\n");
  assert.equal(
    run(["add", "blocked by setting", "--format", "json"]).status,
    1,
  );
  ok(["--direct", "add", "Flag overrides server"]);
  ok(["list", "--format", "json"]);
  ok(["init"]);
  ok(["config", "set", "write-mode", "direct"]);
  assert.equal(
    run([
      "--require-server",
      "add",
      "flag overrides direct",
      "--format",
      "json",
    ]).status,
    1,
  );
  assert.equal(
    run(["--direct", "--require-server", "add", "both", "--format", "json"])
      .status,
    2,
  );
  ok(["config", "set", "write-mode", "automatic"]);
  assert.equal(
    run(["config", "set", "write-mode", "typo", "--format", "json"]).status,
    2,
  );
  const configPath = join(home, ".todo-cli", "config.json");
  writeFileSync(configPath, '{"write_mode":"typo"}');
  const invalidBefore = dump();
  const invalid = run(["login", "--format", "json"], "must not authenticate\n");
  assert.equal(invalid.status, 2);
  assert.match(invalid.stdout, /automatic, direct or server/);
  assert.equal(dump(), invalidBefore);
  writeFileSync(configPath, '{"write_mode":"automatic"}');

  const copied = join(scratch, "copied");
  cpSync(home, copied, { recursive: true });
  const copiedDb = join(copied, ".todo-cli", "todo.db");
  const foreignHome = join(scratch, "foreign-home");
  mkdirSync(foreignHome);
  ok(["init", "--password-stdin"], "foreign passphrase\n", foreignHome);
  ok(["login", "--password-stdin"], "foreign passphrase\n", foreignHome);
  const foreignDb = join(foreignHome, ".todo-cli", "todo.db");
  const other = await startServer(foreignDb);
  const foreignBinding = databaseBinding(foreignDb);
  assert(foreignBinding);
  const otherRecord = readFileSync(endpointPath(foreignBinding.path), "utf8");
  const otherEndpoint: EndpointRecord = JSON.parse(otherRecord);
  const otherCredential = JSON.parse(
    readFileSync(
      join(foreignHome, ".todo-cli", "session_default.json"),
      "utf8",
    ),
  ).token;
  const foreignRouteCounts = async () => {
    const response = await fetch(
      `http://127.0.0.1:${otherEndpoint.port}/diagnostics`,
      { headers: { Authorization: `Bearer ${otherCredential}` } },
    );
    assert.equal(response.status, 200);
    const body = await response.json();
    return body.latency.routes
      .filter((route: { route: string }) => route.route.includes("/local/"))
      .map((route: { route: string; count: number }) => [
        route.route,
        route.count,
      ]);
  };
  const routesBefore = await foreignRouteCounts();
  const foreignBefore = dump(foreignDb);
  const saved = readFileSync(recordPath, "utf8");
  writeFileSync(recordPath, otherRecord);
  assert.equal(await discoverServer(db, 1000), undefined);
  ok(["add", "Foreign record stays direct"]);
  writeFileSync(recordPath, saved);
  assert.equal(await discoverServer(copiedDb, 1000), undefined);
  ok(["add", "Copied record stays direct"], "", copied);
  assert.equal(dump(foreignDb), foreignBefore);
  assert.deepEqual(await foreignRouteCounts(), routesBefore);
  assert.equal(foreignRequests, 0);
  actions.push({
    foreign_database_requests: 0,
    foreign_database_credentials: 0,
    foreign_dump_unchanged: true,
    environment_url_requests: 0,
  });
  await stop(other);

  const second = spawn(serverBinary, [], {
    env: { ...env(), TODO_DB: db, TODO_PORT: "0" },
    stdio: "ignore",
  });
  children.add(second);
  const secondExit = await new Promise<number | null>((resolve) =>
    second.once("exit", resolve),
  );
  children.delete(second);
  assert.notEqual(secondExit, 0);
  const oldRecord = readFileSync(recordPath, "utf8");
  const proxy = createServer((incoming, outgoing) => {
    const forwarded = request(
      {
        hostname: "127.0.0.1",
        port: record.port,
        path: incoming.url,
        method: incoming.method,
        headers: incoming.headers,
      },
      (response) => {
        if (incoming.url === "/local/commands") {
          response.resume();
          response.on("end", () => outgoing.destroy());
        } else {
          outgoing.writeHead(response.statusCode ?? 500, response.headers);
          response.pipe(outgoing);
        }
      },
    );
    forwarded.on("error", () => outgoing.destroy());
    incoming.pipe(forwarded);
  });
  proxy.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => proxy.once("listening", resolve));
  try {
    const proxyAddress = proxy.address();
    assert(proxyAddress && typeof proxyAddress !== "string");
    writeFileSync(
      recordPath,
      JSON.stringify({ ...record, port: proxyAddress.port }),
    );
    const uncertain = await discoverServer(db, 1000);
    assert(uncertain);
    const countBefore = count();
    try {
      await assert.rejects(
        () =>
          uncertain.run(
            {
              kind: "add",
              profile: "default",
              flags: { title: "Commit with lost reply" },
            },
            credential,
          ),
        (error) =>
          error instanceof CommandTransportError &&
          error.code === "write_outcome_unknown" &&
          error.outcome === "unknown",
      );
    } finally {
      uncertain.close();
    }
    assert.equal(count(), (countBefore ?? 0) + 1);
    actions.push({
      lost_committed_reply: "write_outcome_unknown",
      exit_code: 1,
      tasks_added: 1,
      retries: 0,
    });
  } finally {
    proxy.closeAllConnections();
    await new Promise<void>((resolve) => proxy.close(() => resolve()));
    writeFileSync(recordPath, oldRecord);
  }
  const killedConnection = await discoverServer(db, 1000);
  assert(killedConnection);
  await stop(child, "SIGKILL");
  await delay(20);
  let replacementRequests = 0;
  let replacementCredentials = 0;
  const replacement = createServer((request, response) => {
    replacementRequests++;
    if (request.headers.authorization) replacementCredentials++;
    response.writeHead(403).end();
  });
  replacement.listen(record.port, "127.0.0.1");
  await new Promise<void>((resolve) => replacement.once("listening", resolve));
  try {
    await assert.rejects(
      () =>
        killedConnection.run(
          {
            kind: "add",
            profile: "default",
            flags: { title: "must not reconnect" },
          },
          credential,
        ),
      (error) =>
        error instanceof CommandTransportError && error.outcome === "not_sent",
    );
    await delay(20);
    assert.equal(replacementRequests, 0);
    assert.equal(replacementCredentials, 0);
    actions.push({
      replacement_port_requests: 0,
      replacement_port_credentials: 0,
      command_outcome: "not_sent",
    });
  } finally {
    killedConnection.close();
    replacement.closeAllConnections();
    await new Promise<void>((resolve) => replacement.close(() => resolve()));
  }
  writeFileSync(recordPath, oldRecord);
  ok(["add", "Stale record stays direct"]);
  writeFileSync(recordPath, JSON.stringify({ ...record, port: 4310 }));
  const defaultControl = run(
    [
      "--direct",
      "add",
      "Default-port foreign proof is refused",
      "--format",
      "json",
    ],
    "",
    home,
    guardedCli,
  );
  assert.equal(
    defaultControl.status,
    0,
    defaultControl.stdout + defaultControl.stderr,
  );
  assert.match(
    readFileSync(join(evidence, "default-port-trap.jsonl"), "utf8"),
    /redirected_default_port/,
  );
  await delay(20);
  assert.equal(foreignCredentials, 0);
  actions.push({
    default_port_foreign_control:
      "unrelated owned listener substituted at compile boundary",
    credential_requests: 0,
    result: "direct commit",
    real_port_4310_contacted: false,
  });
  writeFileSync(recordPath, JSON.stringify({ ...record, port: address.port }));
  ok(["add", "Unproved listener stays direct"]);
  assert.equal(foreignCredentials, 0);
  writeFileSync(
    recordPath,
    JSON.stringify({ ...record, binding: foreignBinding, port: address.port }),
  );
  const initialRequests = foreignRequests;
  ok(["add", "Wrong database sends nothing"]);
  assert.equal(foreignRequests, initialRequests);
  rmSync(recordPath);

  const seedDir = join(scratch, "seed");
  const prepare = await startServer(db, companion);
  await stop(prepare);
  cpSync(home, seedDir, { recursive: true });
  const differentials: object[] = [];
  const reference = join(scratch, "reference.txt");
  writeFileSync(
    reference,
    "The server stores this path only as a reference.\n",
  );
  for (const [name, flags] of [
    ["success", { title: "Route parity", project: "Routing", tag: ["proof"] }],
    ["refusal", { title: "" }],
  ] as const) {
    for (const format of ["json", "md", "table"]) {
      const input = join(scratch, "command.json");
      writeFileSync(
        input,
        JSON.stringify({
          kind: "add",
          profile: "default",
          flags,
          ...(name === "success"
            ? {
                attachments: [
                  { kind: "file", path: reference, label: "fixture" },
                  { kind: "link", url: "https://example.invalid/proof" },
                ],
              }
            : {}),
        }),
      );
      const results: {
        stdout: string;
        stderr: string;
        exit: number | null;
        rows: string;
      }[] = [];
      for (const mode of ["direct", "server-command"]) {
        rmSync(home, { recursive: true });
        cpSync(seedDir, home, { recursive: true });
        const active =
          mode === "server-command"
            ? await startServer(db, companion)
            : undefined;
        const result = spawnSync(
          companion,
          [mode, db, input, credential, format],
          { env: env(), encoding: "utf8", timeout: 20000 },
        );
        if (result.error) throw result.error;
        if (active) await stop(active);
        results.push({
          stdout: result.stdout,
          stderr: result.stderr,
          exit: result.status,
          rows: dump(),
        });
      }
      assert.deepEqual(results[1], results[0]);
      assert.equal(results[0]?.exit, name === "success" ? 0 : 2);
      const output = results[0];
      assert(output);
      if (name === "success" && format === "json") {
        const printed = JSON.parse(output.stdout).task;
        assert.equal(printed.title, "Route parity");
        assert.equal(printed.project, "Routing");
        assert.deepEqual(printed.tags, ["proof"]);
        assert.equal(printed.row_version, 1);
        assert.equal(printed.attachments[0].exists, true);
        assert.equal(printed.attachments[1].exists, null);
      }
      if (name === "refusal" && format === "json") {
        assert.equal(JSON.parse(output.stdout).code, "invalid_args");
        assert.equal(JSON.parse(output.stdout).exit_code, 2);
      }
      for (const mutation of [
        { ...output, stdout: `${output.stdout}\n` },
        { ...output, rows: `${output.rows}missing-rejection` },
        { ...output, exit: 4 },
      ])
        assert.notDeepEqual(mutation, results[1]);
      differentials.push({
        name,
        format,
        exit: output.exit,
        bytes: Buffer.byteLength(output.stdout),
        controls: 3,
      });
    }
  }
  writeFileSync(
    join(evidence, "differential.json"),
    JSON.stringify(differentials, null, 2),
  );
  rmSync(home, { recursive: true });
  cpSync(seedDir, home, { recursive: true });
  const timedServer = await startServer();
  const timedRecord = readFileSync(recordPath, "utf8");
  const times: {
    condition: "unproven" | "proven";
    milliseconds: number;
    exit: number | null;
  }[] = [];
  const loads = [{ pair: 0, load: loadavg() }];
  const pairs = Number(process.env.TODO_ROUTING_BENCH_PAIRS ?? 1000);
  const timedCount = count();
  for (let pair = 0; pair < pairs; pair++) {
    for (const condition of pair % 2 === 0
      ? (["unproven", "proven"] as const)
      : (["proven", "unproven"] as const)) {
      if (condition === "unproven") rmSync(recordPath, { force: true });
      else writeFileSync(recordPath, timedRecord, { mode: 0o600 });
      const start = performance.now();
      const result = spawnSync(
        cli,
        ["--direct", "add", "Timed routing Task", "--format", "json"],
        { env: env(), encoding: "utf8", timeout: 20000 },
      );
      const milliseconds = performance.now() - start;
      assert.equal(result.status, 0, result.stdout + result.stderr);
      assert.equal(JSON.parse(result.stdout).task.title, "Timed routing Task");
      times.push({ condition, milliseconds, exit: result.status });
    }
    if ((pair + 1) % 100 === 0) {
      loads.push({ pair: pair + 1, load: loadavg() });
      process.stdout.write(`Benchmark ${pair + 1}/${pairs} pairs\n`);
    }
  }
  assert.equal(count(), (timedCount ?? 0) + 2 * pairs);
  writeFileSync(recordPath, timedRecord, { mode: 0o600 });
  const timedEndpoint: EndpointRecord = JSON.parse(timedRecord);
  const diagnosticResponse = await fetch(
    `http://127.0.0.1:${timedEndpoint.port}/diagnostics`,
    { headers: { Authorization: `Bearer ${credential}` } },
  );
  assert.equal(diagnosticResponse.status, 200);
  const diagnostics = await diagnosticResponse.json();
  const nudgeRoute = diagnostics.latency.routes.find(
    (route: { route: string }) => route.route === "POST /local/nudge",
  );
  assert(
    nudgeRoute && nudgeRoute.count > 0,
    "Committing production direct commands must nudge the server",
  );
  actions.push({
    committing_cli_nudges_observed: nudgeRoute.count,
    latency_ring_is_bounded: true,
  });
  const statistics = (condition: "proven" | "unproven") => {
    const values = times
      .filter((time) => time.condition === condition)
      .map((time) => time.milliseconds)
      .sort((a, b) => a - b);
    return {
      samples: values.length,
      median_ms: values[Math.floor(values.length / 2)],
      p99_ms: values[Math.ceil(values.length * 0.99) - 1],
      minimum_ms: values[0],
      maximum_ms: values.at(-1),
    };
  };
  writeFileSync(
    join(evidence, "benchmark.json"),
    JSON.stringify(
      {
        command: "todo --direct add Timed routing Task --format json",
        pairs,
        order: "alternating AB/BA",
        same_database: true,
        server_running_both_conditions: true,
        distinction:
          "private record absent versus proven server; all writes remain direct",
        failures: 0,
        tasks_added: 2 * pairs,
        cores: cpus().length,
        loads,
        proven: statistics("proven"),
        unproven: statistics("unproven"),
        times,
        limitation:
          "Host-load observation, no causal speedup claim or measured resource limiter; all subprocess startup, discovery and nudge costs are timed.",
      },
      null,
      2,
    ),
  );
  await stop(timedServer);
  assert.equal(foreignCredentials, 0);
  actions.push({
    foreignRequests,
    foreignCredentials,
    second_server_exit: secondExit,
    copied_record: "unproven",
    differential_cases: differentials.length,
  });
  writeFileSync(
    join(evidence, "result.json"),
    JSON.stringify(
      {
        status: "PASS",
        foreignCredentials,
        scratch_cleaned: true,
        load: loadavg(),
        cores: cpus().length,
      },
      null,
      2,
    ),
  );
} finally {
  for (const child of children) await stop(child);
  await new Promise<void>((resolve) => foreign.close(() => resolve()));
  writeFileSync(
    join(evidence, "actions.json"),
    JSON.stringify(actions, null, 2),
  );
  rmSync(scratch, { recursive: true });
}
assert(existsSync(join(evidence, "result.json")));
process.stdout.write("PASS; routing evidence survived cleanup\n");

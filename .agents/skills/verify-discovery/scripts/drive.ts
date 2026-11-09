import assert from "node:assert/strict";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { Database } from "bun:sqlite";
import { CONTRACT_ID } from "../../../../packages/api/src/index.ts";
import { CredentialInfo, LookupResponse, ProfileListResponse } from "../../../../packages/domain/src/index.ts";
import { Schema } from "effect";

const root = resolve(import.meta.dirname, "../../../..");
const evidence = process.argv[2];
assert.ok(evidence && isAbsolute(evidence) && !existsSync(evidence));
mkdirSync(evidence, { recursive: true });
const manifest = JSON.parse(readFileSync(join(root, ".scratch/bin/build.json"), "utf8"));
const scratch = mkdtempSync(join(tmpdir(), "todo-discovery-verify-"));
const home = join(scratch, "home");
mkdirSync(home);
const env = { ...process.env, HOME: home, TODO_DB: join(scratch, "scratch.db"), TODO_PORT: "0", TODO_ATTACHMENT_ROOT: join(scratch, "attachments") };
const actions: unknown[] = [];
let server: ChildProcess | undefined;
let serverLog = "";
let passed = false;
const passphrase = "scratch discovery passphrase";
const cli = (args: string[], expected = 0, input?: string, format = "json") => {
  const result = spawnSync(manifest.cli, [...(args.some((arg) => arg === "--profile" || arg.startsWith("--profile=")) ? [] : ["--profile", "work"]), "--format", format, ...args], { env, encoding: "utf8", input, timeout: 20000 });
  if (result.error) throw result.error;
  actions.push({ args, format, exit: result.status, stdout: result.stdout, stderr: result.stderr });
  assert.equal(result.status, expected, result.stdout || result.stderr);
  return format === "json" ? JSON.parse(result.stdout) : result.stdout;
};
const setCredential = (credential: string) => writeFileSync(join(home, ".todo-cli/session_work.json"), JSON.stringify({ token: credential }), { mode: 0o600 });
try {
  cli(["init", "--password-stdin"], 0, `${passphrase}\n`);
  cli(["login", "--password-stdin"], 0, `${passphrase}\n`);
  const owner = Schema.decodeUnknownSync(Schema.Struct({ token: Schema.String }))(JSON.parse(readFileSync(join(home, ".todo-cli/session_work.json"), "utf8"))).token;
  cli(["init", "--profile", "foreign-secret"]);
  cli(["init", "--profile", "empty"]);
  writeFileSync(join(home, ".todo-cli/session_foreign-secret.json"), JSON.stringify({ token: owner }));
  const target = cli(["add", "Visible Task", "--project", "ARG"]).task;
  const foreign = cli(["add", "Foreign secret Task", "--profile", "foreign-secret", "--project", "Secret Project"]).task;
  const deleted = cli(["add", "Deleted Task", "--project", "Unused Project"]).task;
  cli(["rm", deleted.id, "--expected-version", String(deleted.row_version)]);
  const done = cli(["add", "Done Task"]).task;
  cli(["done", done.id, "--expected-version", String(done.row_version)]);
  const cancelled = cli(["add", "Cancelled Task"]).task;
  cli(["cancel", cancelled.id, "--expected-version", String(cancelled.row_version)]);
  const allIds = [target.id, foreign.id, done.id, cancelled.id];
  server = spawn(manifest.server, [], { cwd: scratch, env, stdio: ["ignore", "pipe", "pipe"] });
  server.stdout?.on("data", (chunk) => { serverLog += chunk; });
  server.stderr?.on("data", (chunk) => { serverLog += chunk; });
  const deadline = Date.now() + 60000;
  while (!/Listening on (http:\/\/127\.0\.0\.1:\d+)/.test(serverLog)) {
    assert.ok(Date.now() < deadline, serverLog);
    assert.equal(server.exitCode, null, serverLog);
    await new Promise((done) => setTimeout(done, 30));
  }
  const base = /Listening on (http:\/\/127\.0\.0\.1:\d+)/.exec(serverLog)?.[1];
  assert.ok(base);
  const request = async (path: string, credential = owner, expected = 200, method = "GET", payload?: unknown) => {
    const response = await fetch(base + path, { method, headers: { Authorization: `Bearer ${credential}`, "Content-Type": "application/json" }, ...(payload === undefined ? {} : { body: JSON.stringify(payload) }) });
    const text = await response.text();
    const body: unknown = text ? JSON.parse(text) : null;
    actions.push({ path, method, status: response.status, body: path === "/auth/tokens" ? "<credential omitted>" : body });
    assert.equal(response.status, expected, text);
    return body;
  };
  assert.equal(Schema.decodeUnknownSync(Schema.Struct({ contract: Schema.String }))(await request("/health")).contract, CONTRACT_ID);
  const token = async (name: string, profile: string | null, scope: "read-only" | "read-write", expires_at?: string) => Schema.decodeUnknownSync(Schema.Struct({ credential: Schema.String, ...CredentialInfo.fields }))(await request("/auth/tokens", owner, 200, "POST", { name, profile, scope, ...(expires_at ? { expires_at } : {}) }));
  const reader = await token("reader", "work", "read-only");
  const writer = await token("writer", "work", "read-write");
  const unscoped = await token("unscoped", null, "read-only");
  const expiryFactory = () => token("expiry", null, "read-only", new Date(Date.now() + 1500).toISOString());
  const foreignToken = await token("foreign-reader", "foreign-secret", "read-only");
  const baseline = new Database(env.TODO_DB, { readonly: true });
  const snapshot = () => JSON.stringify({ tasks: baseline.query("SELECT * FROM tasks ORDER BY id").all(), projects: baseline.query("SELECT * FROM projects ORDER BY id").all(), profiles: baseline.query("SELECT * FROM profiles ORDER BY id").all(), history: baseline.query("SELECT * FROM op_log ORDER BY seq").all() });
  const before = snapshot();
  writeFileSync(join(evidence, "read-only-before.json"), before);
  for (const credential of [owner, unscoped.credential, reader.credential, writer.credential]) {
    setCredential(credential);
    const scoped = credential === reader.credential || credential === writer.credential;
    const directory = Schema.decodeUnknownSync(ProfileListResponse)(cli(["profile", "list", "--projects"]));
    const httpDirectory = await request("/profiles?include_projects=true", credential);
    assert.deepEqual(httpDirectory, directory.profiles);
    assert.deepEqual(directory.profiles.map((p) => p.id), scoped ? ["work"] : ["empty", "foreign-secret", "work"]);
    assert.deepEqual(directory.profiles.find((p) => p.id === "work")?.projects?.map((p) => p.name), ["ARG", "Unused Project"]);
    if (!scoped) assert.deepEqual(directory.profiles.find((p) => p.id === "empty")?.projects, []);
    const omitted = Schema.decodeUnknownSync(ProfileListResponse)(cli(["profile", "list"]));
    assert.ok(omitted.profiles.every((p) => p.projects === undefined));
    assert.deepEqual(await request("/profiles?include_projects=false", credential), omitted.profiles);
    for (const prefix of [...new Set(allIds.map((id) => id.slice(0, 1).toUpperCase())), deleted.id]) {
      const lookup = Schema.decodeUnknownSync(LookupResponse)(cli(["lookup", "--prefix", prefix]));
      assert.equal(lookup.prefix, prefix);
      assert.deepEqual(await request(`/tasks/lookup?prefix=${prefix}`, credential), lookup.matches);
      const wanted = allIds.filter((id) => id.toLowerCase().startsWith(prefix.toLowerCase()) && (!scoped || id !== foreign.id)).sort();
      assert.deepEqual(lookup.matches.map((m) => m.task_id).sort(), wanted);
      for (const row of lookup.matches) assert.deepEqual(Object.keys(row), ["profile", "task_id", "title", "project"]);
    }
    if (scoped) assert.ok(!JSON.stringify(httpDirectory).includes("secret"));
    for (const format of ["md", "table"]) {
      assert.ok(cli(["lookup", "--prefix", target.id], 0, undefined, format).includes(`todo show ${target.id} --profile work`));
      assert.ok(cli(["profile", "list", "--projects"], 0, undefined, format).includes("ARG"));
    }
  }
  const after = snapshot();
  writeFileSync(join(evidence, "read-only-after.json"), after);
  assert.equal(after, before, "Successful discovery changed persistent data or History");
  baseline.close();
  for (const prefix of ["", " ab", "ab ", "xyz", "a".repeat(37)]) {
    cli(["lookup", `--prefix=${prefix}`], 2);
    await request(`/tasks/lookup?prefix=${encodeURIComponent(prefix)}`, owner, 400);
  }
  cli(["lookup"], 2);
  cli(["lookup", "--prefix", "ab", "--text", "secret"], 2);
  await request("/tasks/lookup", owner, 400);
  await request("/tasks/lookup?prefix=ab&profile=foreign-secret", owner, 400);
  await request("/profiles?include_projects=invalid", owner, 400);
  await request("/profiles?unknown=true", owner, 400);
  for (const path of ["/profiles/foreign-secret/tasks", "/profiles/foreign-secret/events", "/profiles/does-not-exist/tasks", "/profiles/does-not-exist/events"]) {
    const error = JSON.stringify(await request(path, reader.credential, 403));
    assert.ok(!error.includes("Foreign secret") && !error.includes("Secret Project") && !error.includes(foreign.id));
  }
  setCredential(reader.credential);
  writeFileSync(join(home, ".todo-cli/session_foreign-secret.json"), JSON.stringify({ token: reader.credential }));
  const foreignError = cli(["show", foreign.id, "--profile", "foreign-secret"], 3);
  assert.ok(!JSON.stringify(foreignError).includes("Foreign secret Task"));
  const sseController = new AbortController();
  const stream = await fetch(`${base}/profiles/work/events`, { headers: { Authorization: `Bearer ${reader.credential}` }, signal: sseController.signal });
  assert.equal(stream.status, 200);
  const streamReader = stream.body?.getReader();
  assert.ok(streamReader);
  const first = await streamReader.read();
  const frame = new TextDecoder().decode(first.value);
  assert.ok(frame.includes("ready") && !frame.includes("Foreign secret"));
  await request("/profiles/foreign-secret/tasks", owner, 200, "POST", { title: "Foreign SSE secret" });
  await request("/profiles/work/tasks", owner, 200, "POST", { title: "Visible SSE marker" });
  let frames = frame;
  const until = Date.now() + 10000;
  while (!frames.includes("Visible SSE marker")) {
    const timeout = setTimeout(() => sseController.abort(), Math.max(1, until - Date.now()));
    try {
      const next = await streamReader.read();
      assert.ok(!next.done, "SSE ended before the current Profile operation");
      frames += new TextDecoder().decode(next.value);
    } finally { clearTimeout(timeout); }
    assert.ok(Date.now() < until, "SSE marker deadline");
  }
  assert.ok(!frames.includes("Foreign SSE secret") && !frames.includes("Secret Project"));
  writeFileSync(join(evidence, "authorized.sse"), frames);
  sseController.abort();
  await streamReader.cancel().catch(() => {});
  await request("/auth/tokens/reader", owner, 204, "DELETE");
  const expiry = await expiryFactory();
  await new Promise((done) => setTimeout(done, 1600));
  for (const credential of [reader.credential, expiry.credential, "tok_invalid"]) {
    setCredential(credential);
    for (const command of [["lookup", "--prefix", "ab"], ["profile", "list", "--projects"]]) {
      const error = JSON.stringify(cli(command, 3));
      assert.ok(!error.includes("secret") && !error.includes(foreign.id));
    }
    for (const path of ["/profiles?include_projects=true", "/tasks/lookup?prefix=ab"]) {
      const error = JSON.stringify(await request(path, credential, 401));
      assert.ok(!error.includes("secret") && !error.includes(foreign.id));
    }
  }
  setCredential(owner);
  cli(["profile", "delete", "foreign-secret", "--with-tasks"]);
  for (const path of ["/profiles?include_projects=true", "/tasks/lookup?prefix=ab"]) await request(path, foreignToken.credential, 401);
  const finalDirectory = Schema.decodeUnknownSync(ProfileListResponse)(cli(["profile", "list", "--projects"]));
  assert.deepEqual(finalDirectory.profiles.map((p) => p.id), ["empty", "work"]);
  const schema = cli(["schema", "lookup"]);
  assert.deepEqual(schema.required, ["generated_at", "prefix", "matches"]);
  assert.ok(cli(["man", "lookup"]).text.includes("mutations"));
  cli(["init", "--profile=--boundary"]);
  writeFileSync(join(home, ".todo-cli/session_--boundary.json"), JSON.stringify({ token: owner }));
  const boundaryTask = cli(["add", "Leading flag Profile", "--profile=--boundary"]).task;
  const boundaryOutput = cli(["lookup", "--prefix", boundaryTask.id], 0, undefined, "md");
  const showCommand = boundaryOutput.slice(boundaryOutput.indexOf("todo show ")).trim();
  assert.equal(showCommand, `todo show ${boundaryTask.id} --profile=--boundary`);
  const quotedBinary = "'" + manifest.cli.replaceAll("'", "'\\''") + "'";
  const shown = spawnSync("/bin/sh", ["-c", quotedBinary + " " + showCommand.slice(5) + " --format json"], { env, encoding: "utf8", timeout: 20000 });
  actions.push({ command: showCommand, exit: shown.status, stdout: shown.stdout, stderr: shown.stderr });
  assert.equal(shown.status, 0, shown.stdout || shown.stderr);
  assert.equal(JSON.parse(shown.stdout).task.id, boundaryTask.id);
  passed = true;
} finally {
  let serverExit: number | null = null;
  if (server) {
    const child = server;
    if (child.exitCode !== null || child.signalCode !== null) serverExit = child.exitCode;
    else {
      const stopped = new Promise<number | null>((done) => child.once("exit", done));
      child.kill("SIGTERM");
      serverExit = await stopped;
    }
  }
  writeFileSync(join(evidence, "actions.json"), JSON.stringify(actions, null, 2));
  writeFileSync(join(evidence, "server.log"), serverLog);
  writeFileSync(join(evidence, "binary-provenance.json"), JSON.stringify(manifest, null, 2));
  rmSync(scratch, { recursive: true, force: true });
  writeFileSync(join(evidence, "cleanup.json"), JSON.stringify({ pid: server?.pid, serverExit, scratchRemoved: !existsSync(scratch) }));
  writeFileSync(join(evidence, "result.json"), JSON.stringify({ passed, actions: actions.length }));
}
assert.ok(passed);
process.stdout.write(`PASS; evidence survived cleanup: ${evidence}\n`);

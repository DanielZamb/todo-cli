import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const [manifest, evidence] = process.argv.slice(2);
const binaries = JSON.parse(readFileSync(manifest, "utf8"));
mkdirSync(evidence, { recursive: true });
const scratch = mkdtempSync(join(tmpdir(), "todo-cache-erasure-"));
const env = {
  ...process.env,
  HOME: join(scratch, "home"),
  TODO_DB: join(scratch, "scratch.db"),
  TODO_ATTACHMENT_ROOT: join(scratch, "attachments"),
  TODO_PORT: "0",
};
delete env.BUN_OPTIONS;
mkdirSync(env.HOME);
const actions = [];
const observations = [];
let server;
let serverExit;
let log = "";
let pending = "";
let failure;
const cli = (profile, args, input) => {
  const result = spawnSync(
    binaries.cli,
    ["--profile", profile, "--format", "json", ...args],
    { env, input, encoding: "utf8", timeout: 60000 },
  );
  actions.push({ profile, args, exit: result.status, at: Date.now() });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  return JSON.parse(result.stdout);
};
const consume = (chunk) => {
  log += chunk;
  pending += chunk;
  const lines = pending.split("\n");
  pending = lines.pop() ?? "";
  for (const line of lines) {
    const start = line.indexOf("CACHE_ERASURE_PROBE ");
    if (start >= 0) observations.push(JSON.parse(line.slice(start + 20)));
  }
};
const erased = async (label, started, index) => {
  await new Promise(setImmediate);
  while (
    Date.now() - started < 1000 &&
    !observations
      .slice(index)
      .some((x) => x.kind === "retained" && x.entries === 0)
  )
    await new Promise((resolve) => setTimeout(resolve, 5));
  const clear = observations
    .slice(index)
    .find((x) => x.kind === "retained" && x.entries === 0);
  assert.ok(clear, `${label}: literal zero retained entries within 1000 ms`);
  assert.ok(
    clear.at - started <= 1000,
    `${label}: eviction <=1000 ms including CLI startup`,
  );
  actions.push({
    label,
    evictionMsIncludingCliStartup: Math.max(0, clear.at - started),
    retained: clear.entries,
  });
};
try {
  cli("work", ["init", "--password-stdin"], "compiled erasure passphrase\n");
  cli("personal", ["init"]);
  for (const profile of ["work", "personal"])
    cli(
      profile,
      ["login", "--password-stdin"],
      "compiled erasure passphrase\n",
    );
  const task = cli("work", [
    "add",
    "Classified rent",
    "--desc",
    "Old private description",
  ]).task;
  server = spawn(binaries.server, [], {
    env: {
      ...env,
      BUN_OPTIONS: `--preload=${join(import.meta.dirname, "cache-probe-preload.mjs")}`,
    },
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
  server.stdout.on("data", (x) => consume(x.toString()));
  server.stderr.on("data", (x) => consume(x.toString()));
  const deadline = Date.now() + 60000;
  while (!/Listening on (http:\/\/127\.0\.0\.1:\d+)/.test(log)) {
    assert.ok(Date.now() < deadline, log);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  const base = /Listening on (http:\/\/127\.0\.0\.1:\d+)/.exec(log)[1];
  const auth = await fetch(base + "/auth/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ passphrase: "compiled erasure passphrase" }),
  });
  assert.equal(auth.status, 200);
  const { credential } = await auth.json();
  const warm = async (profile, title) => {
    const response = await fetch(
      `${base}/profiles/${profile}/tasks?text=rent`,
      { headers: { Authorization: `Bearer ${credential}` } },
    );
    assert.equal(response.status, 200);
    assert.deepEqual(
      (await response.json()).map((x) => x.title),
      [title],
    );
    await new Promise(setImmediate);
  };
  await warm("work", "Classified rent");
  cli("work", ["move", task.id, "--to", "personal", "--expected-version", "1"]);
  await warm("personal", "Classified rent");
  assert.equal(
    observations.filter((x) => x.kind === "retained").at(-1)?.entries,
    4,
  );
  cli("personal", ["rm", task.id, "--expected-version", "2"]);
  let index = observations.length;
  let started = Date.now();
  cli("personal", ["rm", task.id, "--force", "--expected-version", "3"]);
  await erased(
    "external moved Task Purge clears work and personal",
    started,
    index,
  );
  cli("work", ["add", "New private rent", "--desc", "New private description"]);
  await warm("work", "New private rent");
  index = observations.length;
  started = Date.now();
  cli("work", ["profile", "delete", "work", "--with-tasks"]);
  await erased("external Profile deletion", started, index);
} catch (error) {
  failure = error;
} finally {
  if (server) {
    const exit = once(server, "exit");
    server.kill("SIGTERM");
    const [code, signal] = await exit;
    serverExit = { code, signal };
  }
  writeFileSync(join(evidence, "server.log"), log);
  writeFileSync(
    join(evidence, "result.json"),
    JSON.stringify(
      {
        status: failure ? "FAIL" : "PASS",
        binaries,
        actions,
        observations,
        serverExit,
        failure: failure ? String(failure) : null,
        boundMs: 1000,
        instrumentation:
          "External preload observes native Map state in the retained compiled production server; no public diagnostics or product hook",
        scratchRemoved: true,
      },
      null,
      2,
    ),
  );
  rmSync(scratch, { recursive: true, force: true });
}
if (failure) throw failure;

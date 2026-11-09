import { Schema } from "effect";
import assert from "node:assert/strict";
import { spawnSync, spawn } from "node:child_process";
import { once } from "node:events";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  taskView,
  TaskViewSchema,
} from "../../../packages/domain/src/presentation.ts";
const [manifest, evidence, oracleBinary] = process.argv.slice(2);
const binaries = JSON.parse(readFileSync(manifest, "utf8"));
mkdirSync(evidence, { recursive: true });
const scratch = mkdtempSync(join(tmpdir(), "todo-cache-lifecycle-"));
const env = {
  ...process.env,
  HOME: join(scratch, "home"),
  TODO_DB: join(scratch, "scratch.db"),
  TODO_ATTACHMENT_ROOT: join(scratch, "attachments"),
  TODO_PORT: "0",
};
mkdirSync(env.HOME);
const actions = [];
let server;
let log = "";
const cli = (args, input, binary = binaries.cli) => {
  const r = spawnSync(
    binary,
    ["--profile", "work", "--format", "json", ...args],
    { env, input, encoding: "utf8" },
  );
  actions.push({ command: args, exit: r.status });
  assert.equal(r.status, 0, r.stderr || r.stdout);
  return JSON.parse(r.stdout);
};
try {
  cli(["init", "--password-stdin"], "cache lifecycle passphrase\n");
  cli(["login", "--password-stdin"], "cache lifecycle passphrase\n");
  const { task } = cli(["add", "Café rent"]);
  const saved = cli([
    "snapshot",
    "create",
    "--reason",
    "pre-cache-proof",
  ]).snapshot;
  server = spawn(binaries.server, [], {
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  for (const stream of [server.stdout, server.stderr])
    stream.on("data", (b) => {
      log += b;
    });
  const deadline = Date.now() + 60000;
  while (!/Listening on (http:\/\/127\.0\.0\.1:\d+)/.test(log)) {
    assert.ok(Date.now() < deadline, log);
    await new Promise((r) => setTimeout(r, 20));
  }
  const base = /Listening on (http:\/\/127\.0\.0\.1:\d+)/.exec(log)[1];
  const auth = await fetch(base + "/auth/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ passphrase: "cache lifecycle passphrase" }),
  });
  assert.equal(auth.status, 200);
  const { credential } = await auth.json();
  const request = async (path, payload) => {
    const r = await fetch(base + path, {
      method: payload ? "POST" : "GET",
      headers: {
        Authorization: `Bearer ${credential}`,
        "Content-Type": "application/json",
      },
      ...(payload ? { body: JSON.stringify(payload) } : {}),
    });
    const body = await r.json();
    actions.push({ path, status: r.status, body });
    assert.equal(r.status, 200, JSON.stringify(body));
    return body;
  };
  const check = async (title) => {
    for (const text of ["cafe", "ship", "-draft", '"cafe rent"']) {
      const remote = await request(
        "/profiles/work/tasks?text=" + encodeURIComponent(text),
      );
      const oracle = cli(
        ["list", "--text", text],
        undefined,
        oracleBinary ?? binaries.cli,
      );
      assert.equal(
        JSON.stringify(
          remote.map((t) =>
            Schema.encodeSync(TaskViewSchema)(taskView(t, [], [])),
          ),
        ),
        JSON.stringify(oracle.tasks ?? []),
      );
    }
    const all = await request("/profiles/work/tasks");
    assert.deepEqual(
      all.map((t) => t.title),
      title === null ? [] : [title],
    );
  };
  await check("Café rent");
  cli(["edit", task.id, "--title", "Ship papers", "--expected-version", "1"]);
  await check("Ship papers");
  const edit = cli(["history", task.id]).entries.find(
    (e) => e.event.kind === "TaskEdited",
  );
  assert.ok(edit);
  await request(`/profiles/work/tasks/${task.id}/revert`, {
    from_version: 2,
    seq: edit.seq,
  });
  await check("Café rent");
  cli(["snapshot", "restore", saved.id]);
  await check("Café rent");
  cli([
    "edit",
    task.id,
    "--title",
    "Ship different Version two",
    "--expected-version",
    "1",
  ]);
  await check("Ship different Version two");
  cli(["rm", task.id, "--expected-version", "2"]);
  await check(null);
  cli(["rm", task.id, "--force", "--expected-version", "3"]);
  await check(null);
  cli(["snapshot", "restore", saved.id]);
  await check(null);
  writeFileSync(
    join(evidence, "result.json"),
    JSON.stringify(
      {
        status: "PASS",
        binaries,
        actions,
        note: "The current CLI has no Revert command. Revert uses authenticated HTTP; every other competing mutation uses the separate compiled CLI process.",
      },
      null,
      2,
    ),
  );
} finally {
  writeFileSync(
    join(evidence, "actions.json"),
    JSON.stringify(actions, null, 2),
  );
  if (server) {
    server.kill("SIGTERM");
    await once(server, "exit");
  }
  writeFileSync(join(evidence, "server.log"), log);
  rmSync(scratch, { recursive: true, force: true });
}

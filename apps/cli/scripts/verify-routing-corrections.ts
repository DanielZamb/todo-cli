import { Database } from "bun:sqlite";
import assert from "node:assert/strict";
import { type ChildProcess, spawn } from "node:child_process";
import * as fs from "node:fs";
import { Agent, createServer, request } from "node:http";
import { loadavg, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { endpointPath } from "@todo/domain/database-route";
import { discoverServer } from "../src/server-connection.ts";

const [outArg, cli, server, barrier, resetCli, baselineBarrier] =
  process.argv.slice(2);
if (!outArg || !cli || !server || !barrier || !resetCli)
  throw Error(
    "Pass evidence, CLI, server, barrier, reset CLI, optional baseline barrier",
  );
const out = resolve(outArg);
fs.mkdirSync(out, { recursive: true });
const scratch = fs.mkdtempSync(join(tmpdir(), "todo-routing-corrections-"));
const owned = new Set<ChildProcess>(),
  actions: unknown[] = [],
  checks: unknown[] = [];
const cleanup: (() => void)[] = [];
const home = join(scratch, "home");
fs.mkdirSync(home);
const db = join(home, "tasks.db");
const environment = {
  ...process.env,
  HOME: home,
  TODO_DB: db,
  TODO_PORT: "0",
  TODO_ATTACHMENT_ROOT: undefined,
};
function save() {
  fs.writeFileSync(join(out, "actions.json"), JSON.stringify(actions, null, 2));
  fs.writeFileSync(join(out, "checks.json"), JSON.stringify(checks, null, 2));
}
async function processResult(
  binary: string,
  args: string[],
  env: NodeJS.ProcessEnv,
  input = "",
) {
  const start = performance.now(),
    child = spawn(binary, args, { env, stdio: ["pipe", "pipe", "pipe"] });
  owned.add(child);
  let stdout = "",
    stderr = "";
  child.stdout.on("data", (x) => (stdout += x));
  child.stderr.on("data", (x) => (stderr += x));
  child.stdin.on("error", () => {});
  child.stdin.end(input);
  const code = await new Promise<number | null>((resolve, reject) => {
    child.on("error", reject);
    child.on("exit", resolve);
  });
  owned.delete(child);
  return { code, stdout, stderr, ms: performance.now() - start };
}
async function command(
  args: string[],
  expected = 0,
  input = "",
  binary: string = cli ?? "",
  path = db,
) {
  const r = await processResult(
    binary,
    ["--format", "json", "--db", path, ...args],
    { ...environment, TODO_DB: path },
    input,
  );
  actions.push({ args, exit: r.code, ms: r.ms, stderr: r.stderr });
  save();
  assert.equal(r.code, expected, r.stdout + r.stderr);
  return r;
}
const json = (r: { stdout: string }) => JSON.parse(r.stdout);
async function until(test: () => boolean, child?: ChildProcess) {
  const end = performance.now() + 30000;
  while (!test()) {
    if (child?.exitCode !== null && child?.exitCode !== undefined)
      throw Error("Child exited before ready");
    assert(performance.now() < end, "Readiness deadline");
    await delay(5);
  }
}
async function stop(child: ChildProcess, signal: NodeJS.Signals = "SIGTERM") {
  if (child.exitCode === null) {
    const done = new Promise((r) => child.once("exit", r));
    child.kill(signal);
    await done;
  }
  owned.delete(child);
}
function start(binary: string, path: string, extra: NodeJS.ProcessEnv = {}) {
  const child = spawn(binary, [], {
    env: { ...environment, TODO_DB: path, ...extra },
    stdio: ["ignore", "pipe", "pipe"],
  });
  owned.add(child);
  let log = "";
  child.stdout.on("data", (x) => (log += x));
  child.stderr.on("data", (x) => (log += x));
  return { child, log: () => log };
}
async function ready(
  binary: string,
  path: string,
  extra: NodeJS.ProcessEnv = {},
) {
  const s = start(binary, path, extra);
  const file = endpointPath(fs.realpathSync(path));
  await until(
    () => fs.existsSync(file) && s.log().includes("Listening on"),
    s.child,
  );
  return { ...s, file, record: JSON.parse(fs.readFileSync(file, "utf8")) };
}
function count(path: string) {
  const c = new Database(path, { readonly: true });
  try {
    return (
      c.query<{ n: number }, []>("SELECT count(*) AS n FROM tasks").get()?.n ??
      0
    );
  } finally {
    c.close();
  }
}
async function check(name: string, use: () => Promise<unknown>) {
  try {
    const result = await use();
    checks.push({ name, pass: true, result });
    save();
  } catch (e) {
    checks.push({ name, pass: false, error: String(e) });
    save();
    throw e;
  }
}
try {
  await command(["init", "--password-stdin"], 0, "correction passphrase\n");
  await command(["login", "--password-stdin"], 0, "correction passphrase\n");
  // Reproduce both startup interleavings using isolated copies, never copied review data.
  for (const mode of ["ordinary", "swap-back"]) {
    await check(`S1 ${mode}`, async () => {
      const d = join(scratch, mode);
      fs.mkdirSync(d);
      const a = join(d, "a.db"),
        b = join(d, "b.db");
      const source = new Database(db, { readonly: true });
      const bytes = source.serialize();
      source.close();
      fs.writeFileSync(a, bytes);
      fs.writeFileSync(b, bytes);
      await command(["add", "Only database B"], 0, "", cli, b);
      async function race(binary: string, red: boolean) {
        const control = join(d, red ? "red" : "green");
        fs.mkdirSync(control);
        const s = start(binary, a, { ROUTING_BARRIER: control });
        await until(
          () => fs.existsSync(join(control, "before.ready")),
          s.child,
        );
        fs.renameSync(a, a + ".kept");
        fs.symlinkSync(b, a);
        fs.writeFileSync(join(control, "before.go"), "go");
        await until(() => fs.existsSync(join(control, "after.ready")), s.child);
        if (mode === "swap-back") {
          fs.unlinkSync(a);
          fs.renameSync(a + ".kept", a);
        }
        fs.writeFileSync(join(control, "after.go"), "go");
        if (red) {
          await until(() => s.log().includes("Listening on"), s.child);
          const file = endpointPath(a);
          const published = fs.existsSync(file);
          let proved = false;
          if (published) {
            const record = JSON.parse(fs.readFileSync(file, "utf8"));
            const response = await fetch(
              `http://127.0.0.1:${record.port}/local/database-proof`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ nonce: "a".repeat(64) }),
              },
            );
            proved = response.status === 200;
          }
          await stop(s.child);
          if (mode === "ordinary") {
            fs.unlinkSync(a);
            fs.renameSync(a + ".kept", a);
          }
          fs.writeFileSync(
            join(out, `red-${mode}.json`),
            JSON.stringify({
              expected_startup_refusal: false,
              published,
              proved,
              log: s.log(),
            }),
          );
          assert.equal(
            mode === "swap-back" ? proved : !published,
            true,
            "The immutable baseline must expose the startup defect",
          );
          return { red_exit: 1, published, proved };
        }
        await until(() => s.child.exitCode !== null);
        owned.delete(s.child);
        fs.writeFileSync(join(out, `green-${mode}.log`), s.log());
        assert.notEqual(s.child.exitCode, 0);
        assert.match(
          s.log(),
          /SQLite store file differs from the kept database descriptor/,
        );
        assert.equal(fs.existsSync(endpointPath(a)), false);
        if (mode === "ordinary") {
          fs.unlinkSync(a);
          fs.renameSync(a + ".kept", a);
        }
        return {
          server_exit: s.child.exitCode,
          record: false,
          tasksA: count(a),
          tasksB: count(b),
        };
      }
      const red = baselineBarrier
        ? await race(baselineBarrier, true)
        : undefined;
      const green = await race(barrier, false);
      assert.equal(green.tasksA, 0);
      assert.equal(green.tasksB, 1);
      return { red, green };
    });
  }
  const live = await ready(server, db);
  const events: { path: string; credential: boolean; body: string }[] = [];
  let slow = false,
    swap = false;
  const agent = new Agent({ keepAlive: true, maxSockets: 20 });
  cleanup.push(() => agent.destroy());
  const proxy = createServer((incoming, response) => {
    const parts: Buffer[] = [];
    incoming.on("data", (x) => parts.push(x));
    incoming.on("end", () => {
      const body = Buffer.concat(parts);
      events.push({
        path: incoming.url ?? "",
        credential: Boolean(incoming.headers.authorization),
        body:
          incoming.url === "/local/commands"
            ? "prepared-command"
            : body.toString(),
      });
      if (slow && incoming.url === "/local/nudge") return;
      if (swap && incoming.url === "/local/commands") {
        fs.renameSync(db, db + ".held");
        fs.writeFileSync(db, fs.readFileSync(db + ".held"));
        swap = false;
      }
      const next = request(
        {
          host: "127.0.0.1",
          port: live.record.port,
          path: incoming.url,
          method: incoming.method,
          headers: {
            ...incoming.headers,
            host: `127.0.0.1:${live.record.port}`,
          },
          agent,
        },
        (reply) => {
          response.writeHead(reply.statusCode ?? 500, reply.headers);
          reply.pipe(response);
        },
      );
      next.on("error", () => response.destroy());
      next.end(body);
    });
  });
  cleanup.push(() => {
    proxy.closeAllConnections();
    proxy.close();
  });
  await new Promise<void>((resolve) => proxy.listen(0, "127.0.0.1", resolve));
  const address = proxy.address();
  if (!address || typeof address === "string")
    throw Error("Missing proxy port");
  const record = { ...live.record, port: address.port };
  fs.writeFileSync(live.file, JSON.stringify(record));
  const nudges = () => events.filter((e) => e.path === "/local/nudge").length;
  const driven: unknown[] = [];
  async function mutation(
    args: string[],
    expected = 0,
    input = "",
    binary = cli,
  ) {
    const before = nudges();
    const r = await command(args, expected, input, binary);
    const n = nudges() - before;
    driven.push({ args, exit: r.code, nudges: n });
    fs.writeFileSync(
      join(out, "nudge-inventory.json"),
      JSON.stringify(driven, null, 2),
    );
    assert.equal(n, 1, `One nudge after ${args.join(" ")}`);
    return json(r);
  }
  await check("S3 help-derived writing inventory", async () => {
    const help = (await command(["--help"])).stdout;
    const names = help
      .split("SUBCOMMANDS\n")[1]
      ?.trim()
      .split("\n")
      .map((x) => x.trim().split(/\s+/)[0]);
    assert(names && names.length > 30);
    const menus = [];
    for (const name of names) {
      const r = await command([name ?? "", "--help"]);
      menus.push({ name, help: r.stdout });
    }
    fs.writeFileSync(
      join(out, "help-inventory.json"),
      JSON.stringify(menus, null, 2),
    );
    let task = (await mutation(["add", "Nudge inventory"])).task;
    const update = async (args: string[], expected = 0) => {
      const r = await mutation(args, expected);
      task = json(await command(["show", task.id])).task;
      return r;
    };
    await update([
      "edit",
      task.id,
      "--title",
      "Nudge edited",
      "--expected-version",
      String(task.row_version),
    ]);
    await update([
      "attach",
      task.id,
      "https://example.invalid/one",
      "--expected-version",
      String(task.row_version),
    ]);
    await update([
      "label-attachment",
      task.id,
      task.attachments[0].id,
      "--label",
      "Named",
      "--expected-version",
      String(task.row_version),
    ]);
    await update([
      "detach",
      task.id,
      task.attachments[0].id,
      "--expected-version",
      String(task.row_version),
    ]);
    for (const verb of ["done", "reopen", "cancel", "reopen"])
      await update([
        verb,
        task.id,
        "--expected-version",
        String(task.row_version),
      ]);
    const blocker = (await mutation(["add", "Blocker"])).task;
    await update([
      "depend",
      task.id,
      "--on",
      blocker.id,
      "--expected-version",
      String(task.row_version),
    ]);
    await update([
      "undepend",
      task.id,
      "--from",
      blocker.id,
      "--expected-version",
      String(task.row_version),
    ]);
    const edge = join(scratch, "edge.json");
    fs.writeFileSync(
      edge,
      JSON.stringify({
        items: [
          {
            action: "depend",
            dependent_id: task.id,
            blocker_id: blocker.id,
            from_version: task.row_version,
          },
        ],
      }),
    );
    await update(["batch-depend", "--file", edge]);
    await update([
      "undepend",
      task.id,
      "--from",
      blocker.id,
      "--expected-version",
      String(task.row_version),
    ]);
    const attachments = join(scratch, "attachments.json");
    fs.writeFileSync(
      attachments,
      JSON.stringify({
        items: [
          {
            task_id: task.id,
            from_version: task.row_version,
            attachments: [{ kind: "link", url: "https://example.invalid/two" }],
          },
        ],
      }),
    );
    await update(["attach-many", attachments]);
    await update([
      "edit",
      task.id,
      "--priority",
      "P1",
      "--expected-version",
      String(task.row_version),
    ]);
    const history = json(await command(["history", task.id]));
    const edit = history.entries
      .filter(
        (e: { outcome: string; event: { kind: string } }) =>
          e.outcome === "committed" && e.event.kind === "TaskEdited",
      )
      .at(-1);
    await update([
      "revert",
      String(edit.seq),
      "--expected-version",
      String(task.row_version),
    ]);
    await mutation(["--profile", "new-profile", "init"]);
    await mutation(["copy", blocker.id, "--to", "new-profile"]);
    await mutation(["move", blocker.id, "--to", "new-profile"]);
    await mutation(["profile", "delete", "new-profile", "--with-tasks"]);
    const batch = join(scratch, "batch.json");
    fs.writeFileSync(
      batch,
      JSON.stringify({
        items: [
          { task_id: task.id, from_version: task.row_version },
          { task_id: "00000000-0000-4000-8000-000000000099", from_version: 1 },
        ],
        changes: { priority: "P2" },
      }),
    );
    const v = task.row_version;
    await update(["batch-edit", batch], 3);
    assert.equal(task.row_version, v + 1);
    const input = join(scratch, "import.json");
    fs.writeFileSync(
      input,
      JSON.stringify([{ external_id: "route-proof", title: "Imported" }]),
    );
    await mutation(["import", input]);
    const snapshot = await mutation(["snapshot", "create"]);
    await mutation(["snapshot", "prune"]);
    await mutation(["snapshot", "restore", snapshot.snapshot.id]);
    task = json(await command(["show", task.id])).task;
    await mutation([
      "rm",
      task.id,
      "--expected-version",
      String(task.row_version),
    ]);
    await mutation([
      "rm",
      task.id,
      "--force",
      "--expected-version",
      String(task.row_version + 1),
    ]);
    await mutation(["login", "--password-stdin"], 0, "correction passphrase\n");
    await mutation(["logout"]);
    await mutation(["login", "--password-stdin"], 0, "correction passphrase\n");
    await mutation(
      ["reset-passphrase", "--password-stdin"],
      0,
      "test-only presence bypass\ncorrection passphrase\n",
      resetCli,
    );
    await mutation(["login", "--password-stdin"], 0, "correction passphrase\n");
    await mutation(
      [
        "edit",
        blocker.id,
        "--title",
        "Refused missing task",
        "--expected-version",
        "1",
      ],
      3,
    );
    await mutation(["snapshot", "prune", "--dry-run"]);
    await mutation(["init"]);
    return {
      top_commands: names.length,
      writing_calls: driven.length,
      profile_create_nudges: 1,
      dry_run_nudges: 1,
      refusal_nudges: 1,
      prefix_nudges: 1,
    };
  });
  await check("S3 reads and early refusals send zero nudges", async () => {
    for (const args of [
      ["list"],
      ["whoami"],
      ["profile", "list"],
      ["snapshot", "list"],
      ["lookup", "--prefix", "a"],
    ]) {
      const n = events.length;
      await command(args);
      assert.equal(events.length, n);
    }
    const sessionFile = join(home, ".todo-cli/session_default.json"),
      session = fs.readFileSync(sessionFile, "utf8");
    const invalid = JSON.parse(session);
    invalid.token = "ses_invalid";
    fs.writeFileSync(sessionFile, JSON.stringify(invalid));
    const n = events.length;
    const before = new Database(db, { readonly: true });
    const seq = () =>
      before
        .query<{ n: number }, []>(
          "SELECT count(*) n FROM op_log WHERE outcome='rejected'",
        )
        .get()?.n;
    const prior = seq();
    await command(["list"], 5);
    assert.equal(events.length, n);
    assert.equal(seq(), (prior ?? 0) + 1);
    before.close();
    fs.writeFileSync(sessionFile, session);
    for (const args of [
      ["add", "x", "--expected-version", "1"],
      ["--direct", "--require-server", "add", "x"],
      ["add", "--unrecognized-routing-flag"],
    ]) {
      const n = events.length;
      await command(args, 2);
      assert.equal(events.length, n);
    }
    fs.renameSync(live.file, live.file + ".hidden");
    const n2 = events.length;
    await command(["add", "No record"]);
    assert.equal(events.length, n2);
    fs.renameSync(live.file + ".hidden", live.file);
    return {
      read_refusal_history: 1,
      read_requests: 0,
      early_requests: 0,
      no_record_requests: 0,
    };
  });
  await check("S3 bounded unnecessary nudge", async () => {
    const samples = [];
    for (let i = 0; i < 5; i++) {
      for (const present of i % 2 ? [true, false] : [false, true]) {
        if (!present) fs.renameSync(live.file, live.file + ".hidden");
        slow = present;
        const n = nudges(),
          r = await command(["init"]);
        assert.equal(nudges() - n, present ? 1 : 0);
        samples.push({ present, ms: r.ms, load: loadavg() });
        if (!present) fs.renameSync(live.file + ".hidden", live.file);
      }
    }
    slow = false;
    fs.writeFileSync(
      join(out, "nudge-timing.json"),
      JSON.stringify(
        { budget_ms: 50, discovery_budget_ms: 50, samples },
        null,
        2,
      ),
    );
    return { successful_pairs: 5 };
  });
  await check("S4 typed refusal before execution", async () => {
    const proven = await discoverServer(db, 1000);
    assert(proven);
    const token = JSON.parse(
      fs.readFileSync(join(home, ".todo-cli/session_default.json"), "utf8"),
    ).token;
    const n = events.filter((e) => e.path === "/local/commands").length,
      prior = count(db);
    swap = true;
    let failure: unknown;
    try {
      await proven.run(
        {
          kind: "add",
          profile: "default",
          flags: { title: "Must not execute" },
        },
        token,
      );
    } catch (e) {
      failure = e;
    } finally {
      proven.close();
    }
    assert(
      failure &&
        typeof failure === "object" &&
        "code" in failure &&
        "exit" in failure,
    );
    assert.equal(failure.code, "server_command_not_run");
    assert.equal(failure.exit, 2);
    assert.equal(
      events.filter((e) => e.path === "/local/commands").length - n,
      1,
    );
    assert.equal(count(db + ".held"), prior);
    assert.equal(count(db), prior);
    fs.unlinkSync(db);
    fs.renameSync(db + ".held", db);
    return {
      code: failure.code,
      exit: failure.exit,
      requests: 1,
      tasks_added: 0,
    };
  });
  agent.destroy();
  proxy.closeAllConnections();
  await new Promise<void>((resolve) => proxy.close(() => resolve()));
  await stop(live.child);
  await check(
    "S2 guard unlink permanently withdraws first incarnation",
    async () => {
      const first = await ready(server, db);
      const alias = join(scratch, "alias");
      fs.symlinkSync(home, alias);
      const alternateHome = join(scratch, "other-home"),
        alternateTmp = join(scratch, "other-tmp");
      fs.mkdirSync(alternateHome);
      fs.mkdirSync(alternateTmp);
      const recordBefore = fs.readFileSync(first.file, "utf8");
      for (const spelling of [
        join(alias, "tasks.db"),
        ...(process.platform === "darwin" ? [join(home, "TASKS.DB")] : []),
      ]) {
        const duplicate = await processResult(server, [], {
          ...environment,
          HOME: alternateHome,
          TMPDIR: alternateTmp,
          TODO_DB: spelling,
        });
        assert.notEqual(duplicate.code, 0);
        assert.equal(fs.readFileSync(first.file, "utf8"), recordBefore);
      }
      const id = first.record.binding.identity;
      const guard = join(
        join(home, ".todo-routing"),
        `${id.device}-${id.inode}-${id.birth}.sqlite`,
      );
      assert(fs.existsSync(guard));
      fs.unlinkSync(guard);
      const second = await ready(server, db);
      const secondRecord = fs.readFileSync(second.file, "utf8");
      const nonce = JSON.stringify({ nonce: "b".repeat(64) });
      const proof = await fetch(
        `http://127.0.0.1:${first.record.port}/local/database-proof`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: nonce,
        },
      );
      assert.equal(proof.status, 400);
      assert.equal(fs.readFileSync(second.file, "utf8"), secondRecord);
      const p = await discoverServer(db, 1000);
      assert(p);
      await p.nudge();
      p.close();
      await stop(first.child);
      assert.equal(fs.readFileSync(second.file, "utf8"), secondRecord);
      await stop(second.child, "SIGKILL");
      const third = await ready(server, db);
      await stop(third.child);
      return {
        old_proof_status: 400,
        old_cli_commands: 0,
        old_cli_credentials: 0,
        replacement_proven: true,
        killed_holder_released: true,
      };
    },
  );
  assert(
    events
      .filter((e) => e.path === "/local/nudge")
      .every((e) => !e.credential && e.body === ""),
  );
  fs.writeFileSync(
    join(out, "result.json"),
    JSON.stringify(
      {
        status: "PASS",
        checks,
        nudge_inventory: driven.length,
        cleanup: "Only owned children and scratch data",
      },
      null,
      2,
    ),
  );
} finally {
  for (const close of cleanup) close();
  for (const child of owned) await stop(child);
  fs.rmSync(scratch, { recursive: true, force: true });
  save();
}

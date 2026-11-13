import { Database } from "bun:sqlite";
import assert from "node:assert/strict";
import { type ChildProcess, spawn } from "node:child_process";
import * as fs from "node:fs";
import { Agent, createServer, request } from "node:http";
import { loadavg, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { endpointPath, routeMac } from "@todo/domain/database-route";
import { Schema } from "effect";
import { discoverServer } from "../src/server-connection.ts";

const [outArg, cli, server, barrier, resetCli, baselineBarrier] =
  process.argv.slice(2);
if (!outArg || !cli || !server || !barrier || !resetCli)
  throw Error(
    "Pass evidence, CLI, server, barrier, reset CLI, optional baseline barrier",
  );
const binaries = { cli, server, barrier, resetCli };
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
  await until(() => {
    try {
      const port = Number(
        s
          .log()
          .split("Listening on http://127.0.0.1:")[1]
          ?.match(/^[0-9]+/)?.[0],
      );
      return (
        port > 0 && JSON.parse(fs.readFileSync(file, "utf8")).port === port
      );
    } catch {
      return false;
    }
  }, s.child);
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
      bytes[18] = 1;
      bytes[19] = 1;
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
          if (mode === "swap-back")
            await until(() => fs.existsSync(file), s.child);
          else await delay(100);
          const published = fs.existsSync(file);
          let proved = false;
          let routedIntoB = false;
          let ordinarySecondLive = false;
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
            if (mode === "swap-back") {
              const credential = JSON.parse(
                fs.readFileSync(
                  join(home, ".todo-cli/session_default.json"),
                  "utf8",
                ),
              ).token;
              const add = await fetch(
                `http://127.0.0.1:${record.port}/local/commands`,
                {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${credential}`,
                    "x-todo-incarnation": record.incarnation,
                    "x-todo-proof": routeMac(
                      record.secret,
                      "command",
                      record.incarnation,
                    ),
                  },
                  body: JSON.stringify({
                    kind: "add",
                    profile: "default",
                    flags: { title: "Baseline wrote into B" },
                  }),
                },
              );
              const result = await add.json();
              assert.equal(result.outcome, "success");
              routedIntoB = true;
            }
          }
          if (mode === "ordinary") {
            const second = await ready(binaries.server, b);
            ordinarySecondLive = s.child.exitCode === null;
            await stop(second.child);
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
              routedIntoB,
              ordinarySecondLive,
              log: s.log(),
            }),
          );
          assert.equal(
            mode === "swap-back" ? proved : !published,
            true,
            "The immutable baseline must expose the startup defect",
          );
          return {
            red_safety_assertion_fails: true,
            published,
            proved,
            routedIntoB,
            ordinarySecondLive,
          };
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
      assert.equal(
        green.tasksB,
        baselineBarrier && mode === "swap-back" ? 2 : 1,
      );
      return { red, green };
    });
  }
  const selected = join(home, "selected.db");
  fs.symlinkSync(db, selected);
  const live = await ready(server, selected);
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
        fs.unlinkSync(selected);
        fs.symlinkSync(join(scratch, "replacement.db"), selected);
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
    const help = Schema.decodeUnknownSync(
      Schema.Struct({ text: Schema.String }),
    )(json(await command(["--help"]))).text;
    const names = help
      .split("SUBCOMMANDS\n")[1]
      ?.trim()
      .split("\n")
      .map((x) => x.trim().split(/\s+/)[0]);
    assert(names && names.length > 30);
    const menus = [];
    for (const name of names) {
      const r = await command([name ?? "", "--help"]);
      menus.push({ name, help: json(r).text });
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
    const snapshot = await mutation([
      "snapshot",
      "create",
      "--reason",
      "pre-restore",
    ]);
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
    const readerDb = new Database(db, { readonly: true });
    const readerTask = readerDb
      .query<{ id: string }, []>("SELECT id FROM tasks WHERE title='Imported'")
      .get();
    readerDb.close();
    assert(readerTask);
    const snapshots = json(await command(["snapshot", "list"]));
    const vault = join(scratch, "vault");
    fs.mkdirSync(vault);
    for (const args of [
      ["show", readerTask.id],
      ["history", readerTask.id],
      ["graph", readerTask.id],
      ["review", "daily"],
      ["review", "weekly"],
      ["export"],
      ["sync", "obsidian", "--vault", vault],
      ["profile", "list", "--projects"],
      ["snapshot", "show", snapshots.snapshots[0].id],
      ["parse", "Tomorrow work"],
      ["config", "show"],
      ["schema", "--list"],
      ["man", "list"],
      ["diagnostics", "--server", `http://127.0.0.1:${live.record.port}`],
      ["top", "--server", `http://127.0.0.1:${live.record.port}`],
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
    await command(["list"], 3);
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
    const held = new Database(db, { readonly: true });
    const replacement = held.serialize();
    replacement[18] = 1;
    replacement[19] = 1;
    fs.writeFileSync(join(scratch, "replacement.db"), replacement);
    const heldCount = () =>
      held.query<{ n: number }, []>("SELECT count(*) n FROM tasks").get()?.n;
    const proven = await discoverServer(db, 1000);
    assert(proven);
    const token = JSON.parse(
      fs.readFileSync(join(home, ".todo-cli/session_default.json"), "utf8"),
    ).token;
    const n = events.filter((e) => e.path === "/local/commands").length,
      prior = count(db);
    swap = true;
    const commandFile = join(scratch, "refused-command.json");
    fs.writeFileSync(
      commandFile,
      JSON.stringify({
        kind: "add",
        profile: "default",
        flags: { title: "Must not execute" },
      }),
    );
    const refused = await processResult(
      join(dirname(binaries.cli), "routing-companion"),
      ["server-command", db, commandFile, token, "json"],
      environment,
    );
    proven.close();
    assert.equal(refused.code, 1, refused.stdout + refused.stderr);
    const failure = json(refused);
    assert.equal(failure.code, "server_command_not_run");
    assert.equal(failure.exit_code, 1);
    assert.equal(failure.exit_meaning, "runtime failure");
    assert.equal(
      failure.message,
      "The server did not run this command because its local database proof was no longer valid. Nothing was written. Run the command again.",
    );
    assert(!failure.message.includes("History"));
    assert.equal(refused.stderr, "");
    assert.equal(
      events.filter((e) => e.path === "/local/commands").length - n,
      1,
    );
    assert.equal(count(join(scratch, "replacement.db")), prior);
    const noNudge = nudges();
    await command(
      ["add", "Direct write into replacement"],
      0,
      "",
      cli,
      selected,
    );
    assert.equal(count(join(scratch, "replacement.db")), prior + 1);
    assert.equal(nudges(), noNudge);
    fs.unlinkSync(selected);
    fs.symlinkSync(db, selected);
    assert.equal(heldCount(), prior);
    held.close();
    return {
      code: failure.code,
      exit: failure.exit_code,
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
      const duplicates: string[] = [];
      const local = (log: string, route: string) =>
        log.split(`"http.url": "/local/${route}"`).length - 1;
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
        assert.equal(duplicate.code, 1, duplicate.stdout + duplicate.stderr);
        assert(
          (duplicate.stdout + duplicate.stderr).includes(
            "Server database binding or singleton guard unavailable",
          ),
          duplicate.stdout + duplicate.stderr,
        );
        assert.equal(fs.readFileSync(first.file, "utf8"), recordBefore);
        duplicates.push(
          spelling === join(alias, "tasks.db")
            ? "symlinked directory"
            : "different case",
        );
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
      const mac = (purpose: string) => ({
        "x-todo-incarnation": first.record.incarnation,
        "x-todo-proof": routeMac(
          first.record.secret,
          purpose,
          first.record.incarnation,
        ),
      });
      const oldNudge = await fetch(
        `http://127.0.0.1:${first.record.port}/local/nudge`,
        { method: "POST", headers: mac("nudge") },
      );
      assert.equal(oldNudge.status, 400);
      const oldCommand = await fetch(
        `http://127.0.0.1:${first.record.port}/local/commands`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", ...mac("command") },
          body: JSON.stringify({
            kind: "add",
            profile: "default",
            flags: { title: "Withdrawn incarnation must not run" },
          }),
        },
      );
      assert.equal(oldCommand.status, 200);
      assert.equal((await oldCommand.json()).outcome, "not_run");
      const tasksBefore = count(db);
      const firstLocal = {
        proof: local(first.log(), "database-proof"),
        nudge: local(first.log(), "nudge"),
        commands: local(first.log(), "commands"),
      };
      const secondLocal = {
        proof: local(second.log(), "database-proof"),
        nudge: local(second.log(), "nudge"),
      };
      await command(["add", "After guard unlink"]);
      await command(["--direct", "add", "After guard unlink, direct"]);
      assert.equal(count(db), tasksBefore + 2);
      await until(() => local(second.log(), "nudge") === secondLocal.nudge + 2);
      assert.equal(
        local(second.log(), "database-proof"),
        secondLocal.proof + 2,
      );
      assert.equal(local(first.log(), "database-proof"), firstLocal.proof);
      assert.equal(local(first.log(), "nudge"), firstLocal.nudge);
      assert.equal(local(first.log(), "commands"), firstLocal.commands);
      assert(!first.log().includes("Authorization"));
      assert.equal(
        first.log().split('"event":"local_routing_disabled"').length - 1,
        1,
        first.log(),
      );
      const p = await discoverServer(db, 1000);
      assert(p);
      p.close();
      await stop(first.child);
      assert.equal(fs.readFileSync(second.file, "utf8"), secondRecord);
      await stop(second.child, "SIGKILL");
      const third = await ready(server, db);
      await stop(third.child);
      return {
        duplicates_refused: duplicates,
        first_record_untouched: true,
        old_proof_status: 400,
        old_nudge_status: 400,
        old_command_outcome: "not_run",
        cli_writes_after_unlink: 2,
        old_cli_proofs: 0,
        old_cli_nudges: 0,
        old_cli_commands: 0,
        old_cli_credentials: 0,
        new_cli_proofs: 2,
        new_cli_nudges: 2,
        withdrawal_logs: 1,
        replacement_proven: true,
        killed_holder_released: true,
      };
    },
  );
  await check("Multiply linked database serves without routing", async () => {
    const local = (log: string) => log.split('"http.url": "/local/').length - 1;
    const withdrawals = (log: string, cause: string) =>
      log
        .split("\n")
        .filter(
          (line) =>
            line.includes('"event":"local_routing_disabled"') &&
            line.includes(cause),
        ).length;
    const token = JSON.parse(
      fs.readFileSync(join(home, ".todo-cli/session_default.json"), "utf8"),
    ).token;
    const file = endpointPath(fs.realpathSync(db));
    const port = (log: string) =>
      Number(
        log.split("Listening on http://127.0.0.1:")[1]?.match(/^[0-9]+/)?.[0],
      );
    const proofStatus = async (p: number) =>
      (
        await fetch(`http://127.0.0.1:${p}/local/database-proof`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nonce: "c".repeat(64) }),
        })
      ).status;
    // Linked before start-up: serves as on the base, never routes.
    const link = join(home, "second-link.db");
    fs.linkSync(db, link);
    assert.equal(fs.statSync(db).nlink, 2);
    const linked = start(server, db);
    await until(() => port(linked.log()) > 0, linked.child);
    const linkedPort = port(linked.log());
    assert.equal(fs.existsSync(file), false);
    assert.equal(
      withdrawals(linked.log(), "more than one hard link"),
      1,
      linked.log(),
    );
    const listed = await fetch(
      `http://127.0.0.1:${linkedPort}/profiles/default/tasks`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    assert.equal(listed.status, 200);
    const created = await fetch(
      `http://127.0.0.1:${linkedPort}/profiles/default/tasks`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ title: "Created over HTTP on a linked file" }),
      },
    );
    assert.equal(created.status, 200, await created.clone().text());
    assert.equal(await proofStatus(linkedPort), 400);
    const localBefore = local(linked.log());
    const tasksBefore = count(db);
    await command(["add", "Direct on a linked file"]);
    assert.equal(count(db), tasksBefore + 1);
    assert.equal(local(linked.log()), localBefore);
    assert.equal(fs.existsSync(file), false);
    assert.equal(withdrawals(linked.log(), "hard link"), 1);
    await stop(linked.child);
    fs.unlinkSync(link);
    // Linked after start-up: withdraws for good, logged once.
    const later = await ready(server, db);
    assert.equal(await proofStatus(later.record.port), 200);
    fs.linkSync(db, link);
    assert.equal(await proofStatus(later.record.port), 400);
    assert.equal(fs.existsSync(later.file), false);
    assert.equal(
      withdrawals(later.log(), "gained another hard link"),
      1,
      later.log(),
    );
    fs.unlinkSync(link);
    assert.equal(fs.statSync(db).nlink, 1);
    assert.equal(await proofStatus(later.record.port), 400);
    assert.equal(fs.existsSync(later.file), false);
    const localLater = local(later.log());
    await command(["add", "Direct after link removed"]);
    assert.equal(local(later.log()), localLater);
    assert.equal(fs.existsSync(later.file), false);
    assert.equal(withdrawals(later.log(), "hard link"), 1);
    await stop(later.child);
    return {
      linked_at_start: {
        server_started: true,
        list_status: 200,
        create_status: 200,
        record: false,
        proof_status: 400,
        cli_write_direct: 1,
        server_local_requests_from_cli: 0,
        withdrawal_logs: 1,
      },
      linked_after_start: {
        proof_before_link: 200,
        proof_after_link: 400,
        record_after_link: false,
        withdrawal_logs: 1,
        proof_after_unlink: 400,
        record_after_unlink: false,
        cli_write_direct: 1,
        server_local_requests_from_cli: 0,
      },
    };
  });
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

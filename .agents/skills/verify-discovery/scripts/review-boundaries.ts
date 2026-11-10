import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join } from "node:path";
import { Database } from "bun:sqlite";
import { Clock, Context, Effect, Layer, Schema } from "effect";
import { HttpServer } from "effect/http";
import { AuthAttemptRejected, Instant, ProfileId, Task } from "../../../../packages/domain/src/index.ts";
import { openStore } from "../../../../packages/domain/src/store/store.ts";
import { taskInput, created, work } from "../../../../packages/domain/test/store-fixtures.ts";
import { serverLayer } from "../../../../apps/server/src/server.ts";

const controlledClock = (base: Clock.Clock, current: () => number, sleep: Clock.Clock["sleep"] = (duration) => base.sleep(duration)): Clock.Clock => ({
  currentTimeMillisUnsafe: current,
  currentTimeMillis: Effect.sync(current),
  currentTimeNanosUnsafe: () => BigInt(current()) * 1000000n,
  currentTimeNanos: Effect.sync(() => BigInt(current()) * 1000000n),
  monotonicTimeNanosUnsafe: () => base.monotonicTimeNanosUnsafe(),
  monotonicTimeNanos: base.monotonicTimeNanos,
  sleep,
});

const [binary, evidence, mode = "after"] = process.argv.slice(2);
assert.ok(binary && isAbsolute(binary) && evidence && isAbsolute(evidence) && !existsSync(evidence));
mkdirSync(evidence, { recursive: true });
const scratch = mkdtempSync(join(tmpdir(), "todo-discovery-boundaries-"));
const seed = join(scratch, "seed.db");
const passphrase = "scratch review passphrase";
const actions: unknown[] = [];
const id = Schema.decodeUnknownSync(ProfileId);
const initialNow = Date.now();
let caseNumber = 0;
const normalized = (text: string) => {
  const body = Schema.decodeUnknownSync(Schema.Record(Schema.String, Schema.Json))(JSON.parse(text));
  const { generated_at: _time, ...rest } = body;
  return JSON.stringify(rest);
};
const stats = (path: string) => {
  const db = new Database(path);
  try { return { profiles: db.query("SELECT id,name FROM profiles ORDER BY id").all(), sessions: db.query("SELECT count(*) AS n FROM credentials WHERE kind='session'").get(), auth: db.query("SELECT count(*) AS n FROM op_log WHERE json_extract(event,'$.kind') IN ('AuthChanged','AuthAttemptRejected')").get() }; }
  finally { db.close(); }
};
const authRows = (path: string) => {
  const db = new Database(path);
  try {
    return db.query<{ seq: number; actor: string; profile: string | null; entity_version: number; event: string; from_version: number | null; to_version: number | null; outcome: string; reason: string | null }, []>("SELECT * FROM op_log WHERE json_extract(event,'$.kind')='AuthAttemptRejected' ORDER BY seq").all().map((row) => ({ ...row, event: Schema.decodeUnknownSync(AuthAttemptRejected)(JSON.parse(row.event)) }));
  } finally { db.close(); }
};
const call = (env: NodeJS.ProcessEnv, args: string[], input?: string, format = "json") => {
  const result = spawnSync(binary, ["--format", format, ...args], { env, input, encoding: "utf8", timeout: 30000 });
  if (result.error) throw result.error;
  const value = { args, format, exit: result.status, stdout: result.stdout, stderr: result.stderr };
  actions.push(value);
  return value;
};
const fixture = await Effect.runPromise(Effect.acquireUseRelease(openStore({ path: seed, attachmentRoot: join(scratch, "attachments") }), (store) => Effect.gen(function* () {
  for (const [profile, name] of [["work", "Named Work"], ["foreign-id", "Foreign Secret"], ["deleted-id", "Deleted Foreign"], ["Team: It's Work", "Team: It's Work"], ["-profile", "-profile"]]) yield* store.putProfile({ ...work, id: id(profile), name });
  yield* store.auth.setupOwner(passphrase);
  const owner = yield* store.auth.signIn(passphrase);
  const scoped = yield* store.auth.issueToken({ credential: owner.credential, token: { name: "scoped", profile: id("work"), scope: "read-write" } });
  const revokedScope = yield* store.auth.issueToken({ credential: owner.credential, token: { name: "revoked-scope", profile: id("work"), scope: "read-write" } });
  yield* store.auth.revokeToken({ credential: owner.credential, name: "revoked-scope" });
  const revokedOwner = yield* store.auth.signIn(passphrase);
  yield* store.auth.signOut(revokedOwner);
  const clock = yield* Clock.Clock;
  const oldClock = controlledClock(clock, () => initialNow - 8 * 86400000);
  const expiredOwner = yield* store.auth.signIn(passphrase).pipe(Effect.provideService(Clock.Clock, oldClock));
  const expiredScope = yield* store.auth.issueToken({ credential: owner.credential, token: { name: "expired-scope", profile: id("work"), scope: "read-write", expires_at: Schema.decodeUnknownSync(Instant)(new Date(initialNow - 86400000).toISOString()) } }).pipe(Effect.provideService(Clock.Clock, oldClock));
  yield* store.auth.deleteProfile({ credential: owner.credential, profile: id("deleted-id"), options: { with_tasks: false, dry_run: false } });
  for (const [taskId, profile, title] of [["-ab", "work", "Dash id Task"], ["ab", "work", "Plain id Task"], ["ab2", "Team: It's Work", "Quoted Profile Task"], ["ab3", "-profile", "Dash flag Task"], ["ab-f", "foreign-id", "Foreign Task"]]) yield* store.auth.append({ credential: owner.credential, profile: id(profile), event: { ...created, task: Schema.decodeUnknownSync(Task)({ ...taskInput, id: taskId, profile_id: profile, title }) } });
  return { owner, scoped, revokedScope, expiredScope, revokedOwner, expiredOwner };
}), (store) => Effect.orDie(store.close())));
const fresh = () => {
  const directory = join(scratch, `case-${++caseNumber}`);
  const home = join(directory, "home");
  mkdirSync(join(home, ".todo-cli"), { recursive: true });
  const path = join(directory, "scratch.db");
  const bin = join(directory, "bin");
  mkdirSync(bin);
  symlinkSync(binary, join(bin, "todo"));
  copyFileSync(seed, path);
  for (const [name, credential] of [["work", fixture.owner.credential], ["owner-key", fixture.owner.credential], ["scoped-key", fixture.scoped.credential], ["-key", fixture.owner.credential]]) writeFileSync(join(home, ".todo-cli", `session_${encodeURIComponent(name)}.json`), JSON.stringify({ token: credential }), { mode: 0o600 });
  return { path, home, env: { ...process.env, HOME: home, PATH: bin + ":" + process.env.PATH, TODO_DB: path, TODO_ATTACHMENT_ROOT: join(directory, "attachments"), TODO_PORT: "0" } };
};
const checks = { F1: true, F2: true, F3: true, attribution: true };
const comparisons: unknown[] = [];
try {
  for (const key of ["scoped-key", "owner-key"]) for (const command of ["show", "list", "whoami", "lookup"]) {
    const responses = [];
    for (const target of ["Foreign Secret", "No Such", "deleted-id"]) {
      const sample = fresh();
      const args = command === "show" ? [command, "ab-f"] : command === "lookup" ? [command, "--prefix=ab-f"] : [command];
      const result = call(sample.env, [...args, "--profile", target, "--credential-profile", key]);
      responses.push({ exit: result.exit, body: normalized(result.stdout) });
    }
    if (key === "scoped-key" || command === "lookup") checks.F1 &&= responses.every((row) => JSON.stringify(row) === JSON.stringify(responses[0])) && responses[0]?.exit === (command === "lookup" ? 0 : 3);
    else checks.F1 &&= responses[0]?.exit === 0 && responses[1]?.exit === 3 && responses[2]?.exit === 3 && responses[1]?.body === responses[2]?.body;
    comparisons.push({ key, command, responses });
  }
  for (const flag of ["--profile", "--credential-profile"]) for (const password of ["correct", "wrong"]) {
    const sample = fresh();
    const before = stats(sample.path);
    const args = flag === "--profile" ? ["login", "--profile", "", "--credential-profile", "owner-key", "--password-stdin"] : ["login", "--profile", "empty-selector-target", "--credential-profile", "", "--password-stdin"];
    const result = call(sample.env, args, password === "correct" ? passphrase + "\n" : "wrong passphrase\n");
    const after = stats(sample.path);
    const body = Schema.decodeUnknownSync(Schema.Struct({ code: Schema.String }))(JSON.parse(result.stdout));
    checks.F2 &&= result.exit === 2 && body.code === "invalid_args" && JSON.stringify(before) === JSON.stringify(after);
    comparisons.push({ flag, password, before, after, exit: result.exit, code: body.code });
  }
  for (const command of [["logout"], ["schema", "lookup"], ["lookup", "--help"], ["init", "--password-stdin"]]) for (const flag of ["--profile=", "--credential-profile="]) {
    const sample = fresh(); const before = stats(sample.path);
    const result = call(sample.env, [...command, flag], passphrase + "\n");
    checks.F2 &&= result.exit === 2 && JSON.stringify(before) === JSON.stringify(stats(sample.path));
  }
  for (const format of ["md", "table"]) for (const [prefix, key, expected] of [
    ["-a", "work", "todo show --profile work -- -ab"],
    ["ab3", "-key", "todo show ab3 --profile=-profile --credential-profile=-key"],
    ["ab2", "owner-key", "todo show ab2 --profile 'Team: It'\\''s Work' --credential-profile owner-key"],
    ["ab", "work", "todo show ab --profile work"],
  ]) {
    const sample = fresh();
    const result = call(sample.env, ["lookup", `--prefix=${prefix}`, "--profile", "work", `--credential-profile=${key}`], undefined, format);
    const commands = result.stdout.split("\n").filter((line) => line.includes("todo show ")).map((line) => line.slice(line.indexOf("todo show ")).trim());
    const command = commands.find((line) => line === expected);
    checks.F3 &&= result.exit === 0 && command === expected;
    const actual = command ?? commands[0];
    if (!actual) { checks.F3 = false; continue; }
    const resolved = spawnSync("/bin/sh", ["-c", "command -v todo"], { env: sample.env, encoding: "utf8" });
    assert.equal(resolved.status, 0);
    assert.equal(resolved.stdout.trim(), join(dirname(sample.path), "bin/todo"));
    const exact = spawnSync("/bin/sh", ["-c", actual], { env: sample.env, encoding: "utf8", timeout: 30000 });
    const expectedTask = prefix === "-a" ? ["-ab", "Dash id Task"] : prefix === "ab3" ? ["ab3", "Dash flag Task"] : prefix === "ab2" ? ["ab2", "Quoted Profile Task"] : ["ab", "Plain id Task"];
    actions.push({ exactPrintedCommand: actual, resolvedTodo: resolved.stdout.trim(), exit: exact.status, stdout: exact.stdout, stderr: exact.stderr });
    checks.F3 &&= exact.status === 0 && expectedTask.every((value) => exact.stdout.includes(value));
    const quoted = "'" + binary.replaceAll("'", "'\\''") + "'";
    const shown = spawnSync("/bin/sh", ["-c", quoted + " --format json " + actual.slice(5)], { env: sample.env, encoding: "utf8", timeout: 30000 });
    actions.push({ printedCommand: actual, expected, exit: shown.status, stdout: shown.stdout, stderr: shown.stderr });
    checks.F3 &&= shown.status === 0;
  }
  for (const kind of ["revokedScope", "expiredScope", "revokedOwner", "expiredOwner"] as const) for (const action of ["read", "mutate"] as const) {
    const sample = fresh(); const issued = fixture[kind];
    writeFileSync(join(sample.home, ".todo-cli/session_bad-key.json"), JSON.stringify({ token: issued.credential }), { mode: 0o600 });
    const cli = call(sample.env, action === "read" ? ["show", "ab", "--profile", "Named Work", "--credential-profile", "bad-key"] : ["edit", "ab", "--title", "Denied", "--expected-version", "1", "--profile", "Named Work", "--credential-profile", "bad-key"]);
    const cliRows = authRows(sample.path);
    const httpSample = fresh();
    let current = initialNow - 10 * 86400000;
    const expectedTime = cliRows[0]?.event.occurred_at;
    let ready = () => {};
    const sleeping = new Promise<void>((done) => { ready = done; });
    const http = await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const clock = yield* Clock.Clock;
      return yield* Effect.gen(function* () {
        const context = yield* Layer.build(serverLayer({ path: httpSample.path, port: 0 }));
        yield* Effect.promise(() => sleeping);
        const server = Context.get(context, HttpServer.HttpServer);
        const base = HttpServer.formatAddress(server.address);
        current = expectedTime ? Date.parse(expectedTime) : Date.now();
        return yield* Effect.tryPromise(async () => {
          const response = await fetch(base + "/profiles/work/tasks/ab", { method: action === "read" ? "GET" : "PATCH", headers: { Authorization: `Bearer ${issued.credential}`, "Content-Type": "application/json" }, ...(action === "mutate" ? { body: JSON.stringify({ from_version: 1, changes: { title: "Denied" } }) } : {}), signal: AbortSignal.timeout(60000) });
          const body: unknown = await response.json();
          return { status: response.status, body };
        });
      }).pipe(Effect.provideService(Clock.Clock, controlledClock(clock, () => current, () => Effect.sync(() => ready()).pipe(Effect.andThen(Effect.never)))));
    })));
    const httpRows = authRows(httpSample.path);
    checks.attribution &&= cli.exit === 3 && http.status === 401 && cliRows.length === 1 && httpRows.length === 1 && JSON.stringify(cliRows) === JSON.stringify(httpRows);
    comparisons.push({ kind, action, cliExit: cli.exit, http, cliRows, httpRows });
  }
} finally {
  writeFileSync(join(evidence, "actions.json"), JSON.stringify(actions, null, 2));
  writeFileSync(join(evidence, "comparisons.json"), JSON.stringify(comparisons, null, 2));
  writeFileSync(join(evidence, "result.json"), JSON.stringify({ binary, mode, checks, cases: caseNumber }, null, 2));
  rmSync(scratch, { recursive: true, force: true });
  writeFileSync(join(evidence, "cleanup.json"), JSON.stringify({ scratchRemoved: !existsSync(scratch), inProcessHttpScopesClosed: true }));
}
assert.deepEqual(checks, { F1: true, F2: true, F3: true, attribution: true });
process.stdout.write("PASS: review boundaries and real HTTP attribution\n");

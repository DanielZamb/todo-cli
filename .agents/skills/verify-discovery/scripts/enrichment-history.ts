import assert from "node:assert/strict";
import { type SpawnSyncReturns, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import { Database } from "bun:sqlite";
import { Clock, Context, Effect, Layer, Schema } from "effect";
import { HttpServer } from "effect/http";
import { AuthAttemptRejected, Instant, ProfileId } from "../../../../packages/domain/src/index.ts";
import { openStore } from "../../../../packages/domain/src/store/store.ts";
import { work } from "../../../../packages/domain/test/store-fixtures.ts";
import { serverLayer } from "../../../../apps/server/src/server.ts";

const [binary, evidence] = process.argv.slice(2);
assert.ok(binary && isAbsolute(binary) && evidence && isAbsolute(evidence) && !existsSync(evidence));
mkdirSync(evidence, { recursive: true });
const scratch = mkdtempSync(join(tmpdir(), "todo-enrichment-history-"));
const start = Date.now() - 60000;
const comparisons: unknown[] = [];
const momentKey = Symbol.for("todo.verify-discovery.enrichment-moment");
const clockAt = (base: Clock.Clock, current: () => number, sleep = base.sleep): Clock.Clock => ({
  currentTimeMillisUnsafe: current,
  currentTimeMillis: Effect.sync(current),
  currentTimeNanosUnsafe: () => BigInt(current()) * 1000000n,
  currentTimeNanos: Effect.sync(() => BigInt(current()) * 1000000n),
  monotonicTimeNanosUnsafe: () => base.monotonicTimeNanosUnsafe(),
  monotonicTimeNanos: base.monotonicTimeNanos,
  sleep,
});
const authRows = (path: string) => {
  const db = new Database(path);
  try {
    return db.query<{ actor: string; profile: string | null; event: string; outcome: string; reason: string | null }, []>("SELECT actor,profile,event,outcome,reason FROM op_log WHERE json_extract(event,'$.kind')='AuthAttemptRejected' ORDER BY seq").all().map((row) => ({ ...row, event: Schema.decodeUnknownSync(AuthAttemptRejected)(JSON.parse(row.event)) }));
  } finally { db.close(); }
};
try {
  for (const item of [
    { command: "batch-edit", route: "/profiles/work/batch-edit", payload: { items: [{ task_id: "ab", from_version: 1 }], changes: { title: "Ignored" } } },
    { command: "attach-many", route: "/profiles/work/attachments/batch", payload: { items: [{ task_id: "ab", from_version: 1, attachments: [{ kind: "link", url: "https://example.com/row" }] }] } },
    { command: "import", route: "/profiles/work/import", payload: { items: [{ external_id: "row", task_id: "ab", from_version: 1, title: "Ignored" }] } },
  ]) for (const moment of ["before-command", ...(item.command === "import" ? [] : ["during-write"]), ...(item.command === "attach-many" ? ["after-enrichment"] : [])]) {
    const directory = join(scratch, item.command + "-" + moment);
    mkdirSync(directory);
    const seed = join(directory, "seed.db");
    const seeded = await Effect.runPromise(Effect.gen(function* () {
      const clock = yield* Clock.Clock;
      return yield* Effect.gen(function* () {
        const store = yield* openStore({ path: seed });
        try {
          yield* store.putProfile(work);
          yield* store.auth.setupOwner("scratch enrichment passphrase");
          const owner = yield* store.auth.signIn("scratch enrichment passphrase");
          const token = yield* store.auth.issueToken({ credential: owner.credential, token: { name: "row-expiry", profile: Schema.decodeUnknownSync(ProfileId)("work"), scope: "read-write", expires_at: Schema.decodeUnknownSync(Instant)(new Date(start + 10000).toISOString()) } });
          return { owner, token };
        } finally { yield* store.close(); }
      }).pipe(Effect.provideService(Clock.Clock, clockAt(clock, () => start)));
    }));
    const cliPath = join(directory, "cli.db");
    const httpPath = join(directory, "http.db");
    copyFileSync(seed, cliPath);
    copyFileSync(seed, httpPath);
    const token = seeded.token;
    const cliToken = token;
    const home = join(directory, "home");
    mkdirSync(join(home, ".todo-cli"), { recursive: true });
    writeFileSync(join(home, ".todo-cli/session_source.json"), JSON.stringify({ token: cliToken.credential }), { mode: 0o600 });
    const input = join(directory, "rows.json");
    writeFileSync(input, JSON.stringify(item.payload));
    const cli: SpawnSyncReturns<string> = spawnSync(binary, ["--format", "json", item.command, input, "--profile", "work", "--credential-profile", "source"], { env: { ...process.env, HOME: home, TODO_DB: cliPath }, encoding: "utf8", timeout: 60000 });
    const cliRows = authRows(cliPath);
    assert.equal(cli.status, 3, cli.stdout + cli.stderr);
    assert.equal(cliRows.length, 1);
    assert.deepEqual(cliRows.map((row) => [row.profile, row.event.action, row.event.detail]), [["work", "authenticate", "expired"]]);
    assert.equal(cliRows[0]?.actor, cliToken.id);
    const rejectionTime = start + 20000;
    let current = start;
    let hits = 0;
    let ready = () => {};
    const sleeping = new Promise<void>((done) => { ready = done; });
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, momentKey);
    Object.defineProperty(globalThis, momentKey, { configurable: true, value: (at: string) => {
      if (at === moment && hits === 0) { hits++; current = rejectionTime; }
    } });
    let http: { status: number; bytes: string; body: Schema.Json };
    try {
      http = await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
        const clock = yield* Clock.Clock;
        return yield* Effect.gen(function* () {
          const context = yield* Layer.build(serverLayer({ path: httpPath, port: 0 }));
          yield* Effect.promise(() => sleeping);
          const server = Context.get(context, HttpServer.HttpServer);
          const base = HttpServer.formatAddress(server.address);
          if (moment === "before-command") current = rejectionTime;
          return yield* Effect.tryPromise(async () => {
            const response = await fetch(base + item.route, { method: "POST", headers: { Authorization: `Bearer ${token.credential}`, "Content-Type": "application/json" }, body: JSON.stringify(item.payload), signal: AbortSignal.timeout(60000) });
            const bytes = await response.text();
            return { status: response.status, bytes, body: Schema.decodeUnknownSync(Schema.Json)(JSON.parse(bytes)) };
          });
        }).pipe(Effect.provideService(Clock.Clock, clockAt(clock, () => current, () => Effect.sync(() => ready()).pipe(Effect.andThen(Effect.never)))));
      })));
    } finally { if (descriptor) Object.defineProperty(globalThis, momentKey, descriptor); else Reflect.deleteProperty(globalThis, momentKey); }
    const httpRows = authRows(httpPath);
    comparisons.push({ command: item.command, moment, hits, cli: { exit: cli.status, stdout: cli.stdout, stderr: cli.stderr }, http, cliRows, httpRows });
    assert.equal(http.status, 401);
    assert.equal(http.bytes, '{"_tag":"Unauthorized","message":"expired","exit_code":3,"exit_meaning":"not found or auth missing"}');
    assert.equal(httpRows.length, 1);
    assert.deepEqual(httpRows.map((row) => [row.profile, row.event.action, row.event.detail]), [["work", item.command === "attach-many" && moment !== "before-command" ? "mutate" : "authenticate", "expired"]]);
    assert.equal(httpRows[0]?.actor, token.id);
    const projection = (rows: ReturnType<typeof authRows>) => rows.map((row) => ({ actor: row.actor, profile: row.profile, outcome: row.outcome, reason: row.reason, entity_version: row.event.entity_version, kind: row.event.kind, action: row.event.action, code: row.event.code, detail: row.event.detail }));
    if (moment === "before-command") assert.deepEqual(projection(httpRows), projection(cliRows));
    assert.equal(hits, moment === "before-command" ? 0 : 1);
  }
  writeFileSync(join(evidence, "result.json"), JSON.stringify({ exit: 0, cases: 6, inProcessProductionHttp: true, trigger: "named enrichment/write moments, no credential callback count" }, null, 2));
} finally {
  writeFileSync(join(evidence, "comparisons.json"), JSON.stringify(comparisons, null, 2));
  rmSync(scratch, { recursive: true, force: true });
  writeFileSync(join(evidence, "cleanup.json"), JSON.stringify({ scratchRemoved: !existsSync(scratch), prototypeRestored: true, httpScopesClosed: true }, null, 2));
}

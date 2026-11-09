import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import { Database } from "bun:sqlite";
import { Clock, Context, Effect, Layer, Schema } from "effect";
import { HttpServer } from "effect/http";
import { AuthAttemptRejected, Instant, ProfileId } from "../../../../packages/domain/src/index.ts";
import { Diagnostics } from "../../../../packages/domain/src/store/diagnostics.ts";
import { openStore } from "../../../../packages/domain/src/store/store.ts";
import { work } from "../../../../packages/domain/test/store-fixtures.ts";
import { serverLayer } from "../../../../apps/server/src/server.ts";

const [binary, evidence] = process.argv.slice(2);
assert.ok(binary && isAbsolute(binary) && evidence && isAbsolute(evidence) && !existsSync(evidence));
mkdirSync(evidence, { recursive: true });
const scratch = mkdtempSync(join(tmpdir(), "todo-enrichment-history-"));
const start = Date.now() + 3600000;
const comparisons: unknown[] = [];
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
    { command: "batch-edit", route: "/profiles/work/batch-edit", at: 2, boundary: "after missing Task check", payload: { items: [{ task_id: "ab", from_version: 1 }], changes: { title: "Ignored" } } },
    { command: "attach-many", route: "/profiles/work/attachments/batch", at: 3, boundary: "after missing Task check", payload: { items: [{ task_id: "ab", from_version: 1, attachments: [{ kind: "link", url: "https://example.com/row" }] }] } },
    { command: "import", route: "/profiles/work/import", at: 0, boundary: "aggregate entry; missing imported ids are conflict-guarded before enrichment", payload: { items: [{ external_id: "row", task_id: "ab", from_version: 1, title: "Ignored" }] } },
  ]) {
    const directory = join(scratch, item.command);
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
    const cliIssueTime = Date.now() - 60000;
    const cliToken = await Effect.runPromise(Effect.gen(function* () {
      const clock = yield* Clock.Clock;
      return yield* Effect.gen(function* () {
        const store = yield* openStore({ path: cliPath });
        try {
          return yield* store.auth.issueToken({ credential: seeded.owner.credential, token: { name: "cli-expired", profile: Schema.decodeUnknownSync(ProfileId)("work"), scope: "read-write", expires_at: Schema.decodeUnknownSync(Instant)(new Date(cliIssueTime + 10000).toISOString()) } });
        } finally { yield* store.close(); }
      }).pipe(Effect.provideService(Clock.Clock, clockAt(clock, () => cliIssueTime)));
    }));
    const home = join(directory, "home");
    mkdirSync(join(home, ".todo-cli"), { recursive: true });
    writeFileSync(join(home, ".todo-cli/session_source.json"), JSON.stringify({ token: cliToken.credential }), { mode: 0o600 });
    const input = join(directory, "rows.json");
    writeFileSync(input, JSON.stringify(item.payload));
    const cli = spawnSync(binary, ["--format", "json", item.command, input, "--profile", "work", "--credential-profile", "source"], { env: { ...process.env, HOME: home, TODO_DB: cliPath }, encoding: "utf8", timeout: 60000 });
    const cliRows = authRows(cliPath);
    assert.equal(cli.status, 3, cli.stdout + cli.stderr);
    assert.equal(cliRows.length, 1);
    assert.deepEqual(cliRows.map((row) => [row.profile, row.event.action, row.event.detail]), [["work", "authenticate", "expired"]]);
    assert.equal(cliRows[0].actor, cliToken.id);
    const rejectionTime = start + 20000;
    let current = start;
    let used = 0;
    let ready = () => {};
    const sleeping = new Promise<void>((done) => { ready = done; });
    const descriptor = Object.getOwnPropertyDescriptor(Diagnostics.prototype, "credentialUsed");
    assert.ok(descriptor);
    const original = Diagnostics.prototype.credentialUsed;
    Object.defineProperty(Diagnostics.prototype, "credentialUsed", { configurable: true, value(this: Diagnostics, id: string, time: number) {
      original.call(this, id, time);
      if (id === token.id && ++used === item.at) current = rejectionTime;
    } });
    let http: { status: number; body: Schema.Json };
    try {
      http = await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
        const clock = yield* Clock.Clock;
        return yield* Effect.gen(function* () {
          const context = yield* Layer.build(serverLayer({ path: httpPath, port: 0 }));
          yield* Effect.promise(() => sleeping);
          const server = Context.get(context, HttpServer.HttpServer);
          const base = HttpServer.formatAddress(server.address);
          if (item.at === 0) current = rejectionTime;
          return yield* Effect.tryPromise(async () => {
            const response = await fetch(base + item.route, { method: "POST", headers: { Authorization: `Bearer ${token.credential}`, "Content-Type": "application/json" }, body: JSON.stringify(item.payload), signal: AbortSignal.timeout(60000) });
            return { status: response.status, body: Schema.decodeUnknownSync(Schema.Json)(await response.json()) };
          });
        }).pipe(Effect.provideService(Clock.Clock, clockAt(clock, () => current, () => Effect.sync(() => ready()).pipe(Effect.andThen(Effect.never)))));
      })));
    } finally { Object.defineProperty(Diagnostics.prototype, "credentialUsed", descriptor); }
    const httpRows = authRows(httpPath);
    comparisons.push({ command: item.command, boundary: item.boundary, successfulCredentialChecksBeforeExpiry: used, cli: { exit: cli.status, stdout: cli.stdout, stderr: cli.stderr }, http, cliRows, httpRows });
    assert.equal(http.status, 401);
    assert.equal(httpRows.length, 1);
    assert.deepEqual(httpRows.map((row) => [row.profile, row.event.action, row.event.detail]), [["work", "authenticate", "expired"]]);
    assert.equal(httpRows[0].actor, token.id);
    const projection = (rows: ReturnType<typeof authRows>) => rows.map((row) => ({ profile: row.profile, outcome: row.outcome, reason: row.reason, entity_version: row.event.entity_version, kind: row.event.kind, action: row.event.action, code: row.event.code, detail: row.event.detail }));
    assert.deepEqual(projection(httpRows), projection(cliRows));
    assert.equal(used, item.at);
  }
  writeFileSync(join(evidence, "result.json"), JSON.stringify({ exit: 0, cases: 3, inProcessProductionHttp: true }, null, 2));
} finally {
  writeFileSync(join(evidence, "comparisons.json"), JSON.stringify(comparisons, null, 2));
  rmSync(scratch, { recursive: true, force: true });
  writeFileSync(join(evidence, "cleanup.json"), JSON.stringify({ scratchRemoved: !existsSync(scratch), prototypeRestored: true, httpScopesClosed: true }, null, 2));
}

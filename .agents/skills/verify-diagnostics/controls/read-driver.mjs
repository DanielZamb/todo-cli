import { Database } from "bun:sqlite";
import { setSystemTime } from "bun:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { Effect } from "effect";
import { openStore } from "../../../../packages/domain/src/store/store.ts";
setSystemTime(new Date("2026-11-11T18:00:00Z"));
let tracing = !0;
const statements = [], originalQuery = Database.prototype.query, originalExec = Database.prototype.exec;
Object.defineProperty(Database.prototype, "query", { configurable: !0, value: function(...args) {
  const statement = Reflect.apply(originalQuery, this, args);
  if (!tracing)
    return statement;
  return new Proxy(statement, { get(target, key) {
    const value = Reflect.get(target, key, target);
    if (typeof value !== "function")
      return value;
    if (["get", "all", "run", "values", "iterate"].includes(String(key)))
      return (...bindings) => {
        statements.push({ sql: args[0], bindings });
        return Reflect.apply(value, target, bindings);
      };
    return value.bind(target);
  } });
} });
Object.defineProperty(Database.prototype, "exec", { configurable: !0, value: function(...args) {
  if (tracing)
    statements.push({ exec: args[0] });
  return Reflect.apply(originalExec, this, args);
} });
const [manifest] = process.argv.slice(2);
assert.ok(manifest);
const fixture = JSON.parse(readFileSync(manifest, "utf8")), store = await Effect.runPromise(openStore({ path: fixture.path }));
tracing = !1;
const hash = (x) => createHash("sha256").update(JSON.stringify(x)).digest("hex");
console.log(JSON.stringify({ ready: !0, statements, constructorHash: hash(statements), lookups: statements.filter((x) => JSON.stringify(x).includes("FROM credentials WHERE")).length }));
try {
  for await (const line of createInterface({ input: process.stdin, crlfDelay: 1 / 0 })) {
    const command = JSON.parse(line);
    if (command.mode === "quit")
      break;
    if (command.mode === "parity")
      Object.defineProperty(process.memoryUsage, "rss", { value: () => 33554432, configurable: !0 });
    const state = { holds: [] };
    Reflect.set(globalThis, Symbol.for("todo.diag-hold"), state);
    const start = performance.now(), body = Effect.runSync(store.diagnostics.read({ credential: fixture.credential })), elapsed = performance.now() - start, normalized = { ...body, generated_at: "clock", runtime: { ...body.runtime, started_at: "clock", uptime_seconds: 0, memory_bytes: 0 } };
    console.log(JSON.stringify({ id: command.id, elapsed, holds: state.holds, bodyHash: hash(normalized), ...command.mode === "parity" ? { body } : {}, synchronous: !0 }));
  }
} finally {
  await Effect.runPromise(store.close());
}

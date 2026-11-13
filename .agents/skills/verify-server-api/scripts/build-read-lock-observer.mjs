import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { relative, resolve } from "node:path";
const [variant, output] = process.argv.slice(2);
assert.ok(["before", "after"].includes(variant) && output);
const root = process.cwd(), base = "e69230f93ce0ea29e955c34c4610122c6f47cb5c";
const prelude = `
import { Database as ObserverDatabase } from "bun:sqlite";
const observerQuery = ObserverDatabase.prototype.query;
Object.defineProperty(ObserverDatabase.prototype, "query", { value: function(sql, ...args) {
  globalThis[Symbol.for("todo.read-control.scope")]?.statements.push(sql);
  return observerQuery.call(this, sql, ...args);
}});
const observerTransaction = ObserverDatabase.prototype.transaction;
Object.defineProperty(ObserverDatabase.prototype, "transaction", { value: function(fn) {
  const db = this;
  let outer = false, started = 0;
  const tx = observerTransaction.call(db, (...args) => {
    if (outer) started = performance.now();
    return fn(...args);
  });
  const wrap = (actual, mode) => (...args) => {
    outer = !db.inTransaction; started = 0;
    try { return actual(...args); }
    finally { if (outer && started) {
      const scope = globalThis[Symbol.for("todo.read-control.scope")];
      scope?.holds.push(performance.now() - started);
      scope?.modes.push(mode);
    }}
  };
  const wrapped = wrap(tx, "deferred");
  for (const mode of ["deferred", "immediate", "exclusive"]) wrapped[mode] = wrap(tx[mode], mode);
  return wrapped;
}});
`;
const result = await Bun.build({ entrypoints: [resolve("apps/server/scripts/read-control-server.ts")], compile: { outfile: resolve(output) }, define: { TODO_BUILD_ID: '"e69230f9"' }, plugins: [{ name: "physical-read-transaction-observer", setup(build) {
  build.onLoad({ filter: /(?:packages\/domain\/src|apps\/server\/src)\/.*\.ts$/ }, (args) => {
    const path = relative(root, args.path);
    let contents = variant === "before" ? execFileSync("git", ["show", `${base}:${path}`], { encoding: "utf8" }) : readFileSync(args.path, "utf8");
    contents = contents.replaceAll("event: JSON.parse(row.event)", "event: (globalThis[Symbol.for('todo.read-control.decodes')] = (globalThis[Symbol.for('todo.read-control.decodes')] ?? 0) + 1, JSON.parse(row.event))");
    if (path === "apps/server/src/server.ts") {
      const start = "const start = performance.now();", end = "diagnostics.request(route, end - start, response.status, end);\n        return Effect.succeed(response);";
      assert.ok(contents.includes(start) && contents.includes(end));
      contents = contents.replace(start, start + `globalThis[Symbol.for("todo.read-control.scope")] = { statements: [], holds: [], modes: [] }; const decodes = globalThis[Symbol.for("todo.read-control.decodes")] ?? 0;`);
      contents = contents.replace(end, `diagnostics.request(route, end - start, response.status, end);
        const scope = globalThis[Symbol.for("todo.read-control.scope")];
        return Effect.succeed(HttpServerResponse.setHeaders(response, {
          "x-control-statements": JSON.stringify(scope.statements),
          "x-control-lock-holds": JSON.stringify(scope.holds),
          "x-control-modes": JSON.stringify(scope.modes),
          "x-control-history-decodes": String((globalThis[Symbol.for("todo.read-control.decodes")] ?? 0) - decodes),
        }));`);
    }
    return { loader: "ts", contents };
  });
  build.onLoad({ filter: /apps\/server\/scripts\/read-control-server\.ts$/ }, (args) => ({ loader: "ts", contents: readFileSync(args.path, "utf8").replace("const fixed =", prelude + "\nconst fixed =") }));
}}] });
assert.ok(result.success, result.logs.map(String).join("\n"));
writeFileSync(output + ".source.json", JSON.stringify({ variant, product: variant === "before" ? base : execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(), physicalTransactionObserver: true }, null, 2));

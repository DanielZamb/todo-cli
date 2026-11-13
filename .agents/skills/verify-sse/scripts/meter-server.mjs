import { Database } from "bun:sqlite";
import { now } from "./host-clock.mjs";

let historyReads = 0;
let passes = 0;
const query = Database.prototype.query;
Database.prototype.query = function (sql, ...args) {
  const statement = query.call(this, sql, ...args);
  if (sql.startsWith("SELECT seq,json_extract(event,'$.generation') AS generation FROM op_log") && !this.inTransaction) {
    return new Proxy(statement, {
      get(target, key) {
        if (key === "get") return (...args) => { passes++; return target.get(...args); };
        const value = Reflect.get(target, key);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
  }
  if (sql !== "SELECT * FROM op_log WHERE seq>? ORDER BY seq") return statement;
  return new Proxy(statement, {
    get(target, key) {
      if (key === "all") return (...args) => {
        historyReads++;
        return target.all(...args);
      };
      const value = Reflect.get(target, key);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
};
const transaction = Database.prototype.transaction;
Database.prototype.transaction = function (...args) {
  const db = this;
  const operation = transaction.apply(db, args);
  const run = (fn, args) => {
    const outer = !db.inTransaction;
    const before = outer ? db.query("SELECT total_changes() AS n").get().n : 0;
    const result = fn(...args);
    const committed = now();
    if (outer && db.query("SELECT total_changes() AS n").get().n !== before) {
      const table = db.query("SELECT 1 FROM sqlite_master WHERE name='op_log'").get();
      const seq = table ? db.query("SELECT max(seq) AS seq FROM op_log").get().seq : 0;
      process.stdout.write(`METER ${JSON.stringify({ committed, seq })}\n`);
    }
    return result;
  };
  const wrapped = (...args) => run(operation, args);
  for (const key of ["immediate", "deferred", "exclusive"])
    wrapped[key] = (...args) => run(operation[key], args);
  return wrapped;
};
process.stdin.setEncoding("utf8");
process.stdin.on("data", () => process.stdout.write(`METER ${JSON.stringify({ cpu: process.cpuUsage(), historyReads, passes, sampledAt: now() })}\n`));
await import("../../../../apps/server/src/main.ts");

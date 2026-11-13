import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
const output = resolve(process.argv[2]);
mkdirSync(output, { recursive: true });
const path = "packages/domain/src/auth/auth.ts", original = readFileSync(path, "utf8");
const sha = (text) => createHash("sha256").update(text).digest("hex");
const start = original.indexOf("    return transaction(() => {"), end = original.indexOf("\n  } catch (error) {\n    frame.failed = true;", start);
assert.ok(start > 0 && end > start);
const admission = `    else {
      lease.active = false;
      lease.credentials.clear();
      if (leases.get(db) === lease) leases.delete(db);
    }`;
assert.equal(original.split(admission).length, 2);
const cases = [
  { name: "late-root-close", source: original.slice(0, start) + "    return transaction(run);" + original.slice(end), filter: "an authority cannot enter a new transaction during post-", failed: /Tests\s+5 failed/, witness: /"task-1"/ },
  { name: "missing-failed-admission-cleanup", source: original.replace(admission, "    else {}"), filter: "failed transaction admission still clears the lease", failed: /Tests\s+1 failed/, witness: /expected.*0.*to be.*1/ },
];
const commands = [];
for (const item of cases) {
  try {
    writeFileSync(path, item.source);
    const r = spawnSync("pnpm", ["--filter", "@todo/domain", "test", "read-lifetime.test.ts", "-t", item.filter], { encoding: "utf8", env: { ...process.env, FORCE_COLOR: "0" }, timeout: 180000, maxBuffer: 8 * 1024 * 1024 });
    const log = (r.stdout ?? "") + (r.stderr ?? "");
    writeFileSync(output + "/" + item.name + ".log", log);
    commands.push({ name: item.name, exit: r.status, signal: r.signal });
    assert.equal(r.status, 1, item.name);
    assert.match(log, item.failed);
    assert.match(log, item.witness);
  } finally {
    writeFileSync(path, original);
    assert.equal(sha(readFileSync(path, "utf8")), sha(original));
    writeFileSync(output + "/commands.json", JSON.stringify(commands, null, 2));
  }
}
const clean = spawnSync("pnpm", ["--filter", "@todo/domain", "test", "read-lifetime.test.ts", "diagnostics-scope.test.ts", "authority-runtime.test.ts"], { encoding: "utf8", timeout: 180000, maxBuffer: 8 * 1024 * 1024 });
writeFileSync(output + "/restored.log", clean.stdout + clean.stderr);
assert.equal(clean.status, 0);
writeFileSync(output + "/result.json", JSON.stringify({ exit: 0, original: sha(original), restored: sha(readFileSync(path, "utf8")), commands, restoredExit: clean.status, scope: "five native transaction return/rollback/throw/cleanup/nesting refusals and failed-admission finalization" }, null, 2));
console.log(JSON.stringify({ mutations: commands, restored: clean.status }));

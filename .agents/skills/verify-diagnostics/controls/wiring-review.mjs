import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
const path = "packages/domain/src/store/store.ts", base = "70b60e221f3b59fa5fb0a7aa8813b5dd624a64ae", before = execFileSync("git", ["show", base + ":" + path], { encoding: "utf8" }), after = readFileSync(path, "utf8"), members = (text) => {
  const start = text.indexOf("export class OperationStore {"), end = text.indexOf(`
}

export const openStore`);
  assert.ok(start >= 0 && end > start);
  const body = text.slice(start, end), rows = [...body.matchAll(/^  (?:(?:private|public|readonly|static|async) )*(\w+)\b/gm)];
  return new Map(rows.map((row, index) => [row[1], body.slice(row.index, rows[index + 1]?.index ?? body.length)]));
}, a = members(before), b = members(after), hash = (s) => createHash("sha256").update(s).digest("hex"), coverage = JSON.parse(readFileSync(".agents/skills/verify-occ-atomicity/coverage.json", "utf8")).files.find((x) => x.path === path), hashes = [];
for (const key of coverage.functions) {
  const name = key.split(".")[1], old = a.get(name), current = b.get(name);
  assert.ok(old && current);
  if (name === "constructor")
    assert.equal(current, old.replace("(input) => this.auth.requireOwner(input),", `(input, use) =>
          this.auth.withOwnerRead(input, Schema.Struct({}), {}, use),`));
  else
    assert.equal(current, old, name);
  hashes.push({ function: key, before: hash(old), after: hash(current), byteIdentical: old === current });
}
const captures = ["const search = store.searchWords.read(selected.profile);", "const search = this.store.searchWords.read(selected.profile);", "prepare: (text) => store.searchWords.words(search, text),", "prepare: (text) => this.store.searchWords.words(search, text),"], commands = "packages/domain/src/commands.ts", old = execFileSync("git", ["show", base + ":" + commands], { encoding: "utf8" }), current = readFileSync(commands, "utf8");
for (const x of captures) {
  assert.equal(old.split(x).length, 2);
  assert.equal(current.split(x).length, 2);
}
const traces = ["owner", "snapshots"].map((name) => {
  const x = JSON.parse(readFileSync("docs/evidence/ui-speed/server-reads/strict-diagnostics-holds/" + name + "-constructor.json", "utf8"));
  assert.deepEqual(x.after.statements, x.before.statements);
  assert.equal(x.before.lookups, 0);
  assert.equal(x.after.lookups, 0);
  return { fixture: name, executedStatements: x.before.statements.length, sha256: x.before.constructorHash, identical: !0, credentialLookups: 0 };
});
writeFileSync("docs/evidence/ui-speed/server-reads/strict-diagnostics-wiring-review.json", JSON.stringify({ base, hashes, cacheStatements: captures.map((statement) => ({ statement, sha256: hash(statement), byteIdentical: !0 })), traces, pinsRenewed: !1 }, null, 2));
console.log({ functions: hashes.length, constructorExactApprovedArgumentOnly: !0, statementTraces: traces });

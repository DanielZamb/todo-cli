import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createHash } from "node:crypto";
const fixtures = JSON.parse(readFileSync(".scratch/server-reads/diagnostics-hold/fixtures.json", "utf8")), rows = [], hash = (p) => createHash("sha256").update(readFileSync(p)).digest("hex");
for (const f of fixtures) {
  const manifest = JSON.parse(readFileSync(f.manifest, "utf8")), initial = hash(manifest.path), traces = [];
  for (const binary of [".scratch/bin/diagnostics-before-70b", ".scratch/bin/diagnostics-after-scoped"]) {
    const result = spawnSync(resolve(binary), [f.manifest], { env: { ...process.env, HOME: dirname(manifest.path) }, input: `{"mode":"quit"}
`, encoding: "utf8", timeout: 30000 });
    assert.equal(result.status, 0, result.stderr);
    const value = JSON.parse(result.stdout.trim());
    assert.equal(value.lookups, 0);
    assert.equal(hash(manifest.path), initial);
    traces.push(value);
  }
  assert.deepEqual(traces[1].statements, traces[0].statements);
  rows.push({ fixture: f.name, sameDatabasePath: manifest.path, databaseSha256Unchanged: initial, before: traces[0], after: traces[1] });
}
writeFileSync("docs/evidence/ui-speed/server-reads/strict-diagnostics-constructor-same-db.json", JSON.stringify(rows, null, 2));
console.log(rows.map((x) => ({ fixture: x.fixture, statements: x.before.statements.length, equal: !0, databaseUnchanged: !0 })));

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { copyFileSync, cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { createInterface } from "node:readline";
import { join, dirname, resolve } from "node:path";
import { tmpdir, loadavg } from "node:os";
const out = resolve("docs/evidence/ui-speed/server-reads/strict-diagnostics-holds");
mkdirSync(out, { recursive: !0 });
const fixtures = JSON.parse(readFileSync(".scratch/server-reads/diagnostics-hold/fixtures.json", "utf8")), percentile = (a, p) => {
  const v = [...a].sort((x, y) => x - y);
  return v[Math.max(0, Math.ceil(p * v.length) - 1)] ?? 0;
}, summary = (a) => ({ n: a.length, median: percentile(a, 0.5), p99: percentile(a, 0.99), max: Math.max(...a) }), totals = [];
async function start(binary, fixture, arm) {
  const dir = mkdtempSync(join(tmpdir(), "todo-diag-pair-")), f = JSON.parse(readFileSync(fixture.manifest, "utf8")), path = join(dir, "scratch.db");
  copyFileSync(f.path, path);
  const snapshots = join(dirname(f.path), "snapshots");
  if (existsSync(snapshots))
    cpSync(snapshots, join(dir, "snapshots"), { recursive: !0 });
  const manifest = join(dir, "fixture.json");
  writeFileSync(manifest, JSON.stringify({ path, credential: f.credential }));
  const p = spawn(resolve(binary), [manifest], { env: { ...process.env, HOME: dir }, stdio: ["pipe", "pipe", "pipe"] });
  let errors = "";
  p.stderr.on("data", (b) => errors += b);
  const iterator = createInterface({ input: p.stdout, crlfDelay: 1 / 0 })[Symbol.asyncIterator]();
  async function read() {
    const row = await iterator.next();
    assert.equal(row.done, !1, errors);
    return JSON.parse(row.value);
  }
  const ready = await read();
  assert.ok(ready.ready, errors);
  return { dir, p, ready, async sample(id, mode = "read") {
    p.stdin.write(JSON.stringify({ id, mode }) + `
`);
    return await read();
  }, async close() {
    p.stdin.write(`{"mode":"quit"}
`);
    p.stdin.end();
    if (p.exitCode === null)
      await new Promise((r) => p.once("exit", r));
    assert.equal(p.exitCode, 0, errors);
    rmSync(dir, { recursive: !0, force: !0 });
  } };
}
for (const fixture of fixtures) {
  const before = await start(".scratch/bin/diagnostics-before-70b", fixture, "before"), after = await start(".scratch/bin/diagnostics-after-scoped", fixture, "after"), samples = { before: [], after: [] };
  try {
    assert.deepEqual(after.ready.statements, before.ready.statements, "Construction statement trace must stay identical");
    assert.equal(before.ready.lookups, 0);
    assert.equal(after.ready.lookups, 0);
    writeFileSync(join(out, fixture.name + "-constructor.json"), JSON.stringify({ before: before.ready, after: after.ready }, null, 2));
    for (let warm = 0;warm < 10; warm++) {
      await before.sample(-1);
      await after.sample(-1);
    }
    const loadStart = loadavg();
    for (let i = 0;i < 200; i++) {
      for (const arm of i % 2 ? ["after", "before"] : ["before", "after"]) {
        const data = await (arm === "before" ? before : after).sample(i);
        assert.equal(data.synchronous, !0);
        assert.ok(data.holds.length > 0);
        samples[arm].push(data);
      }
      assert.equal(samples.before[i].bodyHash, samples.after[i].bodyHash, "Same diagnostic data must be measured");
    }
    const arms = Object.fromEntries(["before", "after"].map((arm) => {
      const rows = samples[arm];
      return [arm, { wall: summary(rows.map((x) => x.elapsed)), lockSum: summary(rows.map((x) => x.holds.reduce((a, b) => a + b, 0))), longestLock: summary(rows.map((x) => Math.max(...x.holds))), transactions: rows.map((x) => x.holds.length) }];
    })), parityBefore = await before.sample(200, "parity"), parityAfter = await after.sample(200, "parity");
    assert.deepEqual(parityAfter.body, parityBefore.body, "Full body with fixed Clock/RSS");
    const result = { fixture, arms, loadStart, loadEnd: loadavg(), sameBodyPairs: 200, fullBodyEqual: !0 };
    writeFileSync(join(out, fixture.name + "-samples.json"), JSON.stringify(samples));
    writeFileSync(join(out, fixture.name + "-result.json"), JSON.stringify(result, null, 2));
    totals.push(result);
    writeFileSync(join(out, "result.json"), JSON.stringify(totals, null, 2));
    console.log(JSON.stringify(result));
  } finally {
    await before.close();
    await after.close();
  }
}

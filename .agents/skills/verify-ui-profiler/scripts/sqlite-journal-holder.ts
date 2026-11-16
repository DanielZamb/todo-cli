import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";

// Journal-based refusals are judged only while this open holds a lock.
// A live writer holding a journal gets busy, never removal advice; a journal
// left by a killed initializer or writer is still refused, files untouched.
// Usage: <checkout> <evidence-dir>
const root = resolve(process.argv[2] ?? ".");
const evidence = resolve(process.argv[3] ?? "docs/evidence/ui-speed/recordings-journal-holder");
mkdirSync(evidence, { recursive: true });
const store = join(root, "packages/domain/src/recordings-sqlite.ts");
const guidance = join(root, "packages/domain/src/recording-database.ts");
const snapshot = (dir: string) =>
  readdirSync(dir)
    .sort()
    .map((name) => `${name}:${statSync(join(dir, name)).size}:${createHash("sha256").update(readFileSync(join(dir, name))).digest("hex").slice(0, 12)}`)
    .join(" ");
const open = (dir: string) => {
  const r = Bun.spawnSync(
    [
      "bun",
      "-e",
      `const { RecordingDatabase } = await import(${JSON.stringify(store)}); const { recordingRefusalGuidance, presentRecordingFiles } = await import(${JSON.stringify(guidance)});
try { new RecordingDatabase(${JSON.stringify(dir)}).close(); console.log(JSON.stringify({ opened: true })); }
catch (e) { const g = e.reason ? recordingRefusalGuidance(${JSON.stringify(dir)}, e.reason, presentRecordingFiles(${JSON.stringify(dir)}), e.detail) : null;
console.log(JSON.stringify({ opened: false, reason: e.reason, state: g?.state, files: g?.files?.length ?? 0, advice: g ? /remove|give/.test(g.recovery) : false })); }`,
    ],
    { stdout: "pipe", stderr: "pipe" },
  );
  return JSON.parse(r.stdout.toString().trim().split("\n").pop() || "{}");
};
const until = async (file: string) => {
  const end = Date.now() + 60000;
  while (!existsSync(file) && Date.now() < end) await Bun.sleep(2);
  assert.ok(existsSync(file), file);
};
const rows: Array<Record<string, unknown>> = [];
const base = mkdtempSync(join(root, ".scratch", "journal-holder-"));
try {
  {
    const dir = join(base, "live-writer");
    Bun.spawnSync(["bun", "-e", `const { RecordingDatabase } = await import(${JSON.stringify(store)}); new RecordingDatabase(${JSON.stringify(dir)}).close();`]);
    const ready = join(base, "w-ready"), go = join(base, "w-go");
    const writer = Bun.spawn(["bun", "-e", `import { Database } from "bun:sqlite"; import { existsSync, writeFileSync } from "node:fs";
const db = new Database(${JSON.stringify(join(dir, "recordings.db"))}); db.exec("PRAGMA journal_mode=DELETE"); db.exec("BEGIN IMMEDIATE");
db.query("UPDATE counters SET value=value+1 WHERE name='dropped_batches'").run(); writeFileSync(${JSON.stringify(ready)}, "1");
while (!existsSync(${JSON.stringify(go)})) Bun.sleepSync(2); db.exec("COMMIT"); db.close();`], { stdout: "ignore", stderr: "pipe" });
    await until(ready);
    const journal = statSync(join(dir, "recordings.db-journal")).size;
    const before = snapshot(dir);
    const during = open(dir);
    const unchanged = before === snapshot(dir);
    writeFileSync(go, "1");
    await writer.exited;
    const after = open(dir);
    rows.push({ case: "live rollback writer holding a journal on our store", journal, during, unchanged, afterRelease: after });
    assert.ok(journal > 0);
    assert.equal(during.reason, "initialization_busy", JSON.stringify(during));
    assert.equal(during.advice, false);
    assert.equal(unchanged, true);
    assert.equal(after.opened, true);
  }
  {
    const dir = join(base, "killed-initializer");
    const ready = join(base, "i-ready");
    const first = Bun.spawn(["bun", "-e", `import { Database } from "bun:sqlite"; import { writeFileSync } from "node:fs";
const { RecordingDatabase } = await import(${JSON.stringify(store)});
const tx = Database.prototype.transaction;
Reflect.set(Database.prototype, "transaction", function (fn) { return tx.call(this, function (...a) { const r = fn.apply(this, a); writeFileSync(${JSON.stringify(ready)}, "1"); for (;;) Bun.sleepSync(1000); return r; }); });
new RecordingDatabase(${JSON.stringify(dir)});`], { stdout: "ignore", stderr: "ignore" });
    await until(ready);
    first.kill("SIGKILL");
    await first.exited;
    const shape = snapshot(dir);
    const result = open(dir);
    const unchanged = shape === snapshot(dir);
    rows.push({ case: "journal left by an initializer killed inside its first commit", shape, result, unchanged });
    assert.equal(result.reason, "interrupted_initialization", JSON.stringify(result));
    assert.equal(unchanged, true);
  }
  {
    const dir = join(base, "killed-writer");
    Bun.spawnSync(["bun", "-e", `const { RecordingDatabase } = await import(${JSON.stringify(store)}); new RecordingDatabase(${JSON.stringify(dir)}).close();`]);
    const ready = join(base, "k-ready");
    const writer = Bun.spawn(["bun", "-e", `import { Database } from "bun:sqlite"; import { writeFileSync } from "node:fs";
const db = new Database(${JSON.stringify(join(dir, "recordings.db"))}); db.exec("PRAGMA journal_mode=DELETE"); db.exec("BEGIN IMMEDIATE");
db.query("UPDATE counters SET value=value+1 WHERE name='dropped_batches'").run(); writeFileSync(${JSON.stringify(ready)}, "1"); for (;;) Bun.sleepSync(1000);`], { stdout: "ignore", stderr: "ignore" });
    await until(ready);
    writer.kill("SIGKILL");
    await writer.exited;
    const shape = snapshot(dir);
    const result = open(dir);
    const unchanged = shape === snapshot(dir);
    rows.push({ case: "hot journal left by a writer killed inside its transaction", shape, result, unchanged });
    assert.equal(result.reason, "hot_journal", JSON.stringify(result));
    assert.equal(unchanged, true);
  }
} finally {
  writeFileSync(join(evidence, "result.json"), JSON.stringify(rows, null, 2));
  console.log(JSON.stringify(rows, null, 1));
  rmSync(base, { recursive: true, force: true });
}

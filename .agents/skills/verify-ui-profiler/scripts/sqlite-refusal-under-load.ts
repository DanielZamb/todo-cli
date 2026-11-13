import { Database } from "bun:sqlite";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

// A separate process keeps committing and checkpointing to a store while
// this process opens it repeatedly. A good store must never be refused; a
// foreign or damaged store must be refused with its reason, or answered
// store_busy, never opened.
const root = resolve(process.argv[2] ?? ".");
const durationMs = Number(process.argv[3] ?? 60000);
const perSecond = Number(process.argv[4] ?? 0);
const { RecordingDatabase } = await import(
  join(root, "packages/domain/src/recordings-sqlite.ts")
);
const rows = [];
for (const kind of ["foreign-catalog", "damaged-page"] as const) {
  const base = mkdtempSync(join(tmpdir(), "todo-refusal-load-"));
  const dir = join(base, "store"),
    path = join(dir, "recordings.db"),
    stop = join(base, "stop"),
    ready = join(base, "ready");
  try {
    new RecordingDatabase(dir).close();
    const setup = new Database(path);
    let page = 0;
    if (kind === "foreign-catalog") setup.exec("DROP TRIGGER sequence_conflict");
    else
      page =
        setup
          .query<{ rootpage: number }, []>(
            "SELECT rootpage FROM sqlite_schema WHERE name='runs'",
          )
          .get()?.rootpage ?? 0;
    setup.close();
    if (kind === "damaged-page") {
      const file = Bun.file(path);
      const bytes = Buffer.from(await file.arrayBuffer());
      const at = (page - 1) * bytes.readUInt16BE(16);
      bytes.fill(0xff, at, at + 8);
      writeFileSync(path, bytes);
    }
    const writer = join(base, "writer.ts");
    writeFileSync(
      writer,
      `import { Database } from "bun:sqlite"; import { existsSync, writeFileSync } from "node:fs";
const db = new Database(${JSON.stringify(path)}); db.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=1");
const insert = db.query("INSERT INTO counters VALUES(?,?)"); writeFileSync(${JSON.stringify(ready)}, "1");
let n = 0, errors = 0; const gap = ${perSecond} > 0 ? 1000 / ${perSecond} : 0; let next = performance.now();
while (!existsSync(${JSON.stringify(stop)})) {
  try { insert.run("load-" + n + "-" + "x".repeat(200), n); n++; if (n % 25 === 0) db.query("PRAGMA wal_checkpoint(PASSIVE)").get(); } catch { errors++; }
  if (gap) { next += gap; const wait = next - performance.now(); if (wait > 0) Bun.sleepSync(wait); }
}
db.close(); console.log(JSON.stringify({ commits: n, errors }));`,
    );
    const w = Bun.spawn(["bun", writer], { stdout: "pipe", stderr: "pipe" });
    while (!existsSync(ready)) await Bun.sleep(5);
    const counts: Record<string, number> = {};
    let opens = 0;
    const until = Date.now() + durationMs;
    while (Date.now() < until) {
      opens++;
      try {
        new RecordingDatabase(dir).close();
        counts.opened = (counts.opened ?? 0) + 1;
      } catch (error) {
        const key =
          error && typeof error === "object" && "reason" in error
            ? String(error.reason)
            : String(error);
        counts[key] = (counts[key] ?? 0) + 1;
      }
    }
    writeFileSync(stop, "1");
    const out = await new Response(w.stdout).text();
    await w.exited;
    rows.push({ kind, perSecond, opens, counts, writer: out.trim() });
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
}
console.log(JSON.stringify(rows, null, 1));

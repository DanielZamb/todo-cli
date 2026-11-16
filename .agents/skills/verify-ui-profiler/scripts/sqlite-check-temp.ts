import assert from "node:assert/strict";
import { Database } from "bun:sqlite";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  statfsSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";

// A store recovering from an unclean stop (committed WAL frames) is opened
// while the temporary directory for its check copy is normal, missing,
// read-only or on a full volume. A good store opens or answers retrying
// (check_unavailable); it is never refused with removal advice. A foreign
// catalog is still refused. The temporary directory is left as it was.
// Usage: <checkout> <evidence-dir> [<mounted-scratch-volume>]
const root = resolve(process.argv[2] ?? ".");
const evidence = resolve(process.argv[3] ?? "docs/evidence/ui-speed/recordings-check-temp");
const volume = process.argv[4];
mkdirSync(evidence, { recursive: true });
const { RecordingDatabase } = await import(
  join(root, "packages/domain/src/recordings-sqlite.ts")
);
const { validateRecordingBatch } = await import(
  join(root, "packages/domain/src/diagnostic-recordings.ts")
);
const { modelBatch } = await import(
  join(root, "packages/domain/test/fixtures/recording-authority.ts")
);
const listing = (dir: string) =>
  existsSync(dir) ? readdirSync(dir).sort().join(",") : "(absent)";
const recovering = (base: string, batches: number, change: string) => {
  const dir = join(base, "rec");
  const store = new RecordingDatabase(dir);
  for (let i = 0; i < batches; i++)
    store.ingest(
      validateRecordingBatch(modelBatch(crypto.randomUUID())),
      Date.now(),
    );
  store.close();
  const work = join(base, "work");
  mkdirSync(work);
  for (const name of readdirSync(dir))
    copyFileSync(join(dir, name), join(work, name));
  const peer = new Database(join(work, "recordings.db"));
  peer.query("PRAGMA wal_autocheckpoint=0").get();
  peer.exec(change);
  copyFileSync(join(work, "recordings.db-wal"), join(dir, "recordings.db-wal"));
  peer.close();
  rmSync(join(dir, "recordings.db-shm"), { force: true });
  chmodSync(join(dir, "recordings.db-wal"), 0o600);
  return dir;
};
const open = (dir: string, temp: string) => {
  const r = Bun.spawnSync(
    [
      "bun",
      "-e",
      `const { RecordingDatabase } = await import(${JSON.stringify(join(root, "packages/domain/src/recordings-sqlite.ts"))});
try { new RecordingDatabase(${JSON.stringify(dir)}).close(); console.log(JSON.stringify({ opened: true })); }
catch (e) { console.log(JSON.stringify({ opened: false, reason: e.reason, detail: e.detail })); }`,
    ],
    { env: { ...process.env, TMPDIR: `${temp}/` }, stdout: "pipe", stderr: "pipe" },
  );
  return JSON.parse(r.stdout.toString().trim().split("\n").pop() || "{}");
};
const good = "UPDATE counters SET value=value+1 WHERE name='dropped_batches'";
const rows = [];
const cases: Array<[string, (base: string) => string, string, number]> = [
  ["normal", (b) => { const t = join(b, "temp"); mkdirSync(t); return t; }, good, 10],
  ["missing", (b) => join(b, "missing"), good, 10],
  ["read-only", (b) => { const t = join(b, "temp"); mkdirSync(t); chmodSync(t, 0o500); return t; }, good, 10],
  ["foreign catalog, missing temp", (b) => join(b, "missing"), "DROP TRIGGER sequence_conflict", 10],
];
if (volume) cases.push(["full volume", () => volume, good, 400]);
for (const [label, temp, change, batches] of cases) {
  const base = mkdtempSync(join(root, ".scratch", "check-temp-"));
  try {
    const dir = recovering(base, batches, change);
    const t = temp(base);
    let filler = "";
    if (label === "full volume") {
      const free = statfsSync(t).bavail * statfsSync(t).bsize;
      filler = join(t, "filler");
      writeFileSync(filler, Buffer.alloc(Math.max(0, free - 800 * 1024)));
    }
    const tempBefore = listing(t);
    const result = open(dir, t);
    const tempAfter = listing(t);
    rows.push({ label, result, tempBefore, tempAfter, tempUnchanged: tempBefore === tempAfter, free_bytes_in_temp: existsSync(t) ? statfsSync(t).bavail * statfsSync(t).bsize : null });
    if (filler) rmSync(filler, { force: true });
    try { chmodSync(t, 0o700); } catch {}
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
}
writeFileSync(join(evidence, "result.json"), JSON.stringify(rows, null, 2));
console.log(JSON.stringify(rows, null, 1));
for (const row of rows) {
  assert.equal(row.tempUnchanged, true, row.label);
  if (row.label.startsWith("foreign"))
    assert.equal(row.result.reason, "foreign_catalog");
  else if (row.label === "normal") assert.equal(row.result.opened, true);
  else assert.equal(row.result.reason, "check_unavailable", row.label);
}

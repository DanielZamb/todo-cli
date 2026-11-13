import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  symlinkSync,
  unlinkSync,
} from "node:fs";
import { join, resolve } from "node:path";

// An access denial is not a fact about the files: a good private store whose
// data is denied by a policy outside it must answer retrying with no files.
// A file or directory that really is not private keeps its true refusal.
// Usage: <checkout> <evidence-dir>
const root = resolve(process.argv[2] ?? ".");
const evidence = resolve(process.argv[3] ?? "docs/evidence/ui-speed/recordings-access-denial");
mkdirSync(evidence, { recursive: true });
const { RecordingDatabase } = await import(join(root, "packages/domain/src/recordings-sqlite.ts"));
const open = (dir: string, profile?: string) => {
  const script = `const { RecordingDatabase } = await import(${JSON.stringify(join(root, "packages/domain/src/recordings-sqlite.ts"))});
const { recordingRefusalGuidance, presentRecordingFiles } = await import(${JSON.stringify(join(root, "packages/domain/src/recording-database.ts"))});
try { new RecordingDatabase(${JSON.stringify(dir)}).close(); console.log(JSON.stringify({ opened: true })); }
catch (e) { const g = e.reason ? recordingRefusalGuidance(${JSON.stringify(dir)}, e.reason, presentRecordingFiles(${JSON.stringify(dir)}), e.detail) : null;
console.log(JSON.stringify({ opened: false, reason: e.reason, detail: e.detail, state: g?.state, files: g?.files?.length, advice: g ? /remove/.test(g.recovery) : null, explanation: g?.explanation })); }`;
  const argv = profile
    ? ["/usr/bin/sandbox-exec", "-p", profile, "bun", "-e", script]
    : ["bun", "-e", script];
  const r = spawnSync(argv[0] as string, argv.slice(1), { encoding: "utf8" });
  return JSON.parse(r.stdout.trim().split("\n").pop() || "{}");
};
const deny = (path: string) =>
  `(version 1)(allow default)(deny file-read-data file-write-data (literal ${JSON.stringify(path)}))`;
const denyCreate = (dir: string) =>
  `(version 1)(allow default)(deny file-write-create (subpath ${JSON.stringify(dir)}))`;
const rows: Array<Record<string, unknown>> = [];
const run = (label: string, build: (dir: string) => string | undefined, expect: (r: any) => void) => {
  const base = mkdtempSync(join(root, ".scratch", "access-denial-"));
  const dir = join(base, "rec");
  try {
    const profile = build(dir);
    const before = readdirSync(dir).sort().join(",");
    const result = open(dir, profile);
    let failure: string | undefined;
    try {
      expect(result);
    } catch (error) {
      failure = String(error).slice(0, 200);
    }
    rows.push({
      label,
      result,
      listingUnchanged: before === readdirSync(dir).sort().join(","),
      ...(failure ? { failure } : {}),
    });
  } finally {
    try { chmodSync(dir, 0o700); } catch {}
    for (const name of ["recordings.db"]) try { chmodSync(join(dir, name), 0o600); } catch {}
    rmSync(base, { recursive: true, force: true });
  }
};
const good = (dir: string) => new RecordingDatabase(dir).close();
const retrying = (stage: string) => (r: any) => {
  assert.equal(r.reason, "check_unavailable", JSON.stringify(r));
  assert.equal(r.detail, stage);
  assert.equal(r.files, 0);
  assert.equal(r.advice, false);
};
const refused = (reason: string) => (r: any) => {
  assert.equal(r.reason, reason, JSON.stringify(r));
  assert.equal(r.state, "refused");
};
run("good store, data of recordings.db denied", (d) => { good(d); return deny(join(d, "recordings.db")); }, retrying("main open: EPERM"));
run("good store, data of recordings.db-wal denied", (d) => { good(d); return deny(join(d, "recordings.db-wal")); }, retrying("wal open: EPERM"));
run("good empty directory, file creation denied", (d) => { mkdirSync(d, { mode: 0o700 }); return denyCreate(d); }, retrying("main create: EPERM"));
run("recordings.db without owner read permission", (d) => { good(d); chmodSync(join(d, "recordings.db"), 0o200); return undefined; }, refused("not_private"));
run("a directory in place of recordings.db", (d) => { mkdirSync(join(d, "recordings.db"), { recursive: true }); return undefined; }, refused("not_private"));
run("a symbolic link in place of recordings.db", (d) => { good(d); mkdirSync(join(d, "..", "elsewhere")); good(join(d, "..", "elsewhere")); unlinkSync(join(d, "recordings.db")); symlinkSync(join(d, "..", "elsewhere", "recordings.db"), join(d, "recordings.db")); return undefined; }, refused("not_private"));
run("recordings directory without owner write permission", (d) => { mkdirSync(d, { mode: 0o700 }); chmodSync(d, 0o500); return undefined; }, refused("directory_not_private"));
console.log(JSON.stringify(rows, null, 1));
await Bun.write(join(evidence, "result.json"), JSON.stringify(rows, null, 2));
assert.deepEqual(
  rows.filter((row) => row.failure || !row.listingUnchanged).map((row) => row.label),
  [],
);

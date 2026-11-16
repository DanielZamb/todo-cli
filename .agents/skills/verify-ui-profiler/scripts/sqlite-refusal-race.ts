import assert from "node:assert/strict";
import { Database } from "bun:sqlite";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(process.argv[2] ?? ".");
const { RecordingDatabase } = await import(
  join(root, "packages/domain/src/recordings-sqlite.ts")
);
const files = (dir: string) =>
  new Map(
    readdirSync(dir)
      .sort()
      .map((name) => [
        name,
        {
          bytes: readFileSync(join(dir, name)),
          mode: statSync(join(dir, name)).mode & 0o777,
        },
      ]),
  );
const ranges = (a: Buffer, b: Buffer) => {
  const out: Array<[number, number]> = [];
  for (let i = 0; i < Math.max(a.length, b.length); i++)
    if (a[i] !== b[i]) {
      const last = out.at(-1);
      if (last && last[1] === i - 1) last[1] = i;
      else out.push([i, i]);
    }
  return out;
};
const diff = (
  before: ReturnType<typeof files>,
  after: ReturnType<typeof files>,
) =>
  [...new Set([...before.keys(), ...after.keys()])].flatMap((name) => {
    const b = before.get(name),
      a = after.get(name);
    if (!b) return [{ name, change: "created", bytes: a?.bytes.length }];
    if (!a) return [{ name, change: "removed" }];
    const changed = ranges(b.bytes, a.bytes);
    return changed.length || b.mode !== a.mode
      ? [{ name, change: "rewritten", ranges: changed, mode: [b.mode, a.mode] }]
      : [];
  });
const rows = [];
for (const scenario of ["live-writer-catalog", "path-removed"] as const) {
  const base = mkdtempSync(join(tmpdir(), "todo-refusal-race-"));
  const dir = join(base, "store");
  mkdirSync(dir, { mode: 0o700 });
  const path = join(dir, "recordings.db");
  const close = Database.prototype.close;
  let peer: Database | undefined;
  try {
    new RecordingDatabase(dir).close();
    if (scenario === "live-writer-catalog") {
      peer = new Database(path);
      peer.query("PRAGMA wal_autocheckpoint=0").get();
      peer.query("SELECT count(*) FROM counters").get();
    }
    let hooked = false;
    let baseline = files(dir);
    Reflect.set(
      Database.prototype,
      "close",
      function (this: Database, ...args: unknown[]) {
        const result = Reflect.apply(close, this, args);
        if (!hooked && String(this.filename).includes("immutable=1")) {
          hooked = true;
          if (scenario === "live-writer-catalog")
            peer?.exec(
              "ALTER TABLE events RENAME COLUMN content TO foreign_content",
            );
          else
            for (const name of readdirSync(dir)) rmSync(join(dir, name));
          baseline = files(dir);
        }
        return result;
      },
    );
    let reason = "opened";
    try {
      new RecordingDatabase(dir).close();
    } catch (error) {
      reason =
        error && typeof error === "object" && "reason" in error
          ? String(error.reason)
          : String(error);
    }
    Reflect.set(Database.prototype, "close", close);
    assert.equal(hooked, true);
    const changes = diff(baseline, files(dir));
    const slots = new Set(
      changes.flatMap((change) =>
        "ranges" in change && change.ranges
          ? (change.ranges as Array<[number, number]>).flatMap(([from, to]) => {
              const all: number[] = [];
              for (let byte = from; byte <= to; byte++)
                all.push(byte >= 104 && byte <= 119 ? (byte - 100) >> 2 : -1);
              return all;
            })
          : [-1],
      ),
    );
    const readMarkOnly =
      changes.every((change) => change.name === "recordings.db-shm") &&
      !slots.has(-1) &&
      slots.size <= 1;
    if (scenario === "live-writer-catalog")
      assert.equal(readMarkOnly, true, JSON.stringify(changes));
    else assert.deepEqual(changes, []);
    rows.push({
      scenario,
      reason,
      read_mark_slots: [...slots],
      read_mark_only: readMarkOnly,
      after_baseline: [...baseline.keys()],
      changes,
      main_exists: existsSync(path),
    });
  } finally {
    Reflect.set(Database.prototype, "close", close);
    peer?.close();
    rmSync(base, { recursive: true, force: true });
  }
}
console.log(JSON.stringify(rows, null, 1));

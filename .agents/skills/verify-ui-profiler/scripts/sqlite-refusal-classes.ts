import { Database } from "bun:sqlite";
import { createHash } from "node:crypto";
import {
  chmodSync,
  copyFileSync,
  linkSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

// Runs every enumerable refusal class and the two SQL11 recovery shapes
// against the RecordingDatabase of a checkout root, using only the API both
// 6d653742 and later heads share. Prints one JSON row per case.
const root = resolve(process.argv[2] ?? ".");
const { RecordingDatabase } = await import(
  join(root, "packages/domain/src/recordings-sqlite.ts")
);
const snapshot = (dir: string) =>
  JSON.stringify({
    mode: statSync(dir).mode & 0o777,
    files: readdirSync(dir)
      .sort()
      .map((name) => {
        const path = join(dir, name);
        return [
          name,
          statSync(path).mode & 0o777,
          createHash("sha256").update(readFileSync(path)).digest("hex"),
        ];
      }),
  });
const committedWal = (base: string, dir: string, change: string) => {
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
};
const fresh = (dir: string) => new RecordingDatabase(dir).close();
const damage = (dir: string, between?: () => void) => {
  fresh(dir);
  const path = join(dir, "recordings.db");
  const probe = new Database(path, { readonly: true });
  const page =
    probe
      .query<{ rootpage: number }, []>(
        "SELECT rootpage FROM sqlite_schema WHERE name='runs'",
      )
      .get()?.rootpage ?? 0;
  probe.close();
  between?.();
  const bytes = readFileSync(path);
  const at = (page - 1) * bytes.readUInt16BE(16);
  bytes.fill(0xff, at, at + 8);
  writeFileSync(path, bytes);
};
const cases: Record<string, (base: string, dir: string) => void> = {
  "wal-column": (b, d) => {
    fresh(d);
    committedWal(b, d, "ALTER TABLE events RENAME COLUMN content TO x_content");
  },
  "wal-version": (b, d) => {
    fresh(d);
    committedWal(b, d, "PRAGMA user_version=7");
  },
  "wal-id": (b, d) => {
    fresh(d);
    committedWal(b, d, "PRAGMA application_id=7");
  },
  "wal-trigger": (b, d) => {
    fresh(d);
    committedWal(b, d, "DROP TRIGGER sequence_conflict");
  },
  "foreign-sqlite": (_, d) => {
    const db = new Database(join(d, "recordings.db"));
    db.exec("CREATE TABLE tasks(id TEXT)");
    db.close();
  },
  "not-sqlite": (_, d) =>
    writeFileSync(join(d, "recordings.db"), "Foreign text, not SQLite"),
  "main-index": (_, d) => {
    fresh(d);
    const db = new Database(join(d, "recordings.db"));
    db.exec("DROP INDEX event_age");
    db.close();
  },
  "hot-journal": (_, d) => {
    fresh(d);
    writeFileSync(join(d, "recordings.db-journal"), Buffer.alloc(512, 1));
  },
  "hard-link": (b, d) => {
    fresh(d);
    linkSync(join(d, "recordings.db"), join(b, "second-name"));
  },
  "interrupted-nonempty-journal": (_, d) => {
    writeFileSync(join(d, "recordings.db"), "");
    writeFileSync(join(d, "recordings.db-journal"), Buffer.alloc(512, 7));
  },
  "missing-main-nonempty-wal": (_, d) =>
    writeFileSync(join(d, "recordings.db-wal"), Buffer.alloc(32, 7)),
  "empty-main-nonempty-shm": (_, d) => {
    writeFileSync(join(d, "recordings.db"), "");
    writeFileSync(join(d, "recordings.db-shm"), Buffer.alloc(32768, 7));
  },
  "sql11-interrupted-empty-journal": (_, d) => {
    writeFileSync(join(d, "recordings.db"), "");
    writeFileSync(join(d, "recordings.db-journal"), "");
  },
  "sql11-deleted-main-empty-sidecars": (_, d) => {
    fresh(d);
    for (const side of ["-wal", "-shm"])
      writeFileSync(join(d, `recordings.db${side}`), "");
    unlinkSync(join(d, "recordings.db"));
  },
  "integrity-main-only": (_, d) => damage(d),
  "integrity-with-wal-frames": (b, d) => {
    damage(d, () =>
      committedWal(b, d, "INSERT INTO counters VALUES('peer_row',1)"),
    );
  },
  "control-benign-wal-row": (b, d) => {
    fresh(d);
    committedWal(b, d, "INSERT INTO counters VALUES('peer_row',1)");
  },
};
const rows = [];
for (const [name, prepare] of Object.entries(cases)) {
  const base = mkdtempSync(join(tmpdir(), "todo-refusal-classes-"));
  const dir = join(base, "store");
  mkdirSync(dir, { mode: 0o700 });
  try {
    prepare(base, dir);
    for (const file of readdirSync(dir))
      if (!lstatSync(join(dir, file)).isSymbolicLink())
        chmodSync(join(dir, file), 0o640);
    chmodSync(dir, 0o750);
    const before = snapshot(dir);
    let outcome = "opened";
    let reason: string | undefined;
    try {
      new RecordingDatabase(dir).close();
    } catch (error) {
      outcome = error instanceof Error ? error.message : String(error);
      reason =
        error && typeof error === "object" && "reason" in error
          ? String(error.reason)
          : undefined;
    }
    const after = snapshot(dir);
    rows.push({
      case: name,
      outcome,
      ...(reason ? { reason } : {}),
      files_unchanged: before === after,
      changed: (() => {
        const b = new Map<string, string>(
          JSON.parse(before).files.map((f: string[]) => [f[0], JSON.stringify(f)]),
        );
        const c = new Map<string, string>(
          JSON.parse(after).files.map((f: string[]) => [f[0], JSON.stringify(f)]),
        );
        return [...new Set([...b.keys(), ...c.keys()])]
          .filter((name) => b.get(name) !== c.get(name))
          .map((name) =>
            !b.has(name)
              ? `${name} created`
              : !c.has(name)
                ? `${name} removed`
                : `${name} rewritten`,
          );
      })(),
      files_after: readdirSync(dir).sort(),
    });
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
}
console.log(JSON.stringify(rows, null, 1));

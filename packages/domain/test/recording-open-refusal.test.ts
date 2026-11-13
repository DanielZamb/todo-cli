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
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "@effect/vitest";
import {
  RecordingOpenRefusal,
  recordingRefusalGuidance,
} from "../src/recording-database.ts";
import { DiagnosticRecordings } from "../src/recordings.ts";
import { RecordingDatabase } from "../src/recordings-sqlite.ts";

const snapshot = (dir: string) => ({
  mode: statSync(dir).mode & 0o777,
  files: readdirSync(dir)
    .sort()
    .map((name) => {
      const path = join(dir, name);
      return {
        name,
        mode: statSync(path).mode & 0o777,
        sha256: createHash("sha256").update(readFileSync(path)).digest("hex"),
      };
    }),
});
const refusal = (dir: string) => {
  try {
    new RecordingDatabase(dir).close();
  } catch (error) {
    if (error instanceof RecordingOpenRefusal)
      return { reason: error.reason, message: error.message };
    throw error;
  }
  return { reason: "opened", message: "" };
};
const scratch = () => mkdtempSync(join(tmpdir(), "todo-recording-refusal-"));
const owned = (root: string, name = "store") => {
  const dir = join(root, name);
  mkdirSync(dir);
  new RecordingDatabase(dir).close();
  return dir;
};
// Leaves `dir` as a byte-identical genuine main file plus a WAL holding one
// committed, un-checkpointed transaction, with no -shm file.
const committedWal = (root: string, dir: string, change: string) => {
  const work = join(root, "work");
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

for (const [label, change, reason] of [
  [
    "a renamed column",
    "ALTER TABLE events RENAME COLUMN content TO foreign_content",
    "foreign_catalog",
  ],
  ["another user_version", "PRAGMA user_version=7", "foreign_header"],
  ["another application_id", "PRAGMA application_id=7", "foreign_header"],
] as const)
  it(`SQL10 refuses ${label} committed only in the WAL and leaves every file byte-identical`, () => {
    const root = scratch();
    try {
      const dir = owned(root);
      const genuine = readFileSync(join(dir, "recordings.db"));
      committedWal(root, dir, change);
      expect(readFileSync(join(dir, "recordings.db")).equals(genuine)).toBe(
        true,
      );
      expect(statSync(join(dir, "recordings.db-wal")).size).toBeGreaterThan(0);
      const before = snapshot(dir);
      expect(refusal(dir)).toEqual({
        reason,
        message: "Foreign database refused",
      });
      expect(snapshot(dir)).toEqual(before);
      expect(readdirSync(dir).sort()).toEqual([
        "recordings.db",
        "recordings.db-wal",
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

it("SQL10 control: a benign committed WAL row is our own store and opens", () => {
  const root = scratch();
  try {
    const dir = owned(root);
    committedWal(root, dir, "INSERT INTO counters VALUES('peer_row',1)");
    const db = new RecordingDatabase(dir);
    try {
      expect(
        db.db.query("SELECT value FROM counters WHERE name='peer_row'").get(),
      ).toEqual({ value: 1 });
    } finally {
      db.close();
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

it("SQL10 refuses a database swapped onto the path after the preflight and leaves both its files byte-identical", () => {
  const root = scratch();
  const close = Database.prototype.close;
  try {
    const dir = owned(root);
    const task = join(root, "task");
    mkdirSync(task);
    const peer = new Database(join(task, "todo.db"));
    peer.exec(
      "PRAGMA journal_mode=WAL; PRAGMA wal_autocheckpoint=0; CREATE TABLE tasks(id TEXT, title TEXT); INSERT INTO tasks VALUES('t1','Scratch Task before swap')",
    );
    copyFileSync(join(task, "todo.db-wal"), join(root, "captured-wal"));
    copyFileSync(join(task, "todo.db"), join(root, "captured-main"));
    peer.close();
    let swapped = false;
    let before = snapshot(dir);
    Reflect.set(
      Database.prototype,
      "close",
      function (this: Database, ...args: unknown[]) {
        const result = Reflect.apply(close, this, args);
        if (!swapped && String(this.filename).includes("immutable=1")) {
          swapped = true;
          for (const side of ["-wal", "-shm"])
            rmSync(join(dir, `recordings.db${side}`), { force: true });
          renameSync(
            join(root, "captured-wal"),
            join(dir, "recordings.db-wal"),
          );
          renameSync(join(root, "captured-main"), join(dir, "recordings.db"));
          before = snapshot(dir);
        }
        return result;
      },
    );
    const outcome = refusal(dir);
    Reflect.set(Database.prototype, "close", close);
    expect(swapped).toBe(true);
    expect(outcome).toEqual({
      reason: "replaced",
      message: "Foreign database refused",
    });
    expect(snapshot(dir)).toEqual(before);
    expect(readFileSync(join(dir, "recordings.db")).readUInt32BE(68)).toBe(0);
  } finally {
    Reflect.set(Database.prototype, "close", close);
    rmSync(root, { recursive: true, force: true });
  }
});

it("SQL11 initializes a store whose initializer died before its first commit with an empty journal", () => {
  const root = scratch();
  try {
    const dir = join(root, "store");
    mkdirSync(dir, { mode: 0o700 });
    writeFileSync(join(dir, "recordings.db"), "", { mode: 0o600 });
    writeFileSync(join(dir, "recordings.db-journal"), "", { mode: 0o600 });
    const db = new RecordingDatabase(dir);
    expect(db.db.query("PRAGMA application_id").get()).toEqual({
      application_id: 0x544f4452,
    });
    db.close();
    expect(readdirSync(dir).includes("recordings.db-journal")).toBe(false);
    expect(refusal(dir).reason).toBe("opened");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

it("SQL11 initializes after only recordings.db was deleted beside empty -wal and -shm files", () => {
  const root = scratch();
  try {
    const dir = owned(root);
    for (const side of ["-wal", "-shm"])
      writeFileSync(join(dir, `recordings.db${side}`), "", { mode: 0o600 });
    unlinkSync(join(dir, "recordings.db"));
    expect(readdirSync(dir).sort()).toEqual([
      "recordings.db-shm",
      "recordings.db-wal",
    ]);
    const db = new RecordingDatabase(dir);
    expect(db.status().segments).toBe(0);
    db.close();
    expect(refusal(dir).reason).toBe("opened");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

for (const [label, main, side, bytes, reason] of [
  [
    "an interrupted initialization with a non-empty journal",
    "",
    "-journal",
    512,
    "interrupted_initialization",
  ],
  [
    "a missing main beside a non-empty WAL",
    undefined,
    "-wal",
    32,
    "foreign_sidecar",
  ],
  [
    "an empty main beside a non-empty shm",
    "",
    "-shm",
    32768,
    "foreign_sidecar",
  ],
  [
    "a missing main beside a non-empty journal",
    undefined,
    "-journal",
    512,
    "foreign_sidecar",
  ],
] as const)
  it(`SQL11 still refuses ${label} and leaves it untouched`, () => {
    const root = scratch();
    try {
      const dir = join(root, "store");
      mkdirSync(dir, { mode: 0o750 });
      if (main !== undefined)
        writeFileSync(join(dir, "recordings.db"), main, { mode: 0o640 });
      writeFileSync(join(dir, `recordings.db${side}`), Buffer.alloc(bytes, 7), {
        mode: 0o640,
      });
      for (const other of ["-wal", "-shm"])
        if (other !== side && main === "")
          writeFileSync(join(dir, `recordings.db${other}`), "", {
            mode: 0o600,
          });
      chmodSync(dir, 0o750);
      const before = snapshot(dir);
      expect(refusal(dir).reason).toBe(reason);
      expect(snapshot(dir)).toEqual(before);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

const classes: Array<
  readonly [string, string, (root: string, dir: string) => void]
> = [
  [
    "a foreign SQLite database",
    "foreign_header",
    (_, dir) => {
      const db = new Database(join(dir, "recordings.db"));
      db.exec("PRAGMA journal_mode=WAL; CREATE TABLE tasks(id TEXT)");
      db.close();
    },
  ],
  [
    "bytes that are not SQLite",
    "foreign_header",
    (_, dir) =>
      writeFileSync(join(dir, "recordings.db"), "Foreign text, not SQLite"),
  ],
  [
    "a main-file catalog change",
    "foreign_catalog",
    (_, dir) => {
      new RecordingDatabase(dir).close();
      const db = new Database(join(dir, "recordings.db"));
      db.exec("DROP INDEX event_age");
      db.close();
    },
  ],
  [
    "a WAL catalog change",
    "foreign_catalog",
    (root, dir) => {
      new RecordingDatabase(dir).close();
      committedWal(root, dir, "DROP TRIGGER sequence_conflict");
    },
  ],
  [
    "a non-empty journal beside our store",
    "hot_journal",
    (_, dir) => {
      new RecordingDatabase(dir).close();
      writeFileSync(join(dir, "recordings.db-journal"), Buffer.alloc(512, 1));
    },
  ],
  [
    "a hard-linked main file",
    "not_private",
    (root, dir) => {
      new RecordingDatabase(dir).close();
      linkSync(join(dir, "recordings.db"), join(root, "second-name"));
    },
  ],
  [
    "a symbolic-link main file",
    "not_private",
    (root, dir) => {
      const target = join(root, "target");
      mkdirSync(target);
      new RecordingDatabase(target).close();
      symlinkSync(join(target, "recordings.db"), join(dir, "recordings.db"));
    },
  ],
  [
    "a damaged table page",
    "integrity",
    (_, dir) => {
      new RecordingDatabase(dir).close();
      const path = join(dir, "recordings.db");
      const probe = new Database(path, { readonly: true });
      const page = probe
        .query<{ rootpage: number }, []>(
          "SELECT rootpage FROM sqlite_schema WHERE name='counters'",
        )
        .get()?.rootpage;
      probe.close();
      expect(statSync(`${path}-wal`).size).toBe(0);
      const bytes = readFileSync(path);
      const at = ((page ?? 0) - 1) * bytes.readUInt16BE(16);
      bytes.fill(0xff, at, at + 8);
      writeFileSync(path, bytes);
    },
  ],
];
for (const [label, reason, prepare] of classes)
  it(`refuses ${label} as ${reason} and leaves every file, mode and listing unchanged`, () => {
    const root = scratch();
    try {
      const dir = join(root, "store");
      mkdirSync(dir, { mode: 0o700 });
      prepare(root, dir);
      chmodSync(dir, 0o750);
      for (const name of readdirSync(dir))
        if (!lstatSync(join(dir, name)).isSymbolicLink())
          chmodSync(join(dir, name), 0o640);
      const before = snapshot(dir);
      expect(refusal(dir).reason).toBe(reason);
      expect(snapshot(dir)).toEqual(before);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

it("SQL11 names the refusal state, reason, files and the way out", () => {
  expect(
    recordingRefusalGuidance(
      "/scratch/diagnostic-recordings",
      "interrupted_initialization",
      ["recordings.db", "recordings.db-journal"],
    ),
  ).toEqual({
    state: "refused",
    reason: "interrupted_initialization",
    explanation:
      "recordings.db is empty beside a non-empty -journal: initialization stopped before its first commit, and the store cannot prove the journal is its own.",
    files: [
      "/scratch/diagnostic-recordings/recordings.db",
      "/scratch/diagnostic-recordings/recordings.db-journal",
    ],
    recovery:
      "Recordings are diagnostic data and may be discarded; Task service is unaffected. Stop the server, remove /scratch/diagnostic-recordings/recordings.db, /scratch/diagnostic-recordings/recordings.db-journal, then start it again to create an empty store.",
  });
  expect(
    recordingRefusalGuidance(
      "/scratch/diagnostic-recordings",
      "initialization_busy",
      [],
    ),
  ).toEqual({
    state: "retrying",
    reason: "initialization_busy",
    explanation:
      "Another process held recordings.db while it was being created; the server retries in one minute.",
    files: [],
    recovery:
      "Recording retries automatically every minute; Task service is unaffected.",
  });
});

it("SQL11 carries a worker refusal and its present files to the owner's health", async () => {
  const root = scratch();
  try {
    const dir = join(root, "store");
    mkdirSync(dir, { mode: 0o700 });
    writeFileSync(join(dir, "recordings.db"), "", { mode: 0o600 });
    writeFileSync(join(dir, "recordings.db-journal"), Buffer.alloc(512, 7), {
      mode: 0o600,
    });
    const before = snapshot(dir);
    const s = await DiagnosticRecordings.open(dir);
    try {
      expect(s.health()).toEqual({
        condition: "unavailable",
        failures: 1,
        refusal: recordingRefusalGuidance(dir, "interrupted_initialization", [
          "recordings.db",
          "recordings.db-journal",
        ]),
      });
    } finally {
      await s.close();
    }
    expect(snapshot(dir)).toEqual(before);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

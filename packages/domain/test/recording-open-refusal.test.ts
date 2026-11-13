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
    "a damaged table page beside committed WAL frames",
    "integrity",
    (root, dir) => {
      new RecordingDatabase(dir).close();
      const path = join(dir, "recordings.db");
      const probe = new Database(path, { readonly: true });
      const page = probe
        .query<{ rootpage: number }, []>(
          "SELECT rootpage FROM sqlite_schema WHERE name='runs'",
        )
        .get()?.rootpage;
      probe.close();
      committedWal(root, dir, "INSERT INTO counters VALUES('peer_row',1)");
      expect(statSync(`${path}-wal`).size).toBeGreaterThan(0);
      const bytes = readFileSync(path);
      const at = ((page ?? 0) - 1) * bytes.readUInt16BE(16);
      bytes.fill(0xff, at, at + 8);
      writeFileSync(path, bytes);
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

it("R5-1 initializes after only recordings.db is deleted from a really closed store", () => {
  const root = scratch();
  try {
    const dir = owned(root);
    const db = new RecordingDatabase(dir);
    db.close();
    const shm = statSync(join(dir, "recordings.db-shm")).size;
    expect(shm).toBeGreaterThan(0);
    expect(statSync(join(dir, "recordings.db-wal")).size).toBe(0);
    unlinkSync(join(dir, "recordings.db"));
    const reopened = new RecordingDatabase(dir);
    expect(reopened.db.query("PRAGMA application_id").get()).toEqual({
      application_id: 0x544f4452,
    });
    expect(reopened.status().segments).toBe(0);
    reopened.close();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

for (const [label, build] of [
  [
    "a zero-length -shm hard-linked to another file",
    (dir: string) => {
      writeFileSync(join(dir, "keep.txt"), "", { mode: 0o600 });
      linkSync(join(dir, "keep.txt"), join(dir, "recordings.db-shm"));
    },
  ],
  [
    "a zero-length -wal that is a symbolic link",
    (dir: string) => {
      writeFileSync(join(dir, "elsewhere"), "", { mode: 0o600 });
      symlinkSync(join(dir, "elsewhere"), join(dir, "recordings.db-wal"));
    },
  ],
] as const)
  it(`R5-2 refuses ${label} beside a missing main without creating any file`, () => {
    const root = scratch();
    try {
      const dir = join(root, "store");
      mkdirSync(dir, { mode: 0o700 });
      build(dir);
      const before = snapshot(dir);
      const names = readdirSync(dir).sort();
      expect(refusal(dir).reason).toBe("foreign_sidecar");
      expect(readdirSync(dir).sort()).toEqual(names);
      expect(snapshot(dir)).toEqual(before);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

it("R5-2 explains a sidecar refusal without claiming the sidecar holds data", () => {
  expect(
    recordingRefusalGuidance(
      "/scratch/diagnostic-recordings",
      "foreign_sidecar",
      ["recordings.db-shm"],
    ).explanation,
  ).toBe(
    "recordings.db is missing or empty, and a -wal, -shm or -journal file beside it either holds data the store cannot prove is its own or is not a private regular file.",
  );
});

it("R5-1 initializes an empty main beside a non-empty -shm and an empty -wal, whatever the -shm holds", () => {
  const root = scratch();
  try {
    const dir = join(root, "store");
    mkdirSync(dir, { mode: 0o700 });
    writeFileSync(join(dir, "recordings.db"), "", { mode: 0o600 });
    writeFileSync(join(dir, "recordings.db-wal"), "", { mode: 0o600 });
    writeFileSync(join(dir, "recordings.db-shm"), Buffer.alloc(32768, 7), {
      mode: 0o600,
    });
    const db = new RecordingDatabase(dir);
    expect(db.db.query("PRAGMA application_id").get()).toEqual({
      application_id: 0x544f4452,
    });
    db.close();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

it("R5-3 answers an open it could not read consistently as busy, with nothing to remove", () => {
  expect(
    recordingRefusalGuidance("/scratch/diagnostic-recordings", "store_busy", [
      "recordings.db",
      "recordings.db-wal",
      "recordings.db-shm",
    ]),
  ).toEqual({
    state: "retrying",
    reason: "store_busy",
    explanation:
      "Another process kept writing recordings.db while it was being checked, so no consistent reading was possible; the server retries in one minute.",
    files: [],
    recovery:
      "Recording retries automatically every minute; Task service is unaffected.",
  });
});

const withTmpdir = <A>(value: string, run: () => A) => {
  const previous = process.env.TMPDIR;
  process.env.TMPDIR = value;
  try {
    return run();
  } finally {
    if (previous === undefined) delete process.env.TMPDIR;
    else process.env.TMPDIR = previous;
  }
};
const recoveringStore = (root: string) => {
  const dir = owned(root);
  committedWal(
    root,
    dir,
    "UPDATE counters SET value=value+1 WHERE name='dropped_batches'",
  );
  expect(statSync(join(dir, "recordings.db-wal")).size).toBeGreaterThan(0);
  return dir;
};
const refusalWithDetail = (dir: string) => {
  try {
    new RecordingDatabase(dir).close();
  } catch (error) {
    if (error instanceof RecordingOpenRefusal)
      return { reason: error.reason, detail: error.detail };
    throw error;
  }
  return { reason: "opened", detail: undefined };
};

for (const [label, prepare, detail] of [
  ["missing", (_: string) => undefined, "temporary image create: ENOENT"],
  [
    "read-only",
    (t: string) => {
      mkdirSync(t);
      chmodSync(t, 0o500);
    },
    "temporary image create: EACCES",
  ],
] as const)
  it(`R6-1 answers retrying, not foreign, when the temporary directory is ${label}, and leaves nothing behind`, () => {
    const root = scratch();
    const temp = join(root, "temp");
    try {
      const dir = recoveringStore(root);
      prepare(temp);
      const before = snapshot(dir);
      const outside = readdirSync(root).sort();
      expect(withTmpdir(`${temp}/`, () => refusalWithDetail(dir))).toEqual({
        reason: "check_unavailable",
        detail,
      });
      expect(snapshot(dir)).toEqual(before);
      expect(readdirSync(root).sort()).toEqual(outside);
      if (label === "read-only") expect(readdirSync(temp)).toEqual([]);
      expect(
        recordingRefusalGuidance(
          dir,
          "check_unavailable",
          ["recordings.db"],
          detail,
        ),
      ).toEqual({
        state: "retrying",
        reason: "check_unavailable",
        explanation: `The store could not finish its own check of recordings.db, so nothing was decided about the files; the server retries in one minute. What failed: ${detail}.`,
        files: [],
        recovery:
          "Recording retries automatically every minute; Task service is unaffected.",
      });
    } finally {
      try {
        chmodSync(temp, 0o700);
      } catch {}
      rmSync(root, { recursive: true, force: true });
    }
  });

it("R6-1 still refuses a foreign catalog committed in the WAL while the temporary directory is missing", () => {
  const root = scratch();
  try {
    const dir = owned(root);
    committedWal(root, dir, "DROP TRIGGER sequence_conflict");
    const before = snapshot(dir);
    expect(
      withTmpdir(join(root, "missing") + "/", () => refusalWithDetail(dir)),
    ).toEqual({ reason: "foreign_catalog", detail: undefined });
    expect(snapshot(dir)).toEqual(before);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

it("R6-1 opens a recovering store with a usable temporary directory and leaves it empty", () => {
  const root = scratch();
  const temp = join(root, "temp");
  try {
    const dir = recoveringStore(root);
    mkdirSync(temp);
    expect(withTmpdir(`${temp}/`, () => refusalWithDetail(dir)).reason).toBe(
      "opened",
    );
    expect(readdirSync(temp)).toEqual([]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

it("R6-1 carries a machinery failure to the owner's health as retrying, with what failed", async () => {
  const root = scratch();
  try {
    const dir = recoveringStore(root);
    const before = snapshot(dir);
    const previous = process.env.TMPDIR;
    process.env.TMPDIR = `${join(root, "missing")}/`;
    const s = await DiagnosticRecordings.open(dir);
    if (previous === undefined) delete process.env.TMPDIR;
    else process.env.TMPDIR = previous;
    try {
      expect(s.health()).toEqual({
        condition: "unavailable",
        failures: 1,
        refusal: recordingRefusalGuidance(
          dir,
          "check_unavailable",
          [],
          "temporary image create: ENOENT",
        ),
      });
    } finally {
      await s.close();
    }
    expect(snapshot(dir)).toEqual(before);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

it("R7-1 refuses a main file without owner read permission as not private, after confirming it", () => {
  const root = scratch();
  try {
    const dir = owned(root);
    const before = snapshot(dir);
    chmodSync(join(dir, "recordings.db"), 0o200);
    expect(refusalWithDetail(dir)).toEqual({
      reason: "not_private",
      detail: undefined,
    });
    chmodSync(join(dir, "recordings.db"), 0o600);
    expect(snapshot(dir)).toEqual(before);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

it("R7-1 words an unwritable recordings directory as a fact about the directory", () => {
  const root = scratch();
  const dir = join(root, "store");
  try {
    mkdirSync(dir, { mode: 0o700 });
    chmodSync(dir, 0o500);
    expect(refusalWithDetail(dir)).toEqual({
      reason: "directory_not_private",
      detail: undefined,
    });
    expect(readdirSync(dir)).toEqual([]);
    expect(recordingRefusalGuidance(dir, "directory_not_private", [])).toEqual({
      state: "refused",
      reason: "directory_not_private",
      explanation:
        "The recordings directory is not this user's private directory: it is not a directory, or its owner or owner read, write and search permission is not the server's, so the store cannot create or open its files.",
      files: [dir],
      recovery: `Recordings are diagnostic data and may be discarded; Task service is unaffected. Stop the server, give ${dir} back to this user as a directory with owner read, write and search permission, or remove it, then start it again.`,
    });
  } finally {
    chmodSync(dir, 0o700);
    rmSync(root, { recursive: true, force: true });
  }
});

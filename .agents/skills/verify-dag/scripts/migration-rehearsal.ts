import { constants, Database } from "bun:sqlite";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { Effect, Schema } from "effect";
import { Task } from "../../../../packages/domain/src/entities.ts";
import { Event } from "../../../../packages/domain/src/events.ts";
import { authMigrationSql } from "../../../../packages/domain/src/store/0003.ts";
import { profileMigrationSql } from "../../../../packages/domain/src/store/0004.ts";
import { migrateExternalId } from "../../../../packages/domain/src/store/0005.ts";
import { attachmentMigrationSql } from "../../../../packages/domain/src/store/0006.ts";
import { applyEvent } from "../../../../packages/domain/src/store/projection.ts";
import { OperationStore } from "../../../../packages/domain/src/store/store.ts";

import {
  repositoryPath,
  verificationRoot,
} from "../../../../scripts/verification-inputs.ts";

const root = verificationRoot(process.env.TODO_REHEARSAL_REPO ?? process.cwd());
assert.ok(
  root && existsSync(join(root, "packages/domain/test/fixtures/legacy.sql")),
);
const quote = (s: string) => `"${s.replaceAll('"', '""')}"`;
const canonical = (x: unknown): string =>
  JSON.stringify(x, (_k, v) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .map((k) => [k, v[k]]),
        )
      : v,
  );
const sha = (s: string | Buffer) =>
  createHash("sha256").update(s).digest("hex");
const tables = (db: Database) =>
  db
    .query<{ name: string }, []>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    )
    .all()
    .map((x) => x.name);
const rows = (db: Database, table: string, columns?: string[]) =>
  db
    .query<Record<string, unknown>, []>(
      `SELECT ${columns ? columns.map(quote).join(",") : "*"} FROM ${quote(table)}`,
    )
    .all()
    .sort((a, b) => canonical(a).localeCompare(canonical(b)));
const capture = (path: string, mode: "standalone" | "live" = "standalone") => {
  const uri = pathToFileURL(path);
  uri.searchParams.set("mode", "ro");
  uri.searchParams.set("immutable", "1");
  if (mode === "standalone") {
    assert.ok(
      !existsSync(path + "-wal") && !existsSync(path + "-shm"),
      "Immutable capture requires a standalone copy without WAL sidecars",
    );
  }
  const db =
    mode === "standalone"
      ? new Database(
          uri.href,
          constants.SQLITE_OPEN_READONLY | constants.SQLITE_OPEN_URI,
        )
      : new Database(path, { readonly: true, strict: true });
  try {
    return {
      version: db
        .query<{ user_version: number }, []>("PRAGMA user_version")
        .get()!.user_version,
      schema: db
        .query(
          "SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name",
        )
        .all(),
      tables: tables(db).map((name) => ({
        name,
        columns: db
          .query<{ name: string }, []>(`PRAGMA table_xinfo(${quote(name)})`)
          .all()
          .map((x) => x.name),
        rows: rows(db, name),
      })),
    };
  } finally {
    db.close();
  }
};
const profileCounts = (state: ReturnType<typeof capture>) =>
  Object.fromEntries(
    [
      ...new Set(
        (state.tables.find((t) => t.name === "tasks")?.rows ?? []).map((r) =>
          String(r.profile_id ?? r.user_id),
        ),
      ),
    ]
      .sort()
      .map((profile) => [
        profile,
        (state.tables.find((t) => t.name === "tasks")?.rows ?? []).filter(
          (r) => String(r.profile_id ?? r.user_id) === profile,
        ).length,
      ]),
  );
const summary = (state: ReturnType<typeof capture>) => ({
  version: state.version,
  taskCountsByProfile: profileCounts(state),
  tables: Object.fromEntries(
    state.tables.map((t) => [
      t.name,
      { count: t.rows.length, sha256: sha(canonical(t.rows)) },
    ]),
  ),
});
const count = (state: ReturnType<typeof capture>, name: string) =>
  state.tables.find((t) => t.name === name)?.rows.length ?? 0;
const guardPath = (path: string) =>
  assert.ok(
    basename(dirname(path)).startsWith("todo-dag-migration-") ||
      path.includes("/todo-dag-migration-"),
    "Only explicitly named scratch/private-copy directories",
  );

if (process.argv[2] === "--private-open") {
  const path = resolve(process.argv[3] ?? ""),
    out = resolve(process.argv[4] ?? "");
  guardPath(path);
  assert.ok(out.startsWith(dirname(path) + "/"));
  console.log("READER STEP immutable pre-open capture");
  const beforeHash = sha(readFileSync(path));
  const before = capture(path);
  assert.equal(
    sha(readFileSync(path)),
    beforeHash,
    "Pre-open capture must not change the copy",
  );
  assert.ok(!existsSync(path + "-wal") && !existsSync(path + "-shm"));
  console.log("READER STEP open copied database");
  const start = performance.now();
  const store = new OperationStore({
    path,
    attachmentRoot: join(dirname(path), "attachments"),
  });
  const openMs = performance.now() - start;
  try {
    console.log("READER STEP capture live migrated state");
    const after = capture(path, "live");
    const snapshots = await Effect.runPromise(store.snapshots.list());
    const current = await Effect.runPromise(store.tasks());
    console.log("READER STEP replay copied History");
    const replayed = await Effect.runPromise(store.rebuild());
    assert.equal(canonical(replayed), canonical(current));
    console.log("READER STEP write report");
    writeFileSync(
      out,
      JSON.stringify(
        {
          before: summary(before),
          after: summary(after),
          beforeCapture: {
            mode: "immutable",
            fileSHA256: beforeHash,
            fileUnchanged: true,
            sidecarsCreated: false,
          },
          openMs,
          taskReplayEqual: true,
          snapshots: snapshots.snapshots.map((x) => ({
            id: x.id,
            reason: x.reason,
            schema_version: x.schema_version,
            size: x.size,
          })),
          privateDataNotPrinted: true,
        },
        null,
        2,
      ) + "\n",
    );
  } finally {
    console.log("READER STEP close copied database");
    await Effect.runPromise(store.close());
  }
} else {
  const evidence = repositoryPath(
    root,
    process.argv[2] ?? "",
    "migration rehearsal evidence",
  );
  assert.ok(evidence.startsWith(root + "/docs/evidence/task-dag/"));
  assert.ok(!existsSync(evidence));
  mkdirSync(evidence, { recursive: true });
  const scratch = mkdtempSync(join(tmpdir(), "todo-dag-migration-"));
  const results: unknown[] = [];
  const seed = (
    version: number,
    path: string,
    large = false,
    empty = false,
  ) => {
    const db = new Database(path, { strict: true });
    db.function("domain_write_allowed", () => 1);
    try {
      if (empty) return;
      if (version < 2) {
        db.exec(
          readFileSync(
            join(root, "packages/domain/test/fixtures/0001_init.sql"),
            "utf8",
          ),
        );
        db.exec(
          readFileSync(
            join(root, "packages/domain/test/fixtures/legacy.sql"),
            "utf8",
          ),
        );
        db.exec(`PRAGMA user_version=${version}`);
        return;
      }
      db.exec(
        readFileSync(
          join(root, "packages/domain/test/fixtures/v2-recurrence.sql"),
          "utf8",
        ),
      );
      if (version >= 3) db.exec(authMigrationSql);
      if (version >= 4) db.exec(profileMigrationSql);
      if (version >= 5) migrateExternalId(db);
      if (version >= 6) db.exec(attachmentMigrationSql);
      if (large)
        db.transaction(() => {
          for (let i = 0; i < 9999; i++) {
            const task = Schema.decodeUnknownSync(Task)({
              id: `synthetic-${String(i).padStart(5, "0")}`,
              profile_id: "work",
              entity_version: 1,
              row_version: 1,
              title: `Synthetic migration Task ${i}`,
              description: null,
              status: "open",
              project_id: null,
              priority: "P3",
              scheduled_at: null,
              due_at: null,
              energy: null,
              estimate_min: null,
              source: "manual",
              tags: [],
              occurrence: null,
              created_at: "2026-11-01T00:00:00.000Z",
              updated_at: "2026-11-01T00:00:00.000Z",
              completed_at: null,
              deleted_at: null,
            });
            const event = Schema.decodeUnknownSync(Event)({
              kind: "TaskCreated",
              entity_version: 1,
              occurred_at: task.created_at,
              task,
              series: null,
              project: null,
              tags: [],
            });
            db.query(
              "INSERT INTO op_log(actor,profile,entity_version,event,from_version,to_version,outcome,reason) VALUES ('scratch-rehearsal','work',1,?,NULL,1,'committed',NULL)",
            ).run(JSON.stringify(event));
            applyEvent(db, event, task.profile_id);
          }
        }).immediate();
    } finally {
      db.close();
    }
  };
  try {
    for (const spec of [
      { name: "empty-0", version: 0, empty: true },
      { name: "legacy-0", version: 0 },
      { name: "legacy-1", version: 1 },
      ...[2, 3, 4, 5, 6].map((version) => ({
        name: `schema-${version}`,
        version,
      })),
      { name: "large-schema-6", version: 6, large: true },
      { name: "purge-journal-schema-6", version: 6, purge: true },
      { name: "wal-backup-schema-6", version: 6, walBackup: true },
    ]) {
      const dir = join(scratch, spec.name);
      mkdirSync(dir);
      const path = join(dir, "todo.db");
      guardPath(path);
      const walCase = "walBackup" in spec && spec.walBackup;
      seed(
        spec.version,
        walCase ? join(dir, "wal-source.db") : path,
        "large" in spec && spec.large,
        "empty" in spec && spec.empty,
      );
      let walBackup:
        | { path: string; sha256: string; header: number[] }
        | undefined;
      if (walCase) {
        const sourcePath = join(dir, "wal-source.db"),
          source = new Database(sourcePath);
        const backupPath = join(dir, "source-before-open.sqlite");
        try {
          source.exec(
            "PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA synchronous=FULL; PRAGMA user_version=6;",
          );
          const argv = [
            "-init",
            "/dev/null",
            "-readonly",
            sourcePath,
            `.backup '${backupPath}'`,
          ];
          const copied = spawnSync("/usr/bin/sqlite3", argv, {
            env: { ...process.env, HOME: dir },
            encoding: "utf8",
          });
          writeFileSync(
            join(evidence, "wal-backup-copy.json"),
            JSON.stringify(
              {
                command: ["/usr/bin/sqlite3", ...argv],
                exit: copied.status,
                stderr: copied.stderr,
              },
              null,
              2,
            ),
          );
          assert.equal(copied.status, 0, copied.stderr);
        } finally {
          source.close();
        }
        chmodSync(backupPath, 0o400);
        copyFileSync(backupPath, path);
        chmodSync(path, 0o600);
        const header = [...readFileSync(path).subarray(18, 20)];
        assert.deepEqual(header, [2, 2]);
        walBackup = {
          path: backupPath,
          sha256: sha(readFileSync(backupPath)),
          header,
        };
        assert.ok(!existsSync(path + "-wal") && !existsSync(path + "-shm"));
      }
      const purge = "purge" in spec && spec.purge;
      if (purge) {
        mkdirSync(join(dir, "snapshots"));
        writeFileSync(
          join(dir, "snapshots/purged.json"),
          JSON.stringify(["legacy-1"]),
        );
      }
      const beforeHash = sha(readFileSync(path));
      const before = capture(path),
        expectedTasks =
          "empty" in spec && spec.empty
            ? 0
            : "large" in spec && spec.large
              ? 10001
              : 2;
      if (walBackup) {
        assert.equal(sha(readFileSync(path)), beforeHash);
        assert.equal(sha(readFileSync(walBackup.path)), walBackup.sha256);
        assert.ok(!existsSync(path + "-wal") && !existsSync(path + "-shm"));
        const uri = pathToFileURL(path);
        uri.searchParams.set("mode", "ro");
        uri.searchParams.set("immutable", "1");
        const ro = new Database(
          uri.href,
          constants.SQLITE_OPEN_READONLY | constants.SQLITE_OPEN_URI,
        );
        try {
          assert.throws(() => ro.exec("PRAGMA user_version=7"), /readonly/);
        } finally {
          ro.close();
        }
        assert.equal(sha(readFileSync(path)), beforeHash);
        assert.ok(!existsSync(path + "-wal") && !existsSync(path + "-shm"));
        const privateDir = join(dir, "private-entry");
        mkdirSync(privateDir);
        const privatePath = join(privateDir, "todo.db"),
          resultPath = join(privateDir, "rehearsal.json");
        copyFileSync(walBackup.path, privatePath);
        chmodSync(privatePath, 0o600);
        const child = spawnSync(
          process.execPath,
          ["--private-open", privatePath, resultPath],
          {
            env: { ...process.env, TODO_REHEARSAL_REPO: root, HOME: dir },
            encoding: "utf8",
            timeout: 60000,
          },
        );
        writeFileSync(
          join(evidence, "wal-private-entry.json"),
          JSON.stringify(
            { exit: child.status, stdout: child.stdout, stderr: child.stderr },
            null,
            2,
          ),
        );
        assert.equal(child.status, 0, child.stderr);
        const privateResult = Schema.decodeUnknownSync(
          Schema.Struct({
            before: Schema.Struct({ version: Schema.Int }),
            after: Schema.Struct({ version: Schema.Int }),
            taskReplayEqual: Schema.Boolean,
            beforeCapture: Schema.Struct({
              mode: Schema.String,
              fileUnchanged: Schema.Boolean,
              sidecarsCreated: Schema.Boolean,
            }),
          }),
        )(JSON.parse(readFileSync(resultPath, "utf8")));
        assert.equal(privateResult.before.version, 6);
        assert.equal(privateResult.after.version, 7);
        assert.equal(privateResult.taskReplayEqual, true);
        assert.deepEqual(privateResult.beforeCapture, {
          mode: "immutable",
          fileUnchanged: true,
          sidecarsCreated: false,
        });
        assert.equal(sha(readFileSync(walBackup.path)), walBackup.sha256);
        writeFileSync(
          join(evidence, "wal-private-result.json"),
          readFileSync(resultPath),
        );
      }
      assert.equal(count(before, "tasks"), expectedTasks);
      assert.equal(
        count(before, "op_log"),
        spec.version < 2 ? 0 : expectedTasks,
      );
      const openedAt = new Date().toISOString(),
        start = performance.now();
      const store = new OperationStore({
        path,
        attachmentRoot: join(dir, "attachments"),
      });
      const openMs = performance.now() - start;
      try {
        const after = capture(path, "live");
        assert.equal(after.version, 7);
        assert.equal(count(after, "tasks"), purge ? 1 : expectedTasks);
        assert.equal(count(after, "op_log"), expectedTasks);
        assert.equal(count(after, "task_dependencies"), 0);
        assert.equal(count(after, "profiles"), expectedTasks ? 2 : 0);
        if ("large" in spec && spec.large) {
          assert.deepEqual(profileCounts(before), { personal: 1, work: 10000 });
          assert.deepEqual(profileCounts(after), { personal: 1, work: 10000 });
        }
        const snapshots = (await Effect.runPromise(store.snapshots.list()))
          .snapshots;
        assert.equal(snapshots.length, expectedTasks ? 1 : 0);
        const saved = snapshots[0];
        let backup: unknown = null;
        if (saved) {
          const old = capture(saved.path);
          assert.equal(old.version, purge ? 7 : spec.version);
          if (!purge) {
            assert.equal(canonical(old.schema), canonical(before.schema));
            assert.equal(canonical(old.tables), canonical(before.tables));
          } else {
            assert.equal(count(old, "tasks"), 1);
            assert.ok(
              !readFileSync(saved.path).includes(Buffer.from("Ship the port")),
            );
          }
          backup = {
            id: saved.id,
            reason: saved.reason,
            schemaVersion: saved.schema_version,
            bytes: saved.size,
            sha256: saved.sha256,
            originalSchemaAndRowsEqual: !purge,
            purgeRedacted: purge,
          };
        }
        if (spec.version >= 2 && !purge) {
          const db = new Database(path, { readonly: true });
          try {
            for (const t of before.tables)
              assert.equal(
                canonical(rows(db, t.name, t.columns)),
                canonical(t.rows),
                spec.name + " " + t.name,
              );
          } finally {
            db.close();
          }
        }
        const tasks = await Effect.runPromise(store.tasks());
        if (expectedTasks === 2 && !purge)
          assert.deepEqual(
            tasks.map((t) => [t.id, t.title, t.row_version]),
            [
              ["legacy-1", "Ship the port", 7],
              ["legacy-2", "Buy tea", 2],
            ],
          );
        const history = await Effect.runPromise(store.history());
        const replayStart = performance.now();
        const rebuilt = await Effect.runPromise(store.rebuild());
        const fullReplayMs = performance.now() - replayStart;
        assert.equal(canonical(rebuilt), canonical(tasks));
        assert.equal(
          canonical(await Effect.runPromise(store.history())),
          canonical(history),
        );
        await Effect.runPromise(store.takeSnapshot());
        const checkpointStart = performance.now();
        const checkpoint = await Effect.runPromise(
          store.rebuild({ useSnapshot: true }),
        );
        const checkpointReplayMs = performance.now() - checkpointStart;
        assert.equal(canonical(checkpoint), canonical(tasks));
        let restore: unknown = null,
          compatibility: unknown = null;
        if (spec.name === "schema-6" && saved) {
          const oldBinary = repositoryPath(
            root,
            process.env.TODO_REHEARSAL_OLD_CLI ??
              ".scratch/bin/dag-migration-old-main-2c488fc7",
            "old CLI",
          );
          assert.ok(existsSync(oldBinary));
          const env = {
            ...process.env,
            HOME: dir,
            TODO_DB: path,
            TODO_ATTACHMENT_ROOT: join(dir, "attachments"),
          };
          const beforeOldAttempt = capture(path, "live");
          const oldAttempt = spawnSync(
            oldBinary,
            ["--format", "json", "--profile", "work", "list"],
            { env, encoding: "utf8", timeout: 60000 },
          );
          writeFileSync(
            join(evidence, "old-main-schema7.json"),
            JSON.stringify(
              {
                exit: oldAttempt.status,
                stdout: oldAttempt.stdout,
                stderr: oldAttempt.stderr,
              },
              null,
              2,
            ),
          );
          assert.equal(oldAttempt.status, 1);
          assert.equal(JSON.parse(oldAttempt.stdout).code, "runtime_error");
          assert.equal(
            canonical(capture(path, "live").tables),
            canonical(beforeOldAttempt.tables),
          );
          const rollback = join(dir, "rollback");
          mkdirSync(rollback);
          const rollbackPath = join(rollback, "todo.db");
          copyFileSync(saved.path, rollbackPath);
          assert.equal(capture(rollbackPath).version, 6);
          const oldEnv = {
            ...env,
            HOME: rollback,
            TODO_DB: rollbackPath,
            TODO_ATTACHMENT_ROOT: join(rollback, "attachments"),
          };
          const init = spawnSync(
            oldBinary,
            [
              "--format",
              "json",
              "--profile",
              "work",
              "init",
              "--password-stdin",
            ],
            {
              env: oldEnv,
              input: "scratch migration rollback passphrase\n",
              encoding: "utf8",
              timeout: 60000,
            },
          );
          assert.equal(init.status, 0, init.stderr + init.stdout);
          const login = spawnSync(
            oldBinary,
            [
              "--format",
              "json",
              "--profile",
              "work",
              "login",
              "--password-stdin",
            ],
            {
              env: oldEnv,
              input: "scratch migration rollback passphrase\n",
              encoding: "utf8",
              timeout: 60000,
            },
          );
          assert.equal(login.status, 0, login.stderr);
          const list = spawnSync(
            oldBinary,
            ["--format", "json", "--profile", "work", "list"],
            { env: oldEnv, encoding: "utf8", timeout: 60000 },
          );
          assert.equal(list.status, 0, list.stderr + list.stdout);
          assert.equal(capture(rollbackPath, "live").version, 6);
          assert.deepEqual(
            JSON.parse(list.stdout).tasks.map(
              (task: { id: string; title: string; row_version: number }) => [
                task.id,
                task.title,
                task.row_version,
              ],
            ),
            [["legacy-1", "Ship the port", 7]],
          );
          compatibility = {
            schema7OldCliExit: oldAttempt.status,
            physicalBackupVersion: 6,
            oldInitExit: init.status,
            oldLoginExit: login.status,
            oldListExit: list.status,
            oldMain: "2c488fc72fe264741d5d8db8f90b441bf426af32",
          };
          writeFileSync(
            join(evidence, "old-main-rollback.json"),
            JSON.stringify(
              {
                init: { exit: init.status },
                login: { exit: login.status },
                list: { exit: list.status, stdout: list.stdout },
              },
              null,
              2,
            ),
          );
          const dry = await Effect.runPromise(
            store.snapshots.restore(saved.id, { dryRun: true }),
          );
          assert.equal(dry.dry_run, true);
          const restoreStart = performance.now();
          const applied = await Effect.runPromise(
            store.snapshots.restore(saved.id),
          );
          const restoreMs = performance.now() - restoreStart;
          assert.equal(applied.dry_run, false);
          assert.equal(capture(path, "live").version, 7);
          assert.equal(
            canonical(await Effect.runPromise(store.tasks())),
            canonical(tasks),
          );
          restore = {
            dryRun: true,
            applied: true,
            restoreMs,
            restoredSchemaVersion: 7,
            seqBefore: applied.seq_before,
            seqAfter: applied.seq_after,
            safetyReason: applied.safety_snapshot?.reason,
            taskEquality: true,
          };
        }
        if (walBackup)
          assert.equal(sha(readFileSync(walBackup.path)), walBackup.sha256);
        const result = {
          name: spec.name,
          before: summary(before),
          after: summary(after),
          expectedTaskCount: expectedTasks,
          existingRowsPreserved: spec.version >= 2 && !purge,
          openMs,
          fullReplayMs,
          checkpointReplayMs,
          backup,
          taskReplayEqual: true,
          historyUnchangedByReplay: true,
          restore,
          compatibility,
          walBackup: walBackup
            ? {
                sourceSHA256: walBackup.sha256,
                sourceUnchanged: true,
                header: walBackup.header,
                immutableCaptureNoSidecars: true,
                immutableWriteRefused: true,
                privateEntryExit: 0,
              }
            : null,
          openedAt,
        };
        results.push(result);
        writeFileSync(
          join(evidence, "cases.json"),
          JSON.stringify(results, null, 2) + "\n",
        );
      } finally {
        await Effect.runPromise(store.close());
      }
    }
    writeFileSync(
      join(evidence, "result.json"),
      JSON.stringify(
        {
          status: "PASS",
          cases: results.length,
          source: process.env.TODO_REHEARSAL_SOURCE ?? "unlabelled",
          fixtureOnly: true,
          realDataRead: false,
          processSignals: [],
          timingBoundary:
            "Compiled shared OperationStore constructor, including synchronous Snapshot and migration; seed, compile, process bootstrap and subsequent assertions excluded",
          timingRunsPerCase: 1,
        },
        null,
        2,
      ) + "\n",
    );
  } catch (error) {
    writeFileSync(
      join(evidence, "failure.json"),
      JSON.stringify(
        {
          error: String(error),
          stack: error instanceof Error ? error.stack : null,
          completedCases: results.length,
          scratch,
        },
        null,
        2,
      ),
    );
    throw error;
  } finally {
    rmSync(scratch, { recursive: true, force: true });
    writeFileSync(
      join(evidence, "cleanup.json"),
      JSON.stringify(
        {
          scratch,
          scratchRemoved: !existsSync(scratch),
          realDataRead: false,
          signals: [],
        },
        null,
        2,
      ) + "\n",
    );
  }
}

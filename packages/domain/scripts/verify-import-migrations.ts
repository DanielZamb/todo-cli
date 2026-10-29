import { Database } from "bun:sqlite";
import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import { openStore } from "@todo/domain/store";
import { Effect } from "effect";
import { authMigrationSql } from "../src/store/0003.ts";

if (process.argv[2] === "--open") {
  const path = process.argv[3];
  if (!path?.includes("todo-c11-migrations-"))
    throw new Error("Scratch database required");
  process.stdout.write("opening\n");
  await Effect.runPromise(
    Effect.acquireUseRelease(
      openStore({ path }),
      (store) => store.settings(),
      (store) => Effect.orDie(store.close()),
    ),
  );
} else {
  const [evidence, fixture] = process.argv.slice(2);
  if (!evidence || !fixture || !isAbsolute(evidence) || !isAbsolute(fixture))
    throw new Error("Pass absolute evidence and fixture paths");
  mkdirSync(evidence, { recursive: true });
  const scratch = mkdtempSync(join(tmpdir(), "todo-c11-migrations-"));
  const receipts = [];
  try {
    for (const version of [2, 3, 4, 5]) {
      const directory = join(scratch, String(version));
      mkdirSync(directory);
      const path = join(directory, "scratch.db");
      const lock = new Database(path);
      lock.function("domain_write_allowed", () => 1);
      lock.exec(readFileSync(fixture, "utf8"));
      if (version >= 3) lock.exec(authMigrationSql);
      if (version >= 4) {
        const { profileMigrationSql } = await import("../src/store/0004.ts");
        lock.exec(profileMigrationSql);
      }
      if (version === 5) {
        const { migrateExternalId } = await import("../src/store/0005.ts");
        migrateExternalId(lock);
      }
      const originalSchema = lock
        .query(
          "SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name",
        )
        .all();
      const tables = lock
        .query<{ name: string }, []>(
          "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
        )
        .all()
        .map((row) => row.name);
      const before = tables.map((table) => ({
        table,
        columns: lock
          .query<{ name: string }, []>(`PRAGMA table_xinfo(${table})`)
          .all()
          .map((column) => column.name)
          .join(","),
        rows: JSON.stringify(
          lock.query(`SELECT * FROM ${table} ORDER BY rowid`).all(),
        ),
      }));
      lock.exec("PRAGMA journal_mode=WAL; BEGIN IMMEDIATE");
      const children = Array.from({ length: 3 }, () =>
        Bun.spawn([process.execPath, "--open", path], {
          env: { ...process.env, HOME: directory },
          stdout: "pipe",
          stderr: "pipe",
        }),
      );
      try {
        await Promise.all(
          children.map(async (child) => {
            const reader = child.stdout.getReader();
            const ready = await reader.read();
            reader.releaseLock();
            assert.equal(new TextDecoder().decode(ready.value), "opening\n");
          }),
        );
        await new Promise((resolve) => setTimeout(resolve, 100));
        lock.exec("COMMIT");
        const exits = await Promise.all(children.map((child) => child.exited));
        const stderr = await Promise.all(
          children.map((child) => new Response(child.stderr).text()),
        );
        assert.deepEqual(exits, [0, 0, 0], stderr.join("\n"));
        const snapshot = await Effect.runPromise(
          Effect.acquireUseRelease(
            openStore({ path }),
            (store) =>
              Effect.gen(function* () {
                assert.equal((yield* store.settings()).user_version, 6);
                const snapshots = (yield* store.snapshots.list()).snapshots;
                assert.deepEqual(
                  snapshots.map((s) => [s.reason, s.schema_version]),
                  [["pre-migration", version]],
                );
                return snapshots[0];
              }),
            (store) => Effect.orDie(store.close()),
          ),
        );
        assert.ok(snapshot);
        const recovery = new Database(snapshot.path, { readonly: true });
        try {
          assert.deepEqual(recovery.query("PRAGMA user_version").get(), {
            user_version: version,
          });
          assert.deepEqual(
            recovery
              .query(
                "SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name",
              )
              .all(),
            originalSchema,
          );
          for (const { table, rows, columns } of before) {
            assert.equal(
              JSON.stringify(
                recovery.query(`SELECT * FROM ${table} ORDER BY rowid`).all(),
              ),
              rows,
            );
            assert.equal(
              JSON.stringify(
                lock
                  .query(`SELECT ${columns} FROM ${table} ORDER BY rowid`)
                  .all(),
              ),
              rows,
            );
          }
        } finally {
          recovery.close();
        }
        receipts.push({
          from: version,
          to: 6,
          concurrent_exits: exits,
          pre_migration_snapshots: 1,
          existing_rows_byte_identical: true,
          op_log_byte_identical: true,
          snapshot_preserves_original_schema_and_rows: true,
        });
      } finally {
        for (const child of children) if (child.exitCode === null) child.kill();
        await Promise.all(children.map((child) => child.exited));
        lock.close();
      }
    }
    writeFileSync(
      join(evidence, "result.json"),
      JSON.stringify({ passed: true, chains: receipts }, null, 2),
    );
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

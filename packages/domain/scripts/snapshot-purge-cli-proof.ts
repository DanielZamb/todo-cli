import { Database } from "bun:sqlite";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Schema } from "effect";
import { TasksResponse } from "../src/presentation.ts";
import { SnapshotManifest } from "../src/snapshots.ts";

export function proveSnapshotPurgeCli(
  root: string,
  evidence: string,
  fixed: string,
) {
  const actions: unknown[] = [];
  const results: unknown[] = [];
  const taskResponse = Schema.decodeUnknownSync(
    Schema.Struct({
      task: Schema.Struct({ id: Schema.String, row_version: Schema.Number }),
    }),
  );
  const snapshotResponse = Schema.decodeUnknownSync(
    Schema.Struct({ snapshot: SnapshotManifest }),
  );
  for (const mode of ["tagged", "dependencies", "metadata", "repair"]) {
    const directory = join(root, mode);
    mkdirSync(join(directory, ".todo-cli"), { recursive: true, mode: 0o700 });
    const path = join(directory, "scratch.db");
    const env = { ...process.env, HOME: directory, TODO_DB: path };
    const base =
      mode === "repair" ? process.env.TODO_SNAPSHOT_BASE_CLI : undefined;
    let binary = base ?? fixed;
    const run = (args: string[], expected = 0, input?: string): unknown => {
      const child = Bun.spawnSync([binary, "--format", "json", ...args], {
        env,
        stdin: input ? Buffer.from(input) : "ignore",
        stdout: "pipe",
        stderr: "pipe",
      });
      const stdout = child.stdout.toString();
      const stderr = child.stderr.toString();
      actions.push({
        mode,
        binary,
        args,
        exit: child.exitCode,
        stdout,
        stderr,
      });
      writeFileSync(
        join(evidence, "purge-cli-actions.json"),
        JSON.stringify(actions, null, 2),
      );
      assert.equal(
        child.exitCode,
        expected,
        `${mode} ${args.join(" ")}: ${stdout} ${stderr}`,
      );
      return JSON.parse(stdout);
    };
    run(["init", "--password-stdin"], 0, "scratch purge proof passphrase\n");
    run(["login", "--password-stdin"], 0, "scratch purge proof passphrase\n");
    const title = `Private ${mode} Task canary`;
    const flags =
      mode === "dependencies" ? [] : ["--tag", "alpha", "--tag", "beta"];
    if (mode === "metadata")
      flags.push(
        "--desc",
        "Private description canary",
        "--project",
        "Private Project canary",
        "--external-id",
        "private-external-id",
        "--due",
        "2030-01-01T09:00:00Z",
        "--recurrence",
        JSON.stringify({
          dtstart: { kind: "date", date: "2030-01-01" },
          rrule: "FREQ=DAILY;COUNT=3",
          exdate: [],
        }),
      );
    const target = taskResponse(run(["add", title, ...flags])).task;
    const keeper = taskResponse(run(["add", "Keeper"])).task;
    let version = target.row_version;
    if (mode === "dependencies") {
      const blocker = taskResponse(run(["add", "Blocker"])).task;
      run(["depend", target.id, "--on", blocker.id, "--expected-version", "1"]);
      run(["depend", keeper.id, "--on", target.id, "--expected-version", "1"]);
      version = 2;
    }
    const saved = snapshotResponse(
      run(["snapshot", "create", "--reason", "before Purge"]),
    ).snapshot;
    run(["snapshot", "restore", saved.id]);
    if (mode === "metadata") {
      const db = new Database(path, { readonly: true });
      try {
        const tables = db
          .query<{ name: string }, []>(
            "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
          )
          .all()
          .map(({ name }) => ({
            name,
            columns: db
              .query(`PRAGMA table_xinfo("${name.replaceAll('"', '""')}")`)
              .all(),
            foreign_keys: db
              .query(`PRAGMA foreign_key_list("${name.replaceAll('"', '""')}")`)
              .all(),
          }));
        writeFileSync(
          join(evidence, "task-reference-schema.json"),
          JSON.stringify(tables, null, 2),
        );
        assert.equal(
          db
            .query<{ count: number }, []>(
              "SELECT count(*) AS count FROM series",
            )
            .get()?.count,
          1,
        );
      } finally {
        db.close();
      }
    }
    run([
      "rm",
      target.id,
      "--expected-version",
      String(version),
      ...(mode === "dependencies" ? ["--with-dependencies"] : []),
    ]);
    run([
      "rm",
      target.id,
      "--expected-version",
      String(version + 1),
      "--force",
    ]);
    if (mode === "repair") {
      if (!base) {
        const db = new Database(saved.path);
        try {
          db.function("domain_write_allowed", () => 1);
          db.query("INSERT INTO task_tags VALUES (?,?)").run(
            target.id,
            "old-missing-tag",
          );
        } finally {
          db.close();
        }
        const manifest = JSON.parse(
          readFileSync(
            join(directory, "snapshots", `${saved.id}.json`),
            "utf8",
          ),
        );
        writeFileSync(
          join(directory, "snapshots", `${saved.id}.json`),
          JSON.stringify({
            ...manifest,
            size: statSync(saved.path).size,
            sha256: createHash("sha256")
              .update(readFileSync(saved.path))
              .digest("hex"),
          }),
        );
      }
      const damaged = new Database(saved.path, { readonly: true });
      try {
        assert.ok(damaged.query("PRAGMA foreign_key_check").all().length > 0);
      } finally {
        damaged.close();
      }
      if (base) run(["snapshot", "restore", saved.id], 2);
      binary = fixed;
    }
    run(["snapshot", "restore", saved.id]);
    run(["snapshot", "restore", saved.id]);
    const titles = Schema.decodeUnknownSync(TasksResponse)(run(["list"]))
      .tasks?.map((row) => row.title)
      .sort();
    assert.deepEqual(
      titles,
      mode === "dependencies" ? ["Blocker", "Keeper"] : ["Keeper"],
    );
    const manifest = snapshotResponse(
      run(["snapshot", "show", saved.id]),
    ).snapshot;
    const bytes = readFileSync(saved.path);
    assert.equal(bytes.includes(Buffer.from(title)), false);
    assert.equal(readFileSync(path).includes(Buffer.from(title)), false);
    assert.equal(
      manifest.sha256,
      createHash("sha256").update(bytes).digest("hex"),
    );
    assert.equal(manifest.size, bytes.length);
    assert.deepEqual(
      manifest.task_counts.map((row) => row.count),
      [mode === "dependencies" ? 2 : 1],
    );
    for (const file of [path, saved.path]) {
      const db = new Database(file, { readonly: true });
      try {
        assert.deepEqual(db.query("PRAGMA foreign_key_check").all(), []);
        assert.deepEqual(
          db.query("SELECT * FROM task_tags WHERE task_id=?").all(target.id),
          [],
        );
        assert.deepEqual(
          db
            .query(
              "SELECT * FROM task_dependencies WHERE dependent_id=? OR blocker_id=?",
            )
            .all(target.id, target.id),
          [],
        );
        assert.deepEqual(
          db
            .query("SELECT * FROM attachment_cleanup WHERE task_id=?")
            .all(target.id),
          [],
        );
        if (mode === "metadata") {
          assert.deepEqual(db.query("SELECT * FROM series").all(), []);
          assert.deepEqual(
            db
              .query(
                "SELECT * FROM tasks WHERE external_id='private-external-id' OR due_at IS NOT NULL OR scheduled_at IS NOT NULL",
              )
              .all(),
            [],
          );
          for (const canary of [
            "Private description canary",
            "Private Project canary",
            "private-external-id",
          ])
            assert.equal(
              readFileSync(file).includes(Buffer.from(canary)),
              false,
            );
        }
      } finally {
        db.close();
      }
    }
    results.push({
      mode,
      tasks: titles,
      restore_exit: 0,
      foreign_key_violations: [],
      title_bytes: false,
      manifest_consistent: true,
      repair_source:
        mode === "repair"
          ? base
            ? "compiled base CLI"
            : "damaged-row fixture"
          : null,
    });
  }
  writeFileSync(
    join(evidence, "purge-cli-result.json"),
    JSON.stringify({ status: "PASS", results }, null, 2),
  );
}

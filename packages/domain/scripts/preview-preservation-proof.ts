import { Database } from "bun:sqlite";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { Effect, Schema } from "effect";
import { writeImage } from "../src/attachment-store.ts";
import { Profile } from "../src/entities.ts";
import { OperationStore } from "../src/store/store.ts";
import {
  actor,
  created,
  profile,
  task,
  time,
  work,
} from "../test/store-fixtures.ts";

export function attachmentTree(root: string) {
  const entries: unknown[] = [];
  const visit = (relative: string) => {
    const file = join(root, relative),
      stat = lstatSync(file);
    const common = {
      path: relative,
      mode: stat.mode,
      mtime: stat.mtimeMs,
      ctime: stat.ctimeMs,
    };
    if (stat.isSymbolicLink())
      entries.push({ ...common, kind: "link", target: readlinkSync(file) });
    else if (stat.isDirectory()) {
      entries.push({ ...common, kind: "directory" });
      for (const name of readdirSync(file).sort()) visit(join(relative, name));
    } else
      entries.push({
        ...common,
        kind: "file",
        size: stat.size,
        sha256: createHash("sha256").update(readFileSync(file)).digest("hex"),
      });
  };
  if (existsSync(root)) visit("");
  return {
    sha256: createHash("sha256").update(JSON.stringify(entries)).digest("hex"),
    entries,
  };
}
export function logicalRows(path: string) {
  const db = new Database(path, { readonly: true });
  try {
    return Object.fromEntries(
      db
        .query<{ name: string }, []>(
          "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
        )
        .all()
        .map(({ name }) => [
          name,
          db
            .query(`SELECT * FROM "${name.replaceAll('"', '""')}"`)
            .all()
            .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
        ]),
    );
  } finally {
    db.close();
  }
}

export async function provePreviewCli(
  directory: string,
  evidence: string,
  binary: string,
  mode: "purge" | "matrix",
) {
  mkdirSync(join(directory, ".todo-cli"), { recursive: true });
  const path = join(directory, "scratch.db"),
    attachmentRoot = join(directory, "attachments");
  const store = new OperationStore({ path, attachmentRoot });
  const actions: unknown[] = [],
    observations: unknown[] = [];
  const run = (args: string[], input?: string): unknown => {
    const child = Bun.spawnSync(
      [binary, "--profile", "work", "--format", "json", ...args],
      {
        env: {
          ...process.env,
          HOME: directory,
          TODO_DB: path,
          TODO_ATTACHMENT_ROOT: attachmentRoot,
        },
        stdin: input ? Buffer.from(input) : "ignore",
        stdout: "pipe",
        stderr: "pipe",
      },
    );
    const stdout = child.stdout.toString();
    actions.push({
      args,
      exit: child.exitCode,
      stdout,
      stderr: child.stderr.toString(),
    });
    writeFileSync(
      join(evidence, "preview-actions.json"),
      JSON.stringify(actions, null, 2),
    );
    assert.equal(child.exitCode, 0, stdout + child.stderr.toString());
    return JSON.parse(stdout);
  };
  try {
    await Effect.runPromise(store.putProfile(work));
    await Effect.runPromise(
      store.putProfile(
        Schema.decodeUnknownSync(Profile)({
          ...work,
          id: "personal",
          name: "Personal",
        }),
      ),
    );
    await Effect.runPromise(
      store.auth.setupOwner("scratch preview passphrase"),
    );
    const images = new Map<string, string>();
    for (const [id, title, profileId] of [
      ["active", "Active image Task", "work"],
      ["deleted", "Deleted image Task", "work"],
      ["blocker", "Blocker", "work"],
      ["dependent", "Dependent", "work"],
      ["managed", "Imported image Task", "work"],
      ["personal-task", "Personal image Task", "personal"],
    ]) {
      assert.ok(id && title && profileId);
      const image = writeImage(
        attachmentRoot,
        profileId,
        id,
        `${id}-image`,
        Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
        "image/png",
      );
      images.set(id, image);
      assert.equal(
        (
          await Effect.runPromise(
            store.append({
              actor,
              profile: Schema.decodeUnknownSync(Profile.fields.id)(profileId),
              event: {
                ...created,
                task: {
                  ...task,
                  id,
                  title,
                  profile_id: profileId,
                  ...(id === "managed" ? { external_id: "managed-id" } : {}),
                  attachments: [
                    {
                      kind: "image",
                      id: `${id}-image`,
                      path: image,
                      added_at: time,
                    },
                  ],
                },
              },
            }),
          )
        ).outcome,
        "committed",
      );
    }
    const before = (await Effect.runPromise(store.tasks())).find(
      (row) => row.id === "deleted",
    );
    assert.ok(before);
    const after = { ...before, row_version: 2, deleted_at: time };
    await Effect.runPromise(
      store.append({
        actor,
        profile,
        event: {
          kind: "TaskDeleted",
          entity_version: 1,
          occurred_at: time,
          before,
          after,
        },
      }),
    );
    run(["login", "--password-stdin"], "scratch preview passphrase\n");
    if (mode === "matrix")
      run([
        "depend",
        "dependent",
        "--on",
        "blocker",
        "--expected-version",
        "1",
      ]);
    const saved = await Effect.runPromise(
      store.snapshots.create("preview preservation"),
    );
    const input = (name: string, value: unknown) => {
      const file = join(directory, `${name}.json`);
      writeFileSync(file, JSON.stringify(value));
      return file;
    };
    const imports = input("import", [
      {
        external_id: "new-id",
        title: "Imported preview",
        attachments: [{ kind: "file", path: images.get("active") }],
      },
    ]);
    const adoption = input("adoption", [
      {
        external_id: "adopted-id",
        task_id: "active",
        from_version: 1,
        title: "Adopted preview",
      },
    ]);
    const cases: { name: string; args: string[] }[] =
      mode === "purge"
        ? []
        : [
            { name: "parse", args: ["parse", "Draft Task tomorrow"] },
            {
              name: "delete",
              args: ["rm", "active", "--expected-version", "1", "--dry-run"],
            },
            {
              name: "delete-dependencies",
              args: [
                "rm",
                "blocker",
                "--expected-version",
                "1",
                "--with-dependencies",
                "--dry-run",
              ],
            },
            {
              name: "move",
              args: [
                "move",
                "active",
                "--to",
                "Personal",
                "--expected-version",
                "1",
                "--dry-run",
              ],
            },
            {
              name: "copy",
              args: [
                "copy",
                "active",
                "--to",
                "Personal",
                "--expected-version",
                "1",
                "--dry-run",
              ],
            },
            {
              name: "batch-edit",
              args: [
                "batch-edit",
                input("batch-edit", {
                  items: [{ task_id: "active", from_version: 1 }],
                  changes: { title: "Preview edit" },
                }),
                "--dry-run",
              ],
            },
            {
              name: "attach-many",
              args: [
                "attach-many",
                input("attach-many", {
                  items: [
                    {
                      task_id: "active",
                      from_version: 1,
                      attachments: [
                        { kind: "link", url: "https://example.com/preview" },
                      ],
                    },
                  ],
                }),
                "--dry-run",
              ],
            },
            {
              name: "batch-depend",
              args: [
                "batch-depend",
                "--file",
                input("batch-depend", {
                  items: [
                    {
                      action: "depend",
                      dependent_id: "active",
                      blocker_id: "blocker",
                      from_version: 1,
                    },
                  ],
                }),
                "--dry-run",
              ],
            },
            {
              name: "batch-undepend",
              args: [
                "batch-depend",
                "--file",
                input("batch-undepend", {
                  items: [
                    {
                      action: "undepend",
                      dependent_id: "dependent",
                      blocker_id: "blocker",
                      from_version: 2,
                    },
                  ],
                }),
                "--dry-run",
              ],
            },
            { name: "import", args: ["import", imports, "--dry-run"] },
            {
              name: "import-adoption",
              args: ["import", adoption, "--dry-run"],
            },
            {
              name: "import-close-missing",
              args: ["import", imports, "--close-missing", "--dry-run"],
            },
            {
              name: "profile-delete",
              args: [
                "profile",
                "delete",
                "Personal",
                "--with-tasks",
                "--dry-run",
              ],
            },
            {
              name: "snapshot-restore",
              args: ["snapshot", "restore", saved.id, "--dry-run"],
            },
            {
              name: "snapshot-prune",
              args: ["snapshot", "prune", "--dry-run"],
            },
            {
              name: "detach",
              args: [
                "detach",
                "active",
                "active-image",
                "--expected-version",
                "1",
                "--dry-run",
              ],
            },
          ];
    cases.push({
      name: "purge",
      args: [
        "rm",
        "deleted",
        "--expected-version",
        "2",
        "--force",
        "--dry-run",
      ],
    });
    for (const item of cases) {
      const treeBefore = attachmentTree(attachmentRoot),
        rowsBefore = logicalRows(path),
        unionBefore = store.snapshots.purgedIdsSync();
      assert.deepEqual(unionBefore, []);
      const response = run(item.args);
      const treeAfter = attachmentTree(attachmentRoot),
        rowsAfter = logicalRows(path),
        unionAfter = store.snapshots.purgedIdsSync();
      const png = images.get("deleted");
      assert.ok(png);
      const taskState = (await Effect.runPromise(store.tasks()))
        .filter((row) => row.id === "deleted")
        .map((row) => [row.id, row.row_version, row.deleted_at]);
      const state = {
        command: item.name,
        tree_before: treeBefore,
        tree_after: treeAfter,
        rows_equal: JSON.stringify(rowsBefore) === JSON.stringify(rowsAfter),
        rows_before_sha256: createHash("sha256")
          .update(JSON.stringify(rowsBefore))
          .digest("hex"),
        rows_after_sha256: createHash("sha256")
          .update(JSON.stringify(rowsAfter))
          .digest("hex"),
        tree_equal: treeBefore.sha256 === treeAfter.sha256,
        queue: rowsAfter.attachment_cleanup,
        union_before: unionBefore,
        union_after: unionAfter,
        deleted_task: taskState,
        image_present: existsSync(png),
      };
      observations.push(state);
      writeFileSync(
        join(evidence, "preview-observations.json"),
        JSON.stringify(observations, null, 2),
      );
      if (item.name === "purge")
        assert.deepEqual(
          Schema.decodeUnknownSync(
            Schema.Struct({ dry_run: Schema.Boolean, status: Schema.String }),
          )(response),
          { dry_run: true, status: "would_purge" },
        );
      assert.deepEqual(
        rowsAfter,
        rowsBefore,
        `${item.name} changed logical rows`,
      );
      assert.deepEqual(
        treeAfter,
        treeBefore,
        `${item.name} touched Attachment tree`,
      );
      assert.deepEqual(unionAfter, []);
      assert.deepEqual(rowsAfter.attachment_cleanup, []);
      assert.deepEqual(taskState, [["deleted", 2, time]]);
      assert.equal(existsSync(png), true);
    }
    run(["rm", "deleted", "--expected-version", "2", "--force"]);
    const png = images.get("deleted");
    assert.ok(png);
    assert.equal(existsSync(png), false);
    assert.equal(
      (await Effect.runPromise(store.tasks())).some(
        (row) => row.id === "deleted",
      ),
      false,
    );
    assert.deepEqual(store.snapshots.purgedIdsSync(), ["deleted"]);
    const result = {
      status: "PASS",
      commands: cases.map((item) => item.name),
      real_purge_erased_png: true,
      dry_runs_preserved_tree_and_all_rows: true,
    };
    writeFileSync(
      join(evidence, "preview-result.json"),
      JSON.stringify(result, null, 2),
    );
    return result;
  } finally {
    await Effect.runPromise(store.close());
  }
}

if (import.meta.main) {
  const [directory, evidence, binary, mode] = process.argv.slice(2);
  if (
    !directory?.includes("todo-") ||
    !evidence ||
    !binary ||
    (mode !== "purge" && mode !== "matrix")
  )
    throw new Error("Expected scratch, evidence, binary and mode");
  await provePreviewCli(
    resolve(directory),
    resolve(evidence),
    resolve(binary),
    mode,
  );
}

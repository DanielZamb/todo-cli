import { Database } from "bun:sqlite";
import assert from "node:assert/strict";
import { type ChildProcess, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { ImportReport, parseImportText } from "@todo/domain";
import { Schema } from "effect";

const [binaryArg, evidenceArg, fixtureArg, serverBinary] =
  process.argv.slice(2);
if (
  !binaryArg ||
  !evidenceArg ||
  !fixtureArg ||
  !isAbsolute(binaryArg) ||
  !isAbsolute(evidenceArg)
)
  throw new Error("Pass absolute binary, evidence and fixture paths");
const binary = resolve(binaryArg);
const evidence = resolve(evidenceArg);
mkdirSync(evidence, { recursive: true });
const scratch = mkdtempSync(join(tmpdir(), "todo-c11-import-"));
const actions: unknown[] = [];
let server: ChildProcess | undefined;
let serverLog = "";
const env = {
  ...process.env,
  HOME: scratch,
  TODO_DB: join(scratch, "scratch.db"),
};
function cli(
  args: string[],
  options: {
    stdin?: string;
    exit?: number;
    env?: NodeJS.ProcessEnv;
    profile?: string;
  } = {},
) {
  const result = Bun.spawnSync(
    [
      binary,
      "--profile",
      options.profile ?? "scratch-work",
      "--format",
      "json",
      ...args,
    ],
    {
      env: options.env ?? env,
      stdin:
        options.stdin === undefined
          ? "ignore"
          : new TextEncoder().encode(options.stdin),
    },
  );
  const stdout = new TextDecoder().decode(result.stdout);
  const stderr = new TextDecoder().decode(result.stderr);
  actions.push({ args, exit: result.exitCode, stdout, stderr });
  assert.equal(result.exitCode, options.exit ?? 0, stdout + stderr);
  return stdout;
}
function state(includeSnapshotFiles = true) {
  const db = new Database(env.TODO_DB, { readonly: true });
  try {
    return JSON.stringify({
      tables: ["tasks", "projects", "tags", "op_log", "snapshots"].map(
        (table) => db.query(`SELECT * FROM ${table}`).all(),
      ),
      ownerSnapshots:
        includeSnapshotFiles && existsSync(join(scratch, "snapshots"))
          ? readdirSync(join(scratch, "snapshots"))
              .sort()
              .map((name) => [
                name,
                createHash("sha256")
                  .update(readFileSync(join(scratch, "snapshots", name)))
                  .digest("hex"),
              ])
          : [],
    });
  } finally {
    db.close();
  }
}
const report = (text: string) =>
  Schema.decodeUnknownSync(ImportReport)(JSON.parse(text));
try {
  cli(["--version"]);
  cli(["init", "--password-stdin"], { stdin: "scratch import passphrase\n" });
  cli(["login", "--password-stdin"], { stdin: "scratch import passphrase\n" });
  const fixture = join(scratch, "repository-sync.json");
  writeFileSync(fixture, readFileSync(fixtureArg, "utf8"));
  assert.deepEqual(JSON.parse(cli(["snapshot", "list"])).snapshots, []);
  const before = state();
  assert.deepEqual(report(cli(["import", fixture, "--dry-run"])).totals, {
    created: 2,
    updated: 0,
    unchanged: 0,
    rejected: 0,
  });
  assert.equal(state(), before);
  const applied = report(cli(["import", fixture]));
  assert.deepEqual(
    JSON.parse(cli(["snapshot", "list"])).snapshots.map(
      (value: { reason: string }) => value.reason,
    ),
    ["before import repository-sync.json"],
  );
  assert.deepEqual(applied.totals, {
    created: 2,
    updated: 0,
    unchanged: 0,
    rejected: 0,
  });
  const snapshotDirectory = join(scratch, "snapshots");
  const heldSnapshots = join(scratch, "held-snapshots");
  const beforeSnapshotFailure = state(false);
  renameSync(snapshotDirectory, heldSnapshots);
  writeFileSync(snapshotDirectory, "Not a directory");
  try {
    cli(["import", "-"], {
      stdin: JSON.stringify([
        {
          external_id: "snapshot:failure",
          title: "Must not be written",
          project_name: "Must not exist",
          tag_names: ["Must not exist"],
        },
      ]),
      exit: 1,
    });
    assert.equal(state(false), beforeSnapshotFailure);
    writeFileSync(
      join(evidence, "snapshot-failure.json"),
      JSON.stringify({
        status: "PASS",
        tasks_written: 0,
        projects_written: 0,
        tags_written: 0,
        history_written: 0,
      }),
    );
  } finally {
    rmSync(snapshotDirectory);
    renameSync(heldSnapshots, snapshotDirectory);
  }
  assert.deepEqual(report(cli(["import", fixture])).totals, {
    created: 0,
    updated: 0,
    unchanged: 2,
    rejected: 0,
  });
  const ndjson = parseImportText(readFileSync(fixture, "utf8"))
    .map((item) => JSON.stringify(item))
    .join("\n");
  assert.deepEqual(report(cli(["import", "-"], { stdin: ndjson })).totals, {
    created: 0,
    updated: 0,
    unchanged: 2,
    rejected: 0,
  });
  const first = applied.items[0];
  assert.ok(first?.task_id);
  const shown = JSON.parse(cli(["show", first.task_id]));
  assert.equal(shown.task.external_id, "repository:arg-weekly-export");
  assert.equal(JSON.parse(cli(["list"])).tasks.length, 2);
  assert.equal(
    JSON.parse(cli(["schema", "import-item"])).required.includes("external_id"),
    true,
  );
  assert.equal(
    JSON.parse(cli(["schema", "import"])).properties.totals.type,
    "object",
  );
  const stale = report(
    cli(["import", "-"], {
      stdin: JSON.stringify([
        {
          external_id: "repository:arg-weekly-export",
          title: "Stale",
          from_version: 2,
        },
      ]),
      exit: 4,
    }),
  );
  assert.equal(stale.items[0]?.error?.code, "occ_conflict");
  const baseline = state();
  cli(["import", "-", "--dry-run"], {
    stdin: JSON.stringify([
      { external_id: "repository:arg-weekly-export", description: null },
    ]),
  });
  assert.equal(state(), baseline);
  const invalid = JSON.parse(
    cli(["import", "-"], { stdin: "{broken", exit: 2 }),
  );
  assert.equal(invalid.code, "invalid_args");
  const added = JSON.parse(
    cli(["add", "Created with external id", "--external-id", "manual:one"]),
  );
  assert.equal(added.task.external_id, "manual:one");
  cli(["import", "-", "--close-missing"], { stdin: "[]" });
  const final = JSON.parse(cli(["list"]));
  assert.deepEqual(
    final.tasks
      .map((task: { external_id: string; status: string }) => [
        task.external_id,
        task.status,
      ])
      .sort(),
    [
      ["manual:one", "cancelled"],
      ["repository:arg-weekly-export", "cancelled"],
      ["repository:jira-etl-follow-up", "done"],
    ],
  );
  if (serverBinary) {
    server = spawn(serverBinary, [], {
      env: { ...env, TODO_PORT: "0" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const child = server;
    const address = await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("Scratch server readiness timed out")),
        60000,
      );
      const receive = (chunk: Buffer) => {
        serverLog += chunk.toString();
        const match = /Listening on (http:\/\/127\.0\.0\.1:\d+)/.exec(
          serverLog,
        );
        if (match?.[1]) {
          clearTimeout(timer);
          resolve(match[1]);
        }
      };
      child.stdout?.on("data", receive);
      child.stderr?.on("data", receive);
      child.once("exit", (code) => {
        clearTimeout(timer);
        reject(new Error(`Scratch server exited ${code}`));
      });
    });
    const token = Schema.decodeUnknownSync(
      Schema.Struct({ token: Schema.String }),
    )(
      JSON.parse(
        readFileSync(
          join(scratch, ".todo-cli/session_scratch-work.json"),
          "utf8",
        ),
      ),
    ).token;
    const importResponse = (body: unknown, profile = "scratch-work") => {
      const result = Bun.spawnSync(
        [
          "curl",
          "--silent",
          "--show-error",
          "--max-time",
          "10",
          "--request",
          "POST",
          `${address}/profiles/${profile}/import`,
          "--header",
          "Content-Type: application/json",
          "--header",
          `Authorization: Bearer ${token}`,
          "--data-binary",
          JSON.stringify(body),
          "--write-out",
          "\n%{http_code}",
        ],
        { env },
      );
      assert.equal(result.exitCode, 0);
      const output = new TextDecoder().decode(result.stdout);
      const split = output.lastIndexOf("\n");
      const response = {
        status: Number(output.slice(split + 1)),
        body: JSON.parse(output.slice(0, split)),
      };
      actions.push({ http: response });
      return response;
    };
    const http = (body: unknown) => {
      const response = importResponse(body);
      assert.equal(response.status, 200);
      return Schema.decodeUnknownSync(ImportReport)(response.body);
    };
    const items = [{ external_id: "http:new", title: "Compiled HTTP import" }];
    const dailyDeadline = Date.now() + 60000;
    while (
      !JSON.parse(cli(["snapshot", "list"])).snapshots.some(
        (snapshot: { reason: string }) => snapshot.reason === "daily",
      )
    ) {
      assert.ok(
        Date.now() < dailyDeadline,
        "Scheduler daily Snapshot readiness timed out",
      );
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    const baseline = state();
    assert.deepEqual(http({ items, dry_run: true }).totals, {
      created: 1,
      updated: 0,
      unchanged: 0,
      rejected: 0,
    });
    assert.equal(state(), baseline);
    assert.deepEqual(http({ items }).totals, {
      created: 1,
      updated: 0,
      unchanged: 0,
      rejected: 0,
    });
    assert.deepEqual(http({ items }).totals, {
      created: 0,
      updated: 0,
      unchanged: 1,
      rejected: 0,
    });
    assert.equal(
      http({
        items: [{ external_id: "http:new", title: "Stale", from_version: 2 }],
      }).items[0]?.error?.code,
      "occ_conflict",
    );
    cli(["init"], { profile: "deleted-import" });
    cli(["profile", "delete", "deleted-import"]);
    const deletedState = () => {
      const db = new Database(env.TODO_DB, { readonly: true });
      try {
        return JSON.stringify(
          ["tasks", "profiles", "profile_deletions", "snapshots"].map((table) =>
            db.query(`SELECT * FROM ${table}`).all(),
          ),
        );
      } finally {
        db.close();
      }
    };
    const deletedBefore = deletedState();
    for (const dry_run of [true, false]) {
      const response = importResponse(
        {
          items: [{ external_id: "deleted:one", title: "Must stay absent" }],
          dry_run,
        },
        "deleted-import",
      );
      assert.equal(response.status, 404);
      assert.deepEqual(response.body, {
        generated_at: response.body.generated_at,
        code: "not_found",
        message: "Profile not found; choose a Profile from GET /profiles",
      });
    }
    assert.equal(deletedState(), deletedBefore);
    cli(["import", "-"], {
      profile: "deleted-import",
      stdin: JSON.stringify(items),
      exit: 3,
    });
    const deletedDb = new Database(env.TODO_DB, { readonly: true });
    try {
      assert.deepEqual(
        deletedDb
          .query("SELECT id FROM profiles WHERE name='deleted-import'")
          .all(),
        [{ id: "deleted-import" }],
      );
      assert.deepEqual(
        deletedDb
          .query(
            "SELECT profile FROM profile_deletions WHERE profile='deleted-import'",
          )
          .all(),
        [{ profile: "deleted-import" }],
      );
      assert.deepEqual(
        deletedDb
          .query("SELECT id FROM tasks WHERE profile_id='deleted-import'")
          .all(),
        [],
      );
    } finally {
      deletedDb.close();
    }
    writeFileSync(
      join(evidence, "http-result.json"),
      JSON.stringify(
        {
          passed: true,
          dry_run_source_unchanged: true,
          created: 1,
          unchanged: 1,
          conflict: true,
          deleted_profile_404: true,
          deleted_profile_not_resurrected: true,
        },
        null,
        2,
      ),
    );
  }
  const privateText = "Private rejected import contents";
  const privateTask = report(
    cli(["import", "-"], {
      stdin: JSON.stringify([
        { external_id: "private:review", title: privateText },
      ]),
    }),
  ).items[0]?.task_id;
  assert.ok(privateTask);
  cli(["rm", privateTask, "--expected-version", "1"]);
  const deleted = report(
    cli(["import", "-"], {
      stdin: JSON.stringify([
        { external_id: "private:review", title: privateText },
      ]),
      exit: 2,
    }),
  );
  assert.equal(deleted.items[0]?.error?.code, "task_deleted");
  assert.equal(deleted.items[0]?.task_id, privateTask);
  cli(["rm", privateTask, "--expected-version", "2", "--force"]);
  const database = new Database(env.TODO_DB, { readonly: true });
  try {
    const count = Schema.decodeUnknownSync(Schema.Struct({ n: Schema.Int }))(
      database
        .query(
          "SELECT count(*) AS n FROM op_log WHERE event LIKE '%Private rejected import contents%'",
        )
        .get(),
    );
    assert.equal(count.n, 0);
    cli(["add", "Tag union seed", "--tag", "id-tag"]);
    const tag = Schema.decodeUnknownSync(Schema.Struct({ id: Schema.String }))(
      database
        .query(
          "SELECT id FROM tags WHERE name='id-tag' AND profile_id='scratch-work'",
        )
        .get(),
    ).id;
    assert.ok(tag);
    const union = [
      {
        external_id: "tags:review",
        title: "Combined Tags",
        tags: [tag],
        tag_names: ["named-tag"],
      },
    ];
    const created = report(
      cli(["import", "-"], { stdin: JSON.stringify(union) }),
    );
    assert.deepEqual(
      report(cli(["import", "-"], { stdin: JSON.stringify(union) })).totals,
      { created: 0, updated: 0, unchanged: 1, rejected: 0 },
    );
    const id = created.items[0]?.task_id;
    assert.ok(id);
    cli(["edit", id, "--expected-version", "1", "--title", "Newer union"]);
    cli(["import", "-"], {
      stdin: JSON.stringify([
        { external_id: "tags:review", title: "Stale", from_version: 1 },
      ]),
      exit: 4,
    });
    const conflict = Schema.decodeUnknownSync(
      Schema.Struct({ from_version: Schema.Int }),
    )(
      database
        .query(
          "SELECT from_version FROM op_log WHERE reason='conflict' ORDER BY seq DESC LIMIT 1",
        )
        .get(),
    );
    assert.equal(conflict.from_version, 1);
    cli(["add", "Project seed", "--project", "Chosen"]);
    const project = Schema.decodeUnknownSync(
      Schema.Struct({ id: Schema.String }),
    )(
      database
        .query(
          "SELECT id FROM projects WHERE name='Chosen' AND profile_id='scratch-work'",
        )
        .get(),
    ).id;
    const both = [
      {
        external_id: "project:review",
        title: "Project precedence",
        project_id: project,
        project_name: "Ignored",
      },
    ];
    cli(["import", "-"], { stdin: JSON.stringify(both) });
    assert.deepEqual(
      report(cli(["import", "-"], { stdin: JSON.stringify(both) })).totals,
      { created: 0, updated: 0, unchanged: 1, rejected: 0 },
    );
  } finally {
    database.close();
  }
  for (const file of readdirSync(join(scratch, "snapshots")))
    assert.equal(
      readFileSync(join(scratch, "snapshots", file)).includes(
        Buffer.from(privateText),
      ),
      false,
    );
  const legacyDirectory = join(scratch, "legacy");
  mkdirSync(legacyDirectory);
  const legacyEnv = {
    ...env,
    HOME: legacyDirectory,
    TODO_DB: join(legacyDirectory, "scratch.db"),
  };
  const legacyDatabase = new Database(legacyEnv.TODO_DB);
  try {
    const fixtures = resolve(fixtureArg, "../..");
    legacyDatabase.exec(readFileSync(join(fixtures, "0001_init.sql"), "utf8"));
    legacyDatabase.exec(readFileSync(join(fixtures, "legacy.sql"), "utf8"));
    legacyDatabase.exec(
      "UPDATE tasks SET status='snoozed',recurrence=NULL,scheduled_at='2027-01-01T00:00:00Z' WHERE id='legacy-1'",
    );
  } finally {
    legacyDatabase.close();
  }
  const legacy = (
    args: string[],
    options: { stdin?: string; exit?: number } = {},
  ) => cli(args, { ...options, env: legacyEnv, profile: "work" });
  legacy(["init", "--password-stdin"], {
    stdin: "scratch legacy passphrase\n",
  });
  legacy(["login", "--password-stdin"], {
    stdin: "scratch legacy passphrase\n",
  });
  legacy([
    "edit",
    "legacy-1",
    "--expected-version",
    "7",
    "--external-id",
    "legacy:snoozed",
  ]);
  const legacyRead = new Database(legacyEnv.TODO_DB, { readonly: true });
  try {
    const otherProfiles = JSON.stringify(
      legacyRead
        .query(
          "SELECT id,payload FROM tasks WHERE profile_id<>'work' ORDER BY id",
        )
        .all(),
    );
    const open = JSON.stringify([
      { external_id: "legacy:snoozed", status: "open" },
    ]);
    assert.deepEqual(
      report(legacy(["import", "-", "--dry-run"], { stdin: open })).totals,
      { created: 0, updated: 1, unchanged: 0, rejected: 0 },
    );
    assert.deepEqual(
      legacyRead
        .query("SELECT status,row_version FROM tasks WHERE id='legacy-1'")
        .get(),
      { status: "snoozed", row_version: 8 },
    );
    assert.deepEqual(report(legacy(["import", "-"], { stdin: open })).totals, {
      created: 0,
      updated: 1,
      unchanged: 0,
      rejected: 0,
    });
    assert.deepEqual(
      legacyRead
        .query("SELECT status,row_version FROM tasks WHERE id='legacy-1'")
        .get(),
      { status: "open", row_version: 9 },
    );
    legacy(["reopen", "legacy-1", "--expected-version", "9"], { exit: 2 });
    legacy(["import", "-"], {
      stdin: JSON.stringify([
        { external_id: "legacy:snoozed", title: "", from_version: 1 },
      ]),
      exit: 2,
    });
    legacy(["import", "-"], {
      stdin: JSON.stringify([
        {
          external_id: "legacy:snoozed",
          title: "Duplicate A",
          from_version: 1,
        },
        {
          external_id: "legacy:snoozed",
          title: "Duplicate B",
          from_version: 1,
        },
      ]),
      exit: 2,
    });
    const versions = Schema.decodeUnknownSync(
      Schema.Array(Schema.Struct({ from_version: Schema.Int })),
    )(
      legacyRead
        .query(
          "SELECT from_version FROM op_log WHERE reason='validation' ORDER BY seq DESC LIMIT 3",
        )
        .all(),
    );
    assert.deepEqual(
      versions.map((row) => row.from_version),
      [1, 1, 1],
    );
    assert.equal(
      JSON.stringify(
        legacyRead
          .query(
            "SELECT id,payload FROM tasks WHERE profile_id<>'work' ORDER BY id",
          )
          .all(),
      ),
      otherProfiles,
    );
  } finally {
    legacyRead.close();
  }
  writeFileSync(
    join(evidence, "review-regressions.json"),
    JSON.stringify(
      {
        passed: true,
        purgeRedactsRejectedContent: true,
        combinedTagsUnchanged: true,
        projectIdPrecedenceUnchanged: true,
        conflictExpectedVersion: 1,
        validationExpectedVersion: 1,
        legacySnoozedReopenedAtVersion: 9,
        untouchedProfilesPreserved: true,
      },
      null,
      2,
    ),
  );
  writeFileSync(
    join(evidence, "result.json"),
    JSON.stringify(
      {
        passed: true,
        compiled_binary: binary,
        dry_run_source_unchanged: true,
        idempotent: true,
        schema: true,
        stale_exit: 4,
        final,
      },
      null,
      2,
    ),
  );
} finally {
  if (server && server.exitCode === null && server.signalCode === null) {
    const stopped = new Promise<void>((done) =>
      server?.once("exit", () => done()),
    );
    const timer = setTimeout(() => server?.kill("SIGKILL"), 2000);
    server.kill("SIGTERM");
    await stopped;
    clearTimeout(timer);
  }
  writeFileSync(join(evidence, "server.log"), serverLog);
  writeFileSync(
    join(evidence, "actions.json"),
    JSON.stringify(actions, null, 2),
  );
  rmSync(scratch, { recursive: true, force: true });
}
assert.ok(readFileSync(join(evidence, "result.json"), "utf8"));
process.stdout.write(`PASS; evidence survived cleanup: ${evidence}\n`);

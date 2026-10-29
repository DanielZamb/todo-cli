import { Database } from "bun:sqlite";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, expect, it } from "@effect/vitest";
import {
  ActorId,
  Instant,
  OpLogEntry,
  Profile,
  Project,
  Task,
} from "@todo/domain";
import { TasksResponse } from "@todo/domain/presentation";
import { openStore } from "@todo/domain/store";
import { Effect, Schema } from "effect";

const root = resolve(import.meta.dirname, "../../..");
const scratch = mkdtempSync(join(tmpdir(), "todo-c05-test-"));
const binary = process.env.TODO_CLI_BINARY || join(scratch, "todo");
const evidence = process.env.TODO_CLI_EVIDENCE;
const records: {
  command: readonly string[];
  exit: number | null;
  stdout: string;
  stderr: string;
}[] = [];
const taskEnvelope = Schema.Struct({
  task: Schema.Struct({
    id: Schema.String,
    title: Schema.String,
    status: Schema.String,
    row_version: Schema.Number,
    project: Schema.optionalKey(Schema.String),
    tags: Schema.optionalKey(Schema.Array(Schema.String)),
    due_at: Schema.optionalKey(Schema.String),
    energy: Schema.optionalKey(Schema.Number),
  }),
});
const taskFrom = (out: string) =>
  Schema.decodeUnknownSync(taskEnvelope)(JSON.parse(out)).task;
const normalize = (text: string) =>
  text.replace(
    /"(generated_at|created_at|updated_at)"\s*:\s*"[^"]+"/g,
    '"$1": "<TS>"',
  );
const digest = (text: string) =>
  createHash("sha256").update(text).digest("hex");
function run(home: string, args: readonly string[], input = "") {
  mkdirSync(home, { recursive: true });
  const result = spawnSync(binary, args, {
    input,
    cwd: home,
    encoding: "utf8",
    env: { ...process.env, HOME: home, TODO_DB: "" },
    timeout: 20000,
  });
  if (result.error) throw result.error;
  records.push({
    command: [
      "todo",
      ...args.map((arg, i) =>
        args[i - 1] === "--password" ? "<scratch>" : arg,
      ),
    ],
    exit: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  });
  return { code: result.status, out: result.stdout, err: result.stderr };
}
const ok = (home: string, args: readonly string[], input = "") => {
  const result = run(home, args, input);
  expect(result.code, result.err).toBe(0);
  return result.out;
};
function setup(name: string, profile = "default") {
  const home = join(scratch, name);
  ok(home, ["init", "--password", "scratch-passphrase", "--profile", profile]);
  ok(
    home,
    ["login", "--password-stdin", "--profile", profile],
    "scratch-passphrase\n",
  );
  return home;
}
beforeAll(() => {
  if (!process.env.TODO_CLI_BINARY) {
    const result = spawnSync(
      "bun",
      [
        "build",
        "--compile",
        join(root, "apps/cli/src/main.ts"),
        "--outfile",
        binary,
      ],
      { cwd: scratch, encoding: "utf8" },
    );
    expect(result.status, result.stderr).toBe(0);
  }
  if (evidence) mkdirSync(evidence, { recursive: true });
});
afterAll(() => {
  if (evidence)
    writeFileSync(
      join(evidence, "actions.json"),
      `${JSON.stringify(records, null, 2)}\n`,
    );
  rmSync(scratch, { recursive: true, force: true });
  expect(existsSync(scratch)).toBe(false);
  if (evidence) expect(existsSync(join(evidence, "actions.json"))).toBe(true);
});
it("combines Project and Tag filters within Inbox and reports every active filter", () => {
  const home = setup("project-tag-filters");
  const add = (title: string, ...flags: string[]) =>
    taskFrom(ok(home, ["add", title, "--format", "json", ...flags]));
  add(
    "Unplanned launch revenue",
    "--project",
    "Client Launch",
    "--tag",
    "Revenue",
    "--tag",
    "review",
  );
  add(
    "Dated launch revenue",
    "--project",
    "Client Launch",
    "--tag",
    "revenue",
    "--due",
    "2030-11-01",
  );
  add(
    "Scheduled launch revenue",
    "--project",
    "Client Launch",
    "--tag",
    "revenue",
    "--scheduled",
    "2030-11-02",
  );
  add("Other Project revenue", "--project", "Operations", "--tag", "revenue");
  add("Launch compliance", "--project", "Client Launch", "--tag", "compliance");
  add("Launch without Tags", "--project", "Client Launch");
  const done = add(
    "Completed launch revenue",
    "--project",
    "Client Launch",
    "--tag",
    "revenue",
  );
  ok(home, ["done", done.id, "--expected-version", "1"]);
  const deleted = add(
    "Deleted launch revenue",
    "--project",
    "Client Launch",
    "--tag",
    "revenue",
  );
  ok(home, ["rm", deleted.id, "--expected-version", "1"]);
  const list = (...flags: string[]) =>
    Schema.decodeUnknownSync(TasksResponse)(
      JSON.parse(ok(home, ["list", "--format", "json", ...flags])),
    );
  const titles = (...flags: string[]) =>
    (list(...flags).tasks ?? []).map((task) => task.title).sort();
  expect(titles("--project", "Client Launch", "--tag", "revenue")).toEqual([
    "Completed launch revenue",
    "Dated launch revenue",
    "Scheduled launch revenue",
    "Unplanned launch revenue",
  ]);
  const flags = ["--inbox", "--project", "Client Launch", "--tag", " REVENUE "];
  expect(titles(...flags)).toEqual(["Unplanned launch revenue"]);
  expect(list(...flags).filters).toEqual({
    inbox: "true",
    project: "Client Launch",
    tag: " REVENUE ",
  });
  expect(titles("--tag", "revenue", "--status", "open")).toEqual([
    "Dated launch revenue",
    "Other Project revenue",
    "Scheduled launch revenue",
    "Unplanned launch revenue",
  ]);
  expect(titles("--inbox", "--project", "Client Launch")).toEqual([
    "Launch compliance",
    "Launch without Tags",
    "Unplanned launch revenue",
  ]);
  expect(list("--project", "Unknown Project").tasks).toBeUndefined();
  expect(list("--tag", "unknown").tasks).toBeUndefined();
  for (const format of ["md", "table"]) {
    const text = ok(home, ["list", ...flags, "--format", format]);
    expect(text).toContain("Unplanned launch revenue");
    expect(text).not.toContain("Dated launch revenue");
    expect(text).not.toContain("Other Project revenue");
  }
  ok(home, ["init", "--profile", "personal"]);
  ok(home, ["login", "--profile", "personal"], "scratch-passphrase\n");
  add(
    "Personal launch revenue",
    "--profile",
    "personal",
    "--project",
    "Client Launch",
    "--tag",
    "revenue",
  );
  expect(titles(...flags)).toEqual(["Unplanned launch revenue"]);
  expect(titles(...flags, "--profile", "personal")).toEqual([
    "Personal launch revenue",
  ]);
});
it.effect("drives every frozen Go golden byte for byte", () =>
  Effect.gen(function* () {
    const home = setup("golden", "u-golden");
    const now = Schema.decodeUnknownSync(Instant)(new Date().toISOString());
    const profile = Schema.decodeUnknownSync(Profile)({
      id: "u-golden",
      name: "u-golden",
      created_at: now,
      updated_at: now,
    });
    const project = Schema.decodeUnknownSync(Project)({
      id: "project-golden",
      profile_id: profile.id,
      name: "work",
      created_at: now,
      updated_at: now,
    });
    yield* Effect.acquireUseRelease(
      openStore({ path: join(home, ".todo-cli/todo.db") }),
      (store) =>
        Effect.gen(function* () {
          for (const [id, title, priority, status, hasProject, due] of [
            [
              "a-overdue",
              "Overdue Task",
              "P1",
              "open",
              true,
              {
                kind: "instant",
                utc: "2000-01-01T09:00:00Z",
                time_zone: "UTC",
              },
            ],
            ["b-inbox", "Inbox Task", "P3", "open", false, null],
            ["c-done", "Done Task", "P4", "done", true, null],
          ]) {
            const task = Schema.decodeUnknownSync(Task)({
              id,
              profile_id: profile.id,
              entity_version: 1,
              row_version: 1,
              title,
              description: null,
              project_id: hasProject ? project.id : null,
              priority,
              status,
              scheduled_at: null,
              due_at: due,
              energy: null,
              estimate_min: null,
              source: "manual",
              tags: [],
              occurrence: null,
              created_at: now,
              updated_at: now,
              completed_at: null,
              deleted_at: null,
            });
            const entry = yield* store.append({
              actor: Schema.decodeUnknownSync(ActorId)("golden-fixture"),
              profile: profile.id,
              event: {
                kind: "TaskCreated",
                entity_version: 1,
                occurred_at: now,
                task,
                series: null,
                project: hasProject ? project : null,
                tags: [],
              },
            });
            expect(entry.outcome).toBe("committed");
          }
        }),
      (store) => Effect.orDie(store.close()),
    );
    const cases = [
      ["review_daily.golden", ["review", "daily"]],
      ["review_weekly.golden", ["review", "weekly"]],
      ["export_default_md.golden", ["export"]],
      ["export_jira_md.golden", ["export", "--template", "jira-context"]],
      ["export_default_json.golden", ["--format", "json", "export"]],
    ] satisfies readonly (readonly [string, readonly string[]])[];
    const directory = join(root, "apps/cli/test/golden");
    expect(cases.map(([name]) => name).sort()).toEqual(
      readdirSync(directory).sort(),
    );
    const hashes = [];
    for (const [name, args] of cases) {
      const raw = ok(home, ["--profile", "u-golden", ...args]);
      const actual = name.endsWith("json.golden") ? normalize(raw) : raw;
      const expected = readFileSync(join(directory, name), "utf8");
      if (evidence) {
        writeFileSync(join(evidence, name), actual);
        writeFileSync(join(evidence, `${name}.raw`), raw);
      }
      expect(actual).toBe(expected);
      hashes.push({
        name,
        expected_sha256: digest(expected),
        actual_sha256: digest(actual),
        bytes: Buffer.byteLength(actual),
      });
    }
    if (evidence)
      writeFileSync(
        join(evidence, "goldens.json"),
        `${JSON.stringify(hashes, null, 2)}\n`,
      );
  }),
);
it.effect(
  "CRUD preserves metadata, rejects stale writes, and deletes then purges",
  () =>
    Effect.sync(() => {
      const home = setup("crud");
      const task = taskFrom(
        ok(home, [
          "add",
          "Ship CLI",
          "--format",
          "json",
          "--project",
          "work",
          "--tag",
          "cli",
          "--tag",
          "port",
          "--energy",
          "3",
          "--due",
          "2030-01-02",
        ]),
      );
      expect({
        title: task.title,
        row_version: task.row_version,
        project: task.project,
        tags: task.tags,
        due_at: task.due_at,
      }).toEqual({
        title: "Ship CLI",
        row_version: 1,
        project: "work",
        tags: ["cli", "port"],
        due_at: "2030-01-02",
      });
      expect(
        run(home, ["edit", task.id, "--title", "Missing version"]).code,
      ).toBe(2);
      const edited = taskFrom(
        ok(home, [
          "edit",
          task.id,
          "--title",
          "Ship compiled CLI",
          "--expected-version",
          "1",
          "--format",
          "json",
        ]),
      );
      expect({
        title: edited.title,
        row_version: edited.row_version,
        project: edited.project,
        tags: edited.tags,
        energy: edited.energy,
      }).toEqual({
        title: "Ship compiled CLI",
        row_version: 2,
        project: "work",
        tags: ["cli", "port"],
        energy: 3,
      });
      for (const format of ["md", "json", "table"]) {
        const conflict = run(home, [
          "edit",
          task.id,
          "--title",
          "stale",
          "--expected-version",
          "1",
          "--format",
          format,
        ]);
        expect(conflict.code).toBe(4);
        const error = format === "json" ? conflict.out : conflict.err;
        expect(error).toContain("occ_conflict");
        expect(error).toContain("Ship compiled CLI");
      }
      expect(
        taskFrom(
          ok(home, [
            "done",
            task.id,
            "--expected-version",
            "2",
            "--format",
            "json",
          ]),
        ).status,
      ).toBe("done");
      expect(
        taskFrom(
          ok(home, [
            "reopen",
            task.id,
            "--expected-version",
            "3",
            "--format",
            "json",
          ]),
        ).row_version,
      ).toBe(4);
      expect(
        taskFrom(
          ok(home, [
            "cancel",
            task.id,
            "--expected-version",
            "4",
            "--format",
            "json",
          ]),
        ).status,
      ).toBe("cancelled");
      expect(ok(home, ["rm", task.id, "--expected-version", "5"])).toBe(
        "deleted\n",
      );
      expect(run(home, ["show", task.id]).code).toBe(3);
      expect(ok(home, ["list"])).toBe("# Tasks\n\n_No tasks found._\n");
      expect(
        run(home, ["rm", task.id, "--force", "--expected-version", "5"]).code,
      ).toBe(4);
      expect(
        ok(home, ["rm", task.id, "--force", "--expected-version", "6"]),
      ).toBe("deleted\n");
      const historyText = ok(home, ["history", task.id, "--format", "json"]);
      const history = Schema.decodeUnknownSync(Schema.Array(OpLogEntry))(
        JSON.parse(historyText).entries,
      );
      expect(history.map((entry) => entry.event.kind)).toEqual(
        Array(11).fill("TaskHistoryRedacted"),
      );
      expect(
        history
          .filter((entry) => entry.outcome === "rejected")
          .map((entry) => entry.reason),
      ).toEqual(["conflict", "conflict", "conflict", "conflict"]);
      for (const content of [
        "Ship CLI",
        "Ship compiled CLI",
        '"violations"',
        '"tags" : ["cli"',
      ])
        expect(historyText).not.toContain(content);
      expect(ok(home, ["history", task.id])).toContain("TaskPurged [redacted]");
      expect(ok(home, ["history", task.id, "--format", "table"])).toContain(
        "TaskCreated [redacted]",
      );
      const db = new Database(join(home, ".todo-cli/todo.db"), {
        readonly: true,
      });
      try {
        expect(
          db
            .query<{ count: number }, []>("SELECT count(*) AS count FROM tasks")
            .get()?.count,
        ).toBe(0);
        expect(
          db
            .query<{ count: number }, []>(
              "SELECT count(*) AS count FROM op_log WHERE outcome='rejected' AND reason='conflict'",
            )
            .get()?.count,
        ).toBe(4);
        if (evidence)
          writeFileSync(
            join(evidence, "crud-history.json"),
            JSON.stringify(
              db.query("SELECT seq, outcome, reason, event FROM op_log").all(),
              null,
              2,
            ),
          );
      } finally {
        db.close();
      }
    }),
);
it.effect("init reads the first passphrase line from stdin", () =>
  Effect.sync(() => {
    const home = join(scratch, "init-stdin");
    expect(
      ok(home, ["init", "--password-stdin"], "scratch-passphrase\r\nignored\n"),
    ).toBe("initialized\n");
    expect(
      ok(home, ["login", "--password-stdin"], "scratch-passphrase\n"),
    ).toContain("logged in as owner");
    expect(ok(home, ["list"])).toBe("# Tasks\n\n_No tasks found._\n");
    expect(run(home, ["init", "--password-stdin"], "\n").code).toBe(2);
    expect(
      run(
        home,
        ["init", "--password-stdin", "--password", "other"],
        "scratch-passphrase\n",
      ).code,
    ).toBe(2);
    expect(run(home, ["login", "--password-stdin"], "other\n").code).toBe(3);
  }),
);
it.effect("Profiles isolate tasks and logout revokes the Session", () =>
  Effect.sync(() => {
    const home = setup("profiles");
    const task = taskFrom(
      ok(home, ["add", "Private work", "--format", "json"]),
    );
    ok(
      home,
      ["login", "--profile", "personal", "--password-stdin"],
      "scratch-passphrase\n",
    );
    expect(ok(home, ["--profile", "personal", "list"])).toBe(
      "# Tasks\n\n_No tasks found._\n",
    );
    expect(run(home, ["--profile", "personal", "show", task.id]).code).toBe(3);
    expect(
      run(home, [
        "--profile",
        "personal",
        "edit",
        task.id,
        "--title",
        "leak",
        "--expected-version",
        "1",
      ]).code,
    ).toBe(3);
    expect(ok(home, ["whoami"])).toContain("owner (default) expires");
    expect(ok(home, ["logout"])).toBe("logged out\n");
    expect(run(home, ["list"]).code).toBe(3);
    expect(run(home, ["login", "--password-stdin"], "wrong\n").code).toBe(3);
  }),
);
it.effect(
  "export scopes and Obsidian projection write real files and preserve outside content",
  () =>
    Effect.sync(() => {
      const home = setup("files");
      const task = taskFrom(
        ok(home, [
          "add",
          "Write projection",
          "--project",
          "work",
          "--format",
          "json",
        ]),
      );
      const output = join(home, "export.md");
      expect(
        ok(home, ["export", "--scope", `id:${task.id}`, "--output", output]),
      ).toBe(`${output}\n`);
      expect(readFileSync(output, "utf8")).toBe(
        `# Tasks\n\n- [ ] [P3] Write projection (id: ${task.id}, v:1) @work\n`,
      );
      expect(ok(home, ["export", "--scope", "project:other"])).toBe(
        "# Tasks\n\n_No tasks found._\n",
      );
      expect(run(home, ["export", "--scope", "bad"]).code).toBe(2);
      const vault = join(home, "vault");
      mkdirSync(vault);
      const file = join(vault, "Tasks.md");
      writeFileSync(
        file,
        "Keep before\n<!-- todo-cli:begin -->\nold\n<!-- todo-cli:end -->\nKeep after\n",
      );
      ok(home, ["sync", "obsidian", "--vault", vault, "--file", "Tasks.md"]);
      ok(home, ["sync", "obsidian", "--vault", vault, "--file", "Tasks.md"]);
      const body = readFileSync(file, "utf8");
      expect(body.startsWith("Keep before\n")).toBe(true);
      expect(body.endsWith("Keep after\n")).toBe(true);
      expect(body.match(/<!-- todo-cli:begin -->/g)?.length).toBe(1);
      expect(body).toContain("Write projection");
      expect(body).not.toContain("\nold\n");
      expect(
        run(home, [
          "sync",
          "obsidian",
          "--vault",
          vault,
          "--file",
          "../escape.md",
        ]).code,
      ).toBe(2);
      expect(existsSync(join(home, "escape.md"))).toBe(false);
      expect(statSync(join(home, ".todo-cli/todo.db")).mode & 0o777).toBe(
        0o600,
      );
      if (evidence) {
        writeFileSync(join(evidence, "obsidian.md"), body);
        writeFileSync(join(evidence, "export.md"), readFileSync(output));
      }
    }),
);
it.effect(
  "help, manual, config, validation, and table output use the compiled adapter",
  () =>
    Effect.sync(() => {
      const home = join(scratch, "help");
      const help = ok(home, ["--help"]);
      expect(ok(home, ["help"])).toBe(help);
      expect(ok(home, ["help", "add"])).toContain("--due");
      for (const text of [
        "Todo CLI: local-first task tracking",
        "--db",
        "--profile",
        "--format",
        "--no-color",
        "Exit codes",
        "Examples",
      ])
        expect(help).toContain(text);
      for (const text of [
        "--desc",
        "--project",
        "--priority",
        "--due",
        "--scheduled",
        "--energy",
        "--estimate",
      ])
        expect(ok(home, ["add", "--help"])).toContain(text);
      expect(ok(home, ["man", "edit"])).toContain("optimistic concurrency");
      expect(ok(home, ["--help-human-flag"])).toContain("Tip for humans:");
      expect(run(home, ["unknown"]).code).toBe(2);
      ok(home, ["config", "set", "db.path", join(home, "custom.db")]);
      expect(ok(home, ["config", "get", "db.path"])).toBe(
        `${join(home, "custom.db")}\n`,
      );
      ok(home, ["init", "--password", "scratch-passphrase"]);
      ok(home, ["login", "--password-stdin"], "scratch-passphrase\n");
      for (const args of [
        ["add", ""],
        ["add", "bad", "--energy", "6"],
        ["add", "bad", "--due", "2030-02-30"],
        ["add", "bad", "--source", "invalid"],
        ["add", "bad", "--estimate", "0"],
      ])
        expect(run(home, args).code).toBe(2);
      expect(ok(home, ["--format", "table", "list"])).toBe(
        "ID\tV\tSTATUS\tPRIO\tTITLE\n",
      );
      expect(existsSync(join(home, "custom.db"))).toBe(true);
    }),
);

it.effect(
  "structured Series creation and edits use the domain recurrence API",
  () =>
    Effect.sync(() => {
      const home = setup("series");
      const rule = JSON.stringify({
        dtstart: { kind: "date", date: "2030-01-01" },
        rrule: "FREQ=DAILY;COUNT=3",
        exdate: [],
      });
      const task = taskFrom(
        ok(home, [
          "add",
          "Recurring task",
          "--project",
          "recurrence-work",
          "--tag",
          "series",
          "--recurrence",
          rule,
          "--format",
          "json",
        ]),
      );
      expect({
        title: task.title,
        project: task.project,
        tags: task.tags,
      }).toEqual({
        title: "Recurring task",
        project: "recurrence-work",
        tags: ["series"],
      });
      const done = taskFrom(
        ok(home, [
          "done",
          task.id,
          "--expected-version",
          "1",
          "--format",
          "json",
        ]),
      );
      expect({ status: done.status, row_version: done.row_version }).toEqual({
        status: "done",
        row_version: 2,
      });
      const list = Schema.decodeUnknownSync(
        Schema.Struct({
          tasks: Schema.Array(
            Schema.Struct({
              id: Schema.String,
              status: Schema.String,
              scheduled_at: Schema.String,
            }),
          ),
        }),
      )(JSON.parse(ok(home, ["list", "--format", "json"])));
      expect(
        list.tasks.map((task) => ({
          status: task.status,
          scheduled_at: task.scheduled_at,
        })),
      ).toEqual([
        { status: "done", scheduled_at: "2030-01-01" },
        { status: "open", scheduled_at: "2030-01-02" },
      ]);
      const successor = list.tasks.find((task) => task.status === "open");
      if (!successor) throw new Error("Missing successor");
      const nextView = taskFrom(
        ok(home, ["show", successor.id, "--format", "json"]),
      );
      expect({ project: nextView.project, tags: nextView.tags }).toEqual({
        project: "recurrence-work",
        tags: ["series"],
      });
      expect(
        taskFrom(
          ok(home, [
            "edit",
            successor.id,
            "--recurrence",
            rule,
            "--expected-version",
            "1",
            "--format",
            "json",
          ]),
        ).row_version,
      ).toBe(2);
      expect(
        taskFrom(
          ok(home, [
            "edit",
            successor.id,
            "--recurrence",
            "",
            "--expected-version",
            "2",
            "--format",
            "json",
          ]),
        ).row_version,
      ).toBe(3);
      ok(home, ["cancel", successor.id, "--expected-version", "3"]);
      const standalone = taskFrom(
        ok(home, ["add", "Convert to Series", "--format", "json"]),
      );
      ok(home, [
        "edit",
        standalone.id,
        "--recurrence",
        rule,
        "--expected-version",
        "1",
      ]);
      ok(home, ["done", standalone.id, "--expected-version", "2"]);
      const db = new Database(join(home, ".todo-cli/todo.db"), {
        readonly: true,
      });
      try {
        expect(
          db
            .query<{ count: number }, []>("SELECT count(*) AS count FROM tasks")
            .get()?.count,
        ).toBe(4);
      } finally {
        db.close();
      }
    }),
);

it.effect(
  "Obsidian rejects output and parent symlinks outside the canonical vault",
  () =>
    Effect.sync(() => {
      const home = setup("symlink-containment");
      const vault = join(home, "vault");
      const outside = join(home, "outside");
      mkdirSync(vault);
      mkdirSync(outside);
      const target = join(outside, "untouched.md");
      writeFileSync(target, "outside original\n");
      symlinkSync(target, join(vault, "Tasks.md"));
      const output = run(home, [
        "sync",
        "obsidian",
        "--vault",
        vault,
        "--file",
        "Tasks.md",
      ]);
      expect({ code: output.code, out: output.out }).toEqual({
        code: 2,
        out: "",
      });
      expect(readFileSync(target, "utf8")).toBe("outside original\n");
      symlinkSync(outside, join(vault, "linked"));
      const parent = run(home, [
        "sync",
        "obsidian",
        "--vault",
        vault,
        "--file",
        "linked/new/note.md",
      ]);
      expect({ code: parent.code, out: parent.out }).toEqual({
        code: 2,
        out: "",
      });
      expect(existsSync(join(outside, "new"))).toBe(false);
      symlinkSync(join(outside, "missing.md"), join(vault, "dangling.md"));
      expect(
        run(home, [
          "sync",
          "obsidian",
          "--vault",
          vault,
          "--file",
          "dangling.md",
        ]).code,
      ).toBe(2);
      expect(existsSync(join(outside, "missing.md"))).toBe(false);
      const inside = join(vault, "inside");
      mkdirSync(inside);
      symlinkSync(inside, join(vault, "safe"));
      expect(
        ok(home, [
          "sync",
          "obsidian",
          "--vault",
          vault,
          "--file",
          "safe/note.md",
        ]),
      ).toBe(`${join(vault, "safe/note.md")}\n`);
      expect(readFileSync(join(inside, "note.md"), "utf8")).toContain(
        "# CLI Tasks\n",
      );
      symlinkSync(vault, join(home, "vault-alias"));
      ok(home, [
        "sync",
        "obsidian",
        "--vault",
        join(home, "vault-alias"),
        "--file",
        "alias.md",
      ]);
      expect(readFileSync(join(vault, "alias.md"), "utf8")).toContain(
        "# CLI Tasks\n",
      );
    }),
);
it.effect(
  "empty Obsidian vault arguments exit 2 and create no projection",
  () =>
    Effect.sync(() => {
      const home = setup("empty-vault");
      const before = readdirSync(home).sort();
      for (const vault of ["", " \t"]) {
        const result = run(home, ["sync", "obsidian", "--vault", vault]);
        expect({ code: result.code, out: result.out }).toEqual({
          code: 2,
          out: "",
        });
        expect(result.err).toContain("--vault is required");
        expect(readdirSync(home).sort()).toEqual(before);
        expect(existsSync(join(home, "Todo"))).toBe(false);
      }
    }),
);
it.effect(
  "malformed Session files preserve the auth_required exit contract",
  () =>
    Effect.sync(() => {
      const home = setup("malformed-session");
      const file = join(home, ".todo-cli/session_default.json");
      for (const body of [
        "not-json",
        "null",
        "[]",
        "{}",
        '{"token":42}',
        '{"token":""}',
        '{"token":" "}',
      ]) {
        writeFileSync(file, body);
        const result = run(home, ["--format", "table", "list"]);
        expect(result).toEqual({
          code: 3,
          out: "",
          err: "ERROR\tauth_required\trun todo login\n",
        });
        expect(readFileSync(file, "utf8")).toBe(body);
      }
    }),
);
it.effect(
  "every command has help guidance and the manual has a complete index",
  () =>
    Effect.sync(() => {
      const home = join(scratch, "complete-help");
      const commands = [
        [],
        ["init"],
        ["login"],
        ["logout"],
        ["whoami"],
        ["add"],
        ["list"],
        ["show"],
        ["edit"],
        ["done"],
        ["cancel"],
        ["reopen"],
        ["rm"],
        ["review"],
        ["review", "daily"],
        ["review", "weekly"],
        ["export"],
        ["sync"],
        ["sync", "obsidian"],
        ["config"],
        ["config", "set"],
        ["config", "get"],
        ["config", "show"],
        ["man"],
      ];
      for (const command of commands) {
        const text = ok(home, [...command, "--help"]);
        for (const section of ["Purpose:", "Exit codes:", "Examples:"])
          expect(text, command.join(" ")).toContain(section);
        expect(text.toLowerCase()).toContain("usage");
        for (const flag of ["--format", "--profile", "--db"])
          expect(text).toContain(flag);
      }
      expect(ok(home, ["add", "--help"])).toContain("Create a Task");
      const names = [
        "init",
        "login",
        "logout",
        "whoami",
        "add",
        "list",
        "show",
        "edit",
        "done",
        "cancel",
        "reopen",
        "rm",
        "review",
        "export",
        "sync",
        "config",
        "man",
      ];
      const index = ok(home, ["man"]);
      expect(index).toContain("# Todo CLI Manual");
      for (const name of names) {
        expect(index).toContain(`todo man ${name}`);
        const page = ok(home, ["man", name]);
        for (const section of [
          "## Synopsis",
          "## Detailed behavior",
          "## Flags",
          "## Output contracts",
          "## Concurrency",
          "## Auth",
          "## Practical examples",
          "## Exit codes",
        ])
          expect(page, name).toContain(section);
      }
      const exported = ok(home, ["man", "export"]);
      for (const flag of ["--scope", "--template", "--output"])
        expect(exported).toContain(flag);
      expect(exported).toContain(
        "today|weekly|project:<name>|id:<task-id>|all",
      );
      expect(exported).toContain(
        "todo export --scope project:work --template jira-context",
      );
      expect(run(home, ["man", "unknown"]).code).toBe(3);
    }),
);

it.effect("X01 rejected creation and missing edit keep History", () =>
  Effect.sync(() => {
    const home = setup("x01-rejected-history");
    expect(run(home, ["add", "Task", "--energy", "6"]).code).toBe(2);
    expect(
      run(home, [
        "edit",
        "missing-task",
        "--expected-version",
        "1",
        "--title",
        "Attempt",
      ]).code,
    ).toBe(3);
    const db = new Database(join(home, ".todo-cli/todo.db"), {
      readonly: true,
    });
    try {
      expect(
        db
          .query(
            "SELECT outcome,reason,from_version,json_extract(event,'$.attempted_kind') AS attempted_kind,json_extract(event,'$.task_id') AS task_id FROM op_log WHERE outcome='rejected' ORDER BY seq",
          )
          .all(),
      ).toEqual([
        {
          outcome: "rejected",
          reason: "validation",
          from_version: null,
          attempted_kind: "TaskCreated",
          task_id: null,
        },
        {
          outcome: "rejected",
          reason: "profile_mismatch",
          from_version: 1,
          attempted_kind: "TaskEdited",
          task_id: "missing-task",
        },
      ]);
      expect(db.query("SELECT title FROM tasks").all()).toEqual([]);
    } finally {
      db.close();
    }
  }),
);

it.effect(
  "C05 review regressions through the compiled CLI",
  () =>
    Effect.gen(function* () {
      const home = setup("c05-review");
      const rule = {
        dtstart: { kind: "date", date: "2030-01-01" },
        rrule: "FREQ=DAILY;COUNT=4",
        exdate: [],
      };
      const instantRule = {
        dtstart: {
          kind: "instant",
          utc: "2030-01-01T09:00:00Z",
          time_zone: "America/Bogota",
        },
        rrule: "FREQ=DAILY;COUNT=4",
        exdate: [],
      };
      const recurringView = Schema.Struct({
        id: Schema.String,
        title: Schema.String,
        row_version: Schema.Number,
        status: Schema.String,
        due_at: Schema.optionalKey(Schema.String),
        recurrence: Schema.Unknown,
        series_id: Schema.String,
        occurrence: Schema.Struct({
          series_id: Schema.String,
          date: Schema.String,
          time: Schema.Unknown,
        }),
      });
      const recurringTask = (out: string) =>
        Schema.decodeUnknownSync(Schema.Struct({ task: recurringView }))(
          JSON.parse(out),
        ).task;
      const recurringTasks = (out: string) =>
        Schema.decodeUnknownSync(
          Schema.Struct({ tasks: Schema.Array(recurringView) }),
        )(JSON.parse(out)).tasks;
      const first = recurringTask(
        ok(home, [
          "add",
          "Daily due",
          "--due",
          "2030-01-01",
          "--tag",
          "alpha",
          "--recurrence",
          JSON.stringify(rule),
          "--format",
          "json",
        ]),
      );
      for (const output of [
        ok(home, ["show", first.id, "--format", "json"]),
        ok(home, ["list", "--format", "json"]),
        ok(home, ["export", "--scope", "all", "--format", "json"]),
      ]) {
        const envelope = Schema.decodeUnknownSync(
          Schema.Struct({
            task: Schema.optionalKey(recurringView),
            tasks: Schema.optionalKey(Schema.Array(recurringView)),
          }),
        )(JSON.parse(output));
        const task = envelope.task ?? envelope.tasks?.[0];
        expect([
          task?.recurrence,
          task?.series_id,
          task?.occurrence.series_id,
        ]).toEqual([rule, first.series_id, first.series_id]);
      }
      expect(
        recurringTasks(
          ok(home, ["list", "--tag", "ALPHA", "--format", "json"]),
        ).map((task) => task.title),
      ).toEqual(["Daily due"]);
      ok(home, ["done", first.id, "--expected-version", "1"]);
      const second = recurringTasks(
        ok(home, ["list", "--format", "json"]),
      ).find((task) => task.status === "open");
      if (!second) throw new Error("Missing January 2");
      ok(home, [
        "edit",
        second.id,
        "--expected-version",
        "1",
        "--recurrence",
        JSON.stringify(rule),
      ]);
      ok(home, ["done", second.id, "--expected-version", "2"]);
      const third = recurringTasks(
        ok(home, ["list", "--format", "json"]),
      ).filter((task) => task.status === "open");
      expect(third.map((task) => [task.occurrence.date, task.due_at])).toEqual([
        ["2030-01-03", "2030-01-03"],
      ]);
      for (const action of ["done", "cancel"]) {
        const created = recurringTask(
          ok(home, [
            "add",
            `Change kind ${action}`,
            "--recurrence",
            JSON.stringify(rule),
            "--format",
            "json",
          ]),
        );
        ok(home, [
          "edit",
          created.id,
          "--expected-version",
          "1",
          "--recurrence",
          JSON.stringify(instantRule),
        ]);
        ok(home, [action, created.id, "--expected-version", "2"]);
        const next = recurringTasks(
          ok(home, ["list", "--format", "json"]),
        ).filter(
          (task) =>
            task.status === "open" && task.title === `Change kind ${action}`,
        );
        expect(
          next.map((task) => [task.occurrence.date, task.occurrence.time]),
        ).toEqual([
          [
            "2030-01-02",
            {
              kind: "instant",
              utc: "2030-01-02T09:00:00Z",
              time_zone: "America/Bogota",
            },
          ],
        ]);
      }
      const invalid = run(home, [
        "edit",
        first.id,
        "--expected-version",
        "2",
        "--energy",
        "6",
      ]);
      expect(invalid.code).toBe(2);
      const db = new Database(join(home, ".todo-cli/todo.db"), {
        readonly: true,
      });
      let rejected: unknown;
      try {
        rejected = db
          .query(
            "SELECT outcome,reason,from_version,json_extract(event,'$.attempted_kind') AS attempted_kind FROM op_log WHERE outcome='rejected'",
          )
          .all();
        expect(rejected).toEqual([
          {
            outcome: "rejected",
            reason: "validation",
            from_version: 2,
            attempted_kind: "TaskEdited",
          },
        ]);
        expect(
          db
            .query("SELECT row_version,energy FROM tasks WHERE id=?")
            .get(first.id),
        ).toEqual({ row_version: 2, energy: null });
      } finally {
        db.close();
      }
      const legacyHome = join(scratch, "c05-review-legacy");
      mkdirSync(join(legacyHome, ".todo-cli"), { recursive: true });
      const legacyPath = join(legacyHome, ".todo-cli/todo.db");
      const fixture = new Database(legacyPath);
      try {
        fixture.exec(
          readFileSync(
            join(root, "packages/domain/test/fixtures/v2-recurrence.sql"),
            "utf8",
          ),
        );
      } finally {
        fixture.close();
      }
      ok(legacyHome, [
        "init",
        "--profile",
        "work",
        "--password",
        "scratch-passphrase",
      ]);
      ok(
        legacyHome,
        ["login", "--profile", "work", "--password-stdin"],
        "scratch-passphrase\n",
      );
      ok(legacyHome, [
        "edit",
        "legacy-1",
        "--profile",
        "work",
        "--expected-version",
        "7",
        "--recurrence",
        "",
      ]);
      ok(legacyHome, [
        "done",
        "legacy-1",
        "--profile",
        "work",
        "--expected-version",
        "8",
      ]);
      const legacy = new Database(legacyPath, { readonly: true });
      let legacyTasks: unknown;
      try {
        legacyTasks = legacy
          .query(
            "SELECT id,status,row_version FROM tasks WHERE profile_id='work'",
          )
          .all();
        expect(legacyTasks).toEqual([
          { id: "legacy-1", status: "done", row_version: 9 },
        ]);
      } finally {
        legacy.close();
      }
      if (evidence)
        writeFileSync(
          join(evidence, "c05-review.json"),
          JSON.stringify(
            {
              recurrence: rule,
              series_id: first.series_id,
              january3: third,
              rejections: rejected,
              legacyTasks,
            },
            null,
            2,
          ),
        );
    }),
  30000,
);

it("F11 explicit stale Attachment writes record rejected History and dry runs do not", () => {
  const home = setup("f11-stale-attachments");
  const id = taskFrom(
    ok(home, ["add", "Attachment History", "--format", "json"]),
  ).id;
  const attached = Schema.decodeUnknownSync(
    Schema.Struct({
      task: Schema.Struct({
        attachments: Schema.Array(Schema.Struct({ id: Schema.String })),
      }),
    }),
  )(
    JSON.parse(
      ok(home, [
        "attach",
        id,
        "https://example.com/issue/42",
        "--format",
        "json",
      ]),
    ),
  );
  const attachment = attached.task.attachments[0]?.id;
  if (!attachment) throw new Error("Expected attached link");
  expect(
    run(home, [
      "attach",
      id,
      "https://example.com/stale",
      "--expected-version",
      "1",
      "--format",
      "json",
    ]).code,
  ).toBe(4);
  expect(
    run(home, [
      "detach",
      id,
      attachment,
      "--expected-version",
      "1",
      "--format",
      "json",
    ]).code,
  ).toBe(4);
  expect(
    run(home, [
      "detach",
      id,
      attachment,
      "--expected-version",
      "1",
      "--dry-run",
      "--format",
      "json",
    ]).code,
  ).toBe(4);
  const database = new Database(join(home, ".todo-cli/todo.db"), {
    readonly: true,
  });
  try {
    expect(
      database
        .query(
          "SELECT outcome, reason, from_version, json_extract(event,'$.attempted_kind') AS kind FROM op_log WHERE outcome='rejected' ORDER BY seq",
        )
        .all(),
    ).toEqual([
      {
        outcome: "rejected",
        reason: "conflict",
        from_version: 1,
        kind: "AttachmentAdded",
      },
      {
        outcome: "rejected",
        reason: "conflict",
        from_version: 1,
        kind: "AttachmentRemoved",
      },
    ]);
    expect(
      taskFrom(ok(home, ["show", id, "--format", "json"])).row_version,
    ).toBe(2);
  } finally {
    database.close();
  }
});

it("F11 labels preserve the attachment identity and location", () => {
  const home = setup("f11-label-editing");
  const id = taskFrom(
    ok(home, ["add", "Label editing", "--format", "json"]),
  ).id;
  const view = Schema.Struct({
    task: Schema.Struct({
      row_version: Schema.Number,
      attachments: Schema.Array(
        Schema.Struct({
          id: Schema.String,
          path: Schema.String,
          label: Schema.optionalKey(Schema.String),
          added_at: Schema.String,
        }),
      ),
    }),
  });
  const first = Schema.decodeUnknownSync(view)(
    JSON.parse(
      ok(home, ["attach", id, "/tmp/label-draft.md", "--format", "json"]),
    ),
  );
  const original = first.task.attachments[0];
  if (!original) throw new Error("Missing attachment");
  const marked = Schema.decodeUnknownSync(view)(
    JSON.parse(
      ok(home, [
        "label-attachment",
        id,
        original.id,
        "--label",
        "jira",
        "--format",
        "json",
      ]),
    ),
  );
  expect(marked.task).toEqual({
    row_version: 3,
    attachments: [{ ...original, label: "jira" }],
  });
  const cleared = Schema.decodeUnknownSync(view)(
    JSON.parse(
      ok(home, ["label-attachment", id, original.id, "--format", "json"]),
    ),
  );
  expect(cleared.task).toEqual({ row_version: 4, attachments: [original] });
});

it("moves and copies filtered Tasks between Profiles without losing metadata", () => {
  const home = setup("transfer");
  ok(home, ["init", "--profile", "personal"]);
  ok(
    home,
    ["login", "--profile", "personal", "--password-stdin"],
    "scratch-passphrase\n",
  );
  const unrelated = taskFrom(
    ok(home, ["add", "Unrelated source Task", "--format", "json"]),
  );
  const unrelatedBefore = JSON.parse(
    ok(home, ["show", unrelated.id, "--format", "json"]),
  ).task;
  const original = taskFrom(
    ok(home, [
      "add",
      "Transfer me",
      "--project",
      "ARG",
      "--tag",
      "focus",
      "--format",
      "json",
    ]),
  );
  ok(home, ["done", original.id, "--expected-version", "1"]);
  const before = JSON.parse(
    ok(home, ["show", original.id, "--format", "json"]),
  ).task;
  const preview = JSON.parse(
    ok(home, [
      "copy",
      "--project",
      "ARG",
      "--status",
      "done",
      "--to",
      "personal",
      "--dry-run",
      "--format",
      "json",
    ]),
  );
  expect(preview.results).toEqual([
    {
      source_id: original.id,
      target_id: null,
      outcome: "dry-run",
      occurrence_as_plain_task: false,
      managed_image_count: 0,
      managed_image_bytes: 0,
    },
  ]);
  expect(
    JSON.parse(ok(home, ["list", "--profile", "personal", "--format", "json"]))
      .tasks ?? [],
  ).toEqual([]);
  const copied = JSON.parse(
    ok(home, ["copy", original.id, "--to", "personal", "--format", "json"]),
  ).results[0];
  expect(copied.outcome).toBe("copied");
  expect(copied.source_id).toBe(original.id);
  expect(copied.target_id).not.toBe(original.id);
  ok(
    home,
    ["login", "--profile", "personal", "--password-stdin"],
    "scratch-passphrase\n",
  );
  const copy = JSON.parse(
    ok(home, [
      "show",
      copied.target_id,
      "--profile",
      "personal",
      "--format",
      "json",
    ]),
  ).task;
  expect([
    copy.title,
    copy.status,
    copy.project,
    copy.tags,
    copy.created_at,
  ]).toEqual(["Transfer me", "done", "ARG", ["focus"], before.created_at]);
  expect(
    JSON.parse(ok(home, ["show", original.id, "--format", "json"])).task,
  ).toEqual(before);
  expect(
    ok(home, ["history", copied.target_id, "--profile", "personal"]),
  ).toContain(`Copied from default / ${original.id}`);
  expect(
    JSON.parse(
      ok(home, ["move", original.id, "--to", "personal", "--format", "json"]),
    ).results,
  ).toEqual([
    {
      source_id: original.id,
      target_id: original.id,
      outcome: "moved",
      occurrence_as_plain_task: false,
    },
  ]);
  const moved = JSON.parse(
    ok(home, [
      "show",
      original.id,
      "--profile",
      "personal",
      "--format",
      "json",
    ]),
  ).task;
  expect([
    moved.id,
    moved.status,
    moved.project,
    moved.tags,
    moved.created_at,
  ]).toEqual([original.id, "done", "ARG", ["focus"], before.created_at]);
  expect(
    JSON.parse(ok(home, ["show", unrelated.id, "--format", "json"])).task,
  ).toEqual(unrelatedBefore);
}, 30000);

it("C10 emits one JSON error and reports stale Versions and missing Tasks per batch", () => {
  const home = setup("transfer-conflict");
  ok(home, ["init", "--profile", "personal"]);
  const first = taskFrom(
    ok(home, ["add", "Conflict Task", "--format", "json"]),
  );
  ok(home, [
    "edit",
    first.id,
    "--title",
    "Latest Task",
    "--expected-version",
    "1",
  ]);
  const missingFlag = run(home, ["move", first.id, "--format", "json"]);
  expect(missingFlag.code).toBe(2);
  expect(JSON.parse(missingFlag.out)).toMatchObject({
    code: "invalid_args",
    message: "--to <profile> is required",
  });
  const stale = run(home, [
    "copy",
    first.id,
    "missing-task",
    "--to",
    "personal",
    "--expected-version",
    "1",
    "--format",
    "json",
  ]);
  expect(stale.code).toBe(4);
  expect(JSON.parse(stale.out).details).toMatchObject({
    current_version: 2,
    latest: { id: first.id, title: "Latest Task", row_version: 2 },
  });
  expect(JSON.parse(stale.out).results).toEqual([
    {
      source_id: first.id,
      target_id: null,
      outcome: "conflict",
      occurrence_as_plain_task: false,
      current_version: 2,
    },
    {
      source_id: "missing-task",
      target_id: null,
      outcome: "not-found",
      occurrence_as_plain_task: false,
      message: "Task not found in the selected Profile and filters",
    },
  ]);
});

it("C10 continues a Move batch after a Conflict and leaves the conflicting Task unchanged", () => {
  const home = setup("transfer-mixed");
  ok(home, ["init", "--profile", "personal"]);
  ok(
    home,
    ["login", "--profile", "personal", "--password-stdin"],
    "scratch-passphrase\n",
  );
  const stale = taskFrom(
    ok(home, ["add", "Conflict stays here", "--format", "json"]),
  );
  const fresh = taskFrom(
    ok(home, [
      "add",
      "Move this accepted Task",
      "--project",
      "Mixed Project",
      "--tag",
      "mixed",
      "--format",
      "json",
    ]),
  );
  ok(home, [
    "edit",
    stale.id,
    "--title",
    "Latest stays here",
    "--expected-version",
    "1",
  ]);
  const before = JSON.parse(
    ok(home, ["show", stale.id, "--format", "json"]),
  ).task;
  const batch = run(home, [
    "move",
    stale.id,
    fresh.id,
    "--expected-version",
    "1",
    "--to",
    "personal",
    "--format",
    "json",
  ]);
  expect(batch.code).toBe(4);
  expect(JSON.parse(batch.out).results).toEqual([
    {
      source_id: stale.id,
      target_id: null,
      outcome: "conflict",
      occurrence_as_plain_task: false,
      current_version: 2,
    },
    {
      source_id: fresh.id,
      target_id: fresh.id,
      outcome: "moved",
      occurrence_as_plain_task: false,
    },
  ]);
  expect(
    JSON.parse(ok(home, ["show", stale.id, "--format", "json"])).task,
  ).toEqual(before);
  const moved = JSON.parse(
    ok(home, ["show", fresh.id, "--profile", "personal", "--format", "json"]),
  ).task;
  expect([
    moved.id,
    moved.title,
    moved.row_version,
    moved.project,
    moved.tags,
  ]).toEqual([
    fresh.id,
    "Move this accepted Task",
    2,
    "Mixed Project",
    ["mixed"],
  ]);
}, 30000);

it("C10 rejects explicit invalid Versions before transferring and accepts snoozed filters", () => {
  const home = setup("transfer-versions");
  ok(home, ["init", "--profile", "personal"]);
  const task = taskFrom(
    ok(home, ["add", "Version guarded", "--format", "json"]),
  );
  for (const command of ["move", "copy"]) {
    for (const version of ["0", "-1"]) {
      const result = run(home, [
        command,
        task.id,
        "--to",
        "personal",
        "--expected-version",
        version,
        "--format",
        "json",
      ]);
      expect(result.code).toBe(2);
      expect(JSON.parse(result.out)).toMatchObject({
        code: "invalid_args",
        message: "--expected-version must be a positive Version",
      });
    }
    const filtered = run(home, [
      command,
      "--status",
      "snoozed",
      "--to",
      "personal",
      "--dry-run",
      "--format",
      "json",
    ]);
    expect(filtered.code, filtered.err).toBe(0);
    expect(JSON.parse(filtered.out).results).toEqual([]);
  }
  expect(
    taskFrom(ok(home, ["show", task.id, "--format", "json"])).row_version,
  ).toBe(1);
}, 30000);

it.effect(
  "C10 transfers Tasks selected by the snoozed status filter",
  () =>
    Effect.gen(function* () {
      const home = setup("transfer-snoozed");
      ok(home, ["init", "--profile", "personal"]);
      ok(
        home,
        ["login", "--profile", "personal", "--password-stdin"],
        "scratch-passphrase\n",
      );
      const created = taskFrom(
        ok(home, ["add", "Snoozed selection", "--format", "json"]),
      );
      yield* Effect.acquireUseRelease(
        openStore({ path: join(home, ".todo-cli/todo.db") }),
        (store) =>
          Effect.gen(function* () {
            const before = (yield* store.tasks()).find(
              (task) => task.id === created.id,
            );
            if (!before) throw new Error("Missing snoozed fixture");
            const now = Schema.decodeUnknownSync(Instant)(
              new Date().toISOString(),
            );
            const after = Schema.decodeUnknownSync(Task)({
              ...before,
              status: "snoozed",
              row_version: 2,
              updated_at: now,
            });
            const result = yield* store.append({
              actor: Schema.decodeUnknownSync(ActorId)("c10-snoozed-fixture"),
              profile: before.profile_id,
              event: {
                kind: "TaskEdited",
                entity_version: 1,
                occurred_at: now,
                before,
                after,
                series_before: null,
                series_after: null,
                project_before: null,
                project_after: null,
                tags_before: [],
                tags_after: [],
              },
            });
            expect(result.outcome).toBe("committed");
          }),
        (store) => Effect.orDie(store.close()),
      );
      expect(
        JSON.parse(
          ok(home, ["list", "--status", "snoozed", "--format", "json"]),
        ).tasks.map((task: { id: string }) => task.id),
      ).toEqual([created.id]);
      const copied = JSON.parse(
        ok(home, [
          "copy",
          "--status",
          "snoozed",
          "--to",
          "personal",
          "--format",
          "json",
        ]),
      ).results[0];
      expect([copied.source_id, copied.outcome]).toEqual([
        created.id,
        "copied",
      ]);
      expect(
        taskFrom(
          ok(home, [
            "show",
            copied.target_id,
            "--profile",
            "personal",
            "--format",
            "json",
          ]),
        ).status,
      ).toBe("snoozed");
      expect(
        JSON.parse(
          ok(home, [
            "move",
            "--status",
            "snoozed",
            "--to",
            "personal",
            "--format",
            "json",
          ]),
        ).results,
      ).toEqual([
        {
          source_id: created.id,
          target_id: created.id,
          outcome: "moved",
          occurrence_as_plain_task: false,
        },
      ]);
    }),
  30000,
);

it("lists and deletes Profiles with a non-writing preview and recoverable Tasks", () => {
  const home = setup("delete-profile", "work");
  ok(home, ["init", "--profile", "personal"]);
  const task = taskFrom(
    ok(home, [
      "add",
      "Keep the History",
      "--profile",
      "work",
      "--format",
      "json",
    ]),
  );
  const command = [
    "profile",
    "delete",
    "work",
    "--profile",
    "work",
    "--format",
    "json",
  ];
  const refused = run(home, command);
  expect(refused.code).toBe(2);
  expect(JSON.parse(refused.out)).toMatchObject({
    code: "profile_not_empty",
    details: { visible_task_count: 1 },
  });
  const preview = JSON.parse(
    ok(home, [...command, "--with-tasks", "--dry-run"]),
  );
  expect(preview).toMatchObject({
    dry_run: true,
    tasks_affected: 1,
    sessions_revoked: 0,
    access_tokens_revoked: 0,
  });
  expect(
    JSON.parse(
      ok(home, ["profile", "list", "--profile", "work", "--format", "json"]),
    ).profiles.map((p: { name: string }) => p.name),
  ).toEqual(["personal", "work"]);
  expect(JSON.parse(ok(home, [...command, "--with-tasks"]))).toMatchObject({
    dry_run: false,
    tasks_affected: 1,
  });
  const db = new Database(join(home, ".todo-cli", "todo.db"), {
    readonly: true,
  });
  try {
    expect(
      db
        .query<{ row_version: number; deleted_at: string }, [string]>(
          "SELECT row_version,deleted_at FROM tasks WHERE id=?",
        )
        .get(task.id)?.row_version,
    ).toBe(2);
    expect(
      db
        .query("SELECT 1 FROM tasks WHERE id=? AND deleted_at IS NOT NULL")
        .get(task.id),
    ).not.toBeNull();
    expect(
      db
        .query(
          "SELECT 1 FROM op_log WHERE json_extract(event,'$.kind')='ProfileDeleted'",
        )
        .get(),
    ).not.toBeNull();
  } finally {
    db.close();
  }
  ok(
    home,
    ["login", "--password-stdin", "--profile", "personal"],
    "scratch-passphrase\n",
  );
  expect(
    JSON.parse(
      ok(home, [
        "profile",
        "list",
        "--profile",
        "personal",
        "--format",
        "json",
      ]),
    ).profiles.map((p: { name: string }) => p.name),
  ).toEqual(["personal"]);
  const last = run(home, [
    "profile",
    "delete",
    "personal",
    "--profile",
    "personal",
    "--format",
    "json",
  ]);
  expect(last.code).toBe(2);
  expect(JSON.parse(last.out).code).toBe("last_profile");
  expect(run(home, ["init", "--profile", "work"]).code).toBe(0);
  const reused = JSON.parse(
    ok(home, ["profile", "list", "--profile", "personal", "--format", "json"]),
  ).profiles.find((p: { name: string }) => p.name === "work");
  expect(reused.id).not.toBe("work");
});

it("adds inline Project and Tags through the shared quick-add grammar", () => {
  const home = setup("inline-metadata");
  const task = taskFrom(
    ok(home, [
      "add",
      "--parse",
      'Prepare #"deep focus" #ready @"Client Project" p1',
      "--format",
      "json",
    ]),
  );
  expect([task.title, task.project, task.tags]).toEqual([
    "Prepare",
    "Client Project",
    ["deep focus", "ready"],
  ]);
  const reused = taskFrom(
    ok(home, [
      "add",
      "--parse",
      'Reuse #ready @"Client Project"',
      "--format",
      "json",
    ]),
  );
  expect([reused.title, reused.project, reused.tags]).toEqual([
    "Reuse",
    "Client Project",
    ["ready"],
  ]);
});

it("parses without writing and keeps literal add titles verbatim", () => {
  const home = setup("parse-only");
  const literal = taskFrom(
    ok(home, ["add", "#821 Big 4: shared by #809, #822", "--format", "json"]),
  );
  expect([literal.title, literal.project, literal.tags]).toEqual([
    "#821 Big 4: shared by #809, #822",
    undefined,
    undefined,
  ]);
  const before = ok(home, ["list", "--format", "json"]);
  const result = Schema.decodeUnknownSync(
    Schema.Struct({ generated_at: Schema.String, draft: Schema.Unknown }),
  )(
    JSON.parse(
      ok(home, [
        "parse",
        'Prepare #"deep focus" @"Client Project" p1',
        "--format",
        "json",
      ]),
    ),
  );
  expect(result.draft).toEqual({
    title: "Prepare",
    due_at: null,
    scheduled_at: null,
    priority: "P1",
    tags: ["deep focus"],
    project: "Client Project",
  });
  expect(normalize(ok(home, ["list", "--format", "json"]))).toEqual(
    normalize(before),
  );
});

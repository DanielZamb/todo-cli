import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, expect, it } from "@effect/vitest";
import { JsonSchema, Schema, SchemaRepresentation } from "effect";

const scratch = mkdtempSync(join(tmpdir(), "todo-c12-contract-"));
const binary = process.env.TODO_CLI_BINARY || join(scratch, "todo");
const serverBinary =
  process.env.TODO_SERVER_BINARY || join(scratch, "todo-server");
let diagnosticsServer: ChildProcess | undefined;
let diagnosticsLog = "";
const actions: {
  args: readonly string[];
  code: number | null;
  out: string;
  err: string;
}[] = [];
function run(args: readonly string[], input = "", home = scratch) {
  mkdirSync(home, { recursive: true });
  const result = spawnSync(binary, args, {
    input,
    encoding: "utf8",
    env: { ...process.env, HOME: home, TODO_DB: "" },
    timeout: 20000,
  });
  if (result.error) throw result.error;
  const action = {
    code: result.status,
    out: result.stdout,
    err: result.stderr,
  };
  actions.push({
    args: args.map((arg, i) =>
      args[i - 1] === "--password" ? "<scratch>" : arg,
    ),
    ...action,
  });
  return action;
}
beforeAll(() => {
  if (!process.env.TODO_SERVER_BINARY) {
    const build = spawnSync(
      "bun",
      [
        "build",
        "--compile",
        resolve(import.meta.dirname, "../../server/src/main.ts"),
        "--outfile",
        serverBinary,
      ],
      { encoding: "utf8", cwd: scratch },
    );
    expect(build.status, build.stderr).toBe(0);
  }
  if (!process.env.TODO_CLI_BINARY) {
    const build = spawnSync(
      "bun",
      [
        "build",
        "--compile",
        resolve(import.meta.dirname, "../src/main.ts"),
        "--outfile",
        binary,
      ],
      { encoding: "utf8", cwd: scratch },
    );
    expect(build.status, build.stderr).toBe(0);
  }
});
afterAll(async () => {
  if (
    diagnosticsServer &&
    diagnosticsServer.exitCode === null &&
    diagnosticsServer.signalCode === null
  ) {
    const server = diagnosticsServer;
    const stopped = new Promise<void>((done) =>
      server.once("exit", () => done()),
    );
    server.kill("SIGTERM");
    const timer = setTimeout(() => server.kill("SIGKILL"), 3000);
    await stopped;
    clearTimeout(timer);
  }
  if (process.env.TODO_CLI_EVIDENCE)
    writeFileSync(
      join(process.env.TODO_CLI_EVIDENCE, "contract-server.log"),
      diagnosticsLog,
    );
  if (process.env.TODO_CLI_EVIDENCE)
    writeFileSync(
      join(process.env.TODO_CLI_EVIDENCE, "contract-actions.json"),
      `${JSON.stringify(actions, null, 2)}\n`,
    );
  rmSync(scratch, { recursive: true, force: true });
});
it("publishes the Task and shared error schemas", () => {
  const task = run(["schema", "add"]);
  expect(task.code, task.err).toBe(0);
  expect(JSON.parse(task.out)).toMatchObject({
    type: "object",
    required: ["generated_at", "task"],
  });
  const error = run(["schema", "error"]);
  expect(error.code, error.err).toBe(0);
  expect(JSON.parse(error.out)).toMatchObject({
    type: "object",
    required: ["generated_at", "code", "message"],
  });
});

it("publishes Move and Copy batch schemas", () => {
  for (const command of ["move", "copy"]) {
    const result = run(["schema", command]);
    expect(result.code, result.err).toBe(0);
    expect(JSON.parse(result.out)).toMatchObject({
      type: "object",
      required: ["generated_at", "dry_run", "results"],
      properties: { results: { type: "array" } },
    });
    const invalid = run([command, "--format", "json"]);
    expect(invalid.code).toBe(2);
    expect(JSON.parse(invalid.out)).toMatchObject({
      code: "invalid_args",
      message: "--to <profile> is required",
    });
  }
}, 30000);
it("returns JSON usage errors without help and accepts dash-leading descriptions", () => {
  expect(run(["init", "--password", "scratch-passphrase"]).code).toBe(0);
  expect(run(["login", "--password-stdin"], "scratch-passphrase\n").code).toBe(
    0,
  );
  for (const args of [
    ["list", "--unknown"],
    ["list", "-whoops"],
    ["add"],
    ["done", "task", "--expected-version", "bad"],
    ["add", "bad energy", "--energy", "bad"],
  ]) {
    const result = run([...args, "--format", "json"]);
    expect(result.code).toBe(2);
    expect(JSON.parse(result.out)).toMatchObject({
      code: "invalid_args",
      message: expect.any(String),
    });
    expect(result.err).toBe("");
  }
  for (const flags of [
    ["--desc", "- leading dash"],
    ["--desc=- leading dash"],
  ]) {
    const result = run([
      "add",
      "Dash description",
      ...flags,
      "--format",
      "json",
    ]);
    expect(result.code, result.err).toBe(0);
    expect(JSON.parse(result.out)).toMatchObject({
      task: { description: "- leading dash" },
    });
  }
});
it("reports the current Version for every missing-Version and Conflict error", () => {
  const profile = ["--profile", "versions"];
  expect(run(["init", ...profile]).code).toBe(0);
  expect(
    run(["login", ...profile, "--password-stdin"], "scratch-passphrase\n").code,
  ).toBe(0);
  const created = JSON.parse(
    run(["add", "Recover Version", ...profile, "--format", "json"]).out,
  );
  const id = created.task.id;
  expect(
    run([
      "edit",
      id,
      "--expected-version",
      "1",
      "--title",
      "Recover current Version",
      ...profile,
    ]).code,
  ).toBe(0);
  for (const command of ["done", "cancel", "reopen", "edit", "rm"]) {
    for (const [flags, code] of [
      [[], 2],
      [["--expected-version", "1"], 4],
    ] as const) {
      const result = run([
        command,
        id,
        ...flags,
        ...profile,
        "--format",
        "json",
      ]);
      expect(result.code).toBe(code);
      expect(JSON.parse(result.out)).toMatchObject({
        code: code === 4 ? "occ_conflict" : "invalid_args",
        message: expect.stringContaining("--expected-version 2"),
        details: {
          current_version: 2,
          latest: { id, title: "Recover current Version", row_version: 2 },
        },
      });
      expect(result.err).toBe("");
    }
  }
  expect(
    JSON.parse(run(["show", id, ...profile, "--format", "json"]).out).task
      .row_version,
  ).toBe(2);
});
it("validates every command's single JSON object against its published JSON Schema", async () => {
  const home = join(scratch, "conformance");
  const db = join(home, "scratch.db");
  const covered = new Set<string>();
  const schemas = new Map<string, Schema.Top>();
  function validate(name: string, stdout: string) {
    const value = Schema.decodeUnknownSync(Schema.Unknown)(JSON.parse(stdout));
    expect(typeof value).toBe("object");
    expect(value).not.toBeNull();
    expect(Array.isArray(value)).toBe(false);
    expect(value).toHaveProperty("generated_at", expect.any(String));
    let schema = schemas.get(name);
    if (!schema) {
      const result = run(["schema", name], "", home);
      expect(result.code, result.err).toBe(0);
      const json = Schema.decodeUnknownSync(
        Schema.Record(Schema.String, Schema.Unknown),
      )(JSON.parse(result.out));
      schema = SchemaRepresentation.fromJsonSchemaDocument(
        JsonSchema.fromSchemaDraft2020_12(json),
      );
      expect(Schema.is(schema)(null)).toBe(false);
      schemas.set(name, schema);
    }
    expect(Schema.is(schema)(value), `${name}: ${stdout}`).toBe(true);
    return value;
  }
  function success(
    name: string,
    args: readonly string[],
    input = "",
    responseSchema = name,
  ) {
    const result = run([...args, "--format", "json", "--db", db], input, home);
    expect(result.code, result.err || result.out).toBe(0);
    if (name !== "init") expect(result.err).toBe("");
    covered.add(name);
    return validate(responseSchema, result.out);
  }
  success("init", ["init", "--password-stdin"], "contract-passphrase\n");
  success("login", ["login", "--password-stdin"], "contract-passphrase\n");
  expect(success("whoami", ["whoami"])).toMatchObject({
    owner: "owner",
    profile: "default",
  });
  success("init", ["init", "--profile", "empty-profile-contract"]);
  success("profile list", ["profile", "list"]);
  success("profile delete", [
    "profile",
    "delete",
    "empty-profile-contract",
    "--dry-run",
  ]);
  success("profile delete", ["profile", "delete", "empty-profile-contract"]);
  success("list", ["list"]);
  const importFile = join(home, "import.json");
  writeFileSync(
    importFile,
    JSON.stringify([
      { external_id: "contract:import", title: "Imported contract Task" },
    ]),
  );
  expect(success("import", ["import", importFile, "--dry-run"])).toMatchObject({
    dry_run: true,
    totals: { created: 1, updated: 0, unchanged: 0, rejected: 0 },
  });
  expect(success("import", ["import", importFile])).toMatchObject({
    dry_run: false,
    totals: { created: 1, updated: 0, unchanged: 0, rejected: 0 },
  });
  expect(success("import", ["import", importFile])).toMatchObject({
    totals: { created: 0, updated: 0, unchanged: 1, rejected: 0 },
  });
  const itemDocument = success("schema", ["schema", "import-item"]);
  const itemSchema = SchemaRepresentation.fromJsonSchemaDocument(
    JsonSchema.fromSchemaDraft2020_12(
      Schema.decodeUnknownSync(Schema.Record(Schema.String, Schema.Unknown))(
        itemDocument,
      ),
    ),
  );
  expect(
    Schema.is(itemSchema)({
      external_id: "contract:input",
      title: "Input schema",
    }),
  ).toBe(true);
  expect(Schema.is(itemSchema)({ title: "Missing external id" })).toBe(false);
  expect(
    success("parse", [
      "parse",
      'Parsed contract #"deep focus" @"Client Project" p1',
    ]),
  ).toMatchObject({
    draft: {
      title: "Parsed contract",
      due_at: null,
      scheduled_at: null,
      priority: "P1",
      tags: ["deep focus"],
      project: "Client Project",
    },
  });
  expect(
    success("add", [
      "add",
      "--parse",
      'Parsed contract #"deep focus" @"Client Project" p1',
    ]),
  ).toMatchObject({
    task: {
      title: "Parsed contract",
      priority: "P1",
      tags: ["deep focus"],
      project: "Client Project",
    },
  });

  success("init", ["init", "--profile", "transfer-target"]);
  const transferTask = Schema.decodeUnknownSync(
    Schema.Struct({ task: Schema.Struct({ id: Schema.String }) }),
  )(success("add", ["add", "Transfer conformance"])).task.id;
  for (const command of ["copy", "move"]) {
    success(command, [
      command,
      transferTask,
      "--to",
      "transfer-target",
      "--dry-run",
    ]);
    success(command, [command, transferTask, "--to", "transfer-target"]);
  }
  const created = success("add", [
    "add",
    "Conformance Task",
    "--desc",
    "- item",
    "--project",
    "work",
    "--tag",
    "contract",
    "--due",
    "2030-01-01",
  ]);
  const id = Schema.decodeUnknownSync(
    Schema.Struct({ task: Schema.Struct({ id: Schema.String }) }),
  )(created).task.id;
  expect(success("show", ["show", id])).toMatchObject({
    task: { title: "Conformance Task", description: "- item", row_version: 1 },
  });
  const attachmentTask = success("add", ["add", "Attachment conformance"]);
  const attachmentTaskId = Schema.decodeUnknownSync(
    Schema.Struct({ task: Schema.Struct({ id: Schema.String }) }),
  )(attachmentTask).task.id;
  const attached = success("attach", [
    "attach",
    attachmentTaskId,
    "https://example.com/issue/42",
    "--label",
    "jira",
  ]);
  const attachmentId = Schema.decodeUnknownSync(
    Schema.Struct({
      task: Schema.Struct({
        attachments: Schema.Array(Schema.Struct({ id: Schema.String })),
      }),
    }),
  )(attached).task.attachments[0]?.id;
  if (!attachmentId) throw new Error("Missing conformance Attachment");
  success("label-attachment", [
    "label-attachment",
    attachmentTaskId,
    attachmentId,
    "--label",
    "jira",
  ]);
  success("label-attachment", [
    "label-attachment",
    attachmentTaskId,
    attachmentId,
  ]);
  success("detach", ["detach", attachmentTaskId, attachmentId]);
  success("list", ["list", "--status", "open"]);
  success("edit", [
    "edit",
    id,
    "--expected-version",
    "1",
    "--title",
    "Edited contract",
  ]);
  success("done", ["done", id, "--expected-version", "2"]);
  success("reopen", ["reopen", id, "--expected-version", "3"]);
  success("cancel", ["cancel", id, "--expected-version", "4"]);
  success("history", ["history", id]);
  success("review daily", ["review", "daily"]);
  success("review weekly", ["review", "weekly"]);
  success("export", ["export"]);
  success("export", ["export", "--output", join(home, "tasks.json")]);
  success("sync obsidian", [
    "sync",
    "obsidian",
    "--vault",
    join(home, "vault"),
  ]);
  success("man", ["man"]);
  success("config show", ["config", "show"]);
  success("config get", ["config", "get", "db.path"]);
  success("config set", ["config", "set", "db.path", db]);
  const snapshot = Schema.decodeUnknownSync(
    Schema.Struct({ snapshot: Schema.Struct({ id: Schema.String }) }),
  )(success("snapshot create", ["snapshot", "create", "--reason", "contract"]))
    .snapshot.id;
  success("snapshot list", ["snapshot", "list"]);
  success("snapshot show", ["snapshot", "show", snapshot]);
  success("snapshot restore", ["snapshot", "restore", snapshot, "--dry-run"]);
  success("snapshot prune", ["snapshot", "prune", "--dry-run"]);
  success("schema", ["schema", "add"]);
  const listed = Schema.decodeUnknownSync(
    Schema.Struct({
      commands: Schema.Array(Schema.String),
      inputs: Schema.Array(Schema.String),
    }),
  )(success("schema", ["schema", "--list"]));
  const names = listed.commands;
  expect(listed.inputs).toContain("import-item");
  expect(names).not.toContain("import-item");
  for (const input of listed.inputs) success("schema", ["schema", input]);
  function discover(path: readonly string[] = []): string[] {
    const help = run([...path, "--help"], "", home);
    expect(help.code, help.err).toBe(0);
    const children = help.out.split("SUBCOMMANDS\n")[1] ?? "";
    return [...children.matchAll(/^ {2}(\S+)\s{2,}/gm)].flatMap((match) => {
      const name = Schema.decodeUnknownSync(Schema.String)(match[1]);
      const command = [...path, name];
      return [command.join(" "), ...discover(command)];
    });
  }
  expect([...discover(), "error", "help"].sort()).toEqual(names);
  const commands = names.filter((name) => name !== "error" && name !== "help");
  for (const name of commands) {
    const invalid = run(
      [...name.split(" "), "--unsupported", "--format", "json", "--db", db],
      "",
      home,
    );
    expect(invalid.code, name).toBe(2);
    expect(invalid.err, name).toBe("");
    expect(validate("error", invalid.out)).toMatchObject({
      code: "invalid_args",
    });
  }
  for (const name of commands)
    success(name, [...name.split(" "), "--help"], "", "help");
  success("help", ["help"]);
  success("rm", ["rm", id, "--expected-version", "5"]);
  success("rm", ["rm", id, "--force", "--expected-version", "6"]);
  diagnosticsServer = spawn(serverBinary, [], {
    env: { ...process.env, HOME: home, TODO_DB: db, TODO_PORT: "0" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  diagnosticsServer.stdout?.on("data", (chunk: Buffer) => {
    diagnosticsLog += chunk.toString();
  });
  diagnosticsServer.stderr?.on("data", (chunk: Buffer) => {
    diagnosticsLog += chunk.toString();
  });
  let serverUrl = "";
  for (let attempt = 0; attempt < 1200 && !serverUrl; attempt++) {
    serverUrl =
      diagnosticsLog.match(/Listening on (http:\/\/127\.0\.0\.1:\d+)/)?.[1] ??
      "";
    expect(diagnosticsServer.exitCode).toBe(null);
    if (!serverUrl) await new Promise((done) => setTimeout(done, 50));
  }
  expect(serverUrl).not.toBe("");
  success("diagnostics", ["diagnostics", "--server", serverUrl]);
  success("top", ["top", "--server", serverUrl]);
  success("logout", ["logout"]);
  const denied = run(["list", "--format", "json", "--db", db], "", home);
  expect(denied.code).toBe(3);
  expect(denied.err).toBe("");
  expect(validate("error", denied.out)).toMatchObject({
    code: "auth_required",
    message: "run todo login",
  });
  covered.add("error");
  expect([...covered].sort()).toEqual(names);
  if (process.env.TODO_CLI_EVIDENCE)
    writeFileSync(
      join(process.env.TODO_CLI_EVIDENCE, "contract.json"),
      `${JSON.stringify(
        { commands: [...covered].sort(), schemas: [...schemas.keys()].sort() },
        null,
        2,
      )}\n`,
    );
});
it("keeps follow-mode terminal errors off the JSON stream", () => {
  expect(run(["schema", "error"]).code).toBe(0);
  for (const flags of [
    ["--follow", "--format", "json"],
    ["--follow=true"],
    ["--follow"],
    ["--follow", "-1h"],
  ]) {
    const result = run(["list", ...flags, "--unsupported"]);
    expect(result.code).toBe(2);
    expect(result.out).toBe("");
    expect(JSON.parse(result.err)).toMatchObject({
      generated_at: expect.any(String),
      code: "invalid_args",
      message: expect.any(String),
    });
  }
  const disabled = run([
    "list",
    "--follow=false",
    "--unsupported",
    "--format",
    "json",
  ]);
  expect(disabled.code).toBe(2);
  expect(disabled.err).toBe("");
  expect(JSON.parse(disabled.out)).toMatchObject({ code: "invalid_args" });
});
it("keeps short built-in flag names as string values and rejects ambiguous long values", () => {
  const home = join(scratch, "dash-flags");
  expect(
    run(["init", "--password-stdin"], "dash-passphrase\n", home).code,
  ).toBe(0);
  expect(
    run(["login", "--password-stdin"], "dash-passphrase\n", home).code,
  ).toBe(0);
  for (const value of ["-h", "-v", "-word", "-"]) {
    const result = run(
      ["add", "Literal dash", "--desc", value, "--format", "json"],
      "",
      home,
    );
    expect(result.code, result.out).toBe(0);
    expect(JSON.parse(result.out)).toMatchObject({
      task: { description: value },
    });
  }
  const result = run(
    ["add", "Ambiguous dash", "--desc", "--help", "--format", "json"],
    "",
    home,
  );
  expect(result.code).toBe(2);
  expect(JSON.parse(result.out)).toMatchObject({
    code: "invalid_args",
    message: expect.stringContaining("--desc="),
  });
  const equals = run(
    ["add", "Literal long flag", "--desc=--help", "--format", "json"],
    "",
    home,
  );
  expect(equals.code, equals.out).toBe(0);
  expect(JSON.parse(equals.out)).toMatchObject({
    task: { description: "--help" },
  });
});
it("review regression: rejects digit-leading unknown short flags", () => {
  for (const flag of ["-1h", "-1v", "-0h", "-1.5h"]) {
    const result = run(["list", flag, "--format", "json"]);
    expect(result.code, result.out).toBe(2);
    expect(JSON.parse(result.out)).toMatchObject({ code: "invalid_args" });
  }
});
it("review regression: preserves operands after the end-of-options delimiter", () => {
  const home = join(scratch, "operand-boundary");
  expect(
    run(["init", "--password-stdin"], "operand-passphrase\n", home).code,
  ).toBe(0);
  expect(
    run(["login", "--password-stdin"], "operand-passphrase\n", home).code,
  ).toBe(0);
  const result = run(
    ["add", "--format", "json", "--", "--desc", "-hello"],
    "",
    home,
  );
  expect(result.code, result.out).toBe(2);
  expect(JSON.parse(result.out)).toMatchObject({ code: "invalid_args" });
  expect(
    JSON.parse(run(["list", "--format", "json"], "", home).out),
  ).not.toHaveProperty("tasks");
});
it("review regression: rejects ambiguous long values in every format", () => {
  for (const format of ["md", "table", "json"]) {
    const result = run([
      "add",
      "Literal description",
      "--desc",
      "--help",
      "--format",
      format,
    ]);
    expect(result.code, result.out).toBe(2);
    if (format === "json")
      expect(JSON.parse(result.out)).toMatchObject({
        code: "invalid_args",
        message: expect.stringContaining("--desc="),
      });
    else {
      expect(result.out).toBe("");
      expect(result.err).toContain("--desc=");
    }
  }
});
it("review final: treats action flag names after -- as literal Task titles", () => {
  const home = join(scratch, "literal-actions");
  expect(
    run(["init", "--password-stdin"], "literal-passphrase\n", home).code,
  ).toBe(0);
  expect(
    run(["login", "--password-stdin"], "literal-passphrase\n", home).code,
  ).toBe(0);
  for (const title of ["--wizard", "--help-human-flag", "--format=json"]) {
    const result = run(["add", "--format", "json", "--", title], "", home);
    expect(result.code, result.out).toBe(0);
    expect(JSON.parse(result.out)).toMatchObject({ task: { title } });
  }
});
it("review final: rejects duplicate format flags in one JSON error", () => {
  expect(run(["schema", "error"]).code).toBe(0);
  for (const flags of [
    ["--format", "json", "--format", "md"],
    ["--format", "md", "--format", "json"],
    ["--format=json", "--format=md"],
    ["--format", "json", "--format", "json"],
  ]) {
    const result = run(["list", "--unsupported", ...flags]);
    expect(result.code).toBe(2);
    expect(result.err).toBe("");
    expect(JSON.parse(result.out)).toMatchObject({
      code: "invalid_args",
      message: "--format can be supplied only once",
    });
  }
});

it("publishes diagnostics and top schemas and uses shared errors before accessing a server", {
  timeout: 30000,
}, () => {
  for (const command of ["diagnostics", "top"]) {
    const schema = run(["schema", command]);
    expect(schema.code).toBe(0);
    expect(JSON.parse(schema.out).required).toEqual([
      "generated_at",
      "poll_interval_ms",
      "runtime",
      "profiles",
      "deleted_profiles",
      "storage",
      "operations",
      "clients",
      "credentials",
      "errors",
      "latency",
      "scheduler",
    ]);
    const missing = run(
      [command, "--format", "json", "--server", "http://127.0.0.1:1"],
      "",
      join(scratch, "diagnostics-no-session"),
    );
    expect(missing.code).toBe(3);
    expect(JSON.parse(missing.out)).toMatchObject({
      code: "auth_required",
      message: "run todo login",
    });
  }
  const invalid = run(["diagnostics", "--format", "json", "--unsupported"]);
  expect(invalid.code).toBe(2);
  expect(JSON.parse(invalid.out).code).toBe("invalid_args");
  const follow = run(
    ["diagnostics", "--follow", "--server", "http://127.0.0.1:1"],
    "",
    join(scratch, "diagnostics-no-session"),
  );
  expect(follow.code).toBe(3);
  expect(follow.out).toBe("");
  expect(JSON.parse(follow.err)).toMatchObject({
    code: "auth_required",
  });
});
it("C11 transfer dry runs report identity rejections without writes and Copy clears external ids", () => {
  const home = join(scratch, "external-transfer");
  const call = (args: string[], input = "", profile = "work") =>
    run(["--profile", profile, "--format", "json", ...args], input, home);
  expect(
    call(["init", "--password-stdin"], "scratch transfer passphrase\n").code,
  ).toBe(0);
  expect(call(["init"], "", "personal").code).toBe(0);
  for (const profile of ["work", "personal"])
    expect(
      call(
        ["login", "--password-stdin"],
        "scratch transfer passphrase\n",
        profile,
      ).code,
    ).toBe(0);
  const source = JSON.parse(
    call(["add", "Identity source", "--external-id", "repo:cli"]).out,
  ).task;
  expect(
    call(["add", "Keep target", "--external-id", "repo:cli"], "", "personal")
      .code,
  ).toBe(0);
  const history = JSON.parse(call(["history", source.id]).out).entries;
  const message =
    '"Personal" already has a Task with external id "repo:cli". Choose another Profile.';
  const preview = call(["move", source.id, "--to", "personal", "--dry-run"]);
  expect(preview.code).toBe(2);
  expect(JSON.parse(preview.out)).toMatchObject({
    dry_run: true,
    code: "invalid_args",
    message,
    details: { external_id: "repo:cli", profile_id: "personal" },
    results: [
      {
        source_id: source.id,
        target_id: null,
        outcome: "external_id_conflict",
        message,
      },
    ],
  });
  const same = call(["copy", source.id, "--to", "work", "--dry-run"]);
  expect(same.code).toBe(2);
  expect(JSON.parse(same.out)).toMatchObject({
    dry_run: true,
    code: "invalid_args",
    message: "Copy needs a different Profile.",
    results: [
      { outcome: "validation", message: "Copy needs a different Profile." },
    ],
  });
  expect(JSON.parse(call(["history", source.id]).out).entries).toEqual(history);
  const copied = call(["copy", source.id, "--to", "personal"]);
  expect(copied.code).toBe(0);
  const copy = JSON.parse(
    call(["show", JSON.parse(copied.out).results[0].target_id], "", "personal")
      .out,
  ).task;
  expect(copy.external_id ?? null).toBe(null);
  const moved = call(["move", source.id, "--to", "personal"]);
  expect(moved.code).toBe(2);
  expect(JSON.parse(moved.out)).toMatchObject({
    code: "invalid_args",
    message,
    details: { external_id: "repo:cli", profile_id: "personal" },
    results: [{ outcome: "external_id_conflict", message }],
  });
  expect(JSON.parse(call(["show", source.id]).out).task).toEqual({
    ...source,
    attachments: [],
  });
  expect(
    JSON.parse(call(["history", source.id]).out)
      .entries.filter(
        (entry: { outcome: string }) => entry.outcome === "rejected",
      )
      .map((entry: { reason: string }) => entry.reason),
  ).toEqual(["external_id_conflict"]);
}, 60000);
it("publishes the quick-add draft schema and rejects invalid parse input as shared JSON errors", () => {
  const schema = run(["schema", "parse"]);
  expect(schema.code, schema.err).toBe(0);
  expect(JSON.parse(schema.out)).toMatchObject({
    type: "object",
    required: ["generated_at", "draft"],
    properties: {
      draft: {
        type: "object",
        required: [
          "title",
          "due_at",
          "scheduled_at",
          "priority",
          "tags",
          "project",
        ],
      },
    },
  });
  for (const args of [
    ["parse", "tomorrow p1"],
    ["parse", ""],
    ["add", "literal", "--parse", "parsed"],
  ]) {
    const response = run([...args, "--format", "json"]);
    expect(response.code).toBe(2);
    expect(JSON.parse(response.out)).toMatchObject({
      generated_at: expect.any(String),
      code: "invalid_args",
      message: expect.any(String),
    });
    expect(response.err).not.toContain("Usage:");
  }
});

it("publishes the Profile discovery and deletion reports", () => {
  const list = run(["schema", "profile list"]);
  expect(list.code, list.err).toBe(0);
  expect(JSON.parse(list.out)).toMatchObject({
    type: "object",
    required: ["generated_at", "profiles"],
  });
  const deletion = run(["schema", "profile delete"]);
  expect(deletion.code, deletion.err).toBe(0);
  expect(JSON.parse(deletion.out)).toMatchObject({
    type: "object",
    required: [
      "generated_at",
      "profile",
      "dry_run",
      "tasks_affected",
      "sessions_revoked",
      "access_tokens_revoked",
    ],
  });
});

it("returns one JSON error when a Profile delete argument or flag is missing", () => {
  for (const args of [
    ["profile", "delete"],
    ["profile", "delete", "work", "--unknown-flag"],
  ]) {
    const invalid = run([...args, "--format", "json"]);
    expect(invalid.code).toBe(2);
    expect(JSON.parse(invalid.out)).toMatchObject({
      generated_at: expect.any(String),
      code: "invalid_args",
      message: expect.any(String),
    });
    expect(invalid.out).not.toContain("USAGE");
  }
});

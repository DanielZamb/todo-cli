import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, expect, it } from "@effect/vitest";

const home = mkdtempSync(join(tmpdir(), "todo-error-list-"));
const actions: unknown[] = [];
const binary = process.env.TODO_CLI_BINARY || join(home, "todo");
const serverBinary =
  process.env.TODO_SERVER_BINARY || join(home, "todo-server");
let server: ChildProcess | undefined;
beforeAll(() => {
  for (const [provided, source, destination] of [
    [process.env.TODO_CLI_BINARY, "../src/main.ts", binary],
    [process.env.TODO_SERVER_BINARY, "../../server/src/main.ts", serverBinary],
  ] as const) {
    if (provided) continue;
    expect(
      spawnSync("sh", [
        resolve(import.meta.dirname, "../../../scripts/disk-guard.sh"),
      ]).status,
    ).toBe(0);
    const built = spawnSync(
      "bun",
      [
        "build",
        "--compile",
        resolve(import.meta.dirname, source),
        "--outfile",
        destination,
      ],
      { cwd: home, encoding: "utf8" },
    );
    expect(built.status, built.stderr).toBe(0);
  }
});
function run(args: string[], input = "") {
  const result = spawnSync(binary, args, {
    env: { ...process.env, HOME: home, TODO_DB: "" },
    encoding: "utf8",
    input,
    timeout: 60000,
  });
  actions.push({
    args,
    exit: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
    signal: result.signal,
    error: result.error?.message,
  });
  return result;
}
afterAll(async () => {
  if (server && server.exitCode === null && server.signalCode === null) {
    const stopped = new Promise<void>((done) =>
      server?.once("exit", () => done()),
    );
    server.kill("SIGTERM");
    await stopped;
  }
  const evidence = process.env.TODO_CLI_EVIDENCE;
  if (evidence) {
    mkdirSync(evidence, { recursive: true });
    writeFileSync(
      join(evidence, "error-list-actions.json"),
      JSON.stringify(actions, null, 2),
    );
  }
  rmSync(home, { recursive: true, force: true });
});
it("always returns list tasks and explains actual not-found exits with authorized Profile context", () => {
  expect(run(["init", "--password-stdin"], "scratch-passphrase\n").status).toBe(
    0,
  );
  expect(
    run(["login", "--password-stdin"], "scratch-passphrase\n").status,
  ).toBe(0);
  for (const flags of [
    [],
    ["--status", "done"],
    ["--prefix", "45a312ac"],
    ["--text", "absent"],
  ]) {
    const result = run(["list", ...flags, "--format", "json"]);
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ tasks: [] });
  }
  for (const args of [
    ["show", "45a312ac"],
    ["edit", "45a312ac", "--title", "x", "--expected-version", "1"],
    ["attach", "45a312ac", "/tmp/missing", "--expected-version", "1"],
    ["export", "--scope", "id:45a312ac"],
  ]) {
    const result = run([...args, "--format", "json"]);
    expect(result.status).toBe(3);
    expect(JSON.parse(result.stdout)).toMatchObject({
      code: "not_found",
      exit_code: 3,
      exit_meaning: "not found or auth missing",
      details: {
        profile: { id: "default", name: "default" },
        task_id: "45a312ac",
      },
    });
    expect(JSON.parse(result.stdout).details.recovery).toContain(
      "todo list --profile default --prefix 45a312ac",
    );
    expect(JSON.parse(result.stdout).details.recovery).toContain(
      "todo lookup --prefix 45a312ac --credential-profile default",
    );
  }
  const invalidId = run(["show", "invalid-id", "--format", "json"]);
  expect(invalidId.status).toBe(3);
  expect(JSON.parse(invalidId.stdout).details.recovery).toContain(
    "<hex-prefix>",
  );
  expect(JSON.parse(invalidId.stdout).details.recovery).not.toContain(
    "invalid-id",
  );
  const md = run(["show", "45a312ac"]);
  expect(md.status).toBe(3);
  expect(md.stderr).toContain("error 3 - not found or auth missing");
  const usage = run(["list", "--prefix", "bad!", "--format", "json"]);
  expect(usage.status).toBe(2);
  expect(JSON.parse(usage.stdout)).toMatchObject({
    exit_code: 2,
    exit_meaning: "validation or usage",
  });
}, 120000);

it("keeps HTTP error tags, adds matching pairs at decoding boundaries and hides foreign Profile names", async () => {
  expect(run(["init", "--profile", "private-profile"]).status).toBe(0);
  expect(
    run(
      ["login", "--profile", "private-profile", "--password-stdin"],
      "scratch-passphrase\n",
    ).status,
  ).toBe(0);
  const foreign = run([
    "add",
    "Foreign private title",
    "--profile",
    "private-profile",
    "--format",
    "json",
  ]);
  expect(foreign.status).toBe(0);
  const foreignId: string = JSON.parse(foreign.stdout).task.id;
  const owner: string = JSON.parse(
    readFileSync(join(home, ".todo-cli/session_default.json"), "utf8"),
  ).token;
  let credential = owner;
  let log = "";
  server = spawn(serverBinary, [], {
    env: {
      ...process.env,
      HOME: home,
      TODO_DB: join(home, ".todo-cli/todo.db"),
      TODO_PORT: "0",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout?.on("data", (chunk) => {
    log += String(chunk);
  });
  server.stderr?.on("data", (chunk) => {
    log += String(chunk);
  });
  const deadline = Date.now() + 60000;
  while (
    !/Listening on http:\/\/127\.0\.0\.1:\d+/.test(log) &&
    Date.now() < deadline &&
    server.exitCode === null
  )
    await new Promise((done) => setTimeout(done, 50));
  const base = /Listening on (http:\/\/127\.0\.0\.1:\d+)/.exec(log)?.[1];
  expect(base, log).toBeDefined();
  async function request(
    method: string,
    path: string,
    body?: unknown,
    bearer: string | null = credential,
  ) {
    const response = await fetch(`${base}${path}`, {
      method,
      headers: {
        ...(bearer === null ? {} : { Authorization: `Bearer ${bearer}` }),
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const text = await response.text();
    const data = text ? JSON.parse(text) : null;
    actions.push({
      method,
      path,
      status: response.status,
      body: path === "/auth/tokens" ? "<credential omitted>" : data,
    });
    return { status: response.status, body: data };
  }
  const token = await request("POST", "/auth/tokens", {
    name: "scoped",
    scope: "read-write",
    profile: "default",
  });
  expect(token.status).toBe(200);
  credential = token.body.credential;
  writeFileSync(
    join(home, ".todo-cli/session_private-profile.json"),
    JSON.stringify({ token: credential }),
  );
  const deniedCli = run([
    "show",
    foreignId,
    "--profile",
    "private-profile",
    "--format",
    "json",
  ]);
  expect(deniedCli.status).toBe(3);
  expect(JSON.parse(deniedCli.stdout)).toMatchObject({
    exit_code: 3,
    exit_meaning: "not found or auth missing",
  });
  expect(deniedCli.stdout).not.toContain("private-profile");
  expect(deniedCli.stdout).not.toContain("Foreign private title");
  const transfer = run([
    "copy",
    "45a312ac",
    "--to",
    "private-profile",
    "--format",
    "json",
  ]);
  expect(transfer.status).toBe(3);
  expect(JSON.parse(transfer.stdout)).toMatchObject({
    exit_code: 3,
    exit_meaning: "not found or auth missing",
    results: [
      {
        source_id: "45a312ac",
        details: {
          profile: { id: "default", name: "default" },
          task_id: "45a312ac",
        },
      },
    ],
  });
  const missing = "45a312ac";
  for (const [method, path, body] of [
    ["GET", `/profiles/default/tasks/${missing}`, undefined],
    [
      "PATCH",
      `/profiles/default/tasks/${missing}`,
      { from_version: 1, changes: { title: "edited" } },
    ],
    [
      "POST",
      `/profiles/default/tasks/${missing}/attachments`,
      {
        from_version: 1,
        location: { kind: "link", url: "https://example.com" },
      },
    ],
    [
      "PATCH",
      `/profiles/default/tasks/${missing}/series`,
      {
        from_version: 1,
        changes: {},
        recurrence: {
          dtstart: { kind: "date", date: "2030-01-01" },
          rrule: "FREQ=DAILY",
          exdate: [],
        },
      },
    ],
  ] as const) {
    const result = await request(method, path, body);
    expect(result).toMatchObject({
      status: 404,
      body: {
        _tag: "NotFound",
        exit_code: 3,
        exit_meaning: "not found or auth missing",
        details: {
          profile: { id: "default", name: "default" },
          task_id: missing,
        },
      },
    });
    expect(result.body.details.recovery).toContain(
      "GET /profiles/default/tasks?prefix=45a312ac",
    );
    expect(result.body.details.recovery).toContain(
      "GET /tasks/lookup?prefix=45a312ac",
    );
  }
  for (const [method, path, body] of [
    ["GET", "/profiles/default/tasks?prefix=bad!", undefined],
    ["POST", "/auth/sessions", {}],
    ["POST", "/profiles/default/tasks", { title: "" }],
  ] as const) {
    expect(await request(method, path, body)).toMatchObject({
      status: 400,
      body: { exit_code: 2, exit_meaning: "validation or usage" },
    });
  }
  expect(
    await request("GET", "/profiles/default/tasks", undefined, null),
  ).toMatchObject({
    status: 401,
    body: {
      _tag: "Unauthorized",
      exit_code: 3,
      exit_meaning: "not found or auth missing",
    },
  });
  const denied = await request(
    "GET",
    `/profiles/private-profile/tasks/${foreignId}`,
  );
  expect(denied).toMatchObject({
    status: 403,
    body: {
      _tag: "Forbidden",
      exit_code: 3,
      exit_meaning: "not found or auth missing",
    },
  });
  expect(JSON.stringify(denied.body)).not.toContain("private-profile");
  expect(JSON.stringify(denied.body)).not.toContain("Foreign private title");
  const unknownProfile = await request(
    "GET",
    "/profiles/never-created/tasks/45a312ac",
    undefined,
    owner,
  );
  expect(unknownProfile).toEqual({
    status: 404,
    body: {
      _tag: "NotFound",
      message: "Task not found",
      exit_code: 3,
      exit_meaning: "not found or auth missing",
    },
  });
  const absent = await request("GET", `/profiles/default/tasks/${foreignId}`);
  expect(absent.body.details.profile).toEqual({
    id: "default",
    name: "default",
  });
  const batch = await request("POST", "/profiles/default/batch-edit", {
    items: [{ task_id: missing, from_version: 1 }],
    changes: { title: "edited" },
  });
  expect(batch).toMatchObject({
    status: 200,
    body: {
      items: [
        {
          error: {
            exit_code: 3,
            exit_meaning: "not found or auth missing",
            details: {
              current_version: null,
              task_id: missing,
              profile: { id: "default", name: "default" },
            },
          },
        },
      ],
    },
  });
  expect(await request("GET", "/profiles/default/tasks")).toEqual({
    status: 200,
    body: [],
  });
  const attachmentTask = run(["add", "Attachment target", "--format", "json"]);
  expect(attachmentTask.status).toBe(0);
  const attachmentTaskId: string = JSON.parse(attachmentTask.stdout).task.id;
  for (const [target, taskMissing] of [
    [attachmentTaskId, false],
    ["missing-task", true],
  ] as const) {
    for (const args of [
      ["detach", target, "missing-attachment", "--expected-version", "1"],
      [
        "detach",
        target,
        "missing-attachment",
        "--expected-version",
        "1",
        "--dry-run",
      ],
      [
        "label-attachment",
        target,
        "missing-attachment",
        "--label",
        "new",
        "--expected-version",
        "1",
      ],
    ]) {
      const result = run([...args, "--format", "json"]);
      expect(result.status).toBe(3);
      const body = JSON.parse(result.stdout);
      expect(body).toMatchObject({
        code: "not_found",
        exit_code: 3,
        exit_meaning: "not found or auth missing",
      });
      if (taskMissing) {
        expect(body.details.profile).toEqual({
          id: "default",
          name: "default",
        });
        expect(body.details.task_id).toBe("missing-task");
      } else {
        expect(body.message).toBe("Attachment not found; read todo show <id>");
        expect(body.details).toBeUndefined();
      }
    }
    for (const operation of ["detach", "label"] as const) {
      const result = await request(
        "POST",
        `/profiles/default/tasks/${target}/attachments/${operation}`,
        {
          from_version: 1,
          attachment_id: "missing-attachment",
          ...(operation === "label" ? { label: "new" } : {}),
        },
      );
      expect(result.status).toBe(404);
      expect(result.body).toMatchObject({
        _tag: "NotFound",
        exit_code: 3,
        exit_meaning: "not found or auth missing",
      });
      if (taskMissing) {
        expect(result.body.details.profile).toEqual({
          id: "default",
          name: "default",
        });
        expect(result.body.details.task_id).toBe("missing-task");
      } else {
        expect(result.body.message).toBe(
          "Attachment not found; read the Task and use a current Attachment id.",
        );
        expect(result.body.details).toBeUndefined();
      }
    }
  }
}, 90000);

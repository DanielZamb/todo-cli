import assert from "node:assert/strict";
import {
  type ChildProcess,
  execFileSync,
  spawn,
  spawnSync,
} from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { CONTRACT_ID } from "@todo/api";
import { Task } from "@todo/domain";
import { TaskResponse, TasksResponse } from "@todo/domain/presentation";
import { Schema } from "effect";

const root = resolve(import.meta.dirname, "../../..");
const evidence = process.argv[2];
assert.ok(
  evidence && isAbsolute(evidence) && !existsSync(evidence),
  "Pass a fresh absolute evidence directory",
);
mkdirSync(evidence, { recursive: true });
const scratch = mkdtempSync(join(tmpdir(), "todo-filters-verify-"));
const scratchHome = join(scratch, "home");
mkdirSync(scratchHome);
const env = {
  ...process.env,
  HOME: scratchHome,
  TODO_DB: join(scratch, "scratch.db"),
  TODO_PORT: "0",
  TODO_ATTACHMENT_ROOT: join(scratch, "attachments"),
};
const actions: unknown[] = [];
let server: ChildProcess | undefined;
let serverLog = "";
let passed = false;
const cli = (args: string[], input?: string, expected = 0): unknown => {
  const result = spawnSync(
    join(scratch, "todo"),
    ["--profile", "work", "--format", "json", ...args],
    { cwd: root, env, input, encoding: "utf8", timeout: 20000 },
  );
  if (result.error) throw result.error;
  actions.push({
    command: ["todo", ...args],
    exit: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  });
  assert.equal(result.status, expected, result.stderr || result.stdout);
  return JSON.parse(result.stdout);
};
try {
  execFileSync("sh", ["scripts/disk-guard.sh"], { cwd: root });
  const builds: [string, string][] = [
    ["apps/cli/src/main.ts", "todo"],
    ["apps/server/src/main.ts", "server"],
  ];
  for (const [source, name] of builds) {
    const output = execFileSync(
      "bun",
      [
        "build",
        "--compile",
        join(root, source),
        "--outfile",
        join(scratch, name),
      ],
      { cwd: scratch, encoding: "utf8" },
    );
    actions.push({ compile: source, output });
  }
  cli(["init", "--password-stdin"], "scratch filter passphrase\n");
  cli(["login", "--password-stdin"], "scratch filter passphrase\n");
  cli([
    "import",
    join(root, "apps/cli/test/fixtures/project-tag-business.json"),
  ]);
  const all = Schema.decodeUnknownSync(TasksResponse)(cli(["list"]));
  const target = (title: string) => {
    const task = all.tasks?.find((task) => task.title === title);
    assert.ok(task);
    return task;
  };
  const enterprise = target("Confirm enterprise renewal");
  const pricing = target("Approve partner pricing");
  cli([
    "attach",
    enterprise.id,
    "https://example.test/contracts/enterprise",
    "--label",
    "Enterprise agreement",
  ]);
  const file = join(scratch, "pricing-model.csv");
  writeFileSync(file, "Plan,Price\nEnterprise,100\n");
  cli(["attach", pricing.id, file, "--label", "Rate review"]);
  cli(["add", "Task without estimate", "--project", "Operations"]);
  server = spawn(join(scratch, "server"), [], {
    cwd: scratch,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout?.on("data", (chunk) => {
    serverLog += chunk;
  });
  server.stderr?.on("data", (chunk) => {
    serverLog += chunk;
  });
  const until = Date.now() + 20000;
  while (!/Listening on (http:\/\/127\.0\.0\.1:\d+)/.test(serverLog)) {
    assert.ok(Date.now() < until, `Server readiness: ${serverLog}`);
    await new Promise((done) => setTimeout(done, 40));
  }
  const base = /Listening on (http:\/\/127\.0\.0\.1:\d+)/.exec(serverLog)?.[1];
  assert.ok(base);
  const session = await fetch(`${base}/auth/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ passphrase: "scratch filter passphrase" }),
  });
  assert.equal(session.status, 200);
  const { credential } = Schema.decodeUnknownSync(
    Schema.Struct({ credential: Schema.String }),
  )(await session.json());
  const request = async (
    path: string,
    method = "GET",
    payload?: unknown,
    expected = 200,
  ): Promise<unknown> => {
    const response = await fetch(base + path, {
      method,
      headers: {
        Authorization: `Bearer ${credential}`,
        "Content-Type": "application/json",
      },
      ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
    });
    const text = await response.text();
    const body: unknown = text ? JSON.parse(text) : null;
    actions.push({ path, method, status: response.status, body });
    assert.equal(response.status, expected, text);
    return body;
  };
  assert.deepEqual(await request("/health"), {
    service: "todo-server",
    contract: CONTRACT_ID,
    build: "dev",
  });
  assert.deepEqual(
    Schema.decodeUnknownSync(
      Schema.Struct({ code: Schema.String, message: Schema.String }),
    )(
      await request(
        "/profiles/work/tasks?unkown_status=closed",
        "GET",
        undefined,
        400,
      ),
    ),
    {
      code: "invalid_query",
      message: "Unknown query parameter: unkown_status",
    },
  );
  const contract = Schema.decodeUnknownSync(
    Schema.Struct({
      paths: Schema.Struct({
        "/profiles/{profile}/tasks": Schema.Struct({
          get: Schema.Struct({
            parameters: Schema.Array(
              Schema.Struct({
                name: Schema.String,
                schema: Schema.Struct({
                  enum: Schema.optionalKey(Schema.Array(Schema.String)),
                  pattern: Schema.optionalKey(Schema.String),
                }),
              }),
            ),
          }),
        }),
      }),
    }),
  )(await request("/openapi.json"));
  const parameters = contract.paths["/profiles/{profile}/tasks"].get.parameters;
  assert.deepEqual(
    parameters.find((parameter) => parameter.name === "status")?.schema.enum,
    ["open", "done", "cancelled", "snoozed", "closed"],
  );
  assert.deepEqual(
    parameters.find((parameter) => parameter.name === "priority")?.schema.enum,
    ["P1", "P2", "P3", "P4"],
  );
  assert.deepEqual(
    parameters.find((parameter) => parameter.name === "energy")?.schema.enum,
    ["1", "2", "3", "4", "5", "none"],
  );
  assert.equal(
    parameters.find((parameter) => parameter.name === "estimate")?.schema
      .pattern,
    "^(none|[1-9]\\d*)$",
  );
  for (const name of ["due", "scheduled"])
    assert.equal(
      parameters.find((parameter) => parameter.name === name)?.schema.pattern,
      "^(none|\\d{4}-\\d{2}-\\d{2})$",
    );
  writeFileSync(
    join(evidence, "filter-parameters.json"),
    JSON.stringify(parameters, null, 2),
  );
  await request("/profiles/work/tasks", "POST", {
    title: "Zoned contract",
    priority: "P2",
    estimate_min: 30,
    due_at: {
      kind: "instant",
      utc: "2030-11-02T01:00:00Z",
      time_zone: "America/Bogota",
    },
  });
  const upsell = target("Review upsell proposal");
  await request(
    `/profiles/work/tasks/${upsell.id}/attachments/upload`,
    "POST",
    {
      from_version: 1,
      name: "upsell-graph.png",
      mime_type: "image/png",
      data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7QAAAABJRU5ErkJggg==",
    },
  );
  const cases: Array<{ filters: Record<string, string>; titles: string[] }> = [
    {
      filters: { status: "open" },
      titles: [
        "Approve partner pricing",
        "Collect overdue invoice",
        "Complete compliance review",
        "Confirm enterprise renewal",
        "Finalize launch contract",
        "Polish launch email",
        "Resolve billing blocker",
        "Review acquisition spend",
        "Review upsell proposal",
        "Send renewal offer",
        "Task without estimate",
        "Triage unassigned sales request",
        "Update Operations handbook",
        "Write launch retrospective",
        "Zoned contract",
      ],
    },
    {
      filters: {
        project: "Client Launch",
        tag: " REVENUE ",
        status: "open",
        due: "none",
        scheduled: "none",
      },
      titles: [
        "Approve partner pricing",
        "Confirm enterprise renewal",
        "Polish launch email",
        "Resolve billing blocker",
        "Review upsell proposal",
      ],
    },
    {
      filters: { status: "closed" },
      titles: ["Agree launch discount", "Retire old rate card"],
    },
    {
      filters: {
        project: "Client Launch",
        tag: "revenue",
        priority: "P1",
        status: "open",
        energy: "3",
        estimate: "45",
        attachment: " ENTERPRISE ",
      },
      titles: ["Confirm enterprise renewal"],
    },
    {
      filters: { due: "2030-11-01" },
      titles: ["Finalize launch contract", "Zoned contract"],
    },
    { filters: { scheduled: "2030-11-02" }, titles: ["Send renewal offer"] },
    {
      filters: { attachment: "pricing-model.csv" },
      titles: ["Approve partner pricing"],
    },
    {
      filters: { attachment: "RATE REVIEW" },
      titles: ["Approve partner pricing"],
    },
    {
      filters: { attachment: "upsell-graph.png" },
      titles: ["Review upsell proposal"],
    },
    { filters: { estimate: "none" }, titles: ["Task without estimate"] },
    {
      filters: { estimate: "99999999999999999999999999999999999999" },
      titles: [],
    },
    {
      filters: { project: "Growth", energy: "none" },
      titles: ["Review acquisition spend"],
    },
    {
      filters: {
        project: "Client Launch",
        tag: "compliance",
        attachment: "enterprise",
      },
      titles: [],
    },
  ];
  for (const { filters, titles } of cases) {
    const result = Schema.decodeUnknownSync(TasksResponse)(
      cli([
        "list",
        ...Object.entries(filters).flatMap(([name, value]) => [
          `--${name}`,
          value,
        ]),
      ]),
    );
    assert.deepEqual(
      (result.tasks ?? []).map((task) => task.title).sort(),
      titles,
    );
    assert.deepEqual(result.filters, filters);
    const remote = Schema.decodeUnknownSync(Schema.Array(Task))(
      await request(`/profiles/work/tasks?${new URLSearchParams(filters)}`),
    );
    assert.deepEqual(remote.map((task) => task.title).sort(), titles);
  }
  const invalid: [string, string][] = [
    ["energy", "6"],
    ["energy", "0"],
    ["estimate", "-5"],
    ["estimate", "1.5"],
    ["due", "2030-02-30"],
    ["scheduled", "tomorrow"],
    ["status", "unknown"],
  ];
  for (const [name, value] of invalid) {
    cli(["list", `--${name}=${value}`], undefined, 2);
    await request(
      `/profiles/work/tasks?${new URLSearchParams({ [name]: value })}`,
      "GET",
      undefined,
      400,
    );
  }
  const deleted = Schema.decodeUnknownSync(TaskResponse)(
    cli([
      "add",
      "Deleted filter Task",
      "--priority",
      "P1",
      "--energy",
      "3",
      "--estimate",
      "45",
    ]),
  ).task;
  cli(["rm", deleted.id, "--expected-version", "1"]);
  const final = Schema.decodeUnknownSync(TasksResponse)(
    cli(["list", "--priority", "P1", "--energy", "3", "--estimate", "45"]),
  );
  assert.deepEqual(
    final.tasks?.map((task) => task.title),
    ["Confirm enterprise renewal"],
  );
  passed = true;
} finally {
  if (server && server.exitCode === null && server.signalCode === null) {
    const owned = server;
    const exited = new Promise<void>((done) =>
      owned.once("exit", () => done()),
    );
    const timeout = setTimeout(() => owned.kill("SIGKILL"), 2000);
    owned.kill("SIGTERM");
    await exited;
    clearTimeout(timeout);
  }
  writeFileSync(
    join(evidence, "actions.json"),
    JSON.stringify(actions, null, 2),
  );
  writeFileSync(join(evidence, "server.log"), serverLog);
  rmSync(scratch, { recursive: true, force: true });
  assert.equal(existsSync(scratch), false);
  writeFileSync(
    join(evidence, "result.json"),
    JSON.stringify({
      status: passed ? "PASS" : "FAIL",
      scratchRemoved: true,
      serverStopped:
        server === undefined ||
        server.exitCode !== null ||
        server.signalCode !== null,
    }),
  );
}
assert.ok(existsSync(join(evidence, "actions.json")));
process.stdout.write(`PASS; evidence survived cleanup: ${evidence}\n`);

// Server seat F1 (follow-up 86): a typed time the CLI's zone refuses is refused in the CLI, before
// any routing, so a server in another zone never reads it as its own wall time. A compiled server
// runs in Bogota; the CLI side resolves in New York (resolveTypedTime, what the CLI's add and edit
// call) and only routes what resolved, through the real /local/commands path.
import { Database } from "bun:sqlite";
import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, expect, it } from "@effect/vitest";
import { CommandError, resolveTypedTime } from "@todo/domain/commands";

const scratch = mkdtempSync(join(tmpdir(), "todo-cli-typed-routed-"));
const database = join(scratch, "scratch.db");
const passphrase = "typed routed passphrase";
const compile = (entry: string, name: string) => {
  const out = join(scratch, name);
  const built = spawnSync(
    "bun",
    [
      "build",
      "--compile",
      resolve(import.meta.dirname, entry),
      "--outfile",
      out,
    ],
    { cwd: scratch, encoding: "utf8" },
  );
  expect(built.status, built.stderr).toBe(0);
  return out;
};
let cli = "";
let companion = "";
let server: ChildProcess | undefined;
const env = (TZ: string) => ({
  ...process.env,
  TZ,
  HOME: scratch,
  TODO_DB: database,
  TODO_PORT: "0",
});
const run = (TZ: string, args: string[]) =>
  spawnSync(cli, args, {
    env: env(TZ),
    encoding: "utf8",
    input: `${passphrase}\n`,
    timeout: 60000,
  });
const counts = () => {
  const db = new Database(database, { readonly: true });
  try {
    return {
      tasks: db.query<{ n: number }, []>("SELECT count(*) n FROM tasks").get()
        ?.n,
      history: db
        .query<{ n: number }, []>("SELECT count(*) n FROM op_log")
        .get()?.n,
    };
  } finally {
    db.close();
  }
};

beforeAll(async () => {
  cli = compile("../src/main.ts", "todo");
  companion = compile("../scripts/routing-companion.ts", "routing-companion");
  const serverBinary = compile("../../server/src/main.ts", "todo-server");
  expect(run("America/Bogota", ["init", "--password-stdin"]).status).toBe(0);
  expect(run("America/Bogota", ["login", "--password-stdin"]).status).toBe(0);
  server = spawn(serverBinary, [], { env: env("America/Bogota") });
  await new Promise<void>((done, fail) => {
    let log = "";
    const timer = setTimeout(
      () => fail(new Error(`server not ready: ${log}`)),
      30000,
    );
    const read = (chunk: Buffer) => {
      log += chunk.toString();
      if (/Listening on http:\/\/127\.0\.0\.1:\d+/.test(log)) {
        clearTimeout(timer);
        done();
      }
    };
    server?.stdout?.on("data", read);
    server?.stderr?.on("data", read);
  });
}, 180000);
afterAll(() => {
  server?.kill("SIGTERM");
  rmSync(scratch, { recursive: true, force: true });
});

/** What the CLI in New York does with a typed --due: resolve, then route only what resolved. */
const routedAdd = (title: string, typed: string) => {
  let due: string;
  try {
    due = resolveTypedTime(typed, "America/New_York");
  } catch (error) {
    return {
      refused:
        error instanceof CommandError
          ? [error.exit, error.code, error.message]
          : String(error),
    };
  }
  const file = join(scratch, `${title}.json`);
  writeFileSync(
    file,
    JSON.stringify({ kind: "add", profile: "default", flags: { title, due } }),
  );
  const token = JSON.parse(
    readFileSync(join(scratch, ".todo-cli/session_default.json"), "utf8"),
  ).token;
  const sent = spawnSync(
    companion,
    ["server-command", database, file, token, "json"],
    {
      env: env("America/Bogota"),
      encoding: "utf8",
      timeout: 60000,
    },
  );
  return { routed: sent.status, reply: sent.stdout.slice(0, 200) };
};
const skipped =
  "2027-03-14 02:30 does not exist in America/New_York: a daylight-saving change skips it on 2027-03-14. The nearest times that exist are 2027-03-14T01:59:00-05:00 and 2027-03-14T03:00:00-04:00.";
const repeated =
  "2026-11-01 01:30 occurs twice in America/New_York: a daylight-saving change repeats it on 2026-11-01. Type the one you mean: 2026-11-01T01:30:00-04:00 (the first) or 2026-11-01T01:30:00-05:00 (the second).";

it("a routed add typed in New York refuses a skipped or repeated time before it reaches a server in Bogota", () => {
  const before = counts();
  expect([
    routedAdd("Skipped", "2027-03-14 02:30"),
    routedAdd("Repeated", "2026-11-01 01:30"),
  ]).toEqual([
    { refused: [2, "invalid_args", skipped] },
    { refused: [2, "invalid_args", repeated] },
  ]);
  expect(counts()).toEqual(before);
});

it("the direct write in New York refuses them with the same exit and message, and writes nothing", () => {
  const before = counts();
  const direct = (typed: string) => {
    const result = run("America/New_York", [
      "--format",
      "json",
      "add",
      "Direct",
      "--due",
      typed,
    ]);
    const reply = JSON.parse(result.stdout) as {
      code: string;
      message: string;
    };
    return [result.status, reply.code, reply.message];
  };
  expect([direct("2027-03-14 02:30"), direct("2026-11-01 01:30")]).toEqual([
    [2, "invalid_args", skipped],
    [2, "invalid_args", repeated],
  ]);
  expect(counts()).toEqual(before);
});

it("control: a valid time typed in New York and routed is stored by the Bogota server with New York's zone", () => {
  expect(routedAdd("Routed", "2026-11-16 21:00").routed).toBe(0);
  const db = new Database(database, { readonly: true });
  try {
    expect(
      db
        .query<{ due: string }, []>(
          "SELECT due_at due FROM tasks WHERE title = 'Routed'",
        )
        .all()
        .map((row) => JSON.parse(row.due)),
    ).toEqual([
      {
        kind: "instant",
        utc: "2026-11-17T02:00:00.000Z",
        time_zone: "America/New_York",
      },
    ]);
  } finally {
    db.close();
  }
});

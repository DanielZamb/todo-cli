import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, expect, it } from "@effect/vitest";
import names from "../../../packages/domain/test/fixtures/catalog/names.json" with {
  type: "json",
};

const scratch = mkdtempSync(join(tmpdir(), "todo-cli-catalog-test-"));
const binary = process.env.TODO_CLI_BINARY ?? join(scratch, "todo");
const serverBinary = join(scratch, "todo-server");
const database = join(scratch, "scratch.db");
const passphrase = "scratch verification passphrase";
const env = { ...process.env, HOME: scratch, TODO_DB: database };
const run = (args: string[], code = 0, format = "json") => {
  const result = spawnSync(
    binary,
    ["--profile", "work", "--format", format, ...args],
    { env, encoding: "utf8", input: `${passphrase}\n`, timeout: 60000 },
  );
  expect(result.status, result.stdout + result.stderr).toBe(code);
  return format === "json" ? JSON.parse(result.stdout) : result.stdout;
};
const compile = (entry: string, outfile: string) => {
  const result = spawnSync(
    "bun",
    [
      "build",
      "--compile",
      resolve(import.meta.dirname, entry),
      "--outfile",
      outfile,
    ],
    { cwd: scratch, encoding: "utf8" },
  );
  expect(result.status, result.stderr).toBe(0);
};
beforeAll(() => {
  if (!process.env.TODO_CLI_BINARY) compile("../src/main.ts", binary);
  compile("../../server/src/main.ts", serverBinary);
});
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

const now = "2026-11-13T15:00:00Z";
const withServer = async <A>(use: (base: string) => Promise<A>) => {
  const server = spawn(serverBinary, [], {
    env: { ...env, TODO_PORT: "0" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  try {
    const base = await new Promise<string>((ready, fail) => {
      let log = "";
      const listen = (chunk: Buffer) => {
        log += chunk.toString();
        const match = log.match(/Listening on (http:\/\/127\.0\.0\.1:\d+)/);
        if (match?.[1]) ready(match[1]);
      };
      server.stdout.on("data", listen);
      server.stderr.on("data", listen);
      server.on("exit", (code) =>
        fail(new Error(`server exited ${code}: ${log}`)),
      );
    });
    return await use(base);
  } finally {
    server.kill("SIGTERM");
    await new Promise((done) => server.on("close", done));
  }
};

it("orders names, counts and serves the same Catalog from the compiled CLI and server", async () => {
  run(["init", "--password-stdin"]);
  run(["login", "--password-stdin"]);
  for (const [index, name] of names.input.entries())
    run(["add", `Task ${index}`, "--project", name, "--due", "2026-11-12"]);
  run(["add", "Inbox one"]);

  const cli = run(["catalog", "--view", "today", "--now", now]);
  expect(cli.projects.map((p: { name: string }) => p.name)).toEqual(
    names.ordered,
  );
  expect(cli.counts).toEqual({
    all: 23,
    today: 22,
    overdue: 22,
    scheduled: 0,
    inbox: 1,
  });
  expect(cli.view.groups.map((g: { name: string }) => g.name)).toEqual([
    "Overdue",
    "Due today",
    "Scheduled today",
  ]);

  const http = await withServer(async (base) => {
    const session = (await (
      await fetch(`${base}/auth/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passphrase }),
      })
    ).json()) as { credential: string };
    const response = await fetch(
      `${base}/profiles/work/catalog?view=today&now=${now}`,
      { headers: { Authorization: `Bearer ${session.credential}` } },
    );
    expect(response.status).toBe(200);
    return (await response.json()) as Record<string, unknown> & {
      projects: { name: string }[];
    };
  });
  expect(http.projects.map((p) => p.name)).toEqual(names.ordered);
  // The server's sign-in moved the History position; everything else matches.
  const { generated_at: _generated, position: cliPosition, ...cliRest } = cli;
  const { position: httpPosition, ...httpRest } = http as Record<
    string,
    unknown
  >;
  expect(httpRest).toEqual(cliRest);
  expect((httpPosition as { seq: number }).seq).toBeGreaterThan(
    cliPosition.seq,
  );

  const unchanged = run([
    "catalog",
    "--view",
    "today",
    "--now",
    now,
    "--known-generation",
    "initial",
    "--known-seq",
    String((httpPosition as { seq: number }).seq),
    "--known-day",
    "2026-11-13",
  ]);
  expect(unchanged).toMatchObject({ unchanged: true, day: "2026-11-13" });
  expect(Object.keys(unchanged).sort()).toEqual([
    "day",
    "generated_at",
    "position",
    "unchanged",
  ]);
  const zone = run(["catalog", "--time-zone", "Mars/Olympus"], 2);
  expect(zone).toMatchObject({ code: "invalid_args" });
  const markdown = run(["catalog", "--view", "inbox", "--now", now], 0, "md");
  expect(markdown).toContain("## Open Tasks per view");
  expect(markdown).toContain("- Inbox: 1");
  expect(markdown).toContain("Inbox one");
  expect(run(["schema", "catalog"]).anyOf).toHaveLength(2);
}, 120000);

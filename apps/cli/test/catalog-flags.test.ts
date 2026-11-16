import { Database } from "bun:sqlite";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, expect, it } from "@effect/vitest";

const scratch = mkdtempSync(join(tmpdir(), "todo-cli-catalog-flags-"));
const binary = process.env.TODO_CLI_BINARY ?? join(scratch, "todo");
const database = join(scratch, "scratch.db");
const env = { ...process.env, HOME: scratch, TODO_DB: database };
const cli = (args: string[], profile = "work") =>
  spawnSync(binary, ["--profile", profile, "--format", "json", ...args], {
    env,
    encoding: "utf8",
    input: "scratch verification passphrase\n",
    timeout: 60000,
  });
beforeAll(() => {
  if (!process.env.TODO_CLI_BINARY) {
    const built = spawnSync(
      "bun",
      [
        "build",
        "--compile",
        resolve(import.meta.dirname, "../src/main.ts"),
        "--outfile",
        binary,
      ],
      { cwd: scratch, encoding: "utf8" },
    );
    expect(built.status, built.stderr).toBe(0);
  }
  expect(cli(["init", "--password-stdin"]).status).toBe(0);
  expect(cli(["login", "--password-stdin"]).status).toBe(0);
});
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

const profiles = () => {
  const db = new Database(database, { readonly: true });
  try {
    return db
      .query<{ id: string }, []>("SELECT id FROM profiles ORDER BY id")
      .all()
      .map((row) => row.id);
  } finally {
    db.close();
  }
};
const invalid = (args: string[], label: string) => {
  const result = cli(["catalog", ...args], "Fresh");
  expect(
    [label, result.status, result.stderr.includes("    at ")],
    result.stdout + result.stderr,
  ).toEqual([label, 2, false]);
  expect(JSON.parse(result.stdout), label).toMatchObject({
    code: "invalid_args",
    exit_code: 2,
  });
};
const handled = (args: string[], label: string) => {
  const result = cli(["catalog", ...args]);
  expect(result.stderr.includes("    at "), label + result.stderr).toBe(false);
  expect([0, 2], label + result.stdout + result.stderr).toContain(
    result.status,
  );
  const body = JSON.parse(result.stdout);
  if (result.status === 2) expect(body.exit_code, label).toBe(2);
  else expect(typeof body.generated_at, label).toBe("string");
};

const wrong: Record<string, string> = {
  view: "tomorrow",
  tasks: "some",
  order: "fast",
  status: "late",
  priority: "P9",
  due: "2026-13-40",
  scheduled: "yesterday",
  energy: "9",
  estimate: "0",
  now: "noon",
  "time-zone": "Mars/Olympus",
  "known-generation": "initial",
  "known-seq": "x",
  "known-day": "2026-02-30",
  "known-stamp": "abc",
  text: "x".repeat(201),
  prefix: "xyz!",
};
const free = ["project-id", "tag-id", "project", "tag", "attachment"];
const all = [...Object.keys(wrong), ...free];

it("refuses every invalid catalog flag value with invalid_args before any store work", () => {
  const before = profiles();
  for (const [flag, value] of Object.entries(wrong))
    invalid([`--${flag}`, value], `--${flag} ${value}`);
  for (const flag of all.filter((flag) => flag !== "text"))
    invalid([`--${flag}`, ""], `--${flag} ""`);
  for (const flag of ["view", "tasks", "known-seq", "now", "priority"])
    invalid([`--${flag}`, "-x"], `--${flag} -x`);
  // A blank Tag name is refused; a blank Project name is a real name (F7).
  for (const value of [" ", "\t", "\u3000"])
    invalid(["--tag", value], `--tag ${JSON.stringify(value)}`);
  // A refused catalog never opened the store for --profile Fresh.
  expect(profiles()).toEqual(before);
});

it("answers a dash value or a repeated flag with a reply or the envelope, never a defect", () => {
  for (const flag of all) {
    handled([`--${flag}`, "-x"], `--${flag} -x`);
    handled([`--${flag}`, "a", `--${flag}`, "b"], `--${flag} a --${flag} b`);
  }
  handled(["--view", "today", "--view", "all"], "--view today --view all");
  handled(["--ready", "--ready"], "--ready --ready");
});

it("refuses a blank Tag name on todo list, and keeps an empty one as the flag's absence", () => {
  const blank = cli(["list", "--tag", " "]);
  expect([blank.status, JSON.parse(blank.stdout).code]).toEqual([
    2,
    "invalid_args",
  ]);
  for (const flag of ["project", "tag"]) {
    // todo list gives every value flag the default "", which means absent.
    const empty = cli(["list", `--${flag}`, ""]);
    const absent = cli(["list"]);
    const shape = (stdout: string) => {
      const { generated_at: _, ...rest } = JSON.parse(stdout);
      return rest;
    };
    expect([empty.status, shape(empty.stdout)], flag).toEqual([
      0,
      shape(absent.stdout),
    ]);
  }
});

it("finds a Project named two spaces by its exact name on todo list and todo catalog (seat F7)", () => {
  for (const [title, project] of [
    ["Spaced", "  "],
    ["One space", " "],
    ["Plain", "Errands"],
  ] as const)
    expect(cli(["add", title, "--project", project]).status).toBe(0);
  const listed = cli(["list", "--project", "  "]);
  const catalog = cli(["catalog", "--project", "  ", "--tasks", "matching"]);
  const titles = (stdout: string) =>
    (JSON.parse(stdout).tasks as { title: string }[]).map((t) => t.title);
  expect([
    listed.status,
    titles(listed.stdout),
    catalog.status,
    titles(catalog.stdout),
  ]).toEqual([0, ["Spaced"], 0, ["Spaced"]]);
});

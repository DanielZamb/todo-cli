// Follow-up 88, the case that would have caught it: the compiled CLI's weekly review in Markdown
// lists a date-only Task due today (a Project set, so it is not Missing Metadata) under Scheduled,
// on the machine's real clock. In Bogota (west of UTC) the defect hid it at every hour of the day.
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, expect, it } from "@effect/vitest";

const scratch = mkdtempSync(join(tmpdir(), "todo-cli-review-week-"));
const binary = process.env.TODO_CLI_BINARY ?? join(scratch, "todo");
const TZ = "America/Bogota";
const run = (args: string[]) => {
  const result = spawnSync(binary, args, {
    env: {
      ...process.env,
      TZ,
      HOME: scratch,
      TODO_DB: join(scratch, "scratch.db"),
    },
    encoding: "utf8",
    input: "review week passphrase\n",
    timeout: 60000,
  });
  expect(result.status, result.stdout + result.stderr).toBe(0);
  return result.stdout;
};
const day = (offset: number) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(Date.now() + offset * 86400000));

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
  run(["init", "--password-stdin"]);
  run(["login", "--password-stdin"]);
  run(["add", "Due today", "--due", day(0), "--project", "work"]);
  run(["add", "Due yesterday", "--due", day(-1), "--project", "work"]);
  run(["add", "Due in seven days", "--due", day(7), "--project", "work"]);
}, 180000);
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

it("weekly review: due today is Scheduled, due yesterday Overdue, due in seven days outside the week", () => {
  const groups: Record<string, string[]> = {};
  let current = "";
  for (const line of run(["review", "weekly"]).split("\n")) {
    const heading = /^## (.+)$/.exec(line);
    if (heading?.[1]) {
      current = heading[1];
      groups[current] = [];
    }
    const row = /^- \[ \] \[P\d\] (.+?) \(id:/.exec(line);
    if (row?.[1] && current) groups[current]?.push(row[1]);
  }
  expect(groups).toEqual({
    Overdue: ["Due yesterday"],
    Scheduled: ["Due today"],
    "Stale Inbox": [],
    "Missing Metadata": [],
  });
});

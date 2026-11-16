// Q10, the owner's answer A (2026-11-14): the Markdown `due:` label shows the date in the zone
// stored with the instant, the rule Today and Overdue use (planning-day.ts taskDay), not the
// instant's UTC date. Display only: JSON keeps the instant as it was. Every Markdown path that
// prints a Task line is driven through the compiled CLI on scratch data.
import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, expect, it } from "@effect/vitest";
import { ensureProfile } from "@todo/domain/commands";
import { openStore, TaskCommands } from "@todo/domain/store";
import { Effect } from "effect";

const scratch = mkdtempSync(join(tmpdir(), "todo-cli-due-zone-"));
const binary = process.env.TODO_CLI_BINARY ?? join(scratch, "todo");
const database = join(scratch, "scratch.db");
const passphrase = "due zone passphrase";
const run = (args: string[]) => {
  const result = spawnSync(binary, args, {
    // The machine's zone must not matter: the label comes from the stored zone.
    env: {
      ...process.env,
      TZ: "Pacific/Kiritimati",
      HOME: scratch,
      TODO_DB: database,
    },
    encoding: "utf8",
    input: `${passphrase}\n`,
    timeout: 60000,
  });
  expect(result.status, result.stdout + result.stderr).toBe(0);
  return result.stdout;
};

// 21:00 and 23:59 on 14 November in Bogota are 02:00 and 04:59 on the 15th in UTC; 08:00 on the
// 15th in Tokyo is 23:00 on the 14th in UTC. The CLI stores the zone UTC for a time typed into it.
const expected = {
  "Bogota at 21:00": "2026-11-14",
  "Bogota at 23:59": "2026-11-14",
  "Tokyo at 08:00": "2026-11-15",
  "Typed into the CLI": "2026-11-15",
  "Date only": "2026-11-14",
};
const instants = {
  "Bogota at 21:00": "2026-11-15T02:00:00Z",
  "Bogota at 23:59": "2026-11-15T04:59:00Z",
  "Tokyo at 08:00": "2026-11-14T23:00:00Z",
  "Typed into the CLI": "2026-11-15T02:00:00Z",
  "Date only": "2026-11-14",
};

beforeAll(async () => {
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
  run(["add", "Typed into the CLI", "--due", "2026-11-15T02:00:00Z"]);
  run(["add", "Date only", "--due", "2026-11-14"]);
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const store = yield* Effect.acquireRelease(
          openStore({ path: database }),
          (value) => Effect.orDie(value.close()),
        );
        const { credential } = yield* store.auth.signIn(passphrase);
        const profile = yield* ensureProfile(store, "default");
        const commands = new TaskCommands(store);
        for (const [title, utc, time_zone] of [
          ["Bogota at 21:00", "2026-11-15T02:00:00Z", "America/Bogota"],
          ["Bogota at 23:59", "2026-11-15T04:59:00Z", "America/Bogota"],
          ["Tokyo at 08:00", "2026-11-14T23:00:00Z", "Asia/Tokyo"],
        ] as const)
          yield* commands.create({ credential, profile: profile.id }, {
            title,
            priority: "P3",
            source: "agent",
            due_at: { kind: "instant", utc, time_zone },
          } as never);
      }),
    ),
  );
}, 180000);
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

/** The `due:` label of each Task line in Markdown output, by title. */
const labels = (markdown: string) =>
  Object.fromEntries(
    markdown
      .split("\n")
      .map((line) =>
        /^- \[[ x]\] \[P\d\] (.+?) \(id: .*?\bdue:(\S+)/.exec(line),
      )
      .filter((match) => match !== null)
      .map((match) => [match[1], match[2]]),
  );

it("list, export, catalog and the Obsidian projection label each due date by its stored zone", () => {
  expect(labels(run(["list"]))).toEqual(expected);
  expect(labels(run(["export"]))).toEqual(expected);
  expect(labels(run(["catalog", "--view", "all"]))).toEqual(expected);
  // The vault must be a canonical path: the scratch folder sits behind a symlink.
  const vault = join(realpathSync(scratch), "vault");
  mkdirSync(vault);
  run(["sync", "obsidian", "--vault", vault]);
  expect(
    labels(readFileSync(join(vault, "Todo/CLI Tasks.md"), "utf8")),
  ).toEqual(expected);
});

it("show labels a Bogota evening Task with Bogota's date", () => {
  const listed = JSON.parse(run(["--format", "json", "list"])) as {
    tasks: { id: string; title: string }[];
  };
  const id =
    listed.tasks.find((task) => task.title === "Bogota at 21:00")?.id ?? "";
  expect(labels(run(["show", id]))).toEqual({
    "Bogota at 21:00": "2026-11-14",
  });
});

it("JSON keeps every due time as it was stored", () => {
  const listed = JSON.parse(run(["--format", "json", "list"])) as {
    tasks: { title: string; due_at?: string }[];
  };
  expect(
    Object.fromEntries(listed.tasks.map((task) => [task.title, task.due_at])),
  ).toEqual(instants);
});

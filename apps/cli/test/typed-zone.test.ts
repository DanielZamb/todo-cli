// Follow-up 86 (ADR-0006): a time typed into the compiled CLI is stored in UTC together with the
// zone of the machine it was typed on (TZ here). Read back through the Catalog: the stored utc and
// time_zone, the Markdown due: label, and the Today group at a fixed now.
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, expect, it } from "@effect/vitest";

const scratch = mkdtempSync(join(tmpdir(), "todo-cli-typed-zone-"));
const binary = process.env.TODO_CLI_BINARY ?? join(scratch, "todo");
const passphrase = "typed zone passphrase";
const run = (TZ: string, home: string, args: string[], status = 0) => {
  const result = spawnSync(binary, args, {
    env: { ...process.env, TZ, HOME: home, TODO_DB: join(home, "scratch.db") },
    encoding: "utf8",
    input: `${passphrase}\n`,
    timeout: 60000,
  });
  expect(result.status, result.stdout + result.stderr).toBe(status);
  return result.stdout;
};

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
}, 180000);
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

type CatalogTask = {
  id: string;
  title: string;
  due_at: {
    kind: string;
    utc?: string;
    time_zone?: string;
    date?: string;
  } | null;
};
/** Types the three forms on a machine in `zone`; reads them back at `now`. */
const typedOn = (zone: string, now: string) => {
  const home = join(scratch, zone.replace("/", "-"));
  run(zone, home, ["init", "--password-stdin"]);
  run(zone, home, ["login", "--password-stdin"]);
  run(zone, home, ["add", "Local", "--due", "2026-11-16 21:00"]);
  run(zone, home, ["add", "Offset", "--due", "2026-11-16T21:00:00-05:00"]);
  run(zone, home, ["add", "Zulu", "--due", "2026-11-16T21:00:00Z"]);
  const catalog = JSON.parse(
    run(zone, home, [
      "--format",
      "json",
      "catalog",
      "--view",
      "today",
      "--now",
      now,
    ]),
  ) as {
    tasks: CatalogTask[];
    view: { groups: { name: string; task_ids: string[] }[] };
  };
  const title = (id: string) =>
    catalog.tasks.find((task) => task.id === id)?.title;
  const labels = Object.fromEntries(
    run(zone, home, ["list"])
      .split("\n")
      .map((line) => /\] \[P\d\] (\S+) \(id: .*?\bdue:(\S+)/.exec(line))
      .filter((match) => match !== null)
      .map((match) => [match[1], match[2]]),
  );
  return {
    stored: Object.fromEntries(
      catalog.tasks.map((task) => [
        task.title,
        `${task.due_at?.utc} ${task.due_at?.time_zone}`,
      ]),
    ),
    labels,
    dueToday: (
      catalog.view.groups.find((group) => group.name === "Due today")
        ?.task_ids ?? []
    )
      .map(title)
      .sort(),
  };
};

it("Bogota: 21:00 typed is 21:00 in Bogota; an offset keeps its instant; all stored with Bogota", () => {
  expect(typedOn("America/Bogota", "2026-11-17T01:00:00Z")).toEqual({
    stored: {
      Local: "2026-11-17T02:00:00.000Z America/Bogota",
      Offset: "2026-11-17T02:00:00.000Z America/Bogota",
      Zulu: "2026-11-16T21:00:00.000Z America/Bogota",
    },
    labels: { Local: "2026-11-16", Offset: "2026-11-16", Zulu: "2026-11-16" },
    dueToday: ["Local", "Offset", "Zulu"],
  });
});

it("New York, after daylight saving ends: the same instants, stored with New York", () => {
  expect(typedOn("America/New_York", "2026-11-17T01:00:00Z")).toEqual({
    stored: {
      Local: "2026-11-17T02:00:00.000Z America/New_York",
      Offset: "2026-11-17T02:00:00.000Z America/New_York",
      Zulu: "2026-11-16T21:00:00.000Z America/New_York",
    },
    labels: { Local: "2026-11-16", Offset: "2026-11-16", Zulu: "2026-11-16" },
    dueToday: ["Local", "Offset", "Zulu"],
  });
});

it("Tokyo: 21:00 typed is 21:00 in Tokyo; the Bogota evening offset is Tokyo's next morning", () => {
  expect(typedOn("Asia/Tokyo", "2026-11-16T14:00:00Z")).toEqual({
    stored: {
      Local: "2026-11-16T12:00:00.000Z Asia/Tokyo",
      Offset: "2026-11-17T02:00:00.000Z Asia/Tokyo",
      Zulu: "2026-11-16T21:00:00.000Z Asia/Tokyo",
    },
    labels: { Local: "2026-11-16", Offset: "2026-11-17", Zulu: "2026-11-17" },
    dueToday: ["Local"],
  });
});

it("UTC: a local time is UTC's own wall-clock time", () => {
  expect(typedOn("UTC", "2026-11-16T22:00:00Z")).toEqual({
    stored: {
      Local: "2026-11-16T21:00:00.000Z UTC",
      Offset: "2026-11-17T02:00:00.000Z UTC",
      Zulu: "2026-11-16T21:00:00.000Z UTC",
    },
    labels: { Local: "2026-11-16", Offset: "2026-11-17", Zulu: "2026-11-16" },
    dueToday: ["Local", "Zulu"],
  });
});

it("edit reads a typed time in the machine's zone; a skipped or repeated local time is refused", () => {
  const zone = "America/New_York";
  const home = join(scratch, "edit-new-york");
  run(zone, home, ["init", "--password-stdin"]);
  run(zone, home, ["login", "--password-stdin"]);
  const added = JSON.parse(
    run(zone, home, ["--format", "json", "add", "Edited"]),
  ) as {
    task: { id: string };
  };
  run(zone, home, [
    "edit",
    added.task.id,
    "--expected-version",
    "1",
    "--due",
    "2026-11-16 21:00",
  ]);
  const shown = JSON.parse(
    run(zone, home, ["--format", "json", "show", added.task.id]),
  ) as {
    task: { due_at: string };
  };
  expect(shown.task.due_at).toBe("2026-11-17T02:00:00Z");
  const refused = (due: string) =>
    (
      JSON.parse(
        run(zone, home, ["--format", "json", "add", "DST", "--due", due], 2),
      ) as {
        code: string;
        message: string;
      }
    ).message;
  expect([refused("2026-03-08 02:30"), refused("2026-11-01 01:30")]).toEqual([
    "2026-03-08 02:30 does not exist or occurs twice in America/New_York (a daylight-saving change); add the offset you mean, for example 2026-03-08T02:30:00-05:00",
    "2026-11-01 01:30 does not exist or occurs twice in America/New_York (a daylight-saving change); add the offset you mean, for example 2026-11-01T01:30:00-05:00",
  ]);
});

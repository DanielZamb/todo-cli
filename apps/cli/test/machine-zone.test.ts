// ADR-0006 (amended 2026-11-13): the CLI reads the database directly, so its
// Today and Overdue take today in the machine's zone unless a zone is given.
// Each run names its zone through TZ; nothing depends on the machine's zone.
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, expect, it } from "@effect/vitest";

const scratch = mkdtempSync(join(tmpdir(), "todo-cli-machine-zone-"));
const binary = process.env.TODO_CLI_BINARY ?? join(scratch, "todo");
const cli = (TZ: string, args: string[]) => {
  const result = spawnSync(binary, ["--format", "json", ...args], {
    env: {
      ...process.env,
      TZ,
      HOME: scratch,
      TODO_DB: join(scratch, "scratch.db"),
    },
    encoding: "utf8",
    input: "machine zone passphrase\n",
    timeout: 60000,
  });
  expect(result.status, result.stdout + result.stderr).toBe(0);
  return JSON.parse(result.stdout);
};
const dateIn = (timeZone: string) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
// Kiritimati (UTC+14) and Pago Pago (UTC-11) are 25 hours apart: their dates
// always differ, at any time of day.
const east = "Pacific/Kiritimati";
const west = "Pacific/Pago_Pago";

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
  cli("UTC", ["init", "--password-stdin"]);
  cli("UTC", ["login", "--password-stdin"]);
  cli("UTC", ["add", "Due east today", "--due", dateIn(east)]);
  cli("UTC", ["add", "Due west today", "--due", dateIn(west)]);
});
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

const titles = (reply: { tasks?: { title: string }[] }) =>
  (reply.tasks ?? []).map((task) => task.title).sort();

it("list --today and --overdue take today in the machine's zone", () => {
  expect([
    titles(cli(east, ["list", "--today"])),
    titles(cli(east, ["list", "--overdue"])),
    titles(cli(west, ["list", "--today"])),
    titles(cli(west, ["list", "--overdue"])),
  ]).toEqual([["Due east today"], ["Due west today"], ["Due west today"], []]);
});

it("export --scope today and review daily take today in the machine's zone", () => {
  expect([
    titles(cli(east, ["export", "--scope", "today"])),
    titles(cli(west, ["export", "--scope", "today"])),
  ]).toEqual([["Due east today"], ["Due west today"]]);
  const review = (TZ: string) =>
    spawnSync(binary, ["review", "daily"], {
      env: {
        ...process.env,
        TZ,
        HOME: scratch,
        TODO_DB: join(scratch, "scratch.db"),
      },
      encoding: "utf8",
    }).stdout;
  const overdue = (text: string) =>
    (text.split("## Overdue\n")[1] ?? "").split("\n\n")[0] ?? "";
  expect([
    overdue(review(east)).includes("Due west today"),
    overdue(review(west)).includes("Due west today"),
    overdue(review(west)).includes("Due east today"),
  ]).toEqual([true, false, false]);
});

it("todo catalog takes today in the machine's zone unless --time-zone is given", () => {
  const day = (TZ: string, extra: string[] = []) =>
    cli(TZ, ["catalog", "--now", "2026-11-14T00:01:00Z", ...extra]).day;
  // 19:01 on the 13th in Bogota; the 14th in UTC and Tokyo.
  expect([
    day("America/Bogota"),
    day("UTC"),
    day("America/Bogota", ["--time-zone", "Asia/Tokyo"]),
  ]).toEqual(["2026-11-13", "2026-11-14", "2026-11-14"]);
});

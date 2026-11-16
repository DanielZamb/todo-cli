// Q14 (the owner, 2026-11-16): `todo repair time-zones` on scratch data with the compiled CLI.
// Tasks typed on a machine set to UTC are stored with the zone UTC, as every typed time was before
// follow-up 86; the repair then runs in Bogotá. The dry run leaves the database file byte-identical,
// with and without a running server; the run takes a Snapshot, edits each Task once with the dry
// run's Version, skips a Task changed meanwhile as a Conflict, and a Revert undoes one change.
import { Database } from "bun:sqlite";
import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, expect, it } from "@effect/vitest";

const scratch = mkdtempSync(join(tmpdir(), "todo-cli-repair-zones-"));
const database = join(scratch, "scratch.db");
const passphrase = "repair time zones passphrase";
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
let cli = process.env.TODO_CLI_BINARY ?? "";
let serverBinary = process.env.TODO_SERVER_BINARY ?? "";
const env = (TZ: string) => ({
  ...process.env,
  TZ,
  HOME: scratch,
  TODO_DB: database,
  TODO_PORT: "0",
});
const run = (TZ: string, args: string[], input = `${passphrase}\n`) =>
  spawnSync(cli, args, {
    env: env(TZ),
    encoding: "utf8",
    input,
    timeout: 60000,
  });
const json = (TZ: string, args: string[]) => {
  const result = run(TZ, ["--format", "json", ...args]);
  return { status: result.status, body: JSON.parse(result.stdout) };
};
const ids: Record<string, string> = {};
const add = (TZ: string, title: string, flags: string[]) => {
  const result = json(TZ, ["add", title, ...flags]);
  expect(result.status).toBe(0);
  ids[title] = result.body.task.id;
};
/** The database file and its WAL, by SHA-256: what "writes nothing" means here. */
const fileHashes = () =>
  [database, `${database}-wal`].map((path) =>
    existsSync(path)
      ? createHash("sha256").update(readFileSync(path)).digest("hex")
      : "absent",
  );
const stored = () => {
  const db = new Database(database, { readonly: true });
  try {
    return Object.fromEntries(
      db
        .query<
          {
            title: string;
            due: string | null;
            scheduled: string | null;
            version: number;
          },
          []
        >(
          "SELECT title, due_at due, scheduled_at scheduled, row_version version FROM tasks ORDER BY title",
        )
        .all()
        .map((row) => [
          row.title,
          {
            due: row.due && JSON.parse(row.due),
            scheduled: row.scheduled && JSON.parse(row.scheduled),
            version: row.version,
          },
        ]),
    );
  } finally {
    db.close();
  }
};
const historyCount = () => {
  const db = new Database(database, { readonly: true });
  try {
    return db.query<{ n: number }, []>("SELECT count(*) n FROM op_log").get()
      ?.n;
  } finally {
    db.close();
  }
};
const utc = (at: string) => ({ kind: "instant", utc: at, time_zone: "UTC" });
const bogota = (at: string) => ({
  kind: "instant",
  utc: at,
  time_zone: "America/Bogota",
});
const planFile = join(scratch, "plan.json");
let plan: {
  items: {
    task_id: string;
    title: string;
    field: string;
    utc: string;
    to_zone: string;
    day_before: string;
    day_after: string;
    from_version: number;
  }[];
  totals: unknown;
};
let firstSnapshot = "";

beforeAll(() => {
  if (!cli) cli = compile("../src/main.ts", "todo");
  if (!serverBinary)
    serverBinary = compile("../../server/src/main.ts", "todo-server");
  expect(run("UTC", ["init", "--password-stdin"]).status).toBe(0);
  expect(run("UTC", ["login", "--password-stdin"]).status).toBe(0);
  // Typed on a UTC machine: stored with the zone UTC.
  add("UTC", "Evening", ["--due", "2026-11-17 02:00"]); // 21:00 in Bogotá on the 16th
  add("UTC", "Noon", [
    "--due",
    "2026-11-16 12:00",
    "--scheduled",
    "2026-11-16 09:00",
  ]);
  add("UTC", "Meanwhile", ["--due", "2026-11-18 03:00"]); // 22:00 in Bogotá on the 17th
  add("UTC", "Dated", ["--due", "2026-11-16"]);
  add("America/Bogota", "Already", ["--due", "2026-11-16 21:00"]);
  add("UTC", "Closed", ["--due", "2026-11-15 01:00"]); // 20:00 in Bogotá on the 14th
  expect(
    json("UTC", ["done", ids.Closed as string, "--expected-version", "1"])
      .status,
  ).toBe(0);
}, 240000);
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

it("the dry run lists exactly the UTC-zoned values, and the database file is byte-identical after it", () => {
  const before = { files: fileHashes(), history: historyCount() };
  const result = run("America/Bogota", [
    "--format",
    "json",
    "repair",
    "time-zones",
    "--dry-run",
  ]);
  expect(result.status, result.stdout).toBe(0);
  writeFileSync(planFile, result.stdout);
  plan = JSON.parse(result.stdout);
  expect({ files: fileHashes(), history: historyCount() }).toEqual(before);
  expect(
    plan.items.map(
      (item) =>
        `${item.title} ${item.field} ${item.utc} UTC->${item.to_zone} ${item.day_before}->${item.day_after} v${item.from_version}`,
    ),
  ).toEqual([
    "Noon due_at 2026-11-16T12:00:00.000Z UTC->America/Bogota 2026-11-16->2026-11-16 v1",
    "Noon scheduled_at 2026-11-16T09:00:00.000Z UTC->America/Bogota 2026-11-16->2026-11-16 v1",
    "Evening due_at 2026-11-17T02:00:00.000Z UTC->America/Bogota 2026-11-17->2026-11-16 v1",
    "Meanwhile due_at 2026-11-18T03:00:00.000Z UTC->America/Bogota 2026-11-18->2026-11-17 v1",
  ]);
  expect(plan.totals).toEqual({ tasks: 3, values: 4, not_changed: 1 });
});

it("with the server running, the dry run also leaves the database file byte-identical", async () => {
  const server: ChildProcess = spawn(serverBinary, [], {
    env: env("America/Bogota"),
  });
  try {
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
      server.stdout?.on("data", read);
      server.stderr?.on("data", read);
    });
    // The server's scheduler fires a reminder for each Task already past due when it starts (a
    // History entry of its own). Measure once the database has been quiet for two seconds.
    let quiet = { files: fileHashes(), history: historyCount() };
    for (let tries = 0; tries < 15; tries++) {
      await new Promise((done) => setTimeout(done, 2000));
      const now = { files: fileHashes(), history: historyCount() };
      if (JSON.stringify(now) === JSON.stringify(quiet)) break;
      quiet = now;
    }
    const before = { files: fileHashes(), history: historyCount() };
    expect(before).toEqual(quiet);
    const result = run("America/Bogota", [
      "--format",
      "json",
      "repair",
      "time-zones",
      "--dry-run",
    ]);
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout).items).toEqual(plan.items);
    expect({ files: fileHashes(), history: historyCount() }).toEqual(before);
  } finally {
    server.kill("SIGTERM");
    await new Promise((done) => server.once("exit", done));
  }
}, 60000);

it("the run takes a Snapshot, changes each Task once, and skips a Task changed since the dry run as a Conflict", () => {
  expect(
    json("America/Bogota", [
      "edit",
      ids.Meanwhile as string,
      "--title",
      "Meanwhile",
      "--priority",
      "P1",
      "--expected-version",
      "1",
    ]).status,
  ).toBe(0);
  const history = historyCount() as number;
  const result = run("America/Bogota", [
    "--format",
    "json",
    "repair",
    "time-zones",
    "--plan",
    planFile,
  ]);
  expect(result.status).toBe(4);
  const report = JSON.parse(result.stdout);
  firstSnapshot = report.snapshot_id;
  expect(typeof firstSnapshot).toBe("string");
  expect(
    report.items.map(
      (item: {
        title: string;
        field: string;
        outcome: string;
        to_version: number | null;
        current_version: number | null;
      }) =>
        `${item.title} ${item.field} ${item.outcome} to v${item.to_version} now v${item.current_version}`,
    ),
  ).toEqual([
    "Noon due_at changed to v2 now v2",
    "Noon scheduled_at changed to v2 now v2",
    "Evening due_at changed to v2 now v2",
    "Meanwhile due_at conflict to vnull now v2",
  ]);
  expect(report.totals).toEqual({
    changed: 3,
    already_repaired: 0,
    conflict: 1,
    not_found: 0,
    rejected: 0,
  });
  // Two edits committed (Evening, Noon: one History entry each) and one rejected attempt (Meanwhile).
  expect(historyCount()).toBe(history + 3);
  expect(stored()).toEqual({
    Closed: {
      due: utc("2026-11-15T01:00:00.000Z"),
      scheduled: null,
      version: 2,
    },
    Already: {
      due: bogota("2026-11-17T02:00:00.000Z"),
      scheduled: null,
      version: 1,
    },
    Dated: {
      due: { kind: "date", date: "2026-11-16" },
      scheduled: null,
      version: 1,
    },
    Evening: {
      due: bogota("2026-11-17T02:00:00.000Z"),
      scheduled: null,
      version: 2,
    },
    Meanwhile: {
      due: utc("2026-11-18T03:00:00.000Z"),
      scheduled: null,
      version: 2,
    },
    Noon: {
      due: bogota("2026-11-16T12:00:00.000Z"),
      scheduled: bogota("2026-11-16T09:00:00.000Z"),
      version: 2,
    },
  });
  // The newest Snapshot is the run's (the server took a daily one when it started).
  const snapshots = json("America/Bogota", ["snapshot", "list"]).body.snapshots;
  expect(
    snapshots.map(
      (snapshot: { id: string; reason: string }) =>
        `${snapshot.id === firstSnapshot} ${snapshot.reason}`,
    ),
  ).toEqual(["true repair time-zones", "false daily"]);
});

it("a new dry run picks up the skipped Task at its new Version; after it, a run changes nothing and takes no Snapshot", () => {
  const again = run("America/Bogota", [
    "--format",
    "json",
    "repair",
    "time-zones",
    "--dry-run",
  ]);
  writeFileSync(planFile, again.stdout);
  expect(
    JSON.parse(again.stdout).items.map(
      (item: { title: string; from_version: number }) =>
        `${item.title} v${item.from_version}`,
    ),
  ).toEqual(["Meanwhile v2"]);
  const applied = JSON.parse(
    run("America/Bogota", [
      "--format",
      "json",
      "repair",
      "time-zones",
      "--plan",
      planFile,
    ]).stdout,
  );
  expect(applied.totals.changed).toBe(1);
  // The same plan again, and a fresh dry run's empty plan: nothing written, no Snapshot.
  const before = { files: fileHashes(), history: historyCount() };
  const second = run("America/Bogota", [
    "--format",
    "json",
    "repair",
    "time-zones",
    "--plan",
    planFile,
  ]);
  expect(second.status).toBe(0);
  expect(JSON.parse(second.stdout)).toMatchObject({
    snapshot_id: null,
    totals: {
      changed: 0,
      already_repaired: 1,
      conflict: 0,
      not_found: 0,
      rejected: 0,
    },
  });
  const empty = run("America/Bogota", [
    "--format",
    "json",
    "repair",
    "time-zones",
    "--dry-run",
  ]);
  expect(JSON.parse(empty.stdout).items).toEqual([]);
  writeFileSync(planFile, empty.stdout);
  expect(
    JSON.parse(
      run("America/Bogota", [
        "--format",
        "json",
        "repair",
        "time-zones",
        "--plan",
        planFile,
      ]).stdout,
    ).snapshot_id,
  ).toBe(null);
  expect({ files: fileHashes(), history: historyCount() }).toEqual(before);
});

it("Revert of one repaired Task gives back the zone UTC, through the existing Revert", () => {
  const entries = json("America/Bogota", ["history", ids.Evening as string])
    .body.entries as {
    seq: number;
    outcome: string;
    event: { kind: string };
  }[];
  const repaired = entries.filter(
    (entry) =>
      entry.outcome === "committed" && entry.event.kind === "TaskEdited",
  );
  expect(repaired.length).toBe(1);
  const reverted = json("America/Bogota", [
    "revert",
    String(repaired[0]?.seq),
    "--expected-version",
    "2",
  ]);
  expect(reverted.status).toBe(0);
  expect(stored().Evening).toEqual({
    due: utc("2026-11-17T02:00:00.000Z"),
    scheduled: null,
    version: 3,
  });
});

it("the run's Snapshot restores the state before the repair", () => {
  expect(
    json("America/Bogota", ["snapshot", "restore", firstSnapshot]).status,
  ).toBe(0);
  const restored = stored();
  expect([
    restored.Evening?.due,
    restored.Noon?.due,
    restored.Noon?.scheduled,
  ]).toEqual([
    utc("2026-11-17T02:00:00.000Z"),
    utc("2026-11-16T12:00:00.000Z"),
    utc("2026-11-16T09:00:00.000Z"),
  ]);
});

it("--include-closed adds a done Task; without it the done Task is listed as not changed", () => {
  const closed = run("America/Bogota", [
    "--format",
    "json",
    "repair",
    "time-zones",
    "--dry-run",
    "--include-closed",
  ]);
  writeFileSync(planFile, closed.stdout);
  expect(
    JSON.parse(closed.stdout).items.map(
      (item: {
        title: string;
        status: string;
        day_before: string;
        day_after: string;
      }) =>
        `${item.title} ${item.status} ${item.day_before}->${item.day_after}`,
    ),
  ).toContain("Closed done 2026-11-15->2026-11-14");
  const applied = JSON.parse(
    run("America/Bogota", [
      "--format",
      "json",
      "repair",
      "time-zones",
      "--plan",
      planFile,
    ]).stdout,
  );
  expect(
    applied.items
      .filter((item: { title: string }) => item.title === "Closed")
      .map((item: { outcome: string }) => item.outcome),
  ).toEqual(["changed"]);
  expect(stored().Closed?.due).toEqual(bogota("2026-11-15T01:00:00.000Z"));
});

it("refuses a plan made for another time zone, and a call with neither --dry-run nor --plan", () => {
  const tokyo = json("Asia/Tokyo", [
    "repair",
    "time-zones",
    "--plan",
    planFile,
  ]);
  expect([tokyo.status, tokyo.body.code]).toEqual([2, "invalid_args"]);
  expect(tokyo.body.message).toBe(
    "The plan was made for the time zone America/Bogota; this machine's is Asia/Tokyo. Make a new dry run here.",
  );
  const bare = json("America/Bogota", ["repair", "time-zones"]);
  expect([bare.status, bare.body.code]).toEqual([2, "invalid_args"]);
});

// Q14 (the owner, 2026-11-16): `todo repair time-zones` on scratch data with the compiled CLI and
// server. Tasks typed on a machine set to UTC are stored with the zone UTC, as every time typed
// bare was before follow-up 86; the repair runs in Bogotá.
// - The dry run requires a reading (--keep moment|clock), shows both, and writes nothing, with and
//   without a running server.
// - A run applies exactly a dry run made with the same options (server seat F1): an edited,
//   reordered, truncated or foreign plan is refused before any Snapshot or write.
// - --all-profiles covers every Profile (F2); --task limits a run to named Tasks (F3).
// - The run takes a Snapshot, edits each Task once with the dry run's Version, skips a Task changed
//   meanwhile as a Conflict; Revert undoes one change; the Snapshot restores the state before.
// - Under "clock" the instant moves, and a reminder that fired for the old instant fires again
//   for the new one; under "moment" it does not.
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
const BOGOTA = "America/Bogota";
const repair = (args: string[], TZ = BOGOTA) =>
  json(TZ, ["repair", "time-zones", ...args]);
const ids: Record<string, string> = {};
const add = (
  TZ: string,
  title: string,
  flags: string[],
  profile = "default",
) => {
  const result = json(TZ, ["--profile", profile, "add", title, ...flags]);
  expect(result.status, JSON.stringify(result.body)).toBe(0);
  ids[title] = result.body.task.id;
};
/** The database file and its WAL, by SHA-256: what "writes nothing" means here. */
const fileHashes = () =>
  [database, `${database}-wal`].map((path) =>
    existsSync(path)
      ? createHash("sha256").update(readFileSync(path)).digest("hex")
      : "absent",
  );
const query = <T>(sql: string) => {
  const db = new Database(database, { readonly: true });
  try {
    return db.query<T, []>(sql).all();
  } finally {
    db.close();
  }
};
const unchanged = () => ({
  files: fileHashes(),
  history: query<{ n: number }>("SELECT count(*) n FROM op_log")[0]?.n,
  snapshots: (json(BOGOTA, ["snapshot", "list"]).body.snapshots as unknown[])
    .length,
});
const stored = (title: string) => {
  const row = query<{
    due: string | null;
    scheduled: string | null;
    version: number;
  }>(
    `SELECT due_at due, scheduled_at scheduled, row_version version FROM tasks WHERE title = '${title}'`,
  )[0];
  return (
    row && {
      due: row.due && JSON.parse(row.due),
      scheduled: row.scheduled && JSON.parse(row.scheduled),
      version: row.version,
    }
  );
};
const reminders = (title: string) =>
  query<{ due: string }>(
    `SELECT json_extract(event,'$.due_at') due FROM op_log WHERE outcome='committed' AND json_extract(event,'$.kind')='ReminderFired' AND json_extract(event,'$.task_id')='${ids[title]}' ORDER BY seq`,
  ).map((row) => row.due);
const utc = (at: string) => ({ kind: "instant", utc: at, time_zone: "UTC" });
const bogota = (at: string) => ({
  kind: "instant",
  utc: at,
  time_zone: BOGOTA,
});
const planFile = (name: string, body: unknown) => {
  const path = join(scratch, `${name}.json`);
  writeFileSync(path, typeof body === "string" ? body : JSON.stringify(body));
  return path;
};
type Item = {
  task_id: string;
  title: string;
  field: string;
  stored_utc: string;
  shown_before: string;
  as_moment: string;
  as_clock: string;
  keep: string;
  new_utc: string;
  to_zone: string;
  day_before: string;
  day_after: string;
  from_version: number;
};
const line = (item: Item) =>
  `${item.title} ${item.field}: shown ${item.shown_before} | moment ${item.as_moment} | clock ${item.as_clock} | ${item.keep} -> ${item.new_utc}, day ${item.day_before}->${item.day_after} v${item.from_version}`;
/** Starts the server, waits for two quiet seconds (its scheduler fires reminders for past due Tasks), runs `during`, stops it. */
const withServer = async (during: () => void) => {
  const server: ChildProcess = spawn(serverBinary, [], { env: env(BOGOTA) });
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
    let quiet = JSON.stringify(fileHashes());
    for (let tries = 0; tries < 15; tries++) {
      await new Promise((done) => setTimeout(done, 2000));
      const now = JSON.stringify(fileHashes());
      if (now === quiet) break;
      quiet = now;
    }
    during();
  } finally {
    server.kill("SIGTERM");
    await new Promise((done) => server.once("exit", done));
  }
};

beforeAll(async () => {
  if (!cli) cli = compile("../src/main.ts", "todo");
  if (!serverBinary)
    serverBinary = compile("../../server/src/main.ts", "todo-server");
  expect(run("UTC", ["init", "--password-stdin"]).status).toBe(0);
  expect(run("UTC", ["login", "--password-stdin"]).status).toBe(0);
  expect(
    run("UTC", ["--profile", "work", "login", "--password-stdin"]).status,
  ).toBe(0);
  // Typed bare on a UTC machine: stored as that clock time with the zone UTC.
  add("UTC", "Evening", ["--due", "2026-11-16 21:00"]);
  add("UTC", "Night", ["--due", "2026-11-17 03:00"]);
  add("UTC", "Both", [
    "--due",
    "2026-11-18 02:00",
    "--scheduled",
    "2026-11-17 01:30",
  ]);
  add("UTC", "Meanwhile", ["--due", "2026-11-19 03:00"]);
  add("UTC", "Past", ["--due", "2026-11-16 05:00"]); // its reminder fires when a server starts
  add("UTC", "Dated", ["--due", "2026-11-16"]);
  add(BOGOTA, "Already", ["--due", "2026-11-16 21:00"]);
  add("UTC", "Elsewhere", ["--due", "2026-11-16 21:00"], "work");
  await withServer(() => {});
  expect(reminders("Past")).toEqual(["2026-11-16T05:00:00.000Z"]);
}, 240000);
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

it("a dry run needs a reading, shows both, and writes nothing", () => {
  const none = repair(["--dry-run"]);
  expect([none.status, none.body.code]).toEqual([2, "invalid_args"]);
  const before = unchanged();
  const moment = repair(["--dry-run", "--keep", "moment"]);
  const clock = repair(["--dry-run", "--keep", "clock"]);
  expect([moment.status, clock.status]).toEqual([0, 0]);
  expect(unchanged()).toEqual(before);
  expect(moment.body.profiles).toEqual(["default"]);
  expect(moment.body.items.map(line)).toEqual([
    "Past due_at: shown 2026-11-16 05:00 | moment 2026-11-16 00:00 | clock 2026-11-16 05:00 | moment -> 2026-11-16T05:00:00.000Z, day 2026-11-16->2026-11-16 v1",
    "Evening due_at: shown 2026-11-16 21:00 | moment 2026-11-16 16:00 | clock 2026-11-16 21:00 | moment -> 2026-11-16T21:00:00.000Z, day 2026-11-16->2026-11-16 v1",
    "Both scheduled_at: shown 2026-11-17 01:30 | moment 2026-11-16 20:30 | clock 2026-11-17 01:30 | moment -> 2026-11-17T01:30:00.000Z, day 2026-11-17->2026-11-16 v1",
    "Night due_at: shown 2026-11-17 03:00 | moment 2026-11-16 22:00 | clock 2026-11-17 03:00 | moment -> 2026-11-17T03:00:00.000Z, day 2026-11-17->2026-11-16 v1",
    "Both due_at: shown 2026-11-18 02:00 | moment 2026-11-17 21:00 | clock 2026-11-18 02:00 | moment -> 2026-11-18T02:00:00.000Z, day 2026-11-18->2026-11-17 v1",
    "Meanwhile due_at: shown 2026-11-19 03:00 | moment 2026-11-18 22:00 | clock 2026-11-19 03:00 | moment -> 2026-11-19T03:00:00.000Z, day 2026-11-19->2026-11-18 v1",
  ]);
  expect(
    clock.body.items.map(
      (item: Item) => `${item.title} ${item.field} -> ${item.new_utc}`,
    ),
  ).toEqual([
    "Past due_at -> 2026-11-16T10:00:00.000Z",
    "Evening due_at -> 2026-11-17T02:00:00.000Z",
    "Both scheduled_at -> 2026-11-17T06:30:00.000Z",
    "Night due_at -> 2026-11-17T08:00:00.000Z",
    "Both due_at -> 2026-11-18T07:00:00.000Z",
    "Meanwhile due_at -> 2026-11-19T08:00:00.000Z",
  ]);
});

it("with the server running, the dry run also leaves the database file byte-identical", async () => {
  await withServer(() => {
    const before = fileHashes();
    expect(repair(["--dry-run", "--keep", "clock"]).status).toBe(0);
    expect(fileHashes()).toEqual(before);
  });
}, 90000);

it("--all-profiles covers every Profile the owner may read (server seat F2)", () => {
  const all = repair(["--dry-run", "--keep", "clock", "--all-profiles"]);
  expect(all.body.profiles).toEqual(["default", "work"]);
  expect(all.body.items.map((item: Item) => item.title)).toContain("Elsewhere");
});

it("refuses an edited, reordered, truncated or foreign plan before any Snapshot or write (server seat F1)", () => {
  const plan = repair(["--dry-run", "--keep", "clock"]).body;
  const edited = (edit: (p: typeof plan) => void) => {
    const copy = JSON.parse(JSON.stringify(plan));
    edit(copy);
    return copy;
  };
  const evening = plan.items.findIndex(
    (item: Item) => item.title === "Evening",
  );
  const before = unchanged();
  const results = [
    edited((p) => {
      p.items[evening].stored_utc = "2026-11-16T22:00:00.000Z";
      p.items[evening].new_utc = "2026-11-17T03:00:00.000Z";
    }),
    edited((p) => {
      p.items[evening].to_zone = "Asia/Tokyo";
    }),
    edited((p) => {
      p.items.push({
        ...p.items[evening],
        task_id: ids.Already,
        title: "Already",
        stored_utc: "2026-11-17T02:00:00.000Z",
        new_utc: "2030-01-01T00:00:00.000Z",
      });
    }),
    edited((p) => {
      p.items.push({
        ...p.items[evening],
        task_id: ids.Dated,
        title: "Dated",
        field: "scheduled_at",
        new_utc: "2026-11-20T12:00:00.000Z",
      });
    }),
    edited((p) => {
      p.items.reverse();
    }),
    edited((p) => {
      p.items.pop();
    }),
    edited((p) => {
      for (const item of p.items)
        item.task_id = "0123456789abcdef0123456789abcdef";
    }),
  ].map((body, index) => {
    const result = repair(["--plan", planFile(`edited-${index}`, body)]);
    return [result.status, result.body.code];
  });
  expect(results).toEqual(Array(7).fill([2, "plan_mismatch"]));
  expect(unchanged()).toEqual(before);
  const first = repair([
    "--plan",
    planFile(
      "first",
      edited((p) => {
        p.items[evening].to_zone = "Asia/Tokyo";
      }),
    ),
  ]);
  expect(first.body.message).toBe(
    `The plan does not match what is stored, so nothing was written and no Snapshot was taken: item ${evening + 1} (Task ${ids.Evening}, due_at) names the zone Asia/Tokyo or the reading clock, not the plan's America/Bogota and clock. Make a new dry run.`,
  );
});

it("--task runs one reading on some Tasks; a Task changed meanwhile is a Conflict; the same plan twice writes nothing", () => {
  const plan = repair([
    "--dry-run",
    "--keep",
    "clock",
    "--task",
    ids.Evening as string,
    "--task",
    ids.Meanwhile as string,
    "--task",
    ids.Past as string,
  ]).body;
  expect(plan.tasks).toEqual([ids.Evening, ids.Meanwhile, ids.Past]);
  expect(plan.items.map((item: Item) => item.title)).toEqual([
    "Past",
    "Evening",
    "Meanwhile",
  ]);
  const file = planFile("clock", plan);
  expect(
    json(BOGOTA, [
      "edit",
      ids.Meanwhile as string,
      "--priority",
      "P1",
      "--expected-version",
      "1",
    ]).status,
  ).toBe(0);
  const applied = repair(["--plan", file]);
  expect(applied.status).toBe(4);
  expect(
    applied.body.items.map(
      (item: Item & { outcome: string }) => `${item.title} ${item.outcome}`,
    ),
  ).toEqual(["Past changed", "Evening changed", "Meanwhile conflict"]);
  expect(typeof applied.body.snapshot_id).toBe("string");
  expect([
    stored("Evening")?.due,
    stored("Past")?.due,
    stored("Meanwhile")?.due,
  ]).toEqual([
    bogota("2026-11-17T02:00:00.000Z"),
    bogota("2026-11-16T10:00:00.000Z"),
    utc("2026-11-19T03:00:00.000Z"),
  ]);
  // The same plan again: Past and Evening already repaired, Meanwhile still a Conflict, found
  // before any write: no Snapshot, no History entry.
  const before = unchanged();
  const stale = repair(["--plan", file]);
  expect([stale.status, stale.body.snapshot_id, stale.body.totals]).toEqual([
    4,
    null,
    { changed: 0, already_repaired: 2, conflict: 1, not_found: 0, rejected: 0 },
  ]);
  expect(unchanged()).toEqual(before);
  // A new dry run for it, applied; then that plan again: already repaired, no Snapshot.
  const again = planFile(
    "again",
    repair(["--dry-run", "--keep", "clock", "--task", ids.Meanwhile as string])
      .body,
  );
  expect(repair(["--plan", again]).body.totals.changed).toBe(1);
  const settled = unchanged();
  const twice = repair(["--plan", again]);
  expect([
    twice.status,
    twice.body.snapshot_id,
    twice.body.totals.already_repaired,
  ]).toEqual([0, null, 1]);
  expect(unchanged()).toEqual(settled);
});

it("same moment on the rest; under clock a fired reminder fires again at the new instant, under moment it does not", async () => {
  const rest = planFile(
    "moment",
    repair(["--dry-run", "--keep", "moment"]).body,
  );
  const applied = repair(["--plan", rest]);
  expect(
    applied.body.items.map(
      (item: Item & { outcome: string }) =>
        `${item.title} ${item.field} ${item.outcome}`,
    ),
  ).toEqual([
    "Both scheduled_at changed",
    "Both due_at changed",
    "Night due_at changed",
  ]);
  expect(stored("Night")).toEqual({
    due: bogota("2026-11-17T03:00:00.000Z"),
    scheduled: null,
    version: 2,
  });
  await withServer(() => {});
  // Past (clock): its reminder fired for 05:00Z; its new instant 10:00Z is past too, so it fires once more.
  expect(reminders("Past")).toEqual([
    "2026-11-16T05:00:00.000Z",
    "2026-11-16T10:00:00.000Z",
  ]);
}, 90000);

it("Revert undoes one repaired Task while it is its latest change; the Snapshot restores the state before", () => {
  const entries = json(BOGOTA, ["history", ids.Night as string]).body
    .entries as {
    seq: number;
    outcome: string;
    event: { kind: string };
  }[];
  const repaired = entries.filter(
    (entry) =>
      entry.outcome === "committed" && entry.event.kind === "TaskEdited",
  );
  expect(
    json(BOGOTA, [
      "revert",
      String(repaired[0]?.seq),
      "--expected-version",
      "2",
    ]).status,
  ).toBe(0);
  expect(stored("Night")?.due).toEqual(utc("2026-11-17T03:00:00.000Z"));
  const snapshots = json(BOGOTA, ["snapshot", "list"]).body.snapshots as {
    id: string;
    reason: string;
  }[];
  const first = snapshots
    .filter((snapshot) => snapshot.reason === "repair time-zones")
    .at(-1);
  expect(
    json(BOGOTA, ["snapshot", "restore", first?.id as string]).status,
  ).toBe(0);
  expect([stored("Evening")?.due, stored("Past")?.due]).toEqual([
    utc("2026-11-16T21:00:00.000Z"),
    utc("2026-11-16T05:00:00.000Z"),
  ]);
});

it("refuses a plan from another machine zone, a run with options of its own, and a call with neither --dry-run nor --plan", () => {
  const plan = planFile("zone", repair(["--dry-run", "--keep", "moment"]).body);
  const tokyo = repair(["--plan", plan], "Asia/Tokyo");
  expect([tokyo.status, tokyo.body.message]).toEqual([
    2,
    "The plan was made for the time zone America/Bogota; this machine's is Asia/Tokyo. Make a new dry run here.",
  ]);
  expect(repair(["--plan", plan, "--keep", "clock"]).status).toBe(2);
  expect(repair([]).status).toBe(2);
});

import { Database } from "bun:sqlite";
import { existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { Profile, Task } from "@todo/domain";
import { openStore } from "@todo/domain/store";
import { Effect, Schema } from "effect";

const argument = process.argv[2];
const directory = argument ? resolve(argument) : "";
if (
  !directory ||
  dirname(directory) !== resolve(tmpdir()) ||
  !basename(directory).startsWith("todo-s01-verify-")
)
  throw new Error("Expected a new todo-s01-verify-* scratch directory");
if (
  !["replay", "purge"].includes(process.argv[3] ?? "") &&
  existsSync(join(directory, "scratch.db"))
)
  throw new Error("Scratch database must be new");
if (process.argv[3] === "client-writes-legacy") {
  const database = new Database(join(directory, "scratch.db"));
  try {
    database.exec(
      readFileSync("packages/domain/test/fixtures/v2-recurrence.sql", "utf8"),
    );
  } finally {
    database.close();
  }
}
await Effect.runPromise(
  Effect.acquireUseRelease(
    openStore({ path: join(directory, "scratch.db") }),
    (store) =>
      Effect.gen(function* () {
        if (process.argv[3] === "purge") {
          const task = (yield* store.tasks()).find(
            (task) => task.id === process.argv[4],
          );
          if (!task) throw new Error("Purge fixture Task missing");
          const { credential } = yield* store.auth.signIn(
            "scratch verification passphrase",
          );
          yield* store.takeSnapshot();
          const entry = yield* store.auth.append({
            credential,
            profile: task.profile_id,
            event: {
              kind: "TaskPurged",
              entity_version: 1,
              occurred_at: "2026-10-27T16:00:00Z",
              task_id: task.id,
              before: task,
            },
          });
          if (entry.outcome !== "committed")
            throw new Error("Purge fixture rejected");
          process.stdout.write(`${JSON.stringify(entry)}\n`);
          return;
        }
        if (process.argv[3] === "replay") {
          const before = JSON.stringify({
            tasks: yield* store.tasks(),
            series: yield* store.series(),
          });
          yield* store.rebuild({ useSnapshot: true });
          const earlierSnapshot = JSON.stringify({
            tasks: yield* store.tasks(),
            series: yield* store.series(),
          });
          if (before !== earlierSnapshot)
            throw new Error("Earlier snapshot replay differs");
          yield* store.rebuild({ useSnapshot: false });
          const full = JSON.stringify({
            tasks: yield* store.tasks(),
            series: yield* store.series(),
          });
          if (before !== full) throw new Error("Full replay differs");
          yield* store.takeSnapshot();
          yield* store.rebuild();
          const snapshot = JSON.stringify({
            tasks: yield* store.tasks(),
            series: yield* store.series(),
          });
          if (before !== snapshot) throw new Error("Snapshot replay differs");
          process.stdout.write(
            `${JSON.stringify({
              result: "PASS",
              full: JSON.parse(full),
              snapshot: JSON.parse(snapshot),
            })}\n`,
          );
          return;
        }
        yield* store.auth.setupOwner("scratch verification passphrase");
        for (const id of ["work", "personal"])
          yield* store.putProfile(
            Schema.decodeUnknownSync(Profile)({
              id,
              name:
                process.argv[3] === "diagnostics"
                  ? id === "work"
                    ? "Work"
                    : "Personal"
                  : id,
              created_at: "2026-10-27T00:00:00Z",
              updated_at: "2026-10-27T00:00:00Z",
            }),
          );
        if (
          ["client-reads", "client-writes-legacy"].includes(
            process.argv[3] ?? "",
          )
        ) {
          const { credential } = yield* store.auth.signIn(
            "scratch verification passphrase",
          );
          const now = "2026-10-27T14:00:00Z";
          const cases = [
            { id: "inbox", title: "Inbox without Project" },
            {
              id: "inbox-project",
              title: "Inbox with Project",
              project_id: "work-project",
              tags: ["work-tag"],
            },
            {
              id: "due",
              title: "Due today",
              due_at: { kind: "date", date: "2026-10-27" },
            },
            {
              id: "scheduled",
              title: "Scheduled today",
              scheduled_at: {
                kind: "instant",
                utc: "2026-10-27T23:00:00Z",
                time_zone: "America/Bogota",
              },
              project_id: "work-project",
              tags: ["work-tag"],
            },
            {
              id: "overdue",
              title: "Overdue",
              due_at: { kind: "date", date: "2026-10-26" },
              scheduled_at: { kind: "date", date: "2026-10-28" },
            },
            {
              id: "future",
              title: "Future scheduled",
              scheduled_at: { kind: "date", date: "2026-10-28" },
              project_id: "work-project",
            },
            {
              id: "done",
              title: "Done",
              status: "done",
              project_id: "work-project",
              tags: ["work-tag"],
            },
            { id: "cancelled", title: "Cancelled", status: "cancelled" },
            { id: "snoozed", title: "Snoozed", status: "snoozed" },
            {
              id: "deleted",
              title: "Deleted",
              deleted_at: now,
              project_id: "work-project",
              tags: ["work-tag"],
            },
            {
              id: "personal",
              title: "Private",
              profile_id: "personal",
              project_id: "personal-project",
              tags: ["personal-tag"],
            },
          ];
          for (const value of cases.filter(
            (value) =>
              process.argv[3] === "client-reads" ||
              ["cancelled", "snoozed"].includes(value.id),
          )) {
            const task = Schema.decodeUnknownSync(Task)({
              profile_id: "work",
              entity_version: 1,
              row_version: 1,
              description: null,
              status: "open",
              project_id: null,
              priority: "P3",
              scheduled_at: null,
              due_at: null,
              energy: null,
              estimate_min: null,
              source: "manual",
              tags: [],
              occurrence: null,
              created_at: now,
              updated_at: now,
              completed_at: null,
              deleted_at: null,
              ...value,
            });
            const result = yield* store.auth.append({
              credential,
              profile: task.profile_id,
              event: {
                kind: "TaskCreated",
                entity_version: 1,
                occurred_at: now,
                task,
                series: null,
                project: task.project_id
                  ? {
                      id: task.project_id,
                      profile_id: task.profile_id,
                      name:
                        task.profile_id === "work"
                          ? "Work Project"
                          : "Sensitive personal Project",
                      created_at: now,
                      updated_at: now,
                    }
                  : null,
                tags: task.tags.map((id) => ({
                  id,
                  profile_id: task.profile_id,
                  name:
                    task.profile_id === "work"
                      ? "work-tag"
                      : "Sensitive personal Tag",
                })),
              },
            });
            if (result.outcome !== "committed")
              throw new Error("Read fixture rejected");
          }
        }
        yield* store.takeSnapshot();
      }),
    (store) => Effect.orDie(store.close()),
  ),
);

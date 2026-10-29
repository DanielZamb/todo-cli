import { existsSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { ChangeEvent } from "@todo/api";
import { ActorId, Profile, ProfileId, Task } from "@todo/domain";
import { openStore } from "@todo/domain/store";
import { Effect, Schema } from "effect";

const directory = resolve(process.argv[2] ?? "");
const command = process.argv[3];
if (
  realpathSync(dirname(directory)) !== realpathSync(tmpdir()) ||
  !basename(directory).startsWith("todo-s03-verify-")
)
  throw new Error("Expected own todo-s03-verify-* temporary directory");
const path = join(directory, "scratch.db");
if (command === "seed" && existsSync(path))
  throw new Error("Scratch database must be new");
const actor = Schema.decodeUnknownSync(ActorId)("verification");
const profile = Schema.decodeUnknownSync(ProfileId)("work");
if (command === "decode-sse") {
  const input = process.argv[4];
  if (!input) throw new Error("Expected retained SSE evidence path");
  const decoded = readFileSync(input, "utf8")
    .split("\n\n")
    .slice(0, -1)
    .map((block) => {
      const fields = Object.fromEntries(
        block
          .split("\n")
          .filter((line) => line.includes(": "))
          .map((line) => {
            const separator = line.indexOf(": ");
            return [line.slice(0, separator), line.slice(separator + 2)];
          }),
      );
      return Schema.decodeUnknownSync(ChangeEvent)(fields);
    });
  const reminders = decoded.flatMap((frame) =>
    frame.event === "operation" && frame.data.event.kind === "ReminderFired"
      ? [frame.data]
      : [],
  );
  if (
    reminders.length !== 3 ||
    new Set(reminders.map((entry) => entry.seq)).size !== 3
  )
    throw new Error("Expected three unique decoded ReminderFired operations");
  process.stdout.write(
    JSON.stringify({ sharedContractDecoded: true, reminders }, null, 2),
  );
} else
  await Effect.runPromise(
    Effect.acquireUseRelease(
      openStore({ path }),
      (store) =>
        Effect.gen(function* () {
          if (command === "seed") {
            const now = Date.now();
            const at = new Date(now).toISOString();
            const due = new Date(now + 6000).toISOString();
            const instant = { kind: "instant", utc: due, time_zone: "UTC" };
            yield* store.putProfile(
              Schema.decodeUnknownSync(Profile)({
                id: profile,
                name: "Work",
                created_at: at,
                updated_at: at,
              }),
            );
            yield* store.auth.setupOwner("scratch scheduler passphrase");
            const tasks = [
              {
                id: "wake",
                title: "Wake after restart",
                status: "snoozed",
                scheduled_at: instant,
                due_at: instant,
              },
              {
                id: "remind",
                title: "Remind after restart",
                status: "open",
                due_at: instant,
              },
              {
                id: "date",
                title: "Keep planning date",
                status: "open",
                due_at: { kind: "date", date: "2020-01-01" },
              },
              {
                id: "date-snooze",
                title: "Keep snoozed planning date",
                status: "snoozed",
                scheduled_at: { kind: "date", date: "2020-01-01" },
              },
              {
                id: "done",
                title: "Ignore completed Task",
                status: "done",
                due_at: instant,
              },
              {
                id: "deleted",
                title: "Ignore deleted Task",
                status: "open",
                due_at: instant,
                deleted_at: at,
              },
            ];
            for (const input of tasks) {
              const task = Schema.decodeUnknownSync(Task)({
                description: null,
                project_id: null,
                priority: "P3",
                scheduled_at: null,
                due_at: null,
                energy: null,
                estimate_min: null,
                source: "verification",
                tags: [],
                occurrence: null,
                completed_at: null,
                deleted_at: null,
                ...input,
                profile_id: profile,
                entity_version: 1,
                row_version: 1,
                created_at: at,
                updated_at: at,
              });
              const entry = yield* store.append({
                actor,
                profile,
                event: {
                  kind: "TaskCreated",
                  entity_version: 1,
                  occurred_at: at,
                  task,
                  series: null,
                  project: null,
                  tags: [],
                },
              });
              if (entry.outcome !== "committed")
                throw new Error("Fixture creation rejected");
            }
            writeFileSync(
              join(directory, "fixture.json"),
              JSON.stringify(
                { due, taskIds: tasks.map((task) => task.id) },
                null,
                2,
              ),
            );
            return;
          }
          if (command === "replay") {
            const before = JSON.stringify(yield* store.tasks());
            const history = JSON.stringify(yield* store.history());
            yield* store.takeSnapshot();
            if (JSON.stringify(yield* store.rebuild()) !== before)
              throw new Error("Full replay changed Tasks");
            if (
              JSON.stringify(yield* store.rebuild({ useSnapshot: true })) !==
              before
            )
              throw new Error("Snapshot replay changed Tasks");
            const repeated = yield* store.scheduled.runDue();
            if (
              repeated.woken !== 0 ||
              repeated.reminders !== 0 ||
              JSON.stringify(yield* store.history()) !== history
            )
              throw new Error("Replay lost reminder receipt");
            process.stdout.write(
              JSON.stringify(
                {
                  passed: true,
                  fullReplay: true,
                  snapshotReplay: true,
                  repeated,
                  tasks: yield* store.tasks(),
                  history: yield* store.history(),
                },
                null,
                2,
              ),
            );
            return;
          }
          throw new Error("Expected seed or replay");
        }),
      (store) => Effect.orDie(store.close()),
    ),
  );

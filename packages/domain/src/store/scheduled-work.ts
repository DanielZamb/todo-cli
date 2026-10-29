import type { Database } from "bun:sqlite";
import { Clock, Effect, Schema } from "effect";
import type { Task } from "../entities.ts";
import type { OpLogEntry, ReminderFired } from "../events.ts";
import { ActorId, type ProfileId } from "../ids.ts";
import { Instant } from "../time.ts";
import { StoreError } from "./error.ts";

type Ports = {
  readonly tasks: () => readonly Task[];
  readonly append: (input: {
    readonly actor: ActorId;
    readonly profile: ProfileId;
    readonly event: unknown;
  }) => OpLogEntry;
  readonly remind: (task: Task, event: ReminderFired) => void;
};
const instant = (time: number) =>
  Schema.decodeUnknownSync(Instant)(new Date(time).toISOString());
const receiptKey = (value: Instant) =>
  Schema.decodeUnknownSync(Instant)(
    value.replace(
      /(?:\.([0-9]+))?Z$/,
      (_match, fraction: string | undefined) =>
        `.${(fraction ?? "").replace(/0+$/, "").padEnd(3, "0")}Z`,
    ),
  );
const deadline = (value: Instant) =>
  Date.parse(value) + (/\.\d{3}\d*[1-9]\d*Z$/.test(value) ? 1 : 0);
const actor = Schema.decodeUnknownSync(ActorId)("scheduler");

export class ScheduledWork {
  constructor(
    private readonly db: Database,
    private readonly transaction: <A>(run: () => A) => A,
    private readonly ports: Ports,
  ) {}

  private received(task: Task, due: Instant) {
    return (
      this.db
        .query(
          "SELECT 1 FROM op_log WHERE outcome='committed' AND json_extract(event,'$.kind')='ReminderFired' AND json_extract(event,'$.task_id')=? AND json_extract(event,'$.due_at')=? LIMIT 1",
        )
        .get(task.id, receiptKey(due)) !== null
    );
  }

  readonly pendingReminders = () =>
    Effect.try({
      try: () =>
        this.transaction(
          () =>
            this.ports
              .tasks()
              .filter(
                (task) =>
                  task.deleted_at === null &&
                  task.status === "open" &&
                  task.due_at?.kind === "instant" &&
                  !this.received(task, task.due_at.utc),
              ).length,
        ),
      catch: (cause) => new StoreError(cause),
    });

  readonly nextAt = () =>
    Effect.try({
      try: () =>
        this.transaction(() => {
          const times: number[] = [];
          for (const task of this.ports.tasks()) {
            if (task.deleted_at !== null) continue;
            if (
              task.status === "snoozed" &&
              task.scheduled_at?.kind === "instant"
            )
              times.push(deadline(task.scheduled_at.utc));
            if (task.status === "open" && task.due_at?.kind === "instant") {
              const due = task.due_at.utc;
              if (!this.received(task, due)) times.push(deadline(due));
            }
          }
          return times.length === 0
            ? null
            : times.reduce((next, time) => Math.min(next, time), Infinity);
        }),
      catch: (cause) => new StoreError(cause),
    });

  readonly runDue = () =>
    Effect.gen({ self: this }, function* () {
      const time = yield* Clock.currentTimeMillis;
      return yield* Effect.try({
        try: () =>
          this.transaction(() => {
            const occurred_at = instant(time);
            let woken = 0;
            let reminders = 0;
            for (const before of this.ports.tasks()) {
              if (
                before.deleted_at !== null ||
                before.status !== "snoozed" ||
                before.scheduled_at?.kind !== "instant" ||
                deadline(before.scheduled_at.utc) > time
              )
                continue;
              const after = {
                ...before,
                status: "open",
                row_version: before.row_version + 1,
                updated_at: occurred_at,
              };
              const entry = this.ports.append({
                actor,
                profile: before.profile_id,
                event: {
                  kind: "TaskReopened",
                  entity_version: 1,
                  occurred_at,
                  before,
                  after,
                },
              });
              if (entry.outcome !== "committed")
                throw new Error("Snooze wake-up was rejected");
              woken++;
            }
            for (const task of this.ports.tasks()) {
              if (
                task.deleted_at !== null ||
                task.status !== "open" ||
                task.due_at?.kind !== "instant"
              )
                continue;
              const due = task.due_at.utc;
              if (deadline(due) > time || this.received(task, due)) continue;
              this.ports.remind(task, {
                kind: "ReminderFired",
                entity_version: 1,
                occurred_at,
                task_id: task.id,
                due_at: receiptKey(due),
                task_version: task.row_version,
                title: task.title,
              });
              reminders++;
            }
            return { woken, reminders };
          }),
        catch: (cause) => new StoreError(cause),
      });
    });
}

import { Database } from "bun:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "@effect/vitest";
import { openStore } from "@todo/domain/store";
import { Effect, Schema } from "effect";
import { nextOccurrenceTime, Series, TaskTime } from "../src/index.ts";
import {
  finish,
  monthly,
  recurrence,
  start,
  weekly,
} from "./recurrence-fixtures.ts";
import { actor, profile, task, time, work } from "./store-fixtures.ts";

const taskTime = Schema.decodeUnknownSync(TaskTime);
const scratch = <A, E>(run: (path: string) => Effect.Effect<A, E>) =>
  Effect.acquireUseRelease(
    Effect.sync(() => mkdtempSync(join(tmpdir(), "todo-c03-test-"))),
    (dir) => run(join(dir, "scratch.db")),
    (dir) => Effect.sync(() => rmSync(dir, { recursive: true, force: true })),
  );
const usingStore = <A, E>(
  path: string,
  run: (
    store: Effect.Success<ReturnType<typeof openStore>>,
  ) => Effect.Effect<A, E>,
) =>
  Effect.acquireUseRelease(openStore({ path }), run, (store) =>
    Effect.orDie(store.close()),
  );

describe("RFC 5545 recurrence", () => {
  it.effect(
    "keeps 09:00 local across DST, counts excluded dates, and exhausts COUNT",
    () =>
      Effect.gen(function* () {
        const first = yield* nextOccurrenceTime(weekly.recurrence);
        const second = yield* nextOccurrenceTime(weekly.recurrence, first);
        const third = yield* nextOccurrenceTime(weekly.recurrence, second);
        expect([first, second, third]).toEqual([
          {
            kind: "instant",
            utc: "2026-03-06T14:00:00Z",
            time_zone: "America/New_York",
          },
          {
            kind: "instant",
            utc: "2026-03-09T13:00:00Z",
            time_zone: "America/New_York",
          },
          {
            kind: "instant",
            utc: "2026-03-11T13:00:00Z",
            time_zone: "America/New_York",
          },
        ]);
        expect(yield* nextOccurrenceTime(weekly.recurrence, third)).toBe(null);
      }),
  );

  it.effect("selects each month's last weekday as dates", () =>
    Effect.gen(function* () {
      const first = yield* nextOccurrenceTime(monthly.recurrence);
      const second = yield* nextOccurrenceTime(monthly.recurrence, first);
      const third = yield* nextOccurrenceTime(monthly.recurrence, second);
      expect([first, second, third]).toEqual([
        { kind: "date", date: "2026-01-30" },
        { kind: "date", date: "2026-02-27" },
        { kind: "date", date: "2026-03-31" },
      ]);
    }),
  );

  it.effect("includes the UNTIL instant and then stops", () =>
    Effect.gen(function* () {
      const rule = recurrence({
        ...weekly.recurrence,
        rrule: "FREQ=DAILY;UNTIL=20260309T130000Z",
        exdate: [],
      });
      expect(
        yield* nextOccurrenceTime(
          rule,
          taskTime({
            kind: "instant",
            utc: "2026-03-08T13:00:00Z",
            time_zone: "America/New_York",
          }),
        ),
      ).toEqual({
        kind: "instant",
        utc: "2026-03-09T13:00:00Z",
        time_zone: "America/New_York",
      });
      expect(
        yield* nextOccurrenceTime(
          rule,
          taskTime({
            kind: "instant",
            utc: "2026-03-09T13:00:00Z",
            time_zone: "America/New_York",
          }),
        ),
      ).toBe(null);
    }),
  );

  it.effect(
    "keeps local time across fall DST and skips nonexistent spring times",
    () =>
      Effect.gen(function* () {
        const fall = recurrence({
          dtstart: {
            kind: "instant",
            utc: "2026-10-30T13:00:00Z",
            time_zone: "America/New_York",
          },
          rrule: "FREQ=WEEKLY;BYDAY=MO,FR;COUNT=2",
          exdate: [],
        });
        expect(yield* nextOccurrenceTime(fall, fall.dtstart)).toEqual({
          kind: "instant",
          utc: "2026-11-02T14:00:00Z",
          time_zone: "America/New_York",
        });
        const gap = recurrence({
          dtstart: {
            kind: "instant",
            utc: "2026-03-07T07:30:00Z",
            time_zone: "America/New_York",
          },
          rrule: "FREQ=DAILY;COUNT=2",
          exdate: [],
        });
        expect(yield* nextOccurrenceTime(gap, gap.dtstart)).toEqual({
          kind: "instant",
          utc: "2026-03-09T06:30:00Z",
          time_zone: "America/New_York",
        });
      }),
  );

  it.effect("retains exact EXDATE instants across a fall overlap", () =>
    Effect.gen(function* () {
      const rule = recurrence({
        dtstart: {
          kind: "instant",
          utc: "2026-10-31T05:30:00Z",
          time_zone: "America/New_York",
        },
        rrule: "FREQ=DAILY;COUNT=3",
        exdate: [
          {
            kind: "instant",
            utc: "2026-11-01T06:30:00Z",
            time_zone: "America/New_York",
          },
        ],
      });
      expect(yield* nextOccurrenceTime(rule, rule.dtstart)).toEqual({
        kind: "instant",
        utc: "2026-11-01T05:30:00Z",
        time_zone: "America/New_York",
      });
      const excluded = recurrence({
        ...rule,
        exdate: [
          { kind: "instant", utc: "2026-11-01T05:30:00Z", time_zone: "UTC" },
        ],
      });
      expect(yield* nextOccurrenceTime(excluded, excluded.dtstart)).toEqual({
        kind: "instant",
        utc: "2026-11-02T06:30:00Z",
        time_zone: "America/New_York",
      });
    }),
  );

  it.effect(
    "rejects invalid RRULE and incompatible EXDATE without guessing",
    () =>
      Effect.gen(function* () {
        for (const rule of [
          recurrence({
            ...weekly.recurrence,
            rrule: "FREQ=WEEKLY;COUNT=2;UNTIL=20260401T000000Z",
          }),
          recurrence({
            ...weekly.recurrence,
            rrule: "FREQ=DAILY\nRRULE:FREQ=WEEKLY",
          }),
          recurrence({
            ...weekly.recurrence,
            exdate: [{ kind: "date", date: "2026-03-09" }],
          }),
          recurrence({ ...monthly.recurrence, rrule: "FREQ=HOURLY;COUNT=2" }),
          recurrence({
            ...monthly.recurrence,
            rrule: "FREQ=DAILY;BYHOUR=9;COUNT=2",
          }),
        ])
          expect((yield* Effect.exit(nextOccurrenceTime(rule)))._tag).toBe(
            "Failure",
          );
      }),
  );
});

describe("atomic Series and Occurrences", () => {
  it.effect(
    "completes and cancels in one event each, preserving resolved dates through replay",
    () =>
      scratch((path) =>
        usingStore(path, (store) =>
          Effect.gen(function* () {
            yield* store.putProfile(work);
            expect(
              (yield* store.startSeries(start(weekly, "w1"))).outcome,
            ).toBe("committed");
            const completed = yield* store.finishTask(finish("w1", "w2"));
            const cancelled = yield* store.finishTask(
              finish("w2", "w3", "cancel"),
            );
            expect([completed.event.kind, cancelled.event.kind]).toEqual([
              "TaskCompleted",
              "TaskCancelled",
            ]);
            expect(
              (yield* store.tasks()).map((t) => [
                t.id,
                t.status,
                t.row_version,
                t.occurrence?.date,
                t.completed_at,
              ]),
            ).toEqual([
              ["w1", "done", 2, "2026-03-06", time],
              ["w2", "cancelled", 2, "2026-03-09", null],
              ["w3", "open", 1, "2026-03-11", null],
            ]);
            const before = yield* store.tasks();
            expect(yield* store.rebuild()).toEqual(before);
            yield* store.takeSnapshot();
            expect(yield* store.rebuild({ useSnapshot: true })).toEqual(before);
          }),
        ),
      ),
  );

  it.effect("rolls back completion when the successor cannot be stored", () =>
    scratch((path) =>
      usingStore(path, (store) =>
        Effect.gen(function* () {
          yield* store.putProfile(work);
          yield* store.startSeries(start(weekly, "w1"));
          const db = new Database(path);
          try {
            db.exec(
              "CREATE TRIGGER fail_next BEFORE INSERT ON tasks WHEN NEW.id='w2' BEGIN SELECT RAISE(ABORT, 'failed successor'); END",
            );
            expect(
              (yield* Effect.exit(store.finishTask(finish("w1", "w2"))))._tag,
            ).toBe("Failure");
            expect((yield* store.history()).length).toBe(1);
            expect(
              (yield* store.tasks()).map((t) => [
                t.id,
                t.status,
                t.row_version,
              ]),
            ).toEqual([["w1", "open", 1]]);
          } finally {
            db.close();
          }
        }),
      ),
    ),
  );

  it.effect(
    "rejects stale and repeated completion, plus conflicting successor IDs",
    () =>
      scratch((path) =>
        usingStore(path, (store) =>
          Effect.gen(function* () {
            yield* store.putProfile(work);
            yield* store.startSeries(start(weekly, "w1"));
            expect((yield* store.finishTask(finish("w1", "w1"))).outcome).toBe(
              "rejected",
            );
            expect((yield* store.tasks()).map((t) => [t.id, t.status])).toEqual(
              [["w1", "open"]],
            );
            yield* store.finishTask(finish("w1", "w2"));
            expect((yield* store.finishTask(finish("w1", "w3"))).reason).toBe(
              "conflict",
            );
            expect(
              (yield* store.finishTask(finish("w1", "w3", "complete", 2)))
                .reason,
            ).toBe("validation");
            expect((yield* store.tasks()).length).toBe(2);
          }),
        ),
      ),
  );

  it.effect("finishes a standalone task without creating an Occurrence", () =>
    scratch((path) =>
      usingStore(path, (store) =>
        Effect.gen(function* () {
          yield* store.putProfile(work);
          yield* store.append({
            actor,
            profile,
            event: {
              kind: "TaskCreated",
              entity_version: 1,
              occurred_at: time,
              task,
              series: null,
              project: null,
              tags: [],
            },
          });
          expect(
            (yield* store.finishTask(finish("task-1", "unused"))).outcome,
          ).toBe("committed");
          expect(
            (yield* store.tasks()).map((t) => [t.id, t.status, t.occurrence]),
          ).toEqual([["task-1", "done", null]]);
        }),
      ),
    ),
  );

  it.effect(
    "keeps the recurrence cursor after scheduling edits and suppresses an existing successor after reopening",
    () =>
      scratch((path) =>
        usingStore(path, (store) =>
          Effect.gen(function* () {
            yield* store.putProfile(work);
            yield* store.startSeries(start(weekly, "w1"));
            const first = (yield* store.tasks())[0];
            if (!first) throw new Error("Missing first Occurrence");
            yield* store.append({
              actor,
              profile,
              event: {
                kind: "TaskEdited",
                entity_version: 1,
                occurred_at: time,
                before: first,
                after: {
                  ...first,
                  row_version: 2,
                  scheduled_at: { kind: "date", date: "2026-12-01" },
                },
                series_before: null,
                series_after: null,
                project_before: null,
                project_after: null,
                tags_before: [],
                tags_after: [],
              },
            });
            yield* store.finishTask(finish("w1", "w2", "complete", 2));
            expect(
              (yield* store.tasks()).find((t) => t.id === "w2")?.occurrence
                ?.date,
            ).toBe("2026-03-09");
            const done = (yield* store.tasks()).find((t) => t.id === "w1");
            if (!done) throw new Error("Missing completed Occurrence");
            yield* store.append({
              actor,
              profile,
              event: {
                kind: "TaskReopened",
                entity_version: 1,
                occurred_at: time,
                before: done,
                after: {
                  ...done,
                  row_version: 4,
                  status: "open",
                  completed_at: null,
                },
              },
            });
            expect(
              (yield* store.finishTask(
                finish("w1", "duplicate", "complete", 4),
              )).outcome,
            ).toBe("committed");
            expect((yield* store.tasks()).map((t) => t.id)).toEqual([
              "w1",
              "w2",
            ]);
          }),
        ),
      ),
  );

  it.effect(
    "records invalid rule rejection without creating a Series or task",
    () =>
      scratch((path) =>
        usingStore(path, (store) =>
          Effect.gen(function* () {
            yield* store.putProfile(work);
            const invalid = Schema.decodeUnknownSync(Series)({
              ...weekly,
              recurrence: { ...weekly.recurrence, rrule: "FREQ=NOPE" },
            });
            expect(
              (yield* store.startSeries(start(invalid, "w1"))).reason,
            ).toBe("validation");
            const rejection = (yield* store.history())[0];
            if (
              rejection?.outcome !== "rejected" ||
              rejection.event.kind !== "TaskAttemptRejected"
            )
              throw new Error("Missing rejection");
            expect(rejection.event.violations[0]?.received).toMatchObject({
              series: { recurrence: { rrule: "FREQ=NOPE" } },
            });
            expect(yield* store.tasks()).toEqual([]);
            expect(yield* store.series()).toEqual([]);
            expect(
              (yield* store.history()).map((entry) => [
                entry.event.kind,
                entry.outcome,
              ]),
            ).toEqual([["TaskAttemptRejected", "rejected"]]);
          }),
        ),
      ),
  );

  it.effect("shifts scheduling and due metadata by local calendar time", () =>
    scratch((path) =>
      usingStore(path, (store) =>
        Effect.gen(function* () {
          yield* store.putProfile(work);
          const series = Schema.decodeUnknownSync(Series)({
            ...weekly,
            task: {
              ...weekly.task,
              scheduled_at: weekly.recurrence.dtstart,
              due_at: {
                kind: "instant",
                utc: "2026-03-06T22:00:00Z",
                time_zone: "America/New_York",
              },
            },
          });
          yield* store.startSeries(start(series, "w1"));
          yield* store.finishTask(finish("w1", "w2"));
          expect(
            (yield* store.tasks()).find((t) => t.id === "w2")?.due_at,
          ).toEqual({
            kind: "instant",
            utc: "2026-03-09T21:00:00Z",
            time_zone: "America/New_York",
          });
        }),
      ),
    ),
  );
});

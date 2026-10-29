import { expect, it } from "@effect/vitest";
import { Effect, Schema } from "effect";
import {
  isInboxTask,
  parseQuickAdd,
  QuickAddInput,
  TaskStatus,
  TaskTime,
} from "../src/index.ts";

const input = (text: string, overrides = {}) =>
  Schema.decodeUnknownSync(QuickAddInput)({
    text,
    now: "2026-10-27T02:00:00Z",
    time_zone: "America/Bogota",
    ...overrides,
  });

it.effect(
  "resolves relative dates in the explicit zone and keeps metadata deterministic",
  () =>
    Effect.gen(function* () {
      expect(
        yield* parseQuickAdd(
          input("Ship tomorrow scheduled:fri 10am p1 #Launch #launch @Client"),
        ),
      ).toEqual({
        title: "Ship",
        due_at: { kind: "date", date: "2026-10-27" },
        scheduled_at: {
          kind: "instant",
          utc: "2026-10-30T15:00:00Z",
          time_zone: "America/Bogota",
        },
        priority: "P1",
        tags: ["launch"],
        project: "Client",
      });
      expect(
        yield* parseQuickAdd(
          input("Read tomorrow", { time_zone: "Asia/Tokyo" }),
        ),
      ).toEqual({
        title: "Read",
        due_at: { kind: "date", date: "2026-10-28" },
        scheduled_at: null,
        priority: "P3",
        tags: [],
        project: null,
      });
      expect(
        yield* parseQuickAdd(input('Say "tomorrow" p2 "#literal"')),
      ).toEqual({
        title: "Say tomorrow #literal",
        due_at: null,
        scheduled_at: null,
        priority: "P2",
        tags: [],
        project: null,
      });
      expect(
        yield* parseQuickAdd(
          input("Meet due:2026-12-01 12am scheduled tomorrow 12pm"),
        ),
      ).toEqual({
        title: "Meet",
        due_at: {
          kind: "instant",
          utc: "2026-12-01T05:00:00Z",
          time_zone: "America/Bogota",
        },
        scheduled_at: {
          kind: "instant",
          utc: "2026-10-27T17:00:00Z",
          time_zone: "America/Bogota",
        },
        priority: "P3",
        tags: [],
        project: null,
      });
      expect(
        yield* parseQuickAdd(
          input("Meet mon", { now: "2026-10-26T17:00:00Z" }),
        ),
      ).toEqual({
        title: "Meet",
        due_at: { kind: "date", date: "2026-11-02" },
        scheduled_at: null,
        priority: "P3",
        tags: [],
        project: null,
      });
    }),
);

it.effect(
  "rejects conflicting tokens, empty titles, invalid dates and ambiguous or missing wall times",
  () =>
    Effect.gen(function* () {
      for (const text of [
        "tomorrow p1",
        "Ship p1 p2",
        "Ship @one @two",
        "Ship tomorrow fri",
        "Ship 2026-02-30",
        "Ship tomorrow 13am",
      ])
        expect((yield* parseQuickAdd(input(text)).pipe(Effect.flip))._tag).toBe(
          "QuickAddError",
        );
      for (const text of ["Meet 2026-03-08 2:30am", "Meet 2026-11-01 1:30am"])
        expect(
          (yield* parseQuickAdd(
            input(text, { time_zone: "America/New_York" }),
          ).pipe(Effect.flip))._tag,
        ).toBe("QuickAddError");
    }),
);

it.effect("rejects time-shaped tokens with out-of-range minutes", () =>
  Effect.gen(function* () {
    for (const text of ["Meet tomorrow 10:60am", "Meet scheduled:fri 10:99pm"])
      expect(
        yield* parseQuickAdd(input(text)).pipe(
          Effect.flip,
          Effect.map((error) => ({ tag: error._tag, message: error.message })),
        ),
      ).toEqual({
        tag: "QuickAddError",
        message: "Minute must be between 0 and 59",
      });
  }),
);

it("defines Inbox by open status and absence of both dates, regardless of Project", () => {
  const date = { kind: "date", date: "2026-10-27" };
  const cases = [
    { status: "open", due_at: null, scheduled_at: null, project_id: "project" },
    { status: "open", due_at: date, scheduled_at: null },
    { status: "open", due_at: null, scheduled_at: date },
    { status: "done", due_at: null, scheduled_at: null },
    { status: "cancelled", due_at: null, scheduled_at: null },
    { status: "snoozed", due_at: null, scheduled_at: null },
  ];
  const values = Schema.decodeUnknownSync(
    Schema.Array(
      Schema.Struct({
        status: TaskStatus,
        due_at: Schema.NullOr(TaskTime),
        scheduled_at: Schema.NullOr(TaskTime),
      }),
    ),
  )(cases);
  expect([
    isInboxTask({ status: "open" }),
    isInboxTask({ status: "open", due_at: "2026-10-27" }),
    isInboxTask({ status: "open", scheduled_at: "2026-10-27T14:00:00Z" }),
  ]).toEqual([true, false, false]);
  expect(values.map(isInboxTask)).toEqual([
    true,
    false,
    false,
    false,
    false,
    false,
  ]);
});

it.effect(
  "parses quoted multi-word metadata while preserving quoted literal tokens",
  () =>
    Effect.gen(function* () {
      expect(
        yield* parseQuickAdd(
          input('Prepare #"Deep Focus" @\'Client Project\' "#literal" p1'),
        ),
      ).toEqual({
        title: "Prepare #literal",
        due_at: null,
        scheduled_at: null,
        priority: "P1",
        tags: ["deep focus"],
        project: "Client Project",
      });
    }),
);

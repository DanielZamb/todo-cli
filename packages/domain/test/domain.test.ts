import { describe, expect, expectTypeOf, it } from "@effect/vitest";
import { Effect, Schema } from "effect";
import {
  ActorId,
  CalendarDate,
  type DateValue,
  Event,
  Instant,
  Occurrence,
  OccurrenceId,
  OpLogEntry,
  Profile,
  ProfileId,
  Project,
  ProjectId,
  Series,
  SeriesId,
  Tag,
  TagId,
  Task,
  TaskId,
  TaskPriority,
  TaskStatus,
  TaskTime,
  TimeZoneId,
} from "../src/index.ts";

const task = {
  id: "task-1",
  profile_id: "profile-1",
  entity_version: 1,
  row_version: 1,
  title: "Write the port",
  description: "Keep the golden files",
  status: "open",
  project_id: "project-1",
  priority: "P2",
  scheduled_at: {
    kind: "instant",
    utc: "2026-10-26T14:00:00Z",
    time_zone: "America/Bogota",
  },
  due_at: { kind: "date", date: "2026-10-27" },
  energy: 3,
  estimate_min: 25,
  source: "agent",
  tags: ["tag-1"],
  occurrence: null,
  created_at: "2026-10-26T13:00:00Z",
  updated_at: "2026-10-26T13:00:00Z",
  completed_at: null,
  deleted_at: null,
};

const recurrence = {
  dtstart: { kind: "date", date: "2026-10-27" },
  rrule: "FREQ=WEEKLY;BYDAY=TU,TH",
  exdate: [{ kind: "date", date: "2026-10-29" }],
};

const series = {
  id: "series-1",
  profile_id: "profile-1",
  entity_version: 1,
  row_version: 1,
  recurrence,
  task,
  created_at: "2026-10-26T13:00:00Z",
  updated_at: "2026-10-26T13:00:00Z",
  deleted_at: null,
};

const project = {
  id: "project-1",
  profile_id: "profile-1",
  name: "Port",
  created_at: "2026-10-26T13:00:00Z",
  updated_at: "2026-10-26T13:00:00Z",
};

const tag = { id: "tag-1", profile_id: "profile-1", name: "focus" };

const created = {
  kind: "TaskCreated",
  entity_version: 1,
  occurred_at: "2026-10-26T13:00:00Z",
  task,
  series: null,
  project,
  tags: [tag],
};

const op = {
  seq: 1,
  actor: "actor-1",
  profile: "profile-1",
  event: created,
  from_version: null,
  to_version: 1,
};

describe("shared entities", () => {
  it.effect("decodes a task without changing its scheduling or metadata", () =>
    Effect.gen(function* () {
      const decoded = yield* Schema.decodeUnknownEffect(Task)(task);
      expect(decoded).toEqual({
        id: "task-1",
        profile_id: "profile-1",
        entity_version: 1,
        row_version: 1,
        title: "Write the port",
        description: "Keep the golden files",
        status: "open",
        project_id: "project-1",
        priority: "P2",
        scheduled_at: {
          kind: "instant",
          utc: "2026-10-26T14:00:00Z",
          time_zone: "America/Bogota",
        },
        due_at: { kind: "date", date: "2026-10-27" },
        energy: 3,
        estimate_min: 25,
        source: "agent",
        tags: ["tag-1"],
        occurrence: null,
        created_at: "2026-10-26T13:00:00Z",
        updated_at: "2026-10-26T13:00:00Z",
        completed_at: null,
        deleted_at: null,
      });
    }),
  );

  it.effect(
    "decodes profiles, projects, tags, series and real occurrences",
    () =>
      Effect.gen(function* () {
        const profile = yield* Schema.decodeUnknownEffect(Profile)({
          id: "profile-1",
          name: "Work",
          created_at: task.created_at,
          updated_at: task.updated_at,
        });
        const project = yield* Schema.decodeUnknownEffect(Project)({
          id: "project-1",
          profile_id: "profile-1",
          name: "Port",
          created_at: task.created_at,
          updated_at: task.updated_at,
        });
        const tag = yield* Schema.decodeUnknownEffect(Tag)({
          id: "tag-1",
          profile_id: "profile-1",
          name: "focus",
        });
        const decodedSeries = yield* Schema.decodeUnknownEffect(Series)(series);
        const occurrence = yield* Schema.decodeUnknownEffect(Occurrence)({
          ...task,
          occurrence: {
            id: "occurrence-1",
            series_id: "series-1",
            date: "2026-10-27",
          },
        });
        expect([profile.name, project.name, tag.name]).toEqual([
          "Work",
          "Port",
          "focus",
        ]);
        expect(decodedSeries.recurrence).toEqual({
          dtstart: { kind: "date", date: "2026-10-27" },
          rrule: "FREQ=WEEKLY;BYDAY=TU,TH",
          exdate: [{ kind: "date", date: "2026-10-29" }],
        });
        expect(occurrence.title).toBe("Write the port");
        expect(occurrence.occurrence).toEqual({
          id: "occurrence-1",
          series_id: "series-1",
          date: "2026-10-27",
        });
        expect(Schema.is(Occurrence)(task)).toBe(false);
      }),
  );

  it("keeps each ID brand distinct and rejects empty IDs", () => {
    expectTypeOf<ProfileId>().not.toEqualTypeOf<ProjectId>();
    expectTypeOf<ProjectId>().not.toEqualTypeOf<TaskId>();
    expectTypeOf<TaskId>().not.toEqualTypeOf<TagId>();
    expectTypeOf<TagId>().not.toEqualTypeOf<SeriesId>();
    expectTypeOf<SeriesId>().not.toEqualTypeOf<OccurrenceId>();
    expectTypeOf<OccurrenceId>().not.toEqualTypeOf<ActorId>();
    expectTypeOf<TaskId>().not.toEqualTypeOf<string>();
    for (const id of [
      ProfileId,
      ProjectId,
      TaskId,
      TagId,
      SeriesId,
      OccurrenceId,
      ActorId,
    ]) {
      expect(Schema.is(id)("")).toBe(false);
    }
  });

  it("preserves the migration's status and priority values", () => {
    expect(TaskStatus.literals).toEqual([
      "open",
      "done",
      "cancelled",
      "snoozed",
    ]);
    expect(TaskPriority.literals).toEqual(["P1", "P2", "P3", "P4"]);
    expect(Schema.is(TaskStatus)("closed")).toBe(false);
    expect(Schema.is(TaskPriority)("P0")).toBe(false);
  });

  it.each([
    { energy: 0 },
    { energy: 6 },
    { energy: 1.5 },
    { estimate_min: 0 },
    { estimate_min: -1 },
    { estimate_min: 2.5 },
    { row_version: 0 },
    { row_version: 1.5 },
    { entity_version: 2 },
    { profile_id: "" },
    { title: "" },
  ])("rejects invalid task metadata %j", (change) => {
    expect(Schema.is(Task)({ ...task, ...change })).toBe(false);
  });
});

describe("ADR-0006 time shapes", () => {
  it.effect("preserves a UTC instant and the intended IANA time zone", () =>
    Effect.gen(function* () {
      const decoded = yield* Schema.decodeUnknownEffect(TaskTime)(
        task.scheduled_at,
      );
      expect(decoded).toEqual({
        kind: "instant",
        utc: "2026-10-26T14:00:00Z",
        time_zone: "America/Bogota",
      });
      expectTypeOf<CalendarDate>().not.toEqualTypeOf<Instant>();
      expectTypeOf<DateValue>().not.toEqualTypeOf<Instant>();
    }),
  );

  it.each(["2026-02-29", "2026-04-31", "2026-13-01", "2026-10-26T00:00:00Z"])(
    "rejects invalid calendar date %s",
    (value) => {
      expect(Schema.is(CalendarDate)(value)).toBe(false);
    },
  );

  it("accepts leap days and rejects dates where an instant is required", () => {
    expect(Schema.is(CalendarDate)("2024-02-29")).toBe(true);
    expect(Schema.is(Instant)("2026-10-26")).toBe(false);
    expect(Schema.is(Instant)("2026-10-26T09:00:00-05:00")).toBe(false);
    expect(Schema.is(Instant)("2026-02-30T14:00:00Z")).toBe(false);
    expect(Schema.is(Instant)("2026-10-26T24:00:00Z")).toBe(false);
    expect(Schema.is(TimeZoneId)("Bogus/Zone")).toBe(false);
    expect(
      Schema.is(TaskTime)({ kind: "instant", utc: "2026-10-26T14:00:00Z" }),
    ).toBe(false);
  });
});

describe("versioned resolved events and operation log", () => {
  it.effect("encodes every CLI task mutation as version 1 resolved facts", () =>
    Effect.gen(function* () {
      const changed = {
        ...task,
        row_version: 2,
        updated_at: "2026-10-26T15:00:00Z",
      };
      const eventBase = {
        entity_version: 1,
        occurred_at: "2026-10-26T15:00:00Z",
        before: task,
        after: changed,
      };
      const events = [
        created,
        {
          ...eventBase,
          kind: "TaskEdited",
          after: { ...changed, title: "Port the CLI", tags: ["tag-2"] },
          series_before: null,
          series_after: series,
          project_before: project,
          project_after: project,
          tags_before: [tag],
          tags_after: [
            { id: "tag-2", profile_id: "profile-1", name: "urgent" },
          ],
        },
        {
          ...eventBase,
          kind: "TaskCompleted",
          after: {
            ...changed,
            status: "done",
            completed_at: "2026-10-26T15:00:00Z",
          },
          next_occurrences: [
            {
              ...task,
              id: "task-2",
              occurrence: {
                id: "occurrence-2",
                series_id: "series-1",
                date: "2026-10-29",
              },
            },
          ],
        },
        {
          ...eventBase,
          kind: "TaskCancelled",
          after: { ...changed, status: "cancelled" },
          next_occurrences: [],
        },
        {
          ...eventBase,
          kind: "TaskReopened",
          before: {
            ...task,
            status: "done",
            completed_at: "2026-10-26T14:00:00Z",
          },
        },
        {
          ...eventBase,
          kind: "TaskDeleted",
          after: { ...changed, deleted_at: "2026-10-26T15:00:00Z" },
        },
        {
          kind: "TaskPurged",
          entity_version: 1,
          occurred_at: "2026-10-26T15:00:00Z",
          task_id: "task-1",
          before: { ...task, deleted_at: "2026-10-26T14:00:00Z" },
        },
      ];
      const kinds: string[] = [];
      for (const event of events) {
        const decoded = yield* Schema.decodeUnknownEffect(Event)(event);
        const encoded = yield* Schema.encodeEffect(Event)(decoded);
        const replayed = yield* Schema.decodeUnknownEffect(Event)(
          JSON.parse(JSON.stringify(encoded)),
        );
        kinds.push(replayed.kind);
        expect(replayed.entity_version).toBe(1);
        expect(replayed.occurred_at).toBe(
          replayed.kind === "TaskCreated"
            ? "2026-10-26T13:00:00Z"
            : "2026-10-26T15:00:00Z",
        );
        if (replayed.kind === "TaskCompleted") {
          expect(replayed.after.status).toBe("done");
          expect(replayed.next_occurrences.map((next) => next.id)).toEqual([
            "task-2",
          ]);
        }
        if (replayed.kind === "TaskEdited") {
          expect(replayed.before.tags).toEqual(["tag-1"]);
          expect(replayed.after.tags).toEqual(["tag-2"]);
        }
      }
      expect(kinds).toEqual([
        "TaskCreated",
        "TaskEdited",
        "TaskCompleted",
        "TaskCancelled",
        "TaskReopened",
        "TaskDeleted",
        "TaskPurged",
      ]);
    }),
  );

  it.effect("records committed creation and a rejected version conflict", () =>
    Effect.gen(function* () {
      const committed = yield* Schema.decodeUnknownEffect(OpLogEntry)({
        ...op,
        outcome: "committed",
        reason: null,
      });
      expect({
        seq: committed.seq,
        actor: committed.actor,
        profile: committed.profile,
        from_version: committed.from_version,
        to_version: committed.to_version,
        outcome: committed.outcome,
        reason: committed.reason,
      }).toEqual({
        seq: 1,
        actor: "actor-1",
        profile: "profile-1",
        from_version: null,
        to_version: 1,
        outcome: "committed",
        reason: null,
      });
      const rejected = yield* Schema.decodeUnknownEffect(OpLogEntry)({
        ...op,
        seq: 2,
        from_version: 1,
        to_version: null,
        outcome: "rejected",
        reason: "conflict",
        event: {
          kind: "TaskAttemptRejected",
          entity_version: 1,
          occurred_at: "2026-10-26T15:00:00Z",
          attempted_kind: "TaskEdited",
          task_id: "task-1",
          violations: [],
        },
      });
      expect(rejected.outcome).toBe("rejected");
      expect(rejected.reason).toBe("conflict");
      expect(rejected.to_version).toBe(null);
    }),
  );

  it("rejects unsupported event versions, commands and incomplete outcomes", () => {
    expect(Schema.is(Event)({ ...created, entity_version: 2 })).toBe(false);
    expect(Schema.is(Event)({ ...created, kind: "add" })).toBe(false);
    expect(
      Schema.is(OpLogEntry)({ ...op, outcome: "rejected", reason: null }),
    ).toBe(false);
    expect(
      Schema.is(OpLogEntry)({
        ...op,
        outcome: "committed",
        reason: "conflict",
      }),
    ).toBe(false);
    expect(
      Schema.is(OpLogEntry)({
        ...op,
        seq: 0,
        outcome: "committed",
        reason: null,
      }),
    ).toBe(false);
  });
});

describe("C01 review regressions", () => {
  it.effect("records invalid priority rejection without a resulting task", () =>
    Effect.gen(function* () {
      const attempt = {
        seq: 2,
        actor: "actor-1",
        profile: "profile-1",
        from_version: null,
        to_version: null,
        outcome: "rejected",
        reason: "validation",
        event: {
          kind: "TaskAttemptRejected",
          entity_version: 1,
          occurred_at: "2026-10-26T15:00:00Z",
          attempted_kind: "TaskCreated",
          task_id: "task-2",
          violations: [
            { field: "priority", received: "P0", code: "invalid_priority" },
          ],
        },
      };
      const decoded = yield* Schema.decodeUnknownEffect(OpLogEntry)(attempt);
      const encoded = yield* Schema.encodeEffect(OpLogEntry)(decoded);
      expect(encoded).toEqual({
        seq: 2,
        actor: "actor-1",
        profile: "profile-1",
        from_version: null,
        to_version: null,
        outcome: "rejected",
        reason: "validation",
        event: {
          kind: "TaskAttemptRejected",
          entity_version: 1,
          occurred_at: "2026-10-26T15:00:00Z",
          attempted_kind: "TaskCreated",
          task_id: "task-2",
          violations: [
            { field: "priority", received: "P0", code: "invalid_priority" },
          ],
        },
      });
      expect(Schema.is(Task)({ ...task, priority: "P0" })).toBe(false);
      expect(
        Schema.is(OpLogEntry)({
          ...attempt,
          outcome: "committed",
          reason: null,
        }),
      ).toBe(false);
      expect(Schema.is(OpLogEntry)({ ...attempt, to_version: 1 })).toBe(false);
    }),
  );

  it.effect("retains project and tag definitions in a created event", () =>
    Effect.gen(function* () {
      const decoded = yield* Schema.decodeUnknownEffect(Event)({
        ...created,
        project: {
          id: "project-1",
          profile_id: "profile-1",
          name: "Port",
          created_at: "2026-10-26T13:00:00Z",
          updated_at: "2026-10-26T13:00:00Z",
        },
        tags: [{ id: "tag-1", profile_id: "profile-1", name: "focus" }],
      });
      const encoded = yield* Schema.encodeEffect(Event)(decoded);
      expect(JSON.parse(JSON.stringify(encoded))).toEqual({
        ...created,
        project: {
          id: "project-1",
          profile_id: "profile-1",
          name: "Port",
          created_at: "2026-10-26T13:00:00Z",
          updated_at: "2026-10-26T13:00:00Z",
        },
        tags: [{ id: "tag-1", profile_id: "profile-1", name: "focus" }],
      });
    }),
  );

  it.effect(
    "retains before and after project and tag definitions in an edit",
    () =>
      Effect.gen(function* () {
        const changed = {
          ...task,
          project_id: "project-2",
          tags: ["tag-2"],
          row_version: 2,
        };
        const edited = {
          kind: "TaskEdited",
          entity_version: 1,
          occurred_at: "2026-10-26T15:00:00Z",
          before: task,
          after: changed,
          series_before: null,
          series_after: null,
          project_before: {
            id: "project-1",
            profile_id: "profile-1",
            name: "Port",
            created_at: "2026-10-26T13:00:00Z",
            updated_at: "2026-10-26T13:00:00Z",
          },
          project_after: {
            id: "project-2",
            profile_id: "profile-1",
            name: "Release",
            created_at: "2026-10-26T15:00:00Z",
            updated_at: "2026-10-26T15:00:00Z",
          },
          tags_before: [
            { id: "tag-1", profile_id: "profile-1", name: "focus" },
          ],
          tags_after: [
            { id: "tag-2", profile_id: "profile-1", name: "urgent" },
          ],
        };
        const decoded = yield* Schema.decodeUnknownEffect(Event)(edited);
        const encoded = yield* Schema.encodeEffect(Event)(decoded);
        expect(JSON.parse(JSON.stringify(encoded))).toEqual({
          kind: "TaskEdited",
          entity_version: 1,
          occurred_at: "2026-10-26T15:00:00Z",
          before: task,
          after: changed,
          series_before: null,
          series_after: null,
          project_before: {
            id: "project-1",
            profile_id: "profile-1",
            name: "Port",
            created_at: "2026-10-26T13:00:00Z",
            updated_at: "2026-10-26T13:00:00Z",
          },
          project_after: {
            id: "project-2",
            profile_id: "profile-1",
            name: "Release",
            created_at: "2026-10-26T15:00:00Z",
            updated_at: "2026-10-26T15:00:00Z",
          },
          tags_before: [
            { id: "tag-1", profile_id: "profile-1", name: "focus" },
          ],
          tags_after: [
            { id: "tag-2", profile_id: "profile-1", name: "urgent" },
          ],
        });
      }),
  );

  it.each(["+05:30", "-05:00"])("rejects numeric time zone %s", (zone) => {
    expect(Schema.is(TimeZoneId)(zone)).toBe(false);
    expect(
      Schema.is(TaskTime)({
        kind: "instant",
        utc: "2026-10-26T14:00:00Z",
        time_zone: zone,
      }),
    ).toBe(false);
  });

  it.each(["America/Bogota", "Asia/Kolkata", "UTC", "Etc/GMT+5"])(
    "retains IANA time zone %s",
    (zone) => {
      expect(Schema.decodeUnknownSync(TimeZoneId)(zone)).toBe(zone);
    },
  );
});

import { expect, it } from "@effect/vitest";
import { OpLogEntry, Task } from "@todo/domain";
import { Effect, Schema } from "effect";
import {
  defaultRule,
  historyTaskIds,
  ruleDraft,
  ruleText,
} from "../src/recurrence.ts";

it.effect("writes RFC 5545 presets with chosen days and month positions", () =>
  Effect.sync(() => {
    expect(ruleText(defaultRule)).toBe("FREQ=DAILY");
    expect(ruleText({ ...defaultRule, preset: "weekdays" })).toBe(
      "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR",
    );
    expect(
      ruleText({ ...defaultRule, preset: "weekly", days: ["FR", "MO"] }),
    ).toBe("FREQ=WEEKLY;BYDAY=MO,FR");
    expect(ruleText({ ...defaultRule, preset: "monthly-date", day: 31 })).toBe(
      "FREQ=MONTHLY;BYMONTHDAY=31",
    );
    expect(
      ruleText({
        ...defaultRule,
        preset: "monthly-position",
        position: -1,
        weekday: "FR",
      }),
    ).toBe("FREQ=MONTHLY;BYDAY=-1FR");
  }),
);
it.effect("preserves every unsupported rule as read only", () =>
  Effect.sync(() => {
    for (const rule of [
      "FREQ=DAILY;COUNT=3",
      "FREQ=DAILY;INTERVAL=2",
      "FREQ=YEARLY",
      "FREQ=MONTHLY;BYDAY=MO;BYSETPOS=2",
      "FREQ=WEEKLY;BYDAY=MO;UNTIL=20261231",
    ])
      expect(ruleDraft(rule).preset).toBe("custom");
    expect(ruleDraft("FREQ=WEEKLY;BYDAY=MO,WE")).toEqual({
      ...defaultRule,
      preset: "weekly",
      days: ["MO", "WE"],
    });
    expect(ruleDraft("FREQ=MONTHLY;BYMONTHDAY=25")).toEqual({
      ...defaultRule,
      preset: "monthly-date",
      day: 25,
    });
    expect(ruleDraft("FREQ=MONTHLY;BYDAY=2TU")).toEqual({
      ...defaultRule,
      preset: "monthly-position",
      position: 2,
      weekday: "TU",
    });
  }),
);

it.effect(
  "follows a deleted legacy Series original through successor History",
  () =>
    Effect.sync(() => {
      const original = Schema.decodeUnknownSync(Task)({
        id: "legacy-1",
        profile_id: "work",
        entity_version: 1,
        row_version: 7,
        title: "Ship the port",
        description: null,
        project_id: null,
        priority: "P1",
        scheduled_at: null,
        due_at: null,
        energy: null,
        estimate_min: null,
        source: "manual",
        tags: [],
        status: "open",
        occurrence: null,
        created_at: "2026-10-01T08:00:00Z",
        updated_at: "2026-10-27T12:00:00Z",
        completed_at: null,
        deleted_at: null,
      });
      const completed = Schema.decodeUnknownSync(OpLogEntry)({
        seq: 3,
        actor: "test",
        profile: "work",
        from_version: 7,
        to_version: 8,
        outcome: "committed",
        reason: null,
        event: {
          kind: "TaskCompleted",
          entity_version: 1,
          occurred_at: "2026-10-27T12:00:00Z",
          before: original,
          after: {
            ...original,
            row_version: 8,
            status: "done",
            completed_at: "2026-10-27T12:00:00Z",
          },
          next_occurrences: [],
        },
      });
      expect(historyTaskIds([completed], "legacy-series:legacy-1")).toEqual([
        "legacy-1",
      ]);
      if (completed.event.kind !== "TaskCompleted")
        throw new Error("Missing completion");
      expect(
        historyTaskIds(
          [
            Schema.decodeUnknownSync(OpLogEntry)({
              ...completed,
              event: {
                ...completed.event,
                before: { ...original, legacy_series_detached: true },
                after: {
                  ...completed.event.after,
                  legacy_series_detached: true,
                },
              },
            }),
          ],
          "legacy-series:legacy-1",
        ),
      ).toEqual([]);
      const withSuccessor = Schema.decodeUnknownSync(OpLogEntry)({
        ...completed,
        event: {
          ...completed.event,
          next_occurrences: [
            {
              ...original,
              id: "next-occurrence",
              row_version: 1,
              occurrence: {
                id: "next-origin",
                series_id: "legacy-series:legacy-1",
                date: "2026-10-28",
              },
            },
          ],
        },
      });
      expect(historyTaskIds([withSuccessor], "legacy-series:legacy-1")).toEqual(
        ["legacy-1", "next-occurrence"],
      );
    }),
);

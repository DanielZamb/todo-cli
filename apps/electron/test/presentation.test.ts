import { expect, it } from "@effect/vitest";
import { TaskTime } from "@todo/domain";
import { Schema } from "effect";
import { countTasks, rowDateText } from "../src/presentation.ts";

const time = Schema.decodeUnknownSync(TaskTime);

it("formats Task counts including the singular", () => {
  expect([0, 1, 2].map((count) => countTasks(count))).toEqual([
    "0 tasks",
    "1 task",
    "2 tasks",
  ]);
  expect([0, 1, 2].map((count) => countTasks(count, true))).toEqual([
    "0 Tasks",
    "1 Task",
    "2 Tasks",
  ]);
});
it("formats relative dates without shifting date-only values across zones", () => {
  const options = {
    now: new Date("2026-10-28T15:00:00Z"),
    currentZone: "America/Bogota",
  };
  expect(
    [
      "2026-10-28",
      "2026-10-29",
      "2026-10-27",
      "2026-10-30",
      "2026-11-03",
      "2026-11-04",
      "2027-01-01",
    ].map((date) => rowDateText(time({ kind: "date", date }), options)),
  ).toEqual([
    "Today",
    "Tomorrow",
    "Yesterday",
    "Fri",
    "Tue",
    "Nov 4",
    "Jan 1, 2027",
  ]);
  expect(
    rowDateText(
      time({
        kind: "instant",
        utc: "2026-10-28T14:00:00Z",
        time_zone: "America/Bogota",
      }),
      options,
    ),
  ).toBe("Today 9:00 AM");
  expect(
    rowDateText(
      time({ kind: "instant", utc: "2026-10-28T14:00:00Z", time_zone: "UTC" }),
      options,
    ),
  ).toBe("Today 2:00 PM · UTC");
  expect(
    rowDateText(
      time({
        kind: "instant",
        utc: "2026-10-29T00:30:00Z",
        time_zone: "America/Bogota",
      }),
      options,
    ),
  ).toBe("Today 7:30 PM");
  expect(rowDateText(null, options)).toBe("");
});

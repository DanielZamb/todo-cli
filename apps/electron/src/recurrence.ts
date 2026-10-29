import type { OpLogEntry, Series, Task, TaskId } from "@todo/domain";
import { Schema } from "effect";

export const Preset = Schema.Literals([
  "daily",
  "weekdays",
  "weekly",
  "monthly-date",
  "monthly-position",
  "custom",
]);
export type Preset = typeof Preset.Type;
export const weekdays = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"] as const;
export type Weekday = (typeof weekdays)[number];
export const weekdayNames: Record<Weekday, string> = {
  MO: "Mon",
  TU: "Tue",
  WE: "Wed",
  TH: "Thu",
  FR: "Fri",
  SA: "Sat",
  SU: "Sun",
};
export const RuleDraft = Schema.Struct({
  preset: Preset,
  days: Schema.Array(Schema.Literals(weekdays)),
  day: Schema.Number,
  position: Schema.Number,
  weekday: Schema.Literals(weekdays),
});
export type RuleDraft = typeof RuleDraft.Type;
export const defaultRule: RuleDraft = {
  preset: "daily",
  days: ["MO"],
  day: 1,
  position: 1,
  weekday: "MO",
};
export function ruleText(draft: RuleDraft): string {
  switch (draft.preset) {
    case "daily":
      return "FREQ=DAILY";
    case "weekdays":
      return "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR";
    case "weekly":
      return `FREQ=WEEKLY;BYDAY=${weekdays.filter((day) => draft.days.includes(day)).join(",")}`;
    case "monthly-date":
      return `FREQ=MONTHLY;BYMONTHDAY=${draft.day}`;
    case "monthly-position":
      return `FREQ=MONTHLY;BYDAY=${draft.position}${draft.weekday}`;
    case "custom":
      return "";
  }
}
export function ruleDraft(rule: string): RuleDraft {
  if (rule === "FREQ=DAILY") return defaultRule;
  if (rule === "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR")
    return { ...defaultRule, preset: "weekdays" };
  const weekly =
    /^FREQ=WEEKLY;BYDAY=((?:MO|TU|WE|TH|FR|SA|SU)(?:,(?:MO|TU|WE|TH|FR|SA|SU))*)$/.exec(
      rule,
    );
  if (weekly)
    return {
      ...defaultRule,
      preset: "weekly",
      days: weekdays.filter((day) => weekly[1]?.split(",").includes(day)),
    };
  const date = /^FREQ=MONTHLY;BYMONTHDAY=([1-9]|[12]\d|3[01])$/.exec(rule);
  if (date)
    return { ...defaultRule, preset: "monthly-date", day: Number(date[1]) };
  const position = /^FREQ=MONTHLY;BYDAY=(-1|[1-4])(MO|TU|WE|TH|FR|SA|SU)$/.exec(
    rule,
  );
  if (position)
    return {
      ...defaultRule,
      preset: "monthly-position",
      position: Number(position[1]),
      weekday: Schema.decodeUnknownSync(Schema.Literals(weekdays))(position[2]),
    };
  return { ...defaultRule, preset: "custom" };
}
export const presetNames: Record<Preset, string> = {
  daily: "Daily",
  weekdays: "Weekdays",
  weekly: "Weekly on chosen days",
  "monthly-date": "Monthly by date",
  "monthly-position": "Monthly by position",
  custom: "Custom rule",
};
export function seriesFromHistory(entries: readonly OpLogEntry[]): Series[] {
  const definitions = new Map<string, Series>();
  for (const entry of entries.toSorted((a, b) => a.seq - b.seq)) {
    if (entry.outcome !== "committed") continue;
    const event = entry.event;
    const changes =
      event.kind === "TaskCreated"
        ? [{ before: null, after: event.series }]
        : event.kind === "TaskEdited"
          ? [{ before: event.series_before, after: event.series_after }]
          : event.kind === "TaskReverted"
            ? event.series
            : [];
    for (const change of changes) {
      if (change.after) definitions.set(change.after.id, change.after);
      else if (change.before) definitions.delete(change.before.id);
    }
  }
  return [...definitions.values()];
}
export const seriesKey = (task: Task) =>
  task.occurrence?.series_id ??
  (task.legacy_series_detached ? null : `legacy-series:${task.id}`);
export function historyTaskIds(
  entries: readonly OpLogEntry[],
  seriesId: string,
): TaskId[] {
  return [
    ...new Set(
      entries.flatMap((entry) => {
        if (entry.outcome !== "committed") return [];
        const event = entry.event;
        const tasks =
          event.kind === "TaskReverted"
            ? event.tasks.flatMap((change) => [
                ...(change.before ? [change.before] : []),
                ...(change.after ? [change.after] : []),
              ])
            : "before" in event
              ? [
                  event.before,
                  ...("after" in event ? [event.after] : []),
                  ...("next_occurrences" in event
                    ? event.next_occurrences
                    : []),
                ]
              : "task" in event
                ? [event.task]
                : [];
        return tasks
          .filter((task) => seriesKey(task) === seriesId)
          .map((task) => task.id);
      }),
    ),
  ];
}

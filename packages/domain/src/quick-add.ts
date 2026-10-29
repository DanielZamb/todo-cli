import { Effect, Schema } from "effect";
import { Temporal } from "temporal-polyfill";
import { TaskPriority } from "./entities.ts";
import { Instant, TaskTime, TimeZoneId } from "./time.ts";

export const QuickAddInput = Schema.Struct({
  text: Schema.NonEmptyString,
  now: Instant,
  time_zone: TimeZoneId,
});
export type QuickAddInput = typeof QuickAddInput.Type;
export const QuickAddDraft = Schema.Struct({
  title: Schema.NonEmptyString,
  due_at: Schema.NullOr(TaskTime),
  scheduled_at: Schema.NullOr(TaskTime),
  priority: TaskPriority,
  tags: Schema.Array(Schema.NonEmptyString),
  project: Schema.NullOr(Schema.NonEmptyString),
});
export type QuickAddDraft = typeof QuickAddDraft.Type;

export class QuickAddError extends Error {
  readonly _tag = "QuickAddError";
  constructor(message: string) {
    super(message);
  }
}

const weekdays = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const clockPattern = /^(\d+)(?::(\d+))?(am|pm)$/i;
const datePattern =
  /^(today|tomorrow|mon(?:day)?|tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?|\d{4}-\d{2}-\d{2})$/i;

export const parseQuickAdd = (input: QuickAddInput) =>
  Effect.try({
    try: (): QuickAddDraft => {
      const { text, now, time_zone } =
        Schema.decodeUnknownSync(QuickAddInput)(input);
      const local = Temporal.Instant.from(now).toZonedDateTimeISO(time_zone);
      const today = local.toPlainDate();
      const tokens = Array.from(
        text.matchAll(
          /([#@])(?:"([^"]*)"|'([^']*)')|"([^"]*)"|'([^']*)'|(\S+)/g,
        ),
        (match) => ({
          text:
            match[1] !== undefined
              ? `${match[1]}${match[2] ?? match[3] ?? ""}`
              : (match[4] ?? match[5] ?? match[6] ?? ""),
          literal: match[4] !== undefined || match[5] !== undefined,
        }),
      );
      const title: string[] = [];
      const tags = new Set<string>();
      let priority: TaskPriority = "P3";
      let project: string | null = null;
      let due_at: TaskTime | null = null;
      let scheduled_at: TaskTime | null = null;
      let hasPriority = false;
      for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];
        if (!token) continue;
        const word = token.text;
        if (token.literal) {
          title.push(word);
          continue;
        }
        if (/^p[1-4]$/i.test(word)) {
          if (hasPriority) throw new QuickAddError("Use one priority");
          priority = Schema.decodeUnknownSync(TaskPriority)(word.toUpperCase());
          hasPriority = true;
          continue;
        }
        if (word.startsWith("#") && word.length > 1) {
          tags.add(word.slice(1).toLowerCase());
          continue;
        }
        if (word.startsWith("@") && word.length > 1) {
          if (project !== null) throw new QuickAddError("Use one Project");
          project = word.slice(1);
          continue;
        }
        const prefix = /^(due|scheduled):(.+)$/i.exec(word);
        const separatePrefix =
          /^(due|scheduled):?$/i.test(word) &&
          !tokens[i + 1]?.literal &&
          datePattern.test(tokens[i + 1]?.text ?? "");
        const target = (
          prefix?.[1] ?? (separatePrefix ? word.replace(/:$/, "") : "due")
        ).toLowerCase();
        const dateWord =
          prefix?.[2] ?? (separatePrefix ? (tokens[++i]?.text ?? "") : word);
        if (!datePattern.test(dateWord)) {
          title.push(word);
          continue;
        }
        let date = today;
        if (/^\d/.test(dateWord))
          date = Temporal.PlainDate.from(dateWord, { overflow: "reject" });
        else if (dateWord.toLowerCase() === "tomorrow")
          date = today.add({ days: 1 });
        else if (dateWord.toLowerCase() !== "today") {
          const day = weekdays.indexOf(dateWord.toLowerCase().slice(0, 3)) + 1;
          date = today.add({ days: (day - today.dayOfWeek + 7) % 7 || 7 });
        }
        const next = tokens[i + 1];
        const clock =
          next && !next.literal ? clockPattern.exec(next.text) : null;
        let time: TaskTime = Schema.decodeUnknownSync(TaskTime)({
          kind: "date",
          date: date.toString(),
        });
        if (clock) {
          const hour = Number(clock[1]);
          if (hour < 1 || hour > 12)
            throw new QuickAddError("Hour must be between 1 and 12");
          const minute = Number(clock[2] ?? 0);
          if (minute < 0 || minute > 59)
            throw new QuickAddError("Minute must be between 0 and 59");
          const zoned = date
            .toPlainDateTime({
              hour: (hour % 12) + (clock[3]?.toLowerCase() === "pm" ? 12 : 0),
              minute,
            })
            .toZonedDateTime(time_zone, { disambiguation: "reject" });
          time = Schema.decodeUnknownSync(TaskTime)({
            kind: "instant",
            utc: zoned.toInstant().toString(),
            time_zone,
          });
          i++;
        }
        if (target === "scheduled") {
          if (scheduled_at !== null)
            throw new QuickAddError("Use one scheduled date");
          scheduled_at = time;
        } else {
          if (due_at !== null) throw new QuickAddError("Use one due date");
          due_at = time;
        }
      }
      return Schema.decodeUnknownSync(QuickAddDraft)({
        title: title.join(" ").trim(),
        due_at,
        scheduled_at,
        priority,
        tags: [...tags].sort(),
        project,
      });
    },
    catch: (error) =>
      error instanceof QuickAddError ? error : new QuickAddError(String(error)),
  });

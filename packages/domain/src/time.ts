import { DateTime, Option, Schema } from "effect";

export const CalendarDate = Schema.String.check(
  Schema.isPattern(/^\d{4}-\d{2}-\d{2}$/),
  Schema.makeFilter((value) => {
    const millis = Date.parse(value);
    return (
      Number.isFinite(millis) &&
      new Date(millis).toISOString().slice(0, 10) === value
    );
  }),
).pipe(Schema.brand("CalendarDate"));
export type CalendarDate = typeof CalendarDate.Type;

export const Instant = Schema.String.check(
  Schema.isPattern(
    /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?Z$/,
  ),
  Schema.makeFilter((value) => Schema.is(CalendarDate)(value.slice(0, 10))),
).pipe(Schema.brand("Instant"));
export type Instant = typeof Instant.Type;

export const TimeZoneId = Schema.String.check(
  Schema.isPattern(/^[A-Za-z]/),
  Schema.makeFilter((value) => Option.isSome(DateTime.zoneMakeNamed(value))),
).pipe(Schema.brand("TimeZoneId"));
export type TimeZoneId = typeof TimeZoneId.Type;

export const ZonedInstant = Schema.Struct({
  kind: Schema.Literal("instant"),
  utc: Instant,
  time_zone: TimeZoneId,
});
export type ZonedInstant = typeof ZonedInstant.Type;

export const DateValue = Schema.Struct({
  kind: Schema.Literal("date"),
  date: CalendarDate,
});
export type DateValue = typeof DateValue.Type;

export const TaskTime = Schema.Union([ZonedInstant, DateValue]);
export type TaskTime = typeof TaskTime.Type;

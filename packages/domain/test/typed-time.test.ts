// Follow-up 86 (ADR-0006): a time typed into the CLI is stored in UTC together with the zone of
// the machine it was typed on. A local time is that machine's wall-clock time; a time with `Z` or an
// offset keeps its instant; RFC 9557 text with a bracketed zone keeps that zone.
import { expect, it } from "@effect/vitest";
import { parseTime, resolveTypedTime } from "../src/commands.ts";

const typed = (input: string, zone: string) => {
  try {
    return parseTime(input, zone);
  } catch (error) {
    return { refused: (error as Error).message };
  }
};

it("reads a local time in the typing machine's zone and stores that zone", () => {
  expect(
    ["America/Bogota", "America/New_York", "Asia/Tokyo", "UTC"].map((zone) =>
      typed("2026-11-16 21:00", zone),
    ),
  ).toEqual([
    {
      kind: "instant",
      utc: "2026-11-17T02:00:00.000Z",
      time_zone: "America/Bogota",
    },
    {
      kind: "instant",
      utc: "2026-11-17T02:00:00.000Z",
      time_zone: "America/New_York",
    },
    {
      kind: "instant",
      utc: "2026-11-16T12:00:00.000Z",
      time_zone: "Asia/Tokyo",
    },
    { kind: "instant", utc: "2026-11-16T21:00:00.000Z", time_zone: "UTC" },
  ]);
  expect(typed("11/16/2026 21:30", "America/Bogota")).toEqual({
    kind: "instant",
    utc: "2026-11-17T02:30:00.000Z",
    time_zone: "America/Bogota",
  });
});

it("keeps the instant of a time with an offset or Z, and stores the typing machine's zone", () => {
  expect(
    ["America/Bogota", "Asia/Tokyo", "UTC"].flatMap((zone) => [
      typed("2026-11-16T21:00:00-05:00", zone),
      typed("2026-11-16T21:00:00Z", zone),
    ]),
  ).toEqual([
    {
      kind: "instant",
      utc: "2026-11-17T02:00:00.000Z",
      time_zone: "America/Bogota",
    },
    {
      kind: "instant",
      utc: "2026-11-16T21:00:00.000Z",
      time_zone: "America/Bogota",
    },
    {
      kind: "instant",
      utc: "2026-11-17T02:00:00.000Z",
      time_zone: "Asia/Tokyo",
    },
    {
      kind: "instant",
      utc: "2026-11-16T21:00:00.000Z",
      time_zone: "Asia/Tokyo",
    },
    { kind: "instant", utc: "2026-11-17T02:00:00.000Z", time_zone: "UTC" },
    { kind: "instant", utc: "2026-11-16T21:00:00.000Z", time_zone: "UTC" },
  ]);
});

it("refuses a local time a daylight-saving change skips or repeats, and takes it with an offset", () => {
  const zone = "America/New_York";
  expect([
    typed("2026-03-08 02:30", zone),
    typed("2026-11-01 01:30", zone),
    typed("2026-11-01T01:30:00-04:00", zone),
    typed("2026-11-01T01:30:00-05:00", zone),
    typed("2026-03-08 03:30", zone),
  ]).toEqual([
    {
      refused:
        "2026-03-08 02:30 does not exist or occurs twice in America/New_York (a daylight-saving change); add the offset you mean, for example 2026-03-08T02:30:00-05:00",
    },
    {
      refused:
        "2026-11-01 01:30 does not exist or occurs twice in America/New_York (a daylight-saving change); add the offset you mean, for example 2026-11-01T01:30:00-05:00",
    },
    { kind: "instant", utc: "2026-11-01T05:30:00.000Z", time_zone: zone },
    { kind: "instant", utc: "2026-11-01T06:30:00.000Z", time_zone: zone },
    { kind: "instant", utc: "2026-03-08T07:30:00.000Z", time_zone: zone },
  ]);
});

it("keeps the zone named in brackets, whichever process parses it", () => {
  expect([
    typed("2026-11-16T21:00:00-05:00[America/Bogota]", "Asia/Tokyo"),
    typed("2026-11-16T21:00:00-04:00[America/Bogota]", "Asia/Tokyo"),
    typed("2026-11-16T21:00:00-05:00[Mars/Olympus]", "Asia/Tokyo"),
  ]).toEqual([
    {
      kind: "instant",
      utc: "2026-11-17T02:00:00.000Z",
      time_zone: "America/Bogota",
    },
    {
      refused:
        "invalid datetime format: 2026-11-16T21:00:00-04:00[America/Bogota]",
    },
    { refused: "unknown time zone: Mars/Olympus" },
  ]);
});

it("leaves dates, empty values and malformed text as they were", () => {
  expect([
    typed("2026-11-16", "Asia/Tokyo"),
    typed("11/16/2026", "Asia/Tokyo"),
    typed("", "Asia/Tokyo"),
    typed("2026-11-16 25:00", "Asia/Tokyo"),
    typed("tomorrow", "Asia/Tokyo"),
  ]).toEqual([
    { kind: "date", date: "2026-11-16" },
    { kind: "date", date: "2026-11-16" },
    null,
    { refused: "invalid datetime format: 2026-11-16 25:00" },
    { refused: "invalid datetime format: tomorrow" },
  ]);
});

it("resolves typed text to bracketed text in the typing machine's zone, for the CLI to pass on", () => {
  expect([
    resolveTypedTime("2026-11-16 21:00", "America/Bogota"),
    resolveTypedTime("2026-11-16T21:00:00-05:00", "Asia/Tokyo"),
    resolveTypedTime("2026-11-16T21:00:00Z", "UTC"),
    resolveTypedTime("2026-11-16", "America/Bogota"),
    resolveTypedTime("", "America/Bogota"),
    resolveTypedTime("2026-03-08 02:30", "America/New_York"),
  ]).toEqual([
    "2026-11-16T21:00:00-05:00[America/Bogota]",
    "2026-11-17T11:00:00+09:00[Asia/Tokyo]",
    "2026-11-16T21:00:00+00:00[UTC]",
    "2026-11-16",
    "",
    "2026-03-08 02:30",
  ]);
  // What the CLI passes on parses back to the same stored time in any process's zone.
  expect(
    typed(resolveTypedTime("2026-11-16 21:00", "America/Bogota"), "Asia/Tokyo"),
  ).toEqual(typed("2026-11-16 21:00", "America/Bogota"));
});

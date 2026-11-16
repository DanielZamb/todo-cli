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

// Server seat F2: a skipped or repeated local time is refused with the zone's own offsets at that
// wall time; each suggested value, pasted, is accepted at the instant it names.
const suggestions = {
  "America/New_York": {
    skipped: [
      "2027-03-14 02:30",
      ["2027-03-14T01:59:00-05:00", "2027-03-14T03:00:00-04:00"],
    ],
    repeated: [
      "2026-11-01 01:30",
      ["2026-11-01T01:30:00-04:00", "2026-11-01T01:30:00-05:00"],
    ],
  },
  "Europe/Berlin": {
    skipped: [
      "2027-03-28 02:30",
      ["2027-03-28T01:59:00+01:00", "2027-03-28T03:00:00+02:00"],
    ],
    repeated: [
      "2026-10-25 02:30",
      ["2026-10-25T02:30:00+02:00", "2026-10-25T02:30:00+01:00"],
    ],
  },
} as const;

it("refuses a skipped or repeated local time with the zone's own offsets, New York and Berlin", () => {
  expect(
    Object.entries(suggestions).flatMap(([zone, cases]) => [
      typed(cases.skipped[0], zone),
      typed(cases.repeated[0], zone),
    ]),
  ).toEqual([
    {
      refused:
        "2027-03-14 02:30 does not exist in America/New_York: a daylight-saving change skips it on 2027-03-14. The nearest times that exist are 2027-03-14T01:59:00-05:00 and 2027-03-14T03:00:00-04:00.",
    },
    {
      refused:
        "2026-11-01 01:30 occurs twice in America/New_York: a daylight-saving change repeats it on 2026-11-01. Type the one you mean: 2026-11-01T01:30:00-04:00 (the first) or 2026-11-01T01:30:00-05:00 (the second).",
    },
    {
      refused:
        "2027-03-28 02:30 does not exist in Europe/Berlin: a daylight-saving change skips it on 2027-03-28. The nearest times that exist are 2027-03-28T01:59:00+01:00 and 2027-03-28T03:00:00+02:00.",
    },
    {
      refused:
        "2026-10-25 02:30 occurs twice in Europe/Berlin: a daylight-saving change repeats it on 2026-10-25. Type the one you mean: 2026-10-25T02:30:00+02:00 (the first) or 2026-10-25T02:30:00+01:00 (the second).",
    },
  ]);
});

it("accepts every suggested value as pasted, at the instant it names", () => {
  expect(
    Object.entries(suggestions).flatMap(([zone, cases]) =>
      [...cases.skipped[1], ...cases.repeated[1]].map((value) =>
        typed(value, zone),
      ),
    ),
  ).toEqual([
    {
      kind: "instant",
      utc: "2027-03-14T06:59:00.000Z",
      time_zone: "America/New_York",
    },
    {
      kind: "instant",
      utc: "2027-03-14T07:00:00.000Z",
      time_zone: "America/New_York",
    },
    {
      kind: "instant",
      utc: "2026-11-01T05:30:00.000Z",
      time_zone: "America/New_York",
    },
    {
      kind: "instant",
      utc: "2026-11-01T06:30:00.000Z",
      time_zone: "America/New_York",
    },
    {
      kind: "instant",
      utc: "2027-03-28T00:59:00.000Z",
      time_zone: "Europe/Berlin",
    },
    {
      kind: "instant",
      utc: "2027-03-28T01:00:00.000Z",
      time_zone: "Europe/Berlin",
    },
    {
      kind: "instant",
      utc: "2026-10-25T00:30:00.000Z",
      time_zone: "Europe/Berlin",
    },
    {
      kind: "instant",
      utc: "2026-10-25T01:30:00.000Z",
      time_zone: "Europe/Berlin",
    },
  ]);
});

it("refuses a 60th second in the bracketed and the offset forms, and echoes at most 64 characters", () => {
  const long = `2026-11-16T21:00:00-05:00${"x".repeat(5000)}`;
  expect([
    typed("2026-11-16T23:59:60-05:00[America/Bogota]", "UTC"),
    typed("2026-11-16T23:59:60-05:00", "UTC"),
    typed(long, "UTC"),
  ]).toEqual([
    {
      refused:
        "invalid datetime format: 2026-11-16T23:59:60-05:00[America/Bogota]",
    },
    { refused: "invalid datetime format: 2026-11-16T23:59:60-05:00" },
    { refused: `invalid datetime format: ${long.slice(0, 64)}…` },
  ]);
});

it("resolves typed text to bracketed text in the typing machine's zone, and refuses what it cannot read", () => {
  const resolved = (input: string, zone: string) => {
    try {
      return resolveTypedTime(input, zone);
    } catch (error) {
      return { refused: (error as Error).message };
    }
  };
  expect([
    resolved("2026-11-16 21:00", "America/Bogota"),
    resolved("2026-11-16T21:00:00-05:00", "Asia/Tokyo"),
    resolved("2026-11-16T21:00:00Z", "UTC"),
    resolved("2026-11-16", "America/Bogota"),
    resolved("", "America/Bogota"),
    resolved("tomorrow", "America/Bogota"),
  ]).toEqual([
    "2026-11-16T21:00:00-05:00[America/Bogota]",
    "2026-11-17T11:00:00+09:00[Asia/Tokyo]",
    "2026-11-16T21:00:00+00:00[UTC]",
    "2026-11-16",
    "",
    { refused: "invalid datetime format: tomorrow" },
  ]);
  // A skipped time typed in New York is refused there, never passed on for another zone to read
  // (server seat F1); Bogota has no daylight saving and would have accepted it.
  expect([
    resolved("2027-03-14 02:30", "America/New_York"),
    typed("2027-03-14 02:30", "America/Bogota"),
  ]).toEqual([
    {
      refused:
        "2027-03-14 02:30 does not exist in America/New_York: a daylight-saving change skips it on 2027-03-14. The nearest times that exist are 2027-03-14T01:59:00-05:00 and 2027-03-14T03:00:00-04:00.",
    },
    {
      kind: "instant",
      utc: "2027-03-14T07:30:00.000Z",
      time_zone: "America/Bogota",
    },
  ]);
  // What the CLI passes on parses back to the same stored time in any process's zone.
  expect(
    typed(resolveTypedTime("2026-11-16 21:00", "America/Bogota"), "Asia/Tokyo"),
  ).toEqual(typed("2026-11-16 21:00", "America/Bogota"));
});

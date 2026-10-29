import assert from "node:assert/strict";
import { rrulestr } from "rrule";
import { RRuleTemporal } from "rrule-temporal";

const cases = [
  {
    name: "weekdays-dst-count-exdate",
    ics: "DTSTART;TZID=America/New_York:20260306T090000\nRRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;COUNT=4\nEXDATE;TZID=America/New_York:20260310T090000",
    expected: [
      "2026-03-06T14:00:00Z",
      "2026-03-09T13:00:00Z",
      "2026-03-11T13:00:00Z",
    ],
  },
  {
    name: "monthly-bysetpos",
    ics: "DTSTART;TZID=America/New_York:20260130T090000\nRRULE:FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-1;COUNT=3",
    expected: [
      "2026-01-30T14:00:00Z",
      "2026-02-27T14:00:00Z",
      "2026-03-31T13:00:00Z",
    ],
  },
  {
    name: "until-inclusive",
    ics: "DTSTART;TZID=America/New_York:20260306T090000\nRRULE:FREQ=DAILY;UNTIL=20260309T130000Z",
    expected: [
      "2026-03-06T14:00:00Z",
      "2026-03-07T14:00:00Z",
      "2026-03-08T13:00:00Z",
      "2026-03-09T13:00:00Z",
    ],
  },
  {
    name: "date-only",
    ics: "DTSTART;VALUE=DATE:20260130\nRRULE:FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-1;COUNT=3",
    expected: [
      "2026-01-30T00:00:00Z",
      "2026-02-27T00:00:00Z",
      "2026-03-31T00:00:00Z",
    ],
  },
];
const results = cases.map((test) => {
  const temporal = new RRuleTemporal({ rruleString: test.ics, strict: true })
    .all()
    .map((d) => d.toInstant().toString());
  const baseline = rrulestr(test.ics)
    .all()
    .map((d) => d.toISOString().replace(".000Z", "Z"));
  assert.deepEqual(temporal, test.expected);

  return {
    ...test,
    temporal,
    baseline,
    baselineMatches: JSON.stringify(baseline) === JSON.stringify(test.expected),
  };
});
process.stdout.write(
  `${JSON.stringify({ temporal: "rrule-temporal@2.2.8", baseline: "rrule@2.8.1", results }, null, 2)}\n`,
);

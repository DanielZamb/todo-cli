import { expect, it } from "@effect/vitest";
import {
  RecordingServiceRates,
  recordingMethods,
} from "../src/recording-rate.ts";

it("SQL9 expires each observation without copying or restamping an outlier", () => {
  let now = 0;
  const rates = new RecordingServiceRates(() => now);
  rates.observe("show", 3500);
  expect(rates.estimate("show", 25)).toBe(5250);
  now = 59000;
  rates.observe("show", 3);
  expect(rates.get("show")).toEqual([
    { at: 0, ms: 3500 },
    { at: 59000, ms: 3 },
  ]);
  now = 60000;
  expect(rates.estimate("show", 25)).toBe(37.5);
  now = 61000;
  rates.observe("show", 4);
  expect(rates.get("show")).toEqual([
    { at: 59000, ms: 3 },
    { at: 61000, ms: 4 },
  ]);
  expect(rates.estimate("show", 25)).toBe(37.5);
});
it("SQL9 returns to the cold floor after expiry and both fresh calls stay admissible", () => {
  let now = 0;
  const rates = new RecordingServiceRates(() => now);
  rates.observe("show", 3500);
  now = 61000;
  expect(rates.estimate("show", 25)).toBe(37.5);
  expect(rates.get("show")).toBeUndefined();
  now = 61003;
  rates.observe("show", 3);
  expect(rates.estimate("show", 25)).toBe(37.5);
  now = 61006;
  rates.observe("show", 3);
  expect(rates.estimate("show", 25)).toBe(37.5);
  expect(rates.get("show")).toEqual([
    { at: 61003, ms: 3 },
    { at: 61006, ms: 3 },
  ]);
});
it("SQL9 bounds every production method to eight samples and isolates histories", () => {
  let now = 0;
  const rates = new RecordingServiceRates(() => now);
  rates.observe("show", 3500);
  for (let i = 0; i < 100; i++) {
    now = i;
    rates.observe("ingest", 2);
  }
  expect(rates.get("ingest")?.length).toBe(8);
  expect(rates.get("show")).toEqual([{ at: 0, ms: 3500 }]);
  expect(rates.estimate("ingest", 1)).toBe(3);
  expect(rates.estimate("show", 25)).toBe(5250);
  for (const method of recordingMethods)
    for (let i = 0; i < 100; i++) rates.observe(method, 2);
  expect(rates.size).toBe(7);
  expect([...rates.values()].map((s) => s.length)).toEqual([
    8, 8, 8, 8, 8, 8, 8,
  ]);
  now = 60100;
  for (const method of recordingMethods)
    expect(rates.estimate(method, 1)).toBe(1.5);
  expect(rates.size).toBe(0);
});

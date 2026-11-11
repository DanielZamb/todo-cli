import { expect, it } from "@effect/vitest";
import {
  diagnosticFailureCounts as directCounts,
  observeDiagnostic as directGuard,
} from "@todo/domain/diagnostic-guard";
import { expectTypeOf } from "vitest";
import { diagnosticFailureCounts, observeDiagnostic } from "../src/index.ts";

it("shares one guard and isolated failure counts for any recorder owner", () => {
  expect(observeDiagnostic).toBe(directGuard);
  expect(diagnosticFailureCounts).toBe(directCounts);
  const owner = { renderer: true };
  const other = {};
  expect(diagnosticFailureCounts(owner)).toEqual({
    total: 0,
    lost_starts: 0,
    lost_events: 0,
  });
  let attempts = 0;
  const success = observeDiagnostic(owner, () => {
    attempts++;
    return 37;
  });
  expectTypeOf(success).toEqualTypeOf<number | undefined>();
  expect(success).toBe(37);
  expect(attempts).toBe(1);
  const fail = () => {
    attempts++;
    throw new Error("private recorder failure");
  };
  expect(observeDiagnostic(owner, fail, "start")).toBeUndefined();
  const first = diagnosticFailureCounts(owner);
  expect(first).toEqual({ total: 1, lost_starts: 1, lost_events: 0 });
  expect(directGuard(owner, fail)).toBeUndefined();
  expect(observeDiagnostic(owner, fail, "event")).toBeUndefined();
  expect(diagnosticFailureCounts(owner)).toEqual({
    total: 3,
    lost_starts: 1,
    lost_events: 2,
  });
  expect(first).toEqual({ total: 1, lost_starts: 1, lost_events: 0 });
  expect(diagnosticFailureCounts(other)).toEqual({
    total: 0,
    lost_starts: 0,
    lost_events: 0,
  });
  expect(attempts).toBe(4);
});

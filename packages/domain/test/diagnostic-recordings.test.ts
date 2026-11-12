import { expect, it } from "@effect/vitest";
import { Schema } from "effect";
import {
  DiagnosticEnvelope,
  DiagnosticEvent,
} from "../src/client-diagnostics.ts";

import { event } from "./fixtures/diagnostic-recording.ts";

it("carries release timing and bounded selection context without content", () => {
  const value = {
    ...event,
    profile_ordinal: 2,
    input_timing: {
      basis: "release",
      hold_ms: 120,
      derived_from_native_selection: true,
    },
    selection_context: {
      list_rows: 15,
      refresh_in_flight: true,
      process_uptime_ms: 1000,
      journal_bytes: 4096,
    },
  };
  expect(Schema.is(DiagnosticEvent)(value)).toBe(true);
  expect(() =>
    Schema.decodeUnknownSync(DiagnosticEvent, { onExcessProperty: "error" })(
      value,
    ),
  ).not.toThrow();
  expect(Schema.is(DiagnosticEnvelope)({ ...event, profile_ordinal: 0 })).toBe(
    false,
  );
});

import { expect, it } from "@effect/vitest";
import { DiagnosticSummaries } from "../src/diagnostic-summary.ts";

it("keeps unfinished spans and all outcomes with explicit histogram bounds", () => {
  const summaries = new DiagnosticSummaries();
  for (const duration of [1, 20, 300, 6000]) {
    summaries.start("handler", "I07");
    summaries.finish(
      "handler",
      "I07",
      duration,
      duration === 20 ? "failed" : "completed",
    );
  }
  summaries.start("handler", "I07");
  expect(summaries.snapshot()).toEqual({
    unit: "span",
    quantiles: "histogram_upper_bound",
    outcome_order: [
      "completed",
      "refused",
      "conflicted",
      "failed",
      "cancelled",
    ],
    histogram: {
      upper_ms: [1, 4, 8, 16, 20, 50, 100, 300, 1000, 5000, null],
      counts: [1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 1],
    },
    stages: [
      {
        key: "handler",
        started: 5,
        finished: 4,
        unfinished: 1,
        p50_ms: 20,
        p90_ms: null,
        p99_ms: null,
        outcomes: [3, 0, 0, 1, 0],
      },
    ],
    categories: [
      {
        key: "I07",
        started: 5,
        finished: 4,
        unfinished: 1,
        p50_ms: 20,
        p90_ms: null,
        p99_ms: null,
        outcomes: [3, 0, 0, 1, 0],
      },
    ],
  });
});

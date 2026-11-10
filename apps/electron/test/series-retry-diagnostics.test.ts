import { expect, it } from "@effect/vitest";
import { seriesRetryFailureMessage } from "../scripts/series-retry-diagnostics.ts";

it("retains the original Occurrence, actual HTTP response and timestamped failure samples", async () => {
  let reads = 0;
  const message = await seriesRetryFailureMessage({
    occurrenceId: "original-occurrence",
    readStatus: async () => (++reads === 1 ? "open" : "cancelled"),
    http: () => ({ status: 200, body: '{"task":{"status":"cancelled"}}' }),
  });
  expect(reads).toBe(100);
  expect(message).toContain('"occurrence_id": "original-occurrence"');
  expect(message).toContain('"status": 200');
  expect(message).toContain(
    '"body": "{\\"task\\":{\\"status\\":\\"cancelled\\"}}"',
  );
  const detail = JSON.parse(message.slice(message.indexOf("\n") + 1));
  expect(
    detail.status_samples.map((sample: { status: string }) => sample.status),
  ).toEqual(["open", ...Array.from({ length: 99 }, () => "cancelled")]);
  expect(
    detail.status_samples.every(
      (sample: { timestamp: string; elapsed_ms: number }) =>
        Number.isFinite(Date.parse(sample.timestamp)) && sample.elapsed_ms >= 0,
    ),
  ).toBe(true);
}, 10000);

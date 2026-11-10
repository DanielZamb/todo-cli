export async function seriesRetryFailureMessage({
  occurrenceId,
  readStatus,
  http,
}: {
  occurrenceId: string;
  readStatus: () => Promise<unknown>;
  http: () => unknown;
}) {
  const started = performance.now();
  const failedAt = new Date().toISOString();
  const samples: unknown[] = [];
  for (let index = 1; index <= 100; index++) {
    await new Promise((resolve) =>
      setTimeout(
        resolve,
        Math.max(0, started + index * 50 - performance.now()),
      ),
    );
    const timestamp = new Date().toISOString();
    try {
      samples.push({
        timestamp,
        elapsed_ms: performance.now() - started,
        status: await readStatus(),
      });
    } catch (error) {
      samples.push({ timestamp, error: String(error) });
    }
  }
  return `Series Skip Retry immediate assertion failed.\n${JSON.stringify(
    {
      occurrence_id: occurrenceId,
      failed_at: failedAt,
      http: http(),
      status_samples: samples,
    },
    null,
    2,
  )}`;
}

export const recordingMethods = [
  "ingest",
  "runs",
  "show",
  "export",
  "compare",
  "flush",
  "close",
] as const;
export type RecordingMethod = (typeof recordingMethods)[number];
export type RecordingServiceSample = { at: number; ms: number };
export const recordingRateWindowMs = 60000;
export const recordingRateSampleLimit = 8;
export class RecordingServiceRates extends Map<
  RecordingMethod,
  RecordingServiceSample[]
> {
  constructor(private readonly now: () => number = () => performance.now()) {
    super();
  }
  private fresh(method: RecordingMethod, now: number) {
    const samples = (this.get(method) ?? []).filter(
      (sample) => now - sample.at < recordingRateWindowMs,
    );
    if (samples.length) this.set(method, samples);
    else this.delete(method);
    return samples;
  }
  observe(method: RecordingMethod, ms: number) {
    const now = this.now();
    this.set(method, [
      ...this.fresh(method, now).slice(1 - recordingRateSampleLimit),
      { at: now, ms },
    ]);
  }
  estimate(method: RecordingMethod, floor: number) {
    return (
      1.5 *
      Math.max(
        floor,
        ...this.fresh(method, this.now()).map((sample) => sample.ms),
      )
    );
  }
}

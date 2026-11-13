import { Effect } from "effect";

export class StreamWake {
  private revision = 0;
  private readonly waiters = new Set<() => void>();
  // The fallback bounds every wait; tests pass Effect.never to prove a
  // signal alone wakes the streams.
  constructor(
    private readonly fallback: Effect.Effect<void> = Effect.sleep("250 millis"),
  ) {}

  get version() {
    return this.revision;
  }

  get waiting() {
    return this.waiters.size;
  }

  readonly signal = () => {
    this.revision++;
    const waiting = [...this.waiters];
    this.waiters.clear();
    for (const resume of waiting) resume();
  };

  readonly wait = (seen: number) =>
    Effect.raceFirst(
      Effect.callback<void>((resume) => {
        if (seen !== this.revision) {
          resume(Effect.void);
          return;
        }
        const wake = () => resume(Effect.void);
        this.waiters.add(wake);
        return Effect.sync(() => this.waiters.delete(wake));
      }),
      this.fallback,
    );
}

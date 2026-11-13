import { Effect } from "effect";

export class StreamWake {
  private revision = 0;
  private readonly waiters = new Set<() => void>();

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
      Effect.sleep("250 millis"),
    );
}

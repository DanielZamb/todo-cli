import { Effect } from "effect";

export class OutsideCommit {
  private readonly waiters = new Set<() => void>();
  private generation = 0;
  constructor(private readonly fallback = Effect.sleep("250 millis")) {}

  readonly notify = () => {
    this.generation++;
    for (const wake of [...this.waiters]) wake();
  };

  readonly waiter = () => {
    let observed = this.generation;
    return Effect.suspend(() => {
      const wait =
        observed !== this.generation
          ? Effect.void
          : Effect.raceFirst(
              this.fallback,
              Effect.callback<void>((resume) => {
                if (observed !== this.generation) {
                  resume(Effect.void);
                  return;
                }
                const wake = () => resume(Effect.void);
                this.waiters.add(wake);
                return Effect.sync(() => this.waiters.delete(wake));
              }),
            );
      return wait.pipe(
        Effect.andThen(
          Effect.sync(() => {
            observed = this.generation;
          }),
        ),
      );
    });
  };
}

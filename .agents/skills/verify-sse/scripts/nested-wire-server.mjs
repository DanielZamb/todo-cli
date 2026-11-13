import { Effect, Schema } from "effect";
import { ProfileId } from "../../../../packages/domain/src/index.ts";
import { StoreError } from "../../../../packages/domain/src/store/error.ts";
import { compose, compositionLeaves } from "../../../../apps/server/test/fixtures/stream-wake-compositions.ts";

let pending = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  pending += chunk;
  let end;
  while ((end = pending.indexOf("\n")) >= 0) {
    const input = JSON.parse(pending.slice(0, end));
    pending = pending.slice(end + 1);
    const store = globalThis.streamWakeProbeStore;
    if (input.path) {
      const wake = globalThis.streamWakeProbeWake;
      const before = wake.version;
      const checks = [];
      const check = () => checks.push(wake.version - before);
      const fixture = { credential: input.credential, profile: Effect.runSync(store.profiles()).find((profile) => profile.id === "work"), task: Effect.runSync(store.tasks()).find((task) => task.title === "Reminder inside rollback") };
      const leaf = compositionLeaves.find((leaf) => leaf.name === input.leaf);
      if (!leaf) throw new Error(`Unknown composition leaf ${input.leaf}`);
      const operation = Effect.gen(function* () {
        yield* store.scheduled.runDue();
        check();
        yield* Effect.exit(Effect.suspend(() => leaf.run(store, fixture)));
        check();
        if (input.rollback) return yield* Effect.fail(new StoreError("enclosing rollback"));
      });
      Effect.runPromise(Effect.exit(compose(store, fixture, input.path, operation, check))).then((result) => process.stdout.write(`CONTROL ${result._tag} ${JSON.stringify({ before, after: wake.version, checks })}\n`));
      continue;
    }
    const operation = () => Effect.gen(function* () {
      yield* store.scheduled.runDue();
      if (input.boundary === "sync-snapshot") store.snapshots.createSync("Provisional Snapshot");
      return yield* Effect.fail(new StoreError("enclosing rollback"));
    });
    const effect = input.boundary === "readSnapshot"
      ? store.auth.readSnapshot(operation)
      : store.auth.mutate({ credential: input.credential, profile: Schema.decodeUnknownSync(ProfileId)("work") }, operation);
    Effect.runPromise(Effect.exit(effect)).then((result) => process.stdout.write(`CONTROL ${result._tag}\n`));
  }
});
await import("../../../../apps/server/src/main.ts");

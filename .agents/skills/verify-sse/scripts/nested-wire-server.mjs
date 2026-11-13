import { Effect, Schema } from "effect";
import { ProfileId } from "../../../../packages/domain/src/index.ts";
import { StoreError } from "../../../../packages/domain/src/store/error.ts";

let pending = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  pending += chunk;
  let end;
  while ((end = pending.indexOf("\n")) >= 0) {
    const input = JSON.parse(pending.slice(0, end));
    pending = pending.slice(end + 1);
    const store = globalThis.streamWakeProbeStore;
    Effect.runPromise(Effect.exit(store.auth.mutate({
      credential: input.credential,
      profile: Schema.decodeUnknownSync(ProfileId)("work"),
    }, () => Effect.gen(function* () {
      yield* store.scheduled.runDue();
      return yield* Effect.fail(new StoreError("enclosing rollback"));
    })))).then((result) => process.stdout.write(`CONTROL ${result._tag}\n`));
  }
});
await import("../../../../apps/server/src/main.ts");

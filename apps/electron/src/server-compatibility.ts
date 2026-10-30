import { BUILD_ID, CONTRACT_ID } from "@todo/api";
import { Effect, Schema } from "effect";

const Health = Schema.Struct({
  service: Schema.Literal("todo-server"),
  contract: Schema.optionalKey(Schema.String),
  build: Schema.optionalKey(Schema.String),
});
export const OutdatedServer = Schema.TaggedStruct("outdatedServer", {
  serverBuild: Schema.String,
  appBuild: Schema.String,
});
export type OutdatedServer = typeof OutdatedServer.Type;
export const checkServer = (origin: string) =>
  Effect.tryPromise(async () => {
    const response = await fetch(new URL("/health", origin), {
      signal: AbortSignal.timeout(5000),
      cache: "no-store",
    });
    if (!response.ok)
      throw new Error(`Todo server health failed: HTTP ${response.status}`);
    const health = Schema.decodeUnknownSync(Health)(await response.json());
    return health.contract === CONTRACT_ID
      ? null
      : ({
          _tag: "outdatedServer",
          serverBuild: health.build ?? "unknown",
          appBuild: BUILD_ID,
        } satisfies OutdatedServer);
  });

export function serverCompatibility(origin: string) {
  let outdated: OutdatedServer | null = null;
  return {
    get outdated() {
      return outdated;
    },
    check: () =>
      checkServer(origin).pipe(
        Effect.tap((value) =>
          Effect.sync(() => {
            outdated = value;
          }),
        ),
      ),
  };
}

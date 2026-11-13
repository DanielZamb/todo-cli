import { Database } from "bun:sqlite";
import type { OperationStore } from "@todo/domain/store";
import { Effect } from "effect";
import type { StreamWake } from "./stream-wake.ts";

type Finished = (changed: () => boolean) => void;

const after = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
  finished: Finished,
  changed: (value: A) => boolean,
) =>
  effect.pipe(
    Effect.onExit((exit) =>
      Effect.sync(() =>
        finished(() => exit._tag === "Failure" || changed(exit.value)),
      ),
    ),
  );

type Policy<T> = Record<keyof T, "read" | "write">;

const observe = <T extends object>(
  target: T,
  policy: Policy<T>,
  finished: Finished,
  overrides: Partial<T> = {},
): T =>
  new Proxy(target, {
    get(target, key, receiver) {
      if (Object.hasOwn(overrides, key)) return Reflect.get(overrides, key);
      const value: unknown = Reflect.get(target, key, receiver);
      if (typeof value !== "function") return value;
      const writes = Reflect.get(policy, key) === "write";
      return (...args: unknown[]) => {
        let result: unknown;
        try {
          result = Reflect.apply(value, target, args);
        } catch (cause) {
          finished(() => false);
          throw cause;
        }
        if (Effect.isEffect(result))
          return result.pipe(
            Effect.onExit(() => Effect.sync(() => finished(() => writes))),
          );
        finished(() => writes);
        return result;
      };
    },
  });

export const streamWakeStore = (store: OperationStore, wake: StreamWake) => {
  const connection: unknown = Reflect.get(store, "db");
  if (!(connection instanceof Database))
    throw new Error("Expected the store's Bun SQLite connection");
  let pending = false;
  const finished: Finished = (changed) => {
    try {
      pending = changed() || pending;
      const inside = connection.inTransaction;
      if (!inside && pending) {
        pending = false;
        wake.signal();
      }
    } catch {}
  };
  const scheduled = observe(
    store.scheduled,
    {
      pendingReminders: "read",
      nextAt: "read",
      runDue: "write",
    },
    finished,
    {
      runDue: () =>
        after(
          store.scheduled.runDue(),
          finished,
          ({ woken, reminders }) => woken > 0 || reminders > 0,
        ),
    },
  );
  const auth = observe(
    store.auth,
    {
      setupOwner: "write",
      resetPassphrase: "write",
      signIn: "write",
      authenticate: "read",
      resolveProfile: "read",
      requireOwner: "read",
      issueToken: "write",
      nextExpiry: "read",
      cleanupExpired: "write",
      listTokens: "read",
      revokeToken: "write",
      signOut: "write",
      deleteProfile: "write",
      readSnapshot: "read",
      profiles: "read",
      read: "read",
      append: "write",
      startSeries: "write",
      finishTask: "write",
      mutate: "write",
      revert: "write",
    },
    finished,
    {
      cleanupExpired: () =>
        after(store.auth.cleanupExpired(), finished, (count) => count > 0),
    },
  );
  const snapshots = observe(
    store.snapshots,
    {
      directory: "read",
      persistent: "read",
      listSync: "read",
      createSync: "write",
      create: "write",
      list: "read",
      show: "read",
      discardSync: "write",
      generationSync: "read",
      generation: "read",
      purgedIdsSync: "read",
      redactAllSync: "write",
      restore: "write",
      prune: "write",
      runDaily: "write",
    },
    finished,
    {
      runDaily: () =>
        after(
          store.snapshots.runDaily(),
          finished,
          (snapshot) => snapshot !== null,
        ),
    },
  );
  const observed = observe(
    store,
    {
      searchWords: "read",
      auth: "read",
      scheduled: "read",
      diagnostics: "read",
      attachmentRoot: "read",
      isPreview: "read",
      snapshots: "read",
      close: "read",
      settings: "read",
      ensureProfile: "write",
      putProfile: "write",
      profiles: "read",
      projects: "read",
      tags: "read",
      tasks: "read",
      series: "read",
      dependencies: "read",
      graph: "read",
      fork: "read",
      history: "read",
      searchCacheEvents: "read",
      append: "write",
      move: "write",
      startSeries: "write",
      finishTask: "write",
      reject: "write",
      takeSnapshot: "write",
      rebuild: "write",
      revert: "write",
    },
    finished,
  );
  return new Proxy(observed, {
    get(target, key, receiver) {
      if (key === "auth") return auth;
      if (key === "snapshots") return snapshots;
      if (key === "scheduled") return scheduled;
      return Reflect.get(target, key, receiver);
    },
  });
};

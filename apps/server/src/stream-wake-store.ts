import type { OperationStore } from "@todo/domain/store";
import { Context, Effect } from "effect";
import type { StreamWake } from "./stream-wake.ts";

const activeWrite = Context.Reference<StreamWake | undefined>(
  "todo/server/active-stream-write",
  {
    defaultValue: () => undefined,
  },
);

const afterWrite = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
  wake: StreamWake,
) =>
  Effect.flatMap(activeWrite, (active) =>
    active === wake
      ? effect
      : effect.pipe(
          Effect.provideService(activeWrite, wake),
          Effect.ensuring(Effect.sync(wake.signal)),
        ),
  );

type Policy<T> = Record<keyof T, "read" | "write">;

const observe = <T extends object>(
  target: T,
  policy: Policy<T>,
  wake: StreamWake,
  overrides: Partial<T> = {},
): T =>
  new Proxy(target, {
    get(target, key, receiver) {
      if (Object.hasOwn(overrides, key)) return Reflect.get(overrides, key);
      const value: unknown = Reflect.get(target, key, receiver);
      if (typeof value !== "function" || Reflect.get(policy, key) !== "write")
        return value;
      return (...args: unknown[]) => {
        const result: unknown = Reflect.apply(value, target, args);
        if (Effect.isEffect(result)) return afterWrite(result, wake);
        wake.signal();
        return result;
      };
    },
  });

export const streamWakeStore = (store: OperationStore, wake: StreamWake) => {
  const after = <A, E, R>(
    effect: Effect.Effect<A, E, R>,
    changed: (value: A) => boolean,
  ) =>
    effect.pipe(
      Effect.onExit((exit) =>
        Effect.sync(() => {
          if (exit._tag === "Failure" || changed(exit.value)) wake.signal();
        }),
      ),
    );
  const scheduled = observe(
    store.scheduled,
    {
      pendingReminders: "read",
      nextAt: "read",
      runDue: "write",
    },
    wake,
    {
      runDue: () =>
        after(
          store.scheduled.runDue(),
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
    wake,
    {
      cleanupExpired: () =>
        after(store.auth.cleanupExpired(), (count) => count > 0),
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
    wake,
    {
      runDaily: () =>
        after(store.snapshots.runDaily(), (snapshot) => snapshot !== null),
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
    wake,
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

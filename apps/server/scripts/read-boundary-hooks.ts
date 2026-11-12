import type { OperationStore } from "@todo/domain/store";
import { Effect } from "effect";

type Raw = {
  params?: Record<string, unknown>;
  query?: Record<string, unknown>;
  payload?: Record<string, unknown>;
  headers?: Record<string, unknown>;
};
const active = new Set<Raw>();
const changed = new WeakSet<Raw>();
const mode = process.env.READ_BOUNDARY_MODE ?? "off";
const counters = {
  checks: 0,
  mutations: 0,
  ports: 0,
  overlap: 0,
  waitsOutsideLease: 0,
};
const fields = new Map<string, number>();
const routes = new Map<string, number>();
const names = new WeakMap<Raw, string>();
const mutate = () => {
  for (const raw of active) {
    if (changed.has(raw)) continue;
    changed.add(raw);
    for (const [group, value] of Object.entries(raw)) {
      if (value === null || typeof value !== "object") continue;
      for (const [key, old] of Object.entries(value)) {
        if (typeof old !== "string") continue;
        const replacement =
          key === "profile"
            ? old === "work"
              ? "personal"
              : "work"
            : key === "task"
              ? "foreign-task"
              : key === "attachment"
                ? "foreign-image"
                : key === "snapshot"
                  ? "00000000-0000-4000-8000-000000000000"
                  : key === "prefix"
                    ? "ff"
                    : key === "text"
                      ? "Foreign"
                      : key === "view"
                        ? "scheduled"
                        : key === "now"
                          ? "2027-01-01T00:00:00Z"
                          : key === "include_projects"
                            ? old === "true"
                              ? "false"
                              : "true"
                            : group === "headers"
                              ? "mutated"
                              : old;
        if (replacement !== old) {
          if (
            !Reflect.set(value, key, replacement) ||
            Reflect.get(value, key) !== replacement
          )
            throw new Error("Mutation hook did not change the raw field");
          const field = group + "." + key;
          fields.set(field, (fields.get(field) ?? 0) + 1);
          const route = names.get(raw) ?? "unknown";
          routes.set(route, (routes.get(route) ?? 0) + 1);
          counters.mutations++;
        }
      }
    }
  }
};
export const boundaryHandlers = <A>(
  handlers: Record<string, (raw: Raw) => Effect.Effect<A, unknown, unknown>>,
) =>
  Object.fromEntries(
    Object.entries(handlers).map(([name, handler]) => [
      name,
      (raw: Raw = {}) =>
        Effect.gen(function* () {
          names.set(
            raw,
            name +
              ":" +
              Object.keys(raw.params ?? {})
                .sort()
                .join(","),
          );
          active.add(raw);
          if (active.size > 1) counters.overlap++;
          return yield* handler(raw).pipe(
            Effect.ensuring(Effect.sync(() => active.delete(raw))),
          );
        }),
    ]),
  );

export const boundaryAfterCheck = () => {
  counters.ports++;
  if (mode === "port") mutate();
};

export const installBoundaryHooks = (store: OperationStore) => {
  const used = store.diagnostics.credentialUsed.bind(store.diagnostics);
  Object.defineProperty(store.diagnostics, "credentialUsed", {
    value: (...args: Parameters<typeof used>) => {
      used(...args);
      counters.checks++;
      if (mode === "credential") mutate();
    },
    configurable: true,
  });
  const graphRead = store.graphRead.bind(store);
  Object.defineProperty(store, "graphRead", {
    configurable: true,
    value: (read: Parameters<typeof graphRead>[0]) =>
      graphRead(
        mode === "authority"
          ? Object.assign(structuredClone(read), { profile: "personal" })
          : read,
      ),
  });
  const graph = store.graph.bind(store);
  const withRead = store.auth.withRead.bind(store.auth);
  if (process.env.READ_BOUNDARY_INTERLEAVE === "1")
    Object.defineProperty(store.auth, "withRead", {
      configurable: true,
      value: (...args: Parameters<typeof withRead>) =>
        withRead(...args).pipe(
          Effect.tap(() =>
            Effect.gen(function* () {
              if (Reflect.get(store, "db").inTransaction)
                throw new Error(
                  "Interleaving hook must run after the read lease",
                );
              counters.waitsOutsideLease++;
              yield* Effect.sleep("20 millis");
            }),
          ),
        ),
    });
  Object.defineProperty(store, "graph", {
    value: (...args: Parameters<typeof graph>) =>
      Effect.gen(function* () {
        counters.ports++;
        if (mode === "port") mutate();
        return yield* graph(...args);
      }),
    configurable: true,
  });
  const show = store.snapshots.show.bind(store.snapshots);
  Object.defineProperty(store.snapshots, "show", {
    value: (...args: Parameters<typeof show>) =>
      Effect.suspend(() => {
        counters.ports++;
        if (mode === "port") mutate();
        return show(...args);
      }),
    configurable: true,
  });
  const changes = store.changesRead.bind(store);
  Object.defineProperty(store, "changesRead", {
    value: (...args: Parameters<typeof changes>) =>
      Effect.suspend(() => {
        counters.ports++;
        if (mode === "port") mutate();
        return changes(...args);
      }),
    configurable: true,
  });
  process.on("SIGTERM", () =>
    process.stderr.write(
      "BOUNDARY_COUNTERS " +
        JSON.stringify({
          ...counters,
          fields: Object.fromEntries(fields),
          routes: Object.fromEntries(routes),
        }) +
        "\n",
    ),
  );
};

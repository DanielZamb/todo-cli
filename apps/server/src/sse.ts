import {
  BadRequest,
  BearerCredential,
  type ChangeEvent,
  TodoApi,
} from "@todo/api";
import type { OperationStore } from "@todo/domain/store";
import { Effect, Stream } from "effect";
import { HttpApiBuilder, HttpApiSchema } from "effect/http-api";
import { translate } from "./errors.ts";
import type { StreamWake } from "./stream-wake.ts";

export const changesLayer = (store: OperationStore, wake: StreamWake) =>
  HttpApiBuilder.group(TodoApi, "changes", (handlers) =>
    handlers.handleAll({
      stream: ({ params, headers }) =>
        Effect.gen(function* () {
          const credential = yield* BearerCredential;
          const header = headers["last-event-id"];
          const after = header === undefined ? 0 : Number(header);
          if (
            (header !== undefined && !/^(0|[1-9][0-9]*)$/.test(header)) ||
            !Number.isSafeInteger(after)
          )
            return yield* new BadRequest({ message: "Invalid Last-Event-ID" });
          const authorize = translate(
            store.auth.authenticate({
              credential,
              profile: params.profile,
              access: "read",
            }),
          );
          yield* authorize;
          const initial = yield* translate(store.snapshots.generation());
          const reset =
            after > initial.seq ||
            (initial.generation !== "initial" &&
              headers["x-todo-generation"] !== initial.generation);
          const operations = Stream.unfold(
            {
              cursor: reset ? initial.restore_seq : after,
              generation: initial.generation,
              wakeVersion: wake.version,
            },
            (state) =>
              Effect.gen(function* () {
                yield* wake.wait(state.wakeVersion);
                const wakeVersion = wake.version;
                const current = yield* translate(store.snapshots.generation());
                const events: Array<typeof ChangeEvent.Type> = [];
                if (current.generation !== state.generation) {
                  events.push({
                    event: "reload",
                    data: {
                      generation: current.generation,
                      seq: current.restore_seq,
                    },
                  });
                  return [
                    events,
                    {
                      cursor: current.restore_seq,
                      generation: current.generation,
                      wakeVersion,
                    },
                  ] as const;
                }
                const entries = yield* translate(store.history(state.cursor));
                let cursor = state.cursor;
                for (const entry of entries) {
                  cursor = entry.seq;
                  if (
                    entry.outcome === "committed" &&
                    entry.profile === params.profile
                  )
                    events.push({
                      id: String(entry.seq),
                      event: "operation",
                      data: entry,
                    });
                }
                if (
                  !events.some(
                    (event) =>
                      event.event === "operation" &&
                      event.data.event.kind === "ProfileDeleted",
                  )
                )
                  yield* authorize;
                return [events, { ...state, cursor, wakeVersion }] as const;
              }),
          ).pipe(Stream.flattenIterable);
          const greeting: Array<typeof ChangeEvent.Type> = [
            { event: "ready", data: null },
            ...(reset
              ? [
                  {
                    event: "reload",
                    data: {
                      generation: initial.generation,
                      seq: initial.restore_seq,
                    },
                  } satisfies typeof ChangeEvent.Type,
                ]
              : []),
          ];
          return HttpApiSchema.withHeaders({
            headers: { "cache-control": "no-store" },
            body: Stream.unwrap(
              Effect.gen(function* () {
                const kind = headers["x-todo-client"];
                const id = yield* Effect.acquireRelease(
                  Effect.sync(() =>
                    store.diagnostics.connect(
                      params.profile,
                      kind ?? "unknown",
                      reset ? undefined : header,
                    ),
                  ),
                  (id) => Effect.sync(() => store.diagnostics.disconnect(id)),
                );
                return Stream.concat(
                  Stream.fromIterable(greeting),
                  operations,
                ).pipe(
                  Stream.tap((event) =>
                    Effect.sync(() => {
                      if ("id" in event)
                        store.diagnostics.delivered(id, event.id);
                    }),
                  ),
                );
              }),
            ),
          });
        }),
    }),
  );

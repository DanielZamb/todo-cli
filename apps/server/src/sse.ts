import { randomUUID } from "node:crypto";
import {
  BadRequest,
  BearerCredential,
  type ChangeEvent,
  TodoApi,
} from "@todo/api";
import {
  DiagnosticFrameId,
  DiagnosticStreamId,
  diagnosticContext,
  observeDiagnostic,
} from "@todo/domain";
import type { OperationStore } from "@todo/domain/store";
import { Effect, Schema, Stream } from "effect";
import { HttpApiBuilder, HttpApiSchema } from "effect/http-api";
import { translate } from "./errors.ts";

export const changesLayer = (store: OperationStore) =>
  HttpApiBuilder.group(TodoApi, "changes", (handlers) =>
    handlers.handleAll({
      stream: ({ params, headers }) =>
        Effect.gen(function* () {
          const credential = yield* BearerCredential;
          const scope = diagnosticContext();
          const profiler = scope?.recorder ?? store.diagnostics.profiler;
          const streamId = observeDiagnostic(profiler, () =>
            Schema.decodeUnknownSync(DiagnosticStreamId)(randomUUID()),
          );
          let generation = "initial";
          const observe = (event: typeof ChangeEvent.Type) =>
            observeDiagnostic(profiler, () => {
              if (
                event.event !== "operation" ||
                !scope ||
                !streamId ||
                !profiler.enabled
              )
                return;
              const frame_id = Schema.decodeUnknownSync(DiagnosticFrameId)(
                randomUUID(),
              );
              const commit_receipt = profiler.commitReceipt(
                event.data.seq,
                generation,
              );
              profiler.delivery(
                scope.envelope,
                streamId,
                frame_id,
                commit_receipt,
                "commit_seen",
                null,
              );
              profiler.awaitTransport(event.data.seq, {
                ...scope.envelope,
                name: "stream.delivery",
                stream_id: streamId,
                frame_id,
                commit_receipt,
              });
            });
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
          generation = initial.generation;
          const reset =
            after > initial.seq ||
            (initial.generation !== "initial" &&
              headers["x-todo-generation"] !== initial.generation);
          const operations = Stream.unfold(
            {
              cursor: reset ? initial.restore_seq : after,
              generation: initial.generation,
            },
            (state) =>
              Effect.gen(function* () {
                yield* Effect.sleep("250 millis");
                const current = yield* translate(store.snapshots.generation());
                generation = current.generation;
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
                return [events, { ...state, cursor }] as const;
              }),
          ).pipe(
            Stream.flattenIterable,
            Stream.tap((event) => Effect.sync(() => observe(event))),
          );
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
                  Effect.sync(
                    () =>
                      observeDiagnostic(profiler, () =>
                        store.diagnostics.connect(
                          params.profile,
                          kind ?? "unknown",
                          reset ? undefined : header,
                        ),
                      ) ?? null,
                  ),
                  (id) =>
                    Effect.sync(() => {
                      observeDiagnostic(profiler, () =>
                        store.diagnostics.disconnect(id),
                      );
                      if (scope?.envelope.request_id)
                        observeDiagnostic(profiler, () =>
                          profiler.releaseStream(
                            scope.envelope.request_id ?? "",
                          ),
                        );
                    }),
                );
                return Stream.concat(
                  Stream.fromIterable(greeting),
                  operations,
                ).pipe(
                  Stream.tap((event) =>
                    Effect.sync(() => {
                      if ("id" in event)
                        observeDiagnostic(profiler, () =>
                          store.diagnostics.delivered(id, event.id),
                        );
                    }),
                  ),
                );
              }),
            ),
          });
        }),
    }),
  );

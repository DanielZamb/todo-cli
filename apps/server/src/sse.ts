import { randomUUID } from "node:crypto";
import {
  BadRequest,
  BearerCredential,
  type ChangeEvent,
  TodoApi,
} from "@todo/api";
import { DiagnosticClient, DiagnosticFrameId, DiagnosticStreamId, diagnosticContext, observeDiagnostic } from "@todo/domain";
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
          const read = yield* translate(
            store.auth.subscribe(
              { credential, profile: params.profile },
              Schema.Struct({
                after: Schema.Number,
                header: Schema.optionalKey(Schema.String),
                generation: Schema.optionalKey(Schema.String),
                kind: Schema.optionalKey(DiagnosticClient.fields.kind),
              }),
              {
                after,
                ...(header === undefined ? {} : { header }),
                ...(headers["x-todo-generation"] === undefined
                  ? {}
                  : { generation: headers["x-todo-generation"] }),
                ...(headers["x-todo-client"] === undefined
                  ? {}
                  : { kind: headers["x-todo-client"] }),
              },
            ),
          );
          const authority = yield* translate(
            store.auth.checkRead(read, "read"),
          );
          const authorize = translate(store.auth.recheckRead(read));
          const initial = yield* translate(store.snapshots.generation());
          generation = initial.generation;
          const reset =
            authority.fields.after > initial.seq ||
            (initial.generation !== "initial" &&
              authority.fields.generation !== initial.generation);
          const operations = Stream.unfold(
            {
              cursor: reset ? initial.restore_seq : authority.fields.after,
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
                const { entries, cursor } = yield* translate(
                  store.changesRead(read, state.cursor),
                );
                for (const entry of entries) {
                  if (
                    entry.outcome === "committed" &&
                    entry.profile === authority.profile
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
                const kind = authority.fields.kind;
                const id = yield* Effect.acquireRelease(
                  Effect.sync(() =>
                    store.diagnostics.connect(
                      authority.profile,
                      kind ?? "unknown",
                      reset ? undefined : authority.fields.header,
                    ),
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

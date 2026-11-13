import { randomUUID } from "node:crypto";
import {
  BadRequest,
  BearerCredential,
  type ChangeEvent,
  TodoApi,
} from "@todo/api";
import {
  AuthError,
  DiagnosticClient,
  DiagnosticFrameId,
  DiagnosticStreamId,
  diagnosticContext,
  observeDiagnostic,
  ProfileId,
} from "@todo/domain";
import { type OperationStore, StoreError } from "@todo/domain/store";
import { Effect, Schema, Stream } from "effect";
import { HttpApiBuilder, HttpApiSchema } from "effect/http-api";
import { translate } from "./errors.ts";
import type { StreamReads } from "./raw-store-reads.ts";
import type { StreamWake } from "./stream-wake.ts";

type Connection = { active: boolean };
type Cursor = { cursor: number; generation: string };
// Every pass returns all four fields explicitly, never by spreading the
// previous state: a missing wakeVersion would otherwise keep the version from
// when the stream opened, and every later wait would return at once.
type PassState = {
  readonly cursor: number;
  readonly generation: string;
  readonly wakeVersion: number;
  readonly terminal: boolean;
};
class TerminalPermission {
  #used = false;
  readonly #connection: Connection;
  readonly #state: Cursor;
  readonly #profile: string;
  readonly #read: Parameters<OperationStore["terminalChangesRead"]>[0];
  constructor(
    connection: Connection,
    state: Cursor,
    profile: string,
    read: Parameters<OperationStore["terminalChangesRead"]>[0],
  ) {
    if (new.target !== TerminalPermission)
      throw new StoreError(new Error("Invalid terminal permission"));
    this.#connection = connection;
    this.#state = Object.freeze({ ...state });
    this.#profile = profile;
    this.#read = read;
    Object.freeze(this);
  }
  consume(connection: Connection, state: Cursor, profile: string) {
    if (
      !this.#connection.active ||
      this.#used ||
      connection !== this.#connection ||
      state.cursor !== this.#state.cursor ||
      state.generation !== this.#state.generation ||
      profile !== this.#profile
    )
      throw new StoreError(new Error("Invalid terminal permission"));
    this.#used = true;
    return this.#read;
  }
}
Object.freeze(TerminalPermission.prototype);
Object.freeze(TerminalPermission);

export const changesLayer = (store: StreamReads, wake: StreamWake) =>
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
          const { subscription, initial } = yield* translate(
            store.auth.withRead(
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
              (read) =>
                Effect.gen(function* () {
                  const selection = yield* store.auth.checkRead(read, "read");
                  const initial = yield* store.snapshots.generation();
                  return {
                    subscription: {
                      credential: selection.credential,
                      requested: String(selection.profile),
                      fields: selection.fields,
                    },
                    initial,
                  };
                }),
              "authenticate",
              (selection) =>
                Effect.succeed({
                  subscription: {
                    credential: selection.credential,
                    requested: selection.requested,
                    fields: selection.fields,
                  },
                  initial: selection.snapshot,
                }),
            ),
          );
          generation = initial.generation;
          const connection: Connection = { active: true };
          const reset =
            subscription.fields.after > initial.seq ||
            (initial.generation !== "initial" &&
              subscription.fields.generation !== initial.generation);
          const operations = Stream.unfold(
            {
              cursor: reset ? initial.restore_seq : subscription.fields.after,
              generation: initial.generation,
              wakeVersion: wake.version,
              terminal: false,
            } satisfies PassState,
            (state: PassState) =>
              Effect.gen(function* () {
                yield* wake.wait(state.wakeVersion);
                const wakeVersion = wake.version;
                if (state.terminal) {
                  yield* translate(
                    store.auth.authenticate({
                      credential: subscription.credential,
                      profile: Schema.decodeUnknownSync(ProfileId)(
                        subscription.requested,
                      ),
                      access: "read",
                    }),
                  );
                  return yield* translate(
                    Effect.fail(new AuthError("profile_deleted")),
                  );
                }
                return yield* translate(
                  store.auth.withStreamRead(
                    {
                      credential: subscription.credential,
                      profile: Schema.decodeUnknownSync(ProfileId)(
                        subscription.requested,
                      ),
                    },
                    Schema.Struct({}),
                    {},
                    { after: state.cursor, generation: state.generation },
                    (result) =>
                      Effect.gen(function* () {
                        const current =
                          result.kind === "reload"
                            ? result.snapshot
                            : result.kind === "absent"
                              ? result.selection.snapshot
                              : yield* store.snapshots.generation();
                        generation = current.generation;
                        const events: Array<typeof ChangeEvent.Type> = [];
                        if (
                          result.kind === "reload" ||
                          current.generation !== state.generation
                        ) {
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
                              terminal: false,
                            } satisfies PassState,
                          ] as const;
                        }
                        const batch =
                          result.kind === "absent"
                            ? {
                                entries: [],
                                cursor: Math.max(state.cursor, current.seq),
                              }
                            : result.kind === "active"
                              ? yield* store.changesRead(
                                  result.read,
                                  state.cursor,
                                )
                              : yield* Effect.suspend(() => {
                                  const permission = new TerminalPermission(
                                    connection,
                                    state,
                                    subscription.requested,
                                    result.read,
                                  );
                                  return store.terminalChangesRead(
                                    permission.consume(
                                      connection,
                                      state,
                                      subscription.requested,
                                    ),
                                  );
                                });
                        for (const entry of batch.entries) {
                          if (
                            entry.outcome === "committed" &&
                            entry.profile === subscription.requested
                          )
                            events.push({
                              id: String(entry.seq),
                              event: "operation",
                              data: entry,
                            });
                        }
                        return [
                          events,
                          {
                            cursor: batch.cursor,
                            generation: state.generation,
                            wakeVersion,
                            terminal: result.kind === "terminal",
                          } satisfies PassState,
                        ] as const;
                      }),
                  ),
                );
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
                const kind = subscription.fields.kind;
                const id = yield* Effect.acquireRelease(
                  Effect.sync(
                    () =>
                      observeDiagnostic(profiler, () =>
                        store.diagnostics.connect(
                          Schema.decodeUnknownSync(ProfileId)(
                            subscription.requested,
                          ),
                          kind ?? "unknown",
                          reset ? undefined : subscription.fields.header,
                        ),
                      ) ?? null,
                  ),
                  (id) =>
                    Effect.sync(() => {
                      connection.active = false;
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

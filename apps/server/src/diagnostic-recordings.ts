import {
  BadRequest,
  BearerCredential,
  InternalError,
  TodoApi,
  Unauthorized,
} from "@todo/api";
import {
  exitStatus,
  RecordingRefusal,
  recordingLimits,
  recordingRefusalMessage,
  recordingRefusals,
  validateRecordingBatch,
} from "@todo/domain";
import type { RecordingService } from "@todo/domain/recording-service";
import type { OperationStore } from "@todo/domain/store";
import { Effect, Option, Stream } from "effect";
import { HttpServerRequest, HttpServerResponse } from "effect/http";
import { HttpApiBuilder } from "effect/http-api";
import { translate } from "./errors.ts";

const refusal = (status: number) =>
  HttpServerResponse.jsonUnsafe(
    {
      generated_at: new Date().toISOString(),
      code: status === 401 ? "unauthorized" : "forbidden",
      message: "Recordings require a direct loopback owner Session",
      ...exitStatus(3),
    },
    { status, headers: { "cache-control": "no-store" } },
  );
const safeRefusalMessage = (
  response: HttpServerResponse.HttpServerResponse,
) => {
  if (response.body._tag !== "Uint8Array") return undefined;
  try {
    return recordingRefusalMessage(
      JSON.parse(new TextDecoder().decode(response.body.body)),
    );
  } catch {
    return undefined;
  }
};
export const recordingGuard =
  (store: OperationStore) =>
  <E, R>(effect: Effect.Effect<HttpServerResponse.HttpServerResponse, E, R>) =>
    Effect.gen(function* () {
      const request = yield* HttpServerRequest.HttpServerRequest;
      if (!request.url.split("?")[0]?.startsWith("/diagnostics/profiler"))
        return yield* effect;
      const peer = Option.getOrUndefined(request.remoteAddress);
      const host = (request.headers.host ?? "").replace(/:\d+$/u, "");
      if (
        !["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(peer ?? "") ||
        !["127.0.0.1", "localhost", "[::1]"].includes(host) ||
        request.headers.forwarded ||
        request.headers["x-forwarded-for"] ||
        request.headers["x-forwarded-host"]
      )
        return refusal(403);
      const credential = (request.headers.authorization ?? "").replace(
        /^Bearer /u,
        "",
      );
      const auth = yield* translate(
        store.auth.requireOwner({ credential }),
      ).pipe(
        Effect.match({
          onSuccess: () => 0,
          onFailure: (error) =>
            "_tag" in error && error._tag === "Forbidden" ? 403 : 401,
        }),
      );
      if (auth) return refusal(auth);
      return yield* effect.pipe(
        Effect.map((response) =>
          HttpServerResponse.setHeader(
            response.status === 400
              ? HttpServerResponse.jsonUnsafe(
                  {
                    generated_at: new Date().toISOString(),
                    code: "invalid_args",
                    message:
                      safeRefusalMessage(response) ??
                      "Invalid recording request",
                    ...exitStatus(2),
                  },
                  { status: 400 },
                )
              : response,
            "cache-control",
            "no-store",
          ),
        ),
      );
    });

const admissionFailure = () =>
  new InternalError({ message: recordingRefusals.admission_storage_failure });

export const recordingRoutes = (
  recordings: RecordingService,
  store: OperationStore,
) =>
  HttpApiBuilder.group(TodoApi, "profiler", (handlers) => {
    const owner = Effect.flatMap(BearerCredential, (credential) =>
      translate(store.auth.requireOwner({ credential })).pipe(
        Effect.mapError((error) =>
          "_tag" in error
            ? error
            : new Unauthorized({ message: "Owner Session required" }),
        ),
      ),
    );
    const operation = <A>(run: () => Promise<A>) =>
      owner.pipe(
        Effect.andThen(
          Effect.tryPromise({
            try: run,
            catch: (error) =>
              new BadRequest({
                message:
                  error instanceof RecordingRefusal
                    ? error.message
                    : "Recording unavailable",
              }),
          }),
        ),
        Effect.tap(() => owner),
        Effect.tapError(() => owner),
      );
    return handlers
      .handleRaw("ingest", ({ request, query }) =>
        Effect.gen(function* () {
          yield* owner;
          const parts: Uint8Array[] = [];
          let bytes = 0;
          yield* request.stream.pipe(
            Stream.runForEach((chunk) => {
              bytes += chunk.byteLength;
              if (bytes > recordingLimits.batchBytes)
                return Effect.fail(
                  new BadRequest({
                    message: "Recording batch exceeds its byte budget",
                  }),
                );
              parts.push(chunk);
              return Effect.void;
            }),
            Effect.catch(() =>
              Effect.fail(
                new BadRequest({ message: "Invalid recording batch" }),
              ),
            ),
          );
          const batch = yield* Effect.try({
            try: () =>
              validateRecordingBatch(
                JSON.parse(Buffer.concat(parts).toString("utf8")),
              ),
            catch: () =>
              new BadRequest({ message: "Invalid recording metadata" }),
          });
          yield* owner;
          const receipt = yield* Effect.tryPromise({
            try: () => recordings.ingest(batch, query.dry_run === "true"),
            catch: (error) =>
              error instanceof RecordingRefusal &&
              error.reason !== "metadata_unavailable"
                ? new BadRequest({ message: error.message })
                : admissionFailure(),
          }).pipe(Effect.tapError(() => owner));
          yield* owner;
          if (!receipt.accepted) return yield* Effect.fail(admissionFailure());
          return receipt;
        }),
      )
      .handleAll({
        runs: ({ query }) =>
          operation(() => recordings.runs(query.cursor ?? 0)),
        show: ({ params }) => operation(() => recordings.show(params.run)),
        export: ({ params, query }) =>
          operation(() => recordings.export(params.run, query.cursor)),
        compare: ({ query }) =>
          operation(() => recordings.compare(query.before, query.after)),
      });
  });

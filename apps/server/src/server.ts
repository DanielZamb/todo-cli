import { BunHttpServer } from "@effect/platform-bun";
import {
  Authorization,
  BearerCredential,
  Conflict,
  InternalError,
  InvalidTask,
  NotFound,
  ProfileNotFound,
  TodoApi,
  Unauthorized,
  ValidationHistory,
} from "@todo/api";
import {
  ClientReads,
  ExpectedVersion,
  ProfileId,
  parseQuickAdd,
  SnapshotError,
  type Task,
  TaskId,
  type TaskMutationKind,
} from "@todo/domain";
import { AttachmentCommands } from "@todo/domain/attachments";
import {
  copyTask,
  createSeries,
  editSeries,
  moveTask,
  revertTask,
  skipOccurrence,
} from "@todo/domain/commands";
import { importTasks } from "@todo/domain/import";
import {
  type OperationStore,
  openStore,
  type TaskCommandResult,
  TaskCommands,
} from "@todo/domain/store";
import { Effect, Layer, Option, Redacted, Schema } from "effect";
import {
  HttpEffect,
  HttpRouter,
  HttpServerRequest,
  type HttpServerResponse,
} from "effect/http";
import {
  HttpApiBuilder,
  HttpApiMiddleware,
  HttpApiSchema,
  OpenApi,
} from "effect/http-api";
import { translate } from "./errors.ts";
import { scheduler } from "./scheduler.ts";
import { changesLayer } from "./sse.ts";

const taskResult = (
  result: TaskCommandResult,
): Effect.Effect<Task, NotFound | Conflict | InvalidTask> => {
  switch (result.outcome) {
    case "committed":
      return Effect.succeed(result.task);
    case "not-found":
      return Effect.fail(new NotFound({ message: "Task not found" }));
    case "rejected":
      return result.reason === "conflict"
        ? Effect.fail(new Conflict({ latest: result.latest }))
        : Effect.fail(
            new InvalidTask({
              message: result.message ?? result.reason,
              ...(result.details ? { details: result.details } : {}),
            }),
          );
  }
};

const knownRoutes = Object.keys(OpenApi.fromApi(TodoApi).paths ?? {}).map(
  (path) => ({
    path,
    pattern: new RegExp(`^${path.replace(/\{[^}]+\}/g, "[^/]+")}$`),
  }),
);
export const diagnosticsMiddleware =
  (diagnostics: OperationStore["diagnostics"]) =>
  <E, R>(
    httpEffect: Effect.Effect<HttpServerResponse.HttpServerResponse, E, R>,
  ) =>
    Effect.flatMap(HttpServerRequest.HttpServerRequest, (request) => {
      const query = request.url.indexOf("?");
      const path = query === -1 ? request.url : request.url.slice(0, query);
      const route = `${request.method} ${knownRoutes.find((value) => value.pattern.test(path))?.path ?? "unmatched"}`;
      const start = performance.now();
      HttpEffect.appendPreResponseHandlerUnsafe(request, (_, response) => {
        const end = performance.now();
        diagnostics.request(route, end - start, response.status, end);
        return Effect.succeed(response);
      });
      return httpEffect;
    });

export const serverLayer = (options: {
  readonly path: string;
  readonly port: number;
}) =>
  Layer.unwrap(
    Effect.gen(function* () {
      const store = yield* Effect.acquireRelease(
        openStore({ path: options.path }),
        (store) => Effect.orDie(store.close()),
      );
      yield* scheduler(store).pipe(Effect.forkScoped);
      const commands = new TaskCommands(store);
      const diagnostics = store.diagnostics;
      const attachments = new AttachmentCommands(store);
      const reads = new ClientReads(store);
      const ValidationHistoryLive = HttpApiMiddleware.layerSchemaErrorTransform(
        ValidationHistory,
        (error, { endpoint }) =>
          Effect.gen(function* () {
            const kinds = new Map<string, TaskMutationKind>([
              ["create", "TaskCreated"],
              ["createSeries", "TaskCreated"],
              ["edit", "TaskEdited"],
              ["editSeries", "TaskEdited"],
              ["transition", "TaskCompleted"],
              ["move", "TaskMovedOut"],
              ["copy", "TaskCreated"],
              ["revert", "TaskReverted"],
              ["skipOccurrence", "TaskCancelled"],
              ["delete", "TaskDeleted"],
              ["attach", "AttachmentAdded"],
              ["detach", "AttachmentRemoved"],
              ["labelAttachment", "TaskEdited"],
              ["uploadAttachment", "AttachmentAdded"],
            ]);
            let kind = kinds.get(endpoint.identifier);
            if (
              (error.kind === "Payload" || error.kind === "Query") &&
              kind !== undefined
            ) {
              const request = yield* HttpServerRequest.HttpServerRequest;
              const params = yield* HttpRouter.params;
              const input =
                error.kind === "Query"
                  ? Object.fromEntries(
                      new URLSearchParams(request.url.split("?")[1]),
                    )
                  : yield* request.json.pipe(
                      Effect.catch(() => request.text),
                      Effect.orDie,
                    );
              const version = Schema.decodeUnknownOption(ExpectedVersion)(
                error.kind === "Query" &&
                  typeof input === "object" &&
                  input !== null &&
                  "from_version" in input
                  ? { from_version: Number(input.from_version) }
                  : input,
              );
              if (endpoint.identifier === "transition") {
                const action = Schema.decodeUnknownOption(
                  Schema.Struct({
                    action: Schema.Literals(["complete", "cancel", "reopen"]),
                  }),
                )(input);
                if (Option.isSome(action))
                  kind =
                    action.value.action === "cancel"
                      ? "TaskCancelled"
                      : action.value.action === "reopen"
                        ? "TaskReopened"
                        : "TaskCompleted";
              }
              yield* translate(
                commands.rejectValidation(
                  {
                    credential: yield* BearerCredential,
                    profile: Schema.decodeUnknownSync(ProfileId)(
                      params.profile,
                    ),
                  },
                  {
                    kind,
                    input: { schema: error.kind },
                    ...(params.task === undefined
                      ? {}
                      : {
                          task_id: Schema.decodeUnknownSync(TaskId)(
                            params.task,
                          ),
                        }),
                    ...(Option.isNone(version)
                      ? {}
                      : { from_version: version.value.from_version }),
                  },
                ),
              );
            }
            return yield* Effect.fail(error);
          }),
      );
      const AuthorizationLive = Layer.succeed(
        Authorization,
        Authorization.of({
          bearer: (httpEffect, { credential }) =>
            Effect.provideService(
              httpEffect,
              BearerCredential,
              Redacted.value(credential),
            ),
        }),
      );
      const DiagnosticsLive = HttpApiBuilder.group(
        TodoApi,
        "diagnostics",
        (handlers) =>
          handlers.handleAll({
            snapshot: () =>
              Effect.gen(function* () {
                const body = yield* translate(
                  diagnostics.read({ credential: yield* BearerCredential }),
                );
                return HttpApiSchema.withHeaders({
                  headers: { "cache-control": "no-store" },
                  body,
                });
              }),
          }),
      ).pipe(Layer.provide(AuthorizationLive));
      const TasksLive = HttpApiBuilder.group(TodoApi, "tasks", (handlers) =>
        handlers.handleAll({
          attach: ({ params, payload }) =>
            Effect.gen(function* () {
              return yield* translate(
                attachments.attach(
                  {
                    credential: yield* BearerCredential,
                    profile: params.profile,
                    task_id: params.task,
                  },
                  payload,
                ),
              ).pipe(Effect.flatMap(taskResult));
            }),
          detach: ({ params, payload }) =>
            Effect.gen(function* () {
              return yield* translate(
                attachments.detach(
                  {
                    credential: yield* BearerCredential,
                    profile: params.profile,
                    task_id: params.task,
                  },
                  payload,
                ),
              ).pipe(Effect.flatMap(taskResult));
            }),
          labelAttachment: ({ params, payload }) =>
            Effect.gen(function* () {
              return yield* translate(
                attachments.label(
                  {
                    credential: yield* BearerCredential,
                    profile: params.profile,
                    task_id: params.task,
                  },
                  payload,
                ),
              ).pipe(Effect.flatMap(taskResult));
            }),
          uploadAttachment: ({ params, payload }) =>
            Effect.gen(function* () {
              return yield* translate(
                attachments.upload(
                  {
                    credential: yield* BearerCredential,
                    profile: params.profile,
                    task_id: params.task,
                  },
                  payload,
                ),
              ).pipe(Effect.flatMap(taskResult));
            }),
          attachmentImage: ({ params }) =>
            Effect.gen(function* () {
              const image = yield* translate(
                attachments.image(
                  {
                    credential: yield* BearerCredential,
                    profile: params.profile,
                    task_id: params.task,
                  },
                  params.attachment,
                ),
              );
              return (
                image ??
                (yield* new NotFound({ message: "Managed image not found" }))
              );
            }),
          importTasks: ({ params, payload }) =>
            Effect.gen(function* () {
              const credential = yield* BearerCredential;
              return yield* translate(
                importTasks(
                  store,
                  { credential, profile: params.profile },
                  payload,
                ),
              );
            }),
          list: ({ params, query }) =>
            Effect.gen(function* () {
              const credential = yield* BearerCredential;
              return yield* translate(
                commands.list({ credential, profile: params.profile }, query),
              );
            }),
          show: ({ params }) =>
            Effect.gen(function* () {
              const credential = yield* BearerCredential;
              const task = yield* translate(
                commands.get({
                  credential,
                  profile: params.profile,
                  task_id: params.task,
                }),
              );
              return (
                task ?? (yield* new NotFound({ message: "Task not found" }))
              );
            }),
          create: ({ params, payload }) =>
            Effect.gen(function* () {
              const credential = yield* BearerCredential;
              return yield* translate(
                commands.create(
                  { credential, profile: params.profile },
                  payload,
                ),
              ).pipe(Effect.flatMap(taskResult));
            }),
          edit: ({ params, payload }) =>
            Effect.gen(function* () {
              const credential = yield* BearerCredential;
              return yield* translate(
                commands.edit(
                  { credential, profile: params.profile, task_id: params.task },
                  payload,
                ),
              ).pipe(Effect.flatMap(taskResult));
            }),
          transition: ({ params, payload }) =>
            Effect.gen(function* () {
              const credential = yield* BearerCredential;
              return yield* translate(
                commands.transition(
                  { credential, profile: params.profile, task_id: params.task },
                  payload,
                ),
              ).pipe(Effect.flatMap(taskResult));
            }),
          move: ({ params, payload }) =>
            Effect.gen(function* () {
              const credential = yield* BearerCredential;
              return yield* translate(
                moveTask(
                  store,
                  { credential, profile: params.profile, task_id: params.task },
                  payload,
                ),
              ).pipe(Effect.flatMap(taskResult));
            }),
          copy: ({ params, payload }) =>
            Effect.gen(function* () {
              const credential = yield* BearerCredential;
              return yield* translate(
                copyTask(
                  store,
                  { credential, profile: params.profile, task_id: params.task },
                  payload,
                ),
              ).pipe(Effect.flatMap(taskResult));
            }),
          revert: ({ params, payload }) =>
            Effect.gen(function* () {
              const credential = yield* BearerCredential;
              return yield* translate(
                revertTask(
                  store,
                  { credential, profile: params.profile, task_id: params.task },
                  payload,
                ),
              ).pipe(Effect.flatMap(taskResult));
            }),
          createSeries: ({ params, payload }) =>
            Effect.gen(function* () {
              const credential = yield* BearerCredential;
              return yield* translate(
                createSeries(
                  store,
                  { credential, profile: params.profile },
                  payload,
                ),
              ).pipe(Effect.flatMap(taskResult));
            }),
          editSeries: ({ params, payload }) =>
            Effect.gen(function* () {
              const credential = yield* BearerCredential;
              return yield* translate(
                editSeries(
                  store,
                  { credential, profile: params.profile, task_id: params.task },
                  payload,
                ),
              ).pipe(Effect.flatMap(taskResult));
            }),
          skipOccurrence: ({ params, payload }) =>
            Effect.gen(function* () {
              const credential = yield* BearerCredential;
              return yield* translate(
                skipOccurrence(
                  store,
                  { credential, profile: params.profile, task_id: params.task },
                  payload,
                ),
              ).pipe(Effect.flatMap(taskResult));
            }),
          delete: ({ params, query }) =>
            Effect.gen(function* () {
              const credential = yield* BearerCredential;
              return yield* translate(
                commands.delete(
                  { credential, profile: params.profile, task_id: params.task },
                  query,
                ),
              ).pipe(Effect.flatMap(taskResult));
            }),
        }),
      ).pipe(
        Layer.provide(ValidationHistoryLive),
        Layer.provide(AuthorizationLive),
      );
      const ReadsLive = HttpApiBuilder.group(TodoApi, "reads", (handlers) =>
        handlers.handleAll({
          deleteProfile: ({ params, payload }) =>
            Effect.gen(function* () {
              const result = yield* translate(
                store.auth.deleteProfile({
                  credential: yield* BearerCredential,
                  profile: params.profile,
                  options: payload,
                }),
              );
              if (result.outcome === "refused")
                return yield* Effect.fail(
                  result.error.code === "not_found"
                    ? Schema.decodeUnknownSync(ProfileNotFound)(result.error)
                    : result.error,
                );
              return result.report;
            }),
          profiles: () =>
            Effect.gen(function* () {
              return yield* translate(reads.profiles(yield* BearerCredential));
            }),
          projects: ({ params }) =>
            Effect.gen(function* () {
              return yield* translate(
                reads.projects({
                  credential: yield* BearerCredential,
                  profile: params.profile,
                }),
              );
            }),
          tags: ({ params }) =>
            Effect.gen(function* () {
              return yield* translate(
                reads.tags({
                  credential: yield* BearerCredential,
                  profile: params.profile,
                }),
              );
            }),
          view: ({ params, query }) =>
            Effect.gen(function* () {
              return yield* translate(
                reads.view(
                  {
                    credential: yield* BearerCredential,
                    profile: params.profile,
                  },
                  params.view,
                  query.now,
                ),
              );
            }),
          history: ({ params }) =>
            Effect.gen(function* () {
              return yield* translate(
                reads.history({
                  credential: yield* BearerCredential,
                  profile: params.profile,
                  task_id: params.task,
                }),
              );
            }),
          quickAdd: ({ params, payload }) =>
            Effect.gen(function* () {
              yield* translate(
                store.auth.authenticate({
                  credential: yield* BearerCredential,
                  profile: params.profile,
                  access: "read",
                }),
              );
              return yield* parseQuickAdd(payload).pipe(
                Effect.catchTag("QuickAddError", (error) =>
                  Effect.fail(new InvalidTask({ message: error.message })),
                ),
              );
            }),
        }),
      ).pipe(Layer.provide(AuthorizationLive));
      const SignInLive = HttpApiBuilder.group(TodoApi, "signIn", (handlers) =>
        handlers.handleAll({
          signIn: ({ payload }) =>
            translate(store.auth.signIn(payload.passphrase)).pipe(
              Effect.catchTag("Forbidden", () =>
                Effect.fail(new Unauthorized({ message: "Sign-in failed" })),
              ),
            ),
        }),
      );
      const CredentialsLive = HttpApiBuilder.group(
        TodoApi,
        "credentials",
        (handlers) =>
          handlers.handleAll({
            signOut: () =>
              Effect.gen(function* () {
                const credential = yield* BearerCredential;
                return yield* translate(store.auth.signOut({ credential }));
              }),
            issueToken: ({ payload }) =>
              Effect.gen(function* () {
                const credential = yield* BearerCredential;
                return yield* translate(
                  store.auth.issueToken({ credential, token: payload }),
                );
              }),
            listTokens: () =>
              Effect.gen(function* () {
                const credential = yield* BearerCredential;
                return yield* translate(store.auth.listTokens({ credential }));
              }),
            revokeToken: ({ params }) =>
              Effect.gen(function* () {
                const credential = yield* BearerCredential;
                return yield* translate(
                  store.auth.revokeToken({ credential, name: params.name }),
                );
              }),
          }),
      ).pipe(Layer.provide(AuthorizationLive));
      const SystemLive = HttpApiBuilder.group(TodoApi, "system", (handlers) =>
        handlers.handleAll({
          health: () => Effect.succeed({ service: "todo-server" }),
        }),
      );
      const snapshotOwner = <A>(
        operation: Effect.Effect<A, import("@todo/domain/store").StoreError>,
      ) =>
        Effect.gen(function* () {
          yield* translate(
            store.auth.requireOwner({ credential: yield* BearerCredential }),
          );
          return yield* operation.pipe(
            Effect.catchTag("StoreError", (error) => {
              const cause = error.cause;
              return Effect.fail(
                cause instanceof SnapshotError && cause.code === "not_found"
                  ? new NotFound({ message: cause.message })
                  : cause instanceof SnapshotError
                    ? new InvalidTask({ message: cause.message })
                    : new InternalError({
                        message: "Snapshot operation failed",
                      }),
              );
            }),
          );
        });
      const SnapshotsLive = HttpApiBuilder.group(
        TodoApi,
        "snapshots",
        (handlers) =>
          handlers.handleAll({
            list: () => snapshotOwner(store.snapshots.list()),
            create: ({ payload }) =>
              snapshotOwner(store.snapshots.create(payload.reason)),
            show: ({ params }) =>
              snapshotOwner(store.snapshots.show(params.snapshot)),
            restore: ({ params, payload }) =>
              snapshotOwner(
                store.snapshots.restore(params.snapshot, {
                  dryRun: payload.dry_run,
                }),
              ),
            prune: ({ payload }) =>
              snapshotOwner(store.snapshots.prune({ dryRun: payload.dry_run })),
          }),
      ).pipe(Layer.provide(AuthorizationLive));
      const routes = HttpApiBuilder.layer(TodoApi, {
        openapiPath: "/openapi.json",
      }).pipe(
        Layer.provide([
          TasksLive,
          ReadsLive,
          SignInLive,
          CredentialsLive,
          SystemLive,
          DiagnosticsLive,
          SnapshotsLive,
          changesLayer(store).pipe(Layer.provide(AuthorizationLive)),
        ]),
      );
      return HttpRouter.serve(routes, {
        middleware: diagnosticsMiddleware(diagnostics),
      }).pipe(
        Layer.provideMerge(
          BunHttpServer.layer({
            hostname: "127.0.0.1",
            port: options.port,
            idleTimeout: 0,
            maxRequestBodySize: 28 * 1024 * 1024,
          }),
        ),
      );
    }),
  );

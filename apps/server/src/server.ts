import { BunHttpServer } from "@effect/platform-bun";
import {
  Authorization,
  BadRequest,
  BearerCredential,
  BUILD_ID,
  CONTRACT_ID,
  Conflict,
  InternalError,
  InvalidTask,
  NotFound,
  ProfileNotFound,
  RequestDecoding,
  SearchTooBroadResponse,
  TodoApi,
  TooManySignIns,
  Unauthorized,
  ValidationHistory,
} from "@todo/api";
import {
  type AuthAction,
  authorizedTaskLookupError,
  batchDepend,
  batchEditTasks,
  ClientReads,
  DependencyCommands,
  type DependencyError,
  Discovery,
  type EdgeCommandResult,
  type EdgeReport,
  ExpectedVersion,
  exitStatus,
  Instant,
  ProfileId,
  parseQuickAdd,
  QuickAddInput,
  readGraphQuery,
  SnapshotError,
  TaskId,
  type TaskMutationKind,
  type TaskWrite,
  taskLookupError,
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
  HttpServer,
  HttpServerRequest,
  HttpServerResponse,
} from "effect/http";
import {
  HttpApiBuilder,
  HttpApiMiddleware,
  HttpApiSchema,
  OpenApi,
} from "effect/http-api";
import { databaseEndpoint } from "./database-endpoint.ts";
import { translate } from "./errors.ts";
import { localRoutes } from "./local-routes.ts";
import { OutsideCommit } from "./outside-commit.ts";
import { scheduler } from "./scheduler.ts";
import { changesLayer } from "./sse.ts";
import { taskSearchCacheHygiene } from "./task-search-cache-hygiene.ts";

const taskResult = (
  result: TaskCommandResult,
): Effect.Effect<
  TaskWrite,
  NotFound | Conflict | InvalidTask | DependencyError
> => {
  switch (result.outcome) {
    case "committed": {
      const { outcome: _outcome, task, ...report } = result;
      return Effect.succeed({ ...task, ...report });
    }
    case "not-found":
      return Effect.fail(
        new NotFound({
          message:
            result.missing === "attachment"
              ? "Attachment not found; read the Task and use a current Attachment id."
              : "Task not found",
        }),
      );
    case "rejected":
      if (result.dependency_error) return Effect.fail(result.dependency_error);
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

const dependencyResult = (
  result: EdgeCommandResult,
): Effect.Effect<EdgeReport, Conflict | InvalidTask | DependencyError> =>
  result.outcome === "success"
    ? Effect.succeed(result.report)
    : result.dependency_error
      ? Effect.fail(result.dependency_error)
      : result.reason === "conflict"
        ? Effect.fail(new Conflict({ latest: result.latest }))
        : Effect.fail(
            new InvalidTask({
              message:
                "Dependency change rejected. Check the Task ids and current Version, then retry.",
            }),
          );

const knownRoutes = Object.keys(OpenApi.fromApi(TodoApi).paths ?? {}).map(
  (path) => ({
    path,
    pattern: new RegExp(`^${path.replace(/\{[^}]+\}/g, "[^/]+")}$`),
  }),
);
const queryRoutes = Object.entries(OpenApi.fromApi(TodoApi).paths).flatMap(
  ([path, methods]) =>
    (
      [
        "get",
        "post",
        "put",
        "patch",
        "delete",
        "head",
        "options",
        "trace",
      ] as const
    ).flatMap((method) => {
      const operation = methods[method];
      return operation
        ? [
            {
              method: method.toUpperCase(),
              pattern: new RegExp(`^${path.replace(/\{[^}]+\}/g, "[^/]+")}$`),
              parameters: new Set(
                operation.parameters
                  ?.filter((parameter) => parameter.in === "query")
                  .map((parameter) => parameter.name) ?? [],
              ),
            },
          ]
        : [];
    }),
);
export const rejectUnknownQuery = <E, R>(
  httpEffect: Effect.Effect<HttpServerResponse.HttpServerResponse, E, R>,
) =>
  Effect.flatMap(HttpServerRequest.HttpServerRequest, (request) => {
    const url = new URL(request.url, "http://127.0.0.1");
    const route = queryRoutes.find(
      (route) =>
        route.method === request.method && route.pattern.test(url.pathname),
    );
    const unknown = [...new Set(url.searchParams.keys())].filter(
      (name) => !route?.parameters.has(name),
    );
    const invalidDependencyFilter = ["ready", "blocked"].find(
      (name) =>
        url.searchParams.has(name) &&
        (url.searchParams.getAll(name).length !== 1 ||
          url.searchParams.get(name) !== "true"),
    );
    if (invalidDependencyFilter)
      return Effect.succeed(
        HttpServerResponse.jsonUnsafe(
          {
            generated_at: new Date().toISOString(),
            code: "invalid_args",
            message: `${invalidDependencyFilter} accepts true only. Use --blocked or --status for another set of Tasks.`,
          },
          { status: 400 },
        ),
      );
    return unknown.length
      ? Effect.succeed(
          HttpServerResponse.jsonUnsafe(
            {
              ...exitStatus(2),
              generated_at: new Date().toISOString(),
              code: "invalid_query",
              message: `Unknown query parameter${unknown.length === 1 ? "" : "s"}: ${unknown.join(", ")}`,
            },
            { status: 400 },
          ),
        )
      : httpEffect;
  });
const loopbackHosts = new Set(["127.0.0.1", "localhost", "[::1]"]);
const refuse = (status: number, code: string, message: string) =>
  Effect.succeed(
    HttpServerResponse.jsonUnsafe(
      {
        generated_at: new Date().toISOString(),
        code,
        message,
        ...exitStatus(status === 403 ? 3 : 2),
      },
      { status },
    ),
  );
// The whole Host header must be a name with an optional port; anything else,
// such as "[::1].evil.example", yields no hostname and is refused.
const hostnameOf = (host: string) =>
  host
    .trim()
    .toLowerCase()
    .match(/^(\[[0-9a-f:.]+\]|[a-z0-9.-]+)(?::\d{1,5})?$/)?.[1] ?? "";
// Only native clients talk to this server. Browsers always send Origin or
// Sec-Fetch-Site, and DNS rebinding arrives with a foreign Host, so both are
// refused before authentication runs or anything is recorded.
export const rejectForeignRequests =
  (allowedHosts: ReadonlySet<string> = new Set()) =>
  <E, R>(
    httpEffect: Effect.Effect<HttpServerResponse.HttpServerResponse, E, R>,
  ) =>
    Effect.flatMap(HttpServerRequest.HttpServerRequest, (request) => {
      const headers = request.headers;
      const hostname = hostnameOf(headers.host ?? "");
      if (!loopbackHosts.has(hostname) && !allowedHosts.has(hostname))
        return refuse(403, "forbidden_host", "Host is not allowed");
      const fetchSite = headers["sec-fetch-site"];
      if (
        headers.origin !== undefined ||
        (fetchSite !== undefined && fetchSite !== "none")
      )
        return refuse(403, "forbidden_origin", "Browser requests are refused");
      const hasBody =
        headers["transfer-encoding"] !== undefined ||
        Number(headers["content-length"] ?? 0) > 0;
      const mediaType = (headers["content-type"] ?? "")
        .split(";")[0]
        ?.trim()
        .toLowerCase();
      if (hasBody && mediaType !== "application/json")
        return refuse(
          415,
          "unsupported_media_type",
          "Request bodies must be application/json",
        );
      return httpEffect;
    });
export const allowedHostsFrom = (value: string | undefined) =>
  new Set(
    (value ?? "")
      .split(",")
      .map((host) => host.trim().toLowerCase())
      .filter(Boolean),
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
  readonly allowedHosts?: ReadonlySet<string>;
  readonly outsideCommit?: OutsideCommit;
}) =>
  Layer.unwrap(
    Effect.gen(function* () {
      const endpoint = yield* Effect.acquireRelease(
        Effect.try(() => databaseEndpoint(options.path)),
        (endpoint) => Effect.sync(() => endpoint?.close()),
      );
      const outside = options.outsideCommit ?? new OutsideCommit();
      const beforeStore = endpoint?.beforeStore();
      const store = yield* Effect.acquireRelease(
        openStore({ path: options.path }),
        (store) => Effect.orDie(store.close()),
      );
      yield* Effect.sync(() => endpoint?.verifyStore(beforeStore));
      const cacheHygiene = yield* taskSearchCacheHygiene(store);
      yield* cacheHygiene.run.pipe(Effect.forkScoped);
      yield* scheduler(store).pipe(Effect.forkScoped);
      const commands = new TaskCommands(store);
      const dependencies = new DependencyCommands(store);
      const missingTask = (
        params: { profile: ProfileId; task: TaskId },
        action: AuthAction,
      ) =>
        Effect.gen(function* () {
          const credential = yield* BearerCredential;
          return new NotFound(
            yield* translate(
              taskLookupError(
                store,
                { credential, profile: params.profile },
                params.task,
                "http",
                { action },
              ),
            ),
          );
        });
      const missingBoundTask = (
        selection: {
          readonly profileInfo: {
            readonly id: ProfileId;
            readonly name: string;
          } | null;
          readonly fields: { readonly task_id: string };
        } & (
          | { readonly kind: "read"; readonly profile: ProfileId }
          | { readonly kind: "absent" }
        ),
      ) =>
        new NotFound(
          authorizedTaskLookupError(
            selection.profileInfo ?? undefined,
            selection.fields.task_id,
            "http",
            selection.kind === "read" ? selection.profile : "",
          ),
        );
      const taskResultFor =
        (params: { profile: ProfileId; task?: TaskId }, action: AuthAction) =>
        (result: TaskCommandResult) =>
          Effect.gen(function* () {
            if (
              result.outcome === "not-found" &&
              result.missing !== "attachment" &&
              params.task !== undefined
            )
              return yield* Effect.fail(
                yield* missingTask(
                  {
                    profile: params.profile,
                    task: params.task,
                  },
                  action,
                ),
              );
            return yield* taskResult(result);
          });
      const diagnostics = store.diagnostics;
      const attachments = new AttachmentCommands(store);
      const reads = new ClientReads(store);
      const discovery = new Discovery(store);
      const ValidationHistoryLive = HttpApiMiddleware.layerSchemaErrorTransform(
        ValidationHistory,
        (error, { endpoint }) =>
          Effect.gen(function* () {
            const kinds = new Map<string, TaskMutationKind>([
              ["depend", "DependencyAdded"],
              ["undepend", "DependencyRemoved"],
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
            return yield* Effect.fail(
              new BadRequest({
                message: `Invalid request ${error.kind.toLowerCase()}; check the endpoint schema and retry.`,
              }),
            );
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
              ).pipe(Effect.flatMap(taskResultFor(params, "mutate")));
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
              ).pipe(Effect.flatMap(taskResultFor(params, "mutate")));
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
              ).pipe(Effect.flatMap(taskResultFor(params, "mutate")));
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
              ).pipe(Effect.flatMap(taskResultFor(params, "mutate")));
            }),
          attachmentImage: ({ params }) =>
            Effect.gen(function* () {
              const {
                selection: authority,
                image,
                taskExists,
              } = yield* translate(
                attachments.imageRead(
                  {
                    credential: yield* BearerCredential,
                    profile: params.profile,
                    task_id: params.task,
                  },
                  params.attachment,
                ),
              );
              if (image) return image;
              return yield* Effect.fail(
                !taskExists
                  ? missingBoundTask(authority)
                  : new NotFound({ message: "Managed image not found" }),
              );
            }),
          attachMany: ({ params, payload }) =>
            Effect.gen(function* () {
              const credential = yield* BearerCredential;
              return yield* translate(
                attachments.attachMany(
                  { credential, profile: params.profile },
                  payload,
                ),
              );
            }),
          batchEdit: ({ params, payload }) =>
            Effect.gen(function* () {
              const credential = yield* BearerCredential;
              return yield* translate(
                batchEditTasks(
                  store,
                  { credential, profile: params.profile },
                  payload,
                ),
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
          depend: ({ params, payload }) =>
            Effect.gen(function* () {
              const credential = yield* BearerCredential;
              return yield* translate(
                dependencies.change(
                  { credential, profile: params.profile, task_id: params.task },
                  payload,
                  "depend",
                ),
              ).pipe(Effect.flatMap(dependencyResult));
            }),
          undepend: ({ params, payload }) =>
            Effect.gen(function* () {
              const credential = yield* BearerCredential;
              return yield* translate(
                dependencies.change(
                  { credential, profile: params.profile, task_id: params.task },
                  payload,
                  "undepend",
                ),
              ).pipe(Effect.flatMap(dependencyResult));
            }),
          batchDepend: ({ params, payload }) =>
            Effect.gen(function* () {
              const credential = yield* BearerCredential;
              return yield* translate(
                batchDepend(
                  store,
                  { credential, profile: params.profile },
                  payload,
                ),
              );
            }),
          graph: ({ params }) =>
            Effect.gen(function* () {
              const credential = yield* BearerCredential;
              const { selection: authority, graph } = yield* translate(
                readGraphQuery(
                  store,
                  { credential, profile: params.profile, task_id: params.task },
                  Schema.decodeUnknownSync(Instant)(new Date().toISOString()),
                ),
              );
              return graph ?? (yield* Effect.fail(missingBoundTask(authority)));
            }),
          list: ({ params, query }) =>
            Effect.gen(function* () {
              const credential = yield* BearerCredential;
              return yield* commands
                .list({ credential, profile: params.profile }, query)
                .pipe(
                  Effect.catch(
                    (
                      error,
                    ): Effect.Effect<
                      never,
                      | Effect.Error<ReturnType<typeof translate>>
                      | typeof SearchTooBroadResponse.Type
                    > =>
                      error._tag === "SearchTooBroad"
                        ? Effect.fail(
                            Schema.decodeUnknownSync(SearchTooBroadResponse)({
                              ...exitStatus(2),
                              generated_at: new Date().toISOString(),
                              code: error.code,
                              message: error.message,
                            }),
                          )
                        : translate(Effect.fail(error)),
                  ),
                );
            }),
          show: ({ params }) =>
            Effect.gen(function* () {
              const credential = yield* BearerCredential;
              const { selection: authority, task } = yield* translate(
                commands.readOne(
                  { credential, profile: params.profile },
                  Schema.Struct({ task_id: TaskId }),
                  { task_id: params.task },
                ),
              );
              return task ?? (yield* Effect.fail(missingBoundTask(authority)));
            }),
          create: ({ params, payload }) =>
            Effect.gen(function* () {
              const credential = yield* BearerCredential;
              return yield* translate(
                commands.create(
                  { credential, profile: params.profile },
                  payload,
                ),
              ).pipe(Effect.flatMap(taskResultFor(params, "mutate")));
            }),
          edit: ({ params, payload }) =>
            Effect.gen(function* () {
              const credential = yield* BearerCredential;
              return yield* translate(
                commands.edit(
                  { credential, profile: params.profile, task_id: params.task },
                  payload,
                ),
              ).pipe(Effect.flatMap(taskResultFor(params, "mutate")));
            }),
          transition: ({ params, payload }) =>
            Effect.gen(function* () {
              const credential = yield* BearerCredential;
              return yield* translate(
                commands.transition(
                  { credential, profile: params.profile, task_id: params.task },
                  payload,
                ),
              ).pipe(Effect.flatMap(taskResultFor(params, "mutate")));
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
              ).pipe(Effect.flatMap(taskResultFor(params, "authenticate")));
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
              ).pipe(Effect.flatMap(taskResultFor(params, "authenticate")));
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
              ).pipe(Effect.flatMap(taskResultFor(params, "read")));
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
              ).pipe(Effect.flatMap(taskResultFor(params, "mutate")));
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
              ).pipe(Effect.flatMap(taskResultFor(params, "mutate")));
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
              ).pipe(Effect.flatMap(taskResultFor(params, "mutate")));
            }),
          delete: ({ params, query }) =>
            Effect.gen(function* () {
              const credential = yield* BearerCredential;
              return yield* translate(
                commands.delete(
                  { credential, profile: params.profile, task_id: params.task },
                  query,
                ),
              ).pipe(Effect.flatMap(taskResultFor(params, "mutate")));
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
                    ? Schema.decodeUnknownSync(ProfileNotFound)({
                        ...result.error,
                        ...exitStatus(3),
                      })
                    : { ...result.error, ...exitStatus(2) },
                );
              return result.report;
            }),
          lookup: ({ query }) =>
            Effect.gen(function* () {
              return yield* translate(
                discovery.lookup(yield* BearerCredential, query),
              );
            }),
          profiles: ({ query }) =>
            Effect.gen(function* () {
              const credential = yield* BearerCredential;
              return yield* translate(
                query.include_projects === "true"
                  ? discovery.directory(credential)
                  : reads.profiles(credential),
              );
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
              const authority = yield* translate(
                store.auth.withRead(
                  {
                    credential: yield* BearerCredential,
                    profile: params.profile,
                  },
                  QuickAddInput,
                  payload,
                  (read) => store.auth.checkRead(read, "read"),
                  "authenticate",
                  (selection) => Effect.succeed(selection),
                ),
              );
              return yield* parseQuickAdd(authority.fields).pipe(
                Effect.catchTag("QuickAddError", (error) =>
                  Effect.fail(
                    new InvalidTask({
                      message: error.message,
                    }),
                  ),
                ),
              );
            }),
        }),
      ).pipe(Layer.provide(AuthorizationLive));
      const SignInLive = HttpApiBuilder.group(TodoApi, "signIn", (handlers) =>
        handlers.handleAll({
          signIn: ({ payload }) =>
            store.auth.signIn(payload.passphrase).pipe(
              Effect.catchTag("AuthError", (error) =>
                Effect.gen(function* () {
                  if (error.detail === "sign_in_locked")
                    return yield* new TooManySignIns({
                      message: `Sign-in is locked after 10 wrong passphrases until ${error.locked_until}. Wait, or run todo reset-passphrase on this Mac.`,
                      locked_until: error.locked_until,
                    });
                  if (error.detail === "sign_in_busy")
                    return yield* new TooManySignIns({
                      message:
                        "Too many sign-in attempts are in progress. Retry in a moment.",
                      locked_until: null,
                    });
                  return yield* translate(Effect.fail(error));
                }),
              ),
              Effect.catchTag("StoreError", (error) =>
                translate(Effect.fail(error)),
              ),
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
          health: () =>
            Effect.succeed({
              service: "todo-server",
              contract: CONTRACT_ID,
              build: BUILD_ID,
            }),
        }),
      );
      const snapshotResult = <A>(
        operation: Effect.Effect<
          A,
          | import("@todo/domain/store").StoreError
          | import("@todo/domain").AuthError
        >,
      ) =>
        operation.pipe(
          Effect.catchTag("AuthError", (error) =>
            translate(Effect.fail(error)),
          ),
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
      const snapshotOwner = <A>(
        operation: Effect.Effect<A, import("@todo/domain/store").StoreError>,
      ) =>
        Effect.gen(function* () {
          yield* translate(
            store.auth.requireOwner({ credential: yield* BearerCredential }),
          );
          return yield* snapshotResult(operation);
        });
      const SnapshotsLive = HttpApiBuilder.group(
        TodoApi,
        "snapshots",
        (handlers) =>
          handlers.handleAll({
            list: () =>
              Effect.gen(function* () {
                const credential = yield* BearerCredential;
                return yield* snapshotResult(
                  store.auth.withOwnerRead(
                    { credential },
                    Schema.Struct({}),
                    {},
                    (read) => store.snapshots.listRead(read),
                  ),
                );
              }),
            create: ({ payload }) =>
              snapshotOwner(store.snapshots.create(payload.reason)),
            show: ({ params }) =>
              Effect.gen(function* () {
                const credential = yield* BearerCredential;
                return yield* snapshotResult(
                  store.auth.withOwnerRead(
                    { credential },
                    Schema.Struct({ snapshot: Schema.String }),
                    { snapshot: params.snapshot },
                    (read) => store.snapshots.showRead(read),
                  ),
                );
              }),
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
          localRoutes(store, endpoint, outside),
          changesLayer(store, outside.waiter).pipe(
            Layer.provide(AuthorizationLive),
          ),
        ]),
        Layer.provide(
          HttpApiMiddleware.layerSchemaErrorTransform(
            RequestDecoding,
            (error) =>
              Effect.fail(
                new BadRequest({
                  message: `Invalid request ${error.kind.toLowerCase()}; check the endpoint schema and retry.`,
                }),
              ),
          ),
        ),
      );
      return HttpRouter.serve(routes, {
        middleware: (effect) =>
          diagnosticsMiddleware(diagnostics)(
            rejectForeignRequests(options.allowedHosts)(
              rejectUnknownQuery(effect),
            ),
          ),
      }).pipe(
        Layer.provideMerge(
          BunHttpServer.layer({
            hostname: "127.0.0.1",
            port: options.port,
            idleTimeout: 0,
            maxRequestBodySize: 28 * 1024 * 1024,
          }),
        ),
        Layer.tap((context) =>
          Effect.gen(function* () {
            const server = yield* HttpServer.HttpServer;
            const address = server.address;
            if ("port" in address)
              yield* Effect.try(() => endpoint?.publish(address.port));
          }).pipe(Effect.provideContext(context)),
        ),
      );
    }),
  );

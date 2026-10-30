import {
  AttachmentId,
  AttachTask,
  CreateSeries,
  CreateTask,
  CredentialInfo,
  DeleteProfile,
  DetachTask,
  DiagnosticsSnapshot,
  EditSeries,
  EditTask,
  ExpectedVersion,
  ImageMime,
  ImportReport,
  ImportRequest,
  LabelAttachment,
  MoveTask,
  OpLogEntry,
  PlanningView,
  PlanningViewName,
  PlanningViewQuery,
  ProfileDeletionReport,
  ProfileId,
  ProfileSummary,
  ProjectSummary,
  QuickAddDraft,
  QuickAddInput,
  RevertTask,
  SnapshotGeneration,
  SnapshotId,
  SnapshotList,
  SnapshotManifest,
  SnapshotPruneReport,
  SnapshotRestoreReport,
  TagSummary,
  Task,
  TaskFilters,
  TaskId,
  TokenOptions,
  TransitionTask,
  UploadAttachment,
} from "@todo/domain";
import { ExternalIdConflictDetails } from "@todo/domain/presentation";
import { Context, Schema } from "effect";
import {
  HttpApi,
  HttpApiEndpoint,
  HttpApiError,
  HttpApiGroup,
  HttpApiMiddleware,
  HttpApiSchema,
  HttpApiSecurity,
  OpenApi,
} from "effect/http-api";

export const ProfileNotFound = Schema.Struct({
  generated_at: Schema.String,
  code: Schema.Literal("not_found"),
  message: Schema.String,
}).annotate({ httpApiStatus: 404 });
export const ProfileDeleteError = Schema.Struct({
  generated_at: Schema.String,
  code: Schema.String,
  message: Schema.String,
  details: Schema.Struct({ visible_task_count: Schema.Int }),
}).annotate({ httpApiStatus: 422 });

export class Unauthorized extends Schema.TaggedError<Unauthorized>()(
  "Unauthorized",
  { message: Schema.String },
  { httpApiStatus: 401 },
) {}
export class Forbidden extends Schema.TaggedError<Forbidden>()(
  "Forbidden",
  { message: Schema.String },
  { httpApiStatus: 403 },
) {}
export class NotFound extends Schema.TaggedError<NotFound>()(
  "NotFound",
  { message: Schema.String },
  { httpApiStatus: 404 },
) {}
export class Conflict extends Schema.TaggedError<Conflict>()(
  "Conflict",
  { latest: Schema.NullOr(Task) },
  { httpApiStatus: 409 },
) {}
export class InvalidTask extends Schema.TaggedError<InvalidTask>()(
  "InvalidTask",
  {
    message: Schema.String,
    details: Schema.optionalKey(ExternalIdConflictDetails),
  },
  { httpApiStatus: 422 },
) {}
export class InternalError extends Schema.TaggedError<InternalError>()(
  "InternalError",
  { message: Schema.String },
  { httpApiStatus: 500 },
) {}
export class BearerCredential extends Context.Service<
  BearerCredential,
  string
>()("todo/api/BearerCredential") {}
export class Authorization extends HttpApiMiddleware.Service<
  Authorization,
  { provides: BearerCredential }
>()("todo/api/Authorization", {
  security: { bearer: HttpApiSecurity.bearer },
  error: Unauthorized,
}) {}

export class ValidationHistory extends HttpApiMiddleware.Service<
  ValidationHistory,
  { requires: BearerCredential }
>()("todo/api/ValidationHistory", {
  error: [Unauthorized, Forbidden, ProfileNotFound, InternalError],
}) {}

const profile = { profile: ProfileId };
const target = { ...profile, task: TaskId };
const taskErrors = [
  HttpApiError.BadRequestNoContent,
  Forbidden,
  ProfileNotFound,
  NotFound,
  Conflict,
  InvalidTask,
  InternalError,
];
const Tasks = HttpApiGroup.make("tasks")
  .add(
    HttpApiEndpoint.post(
      "attach",
      "/profiles/:profile/tasks/:task/attachments",
      {
        params: target,
        payload: AttachTask,
        success: Task,
        error: taskErrors,
      },
    ),
    HttpApiEndpoint.post(
      "detach",
      "/profiles/:profile/tasks/:task/attachments/detach",
      {
        params: target,
        payload: DetachTask,
        success: Task,
        error: taskErrors,
      },
    ),
    HttpApiEndpoint.post(
      "labelAttachment",
      "/profiles/:profile/tasks/:task/attachments/label",
      {
        params: target,
        payload: LabelAttachment,
        success: Task,
        error: taskErrors,
      },
    ),
    HttpApiEndpoint.post(
      "uploadAttachment",
      "/profiles/:profile/tasks/:task/attachments/upload",
      {
        params: target,
        payload: UploadAttachment,
        success: Task,
        error: taskErrors,
      },
    ),
    HttpApiEndpoint.get(
      "attachmentImage",
      "/profiles/:profile/tasks/:task/attachments/:attachment/image",
      {
        params: { ...target, attachment: AttachmentId },
        success: Schema.Struct({ mime_type: ImageMime, data: Schema.String }),
        error: taskErrors,
      },
    ),
    HttpApiEndpoint.post("importTasks", "/profiles/:profile/import", {
      params: profile,
      payload: ImportRequest,
      success: ImportReport,
      error: taskErrors,
    }),
    HttpApiEndpoint.get("list", "/profiles/:profile/tasks", {
      params: profile,
      query: TaskFilters,
      success: Schema.Array(Task),
      error: taskErrors,
    }),
    HttpApiEndpoint.get("show", "/profiles/:profile/tasks/:task", {
      params: target,
      success: Task,
      error: taskErrors,
    }),
    HttpApiEndpoint.post("create", "/profiles/:profile/tasks", {
      params: profile,
      payload: CreateTask,
      success: Task,
      error: taskErrors,
    }),
    HttpApiEndpoint.patch("edit", "/profiles/:profile/tasks/:task", {
      params: target,
      payload: EditTask,
      success: Task,
      error: taskErrors,
    }),
    HttpApiEndpoint.post(
      "transition",
      "/profiles/:profile/tasks/:task/transition",
      {
        params: target,
        payload: TransitionTask,
        success: Task,
        error: taskErrors,
      },
    ),
    HttpApiEndpoint.post("move", "/profiles/:profile/tasks/:task/move", {
      params: target,
      payload: MoveTask,
      success: Task,
      error: taskErrors,
    }),
    HttpApiEndpoint.post("copy", "/profiles/:profile/tasks/:task/copy", {
      params: target,
      payload: MoveTask,
      success: Task,
      error: taskErrors,
    }),
    HttpApiEndpoint.post("revert", "/profiles/:profile/tasks/:task/revert", {
      params: target,
      payload: RevertTask,
      success: Task,
      error: taskErrors,
    }),
    HttpApiEndpoint.post("createSeries", "/profiles/:profile/series", {
      params: profile,
      payload: CreateSeries,
      success: Task,
      error: taskErrors,
    }),
    HttpApiEndpoint.patch(
      "editSeries",
      "/profiles/:profile/tasks/:task/series",
      {
        params: target,
        payload: EditSeries,
        success: Task,
        error: taskErrors,
      },
    ),
    HttpApiEndpoint.post(
      "skipOccurrence",
      "/profiles/:profile/tasks/:task/skip",
      {
        params: target,
        payload: ExpectedVersion,
        success: Task,
        error: taskErrors,
      },
    ),
    HttpApiEndpoint.delete("delete", "/profiles/:profile/tasks/:task", {
      params: target,
      query: ExpectedVersion,
      success: Task,
      error: taskErrors,
    }),
  )
  .middleware(ValidationHistory)
  .middleware(Authorization);

const Reads = HttpApiGroup.make("reads")
  .add(
    HttpApiEndpoint.delete("deleteProfile", "/profiles/:profile", {
      params: profile,
      payload: DeleteProfile,
      success: ProfileDeletionReport,
      error: [...taskErrors, ProfileDeleteError],
    }),
    HttpApiEndpoint.get("profiles", "/profiles", {
      success: Schema.Array(ProfileSummary),
      error: taskErrors,
    }),
    HttpApiEndpoint.get("projects", "/profiles/:profile/projects", {
      params: profile,
      success: Schema.Array(ProjectSummary),
      error: taskErrors,
    }),
    HttpApiEndpoint.get("tags", "/profiles/:profile/tags", {
      params: profile,
      success: Schema.Array(TagSummary),
      error: taskErrors,
    }),
    HttpApiEndpoint.get("view", "/profiles/:profile/views/:view", {
      params: { ...profile, view: PlanningViewName },
      query: PlanningViewQuery,
      success: PlanningView,
      error: taskErrors,
    }),
    HttpApiEndpoint.get("history", "/profiles/:profile/tasks/:task/history", {
      params: target,
      success: Schema.Array(OpLogEntry),
      error: taskErrors,
    }),
    HttpApiEndpoint.post("quickAdd", "/profiles/:profile/quick-add/parse", {
      params: profile,
      payload: QuickAddInput,
      success: QuickAddDraft,
      error: taskErrors,
    }),
  )
  .middleware(Authorization);

export const CommittedOperation = OpLogEntry.members[0];
export const OperationEvent = Schema.Struct({
  id: Schema.String,
  event: Schema.Literal("operation"),
  data: Schema.fromJsonString(CommittedOperation).pipe(
    Schema.annotateEncoded({
      contentSchema: Schema.decodeUnknownSync(Schema.Json)(
        Schema.toJsonSchemaDocument(CommittedOperation, {
          referencePolicy: () => undefined,
        }).schema,
      ),
    }),
  ),
});
export const ReadyEvent = Schema.Struct({
  event: Schema.Literal("ready"),
  data: Schema.fromJsonString(Schema.Null),
});
export const ReloadEvent = Schema.Struct({
  event: Schema.Literal("reload"),
  data: Schema.fromJsonString(SnapshotGeneration),
});
export const ChangeEvent = Schema.Union([
  OperationEvent,
  ReadyEvent,
  ReloadEvent,
]);
const Changes = HttpApiGroup.make("changes")
  .add(
    HttpApiEndpoint.get("stream", "/profiles/:profile/events", {
      params: profile,
      headers: {
        "last-event-id": Schema.optionalKey(Schema.String),
        "x-todo-client": Schema.optionalKey(
          Schema.Literals(["electron", "swiftui", "cli"]),
        ),
        "x-todo-generation": Schema.optionalKey(Schema.String),
      },
      success: HttpApiSchema.WithHeaders(
        HttpApiSchema.StreamSse({
          events: ChangeEvent,
          error: Schema.Union([
            Unauthorized,
            Forbidden,
            ProfileNotFound,
            InternalError,
          ]),
        }),
        { "cache-control": Schema.Literal("no-store") },
      ),
      error: [
        HttpApiError.BadRequestNoContent,
        Forbidden,
        ProfileNotFound,
        InternalError,
      ],
    }),
  )
  .middleware(Authorization);

const Passphrase = Schema.Struct({ passphrase: Schema.NonEmptyString });
const IssuedCredential = Schema.Struct({
  ...CredentialInfo.fields,
  credential: Schema.String,
});
const SignIn = HttpApiGroup.make("signIn").add(
  HttpApiEndpoint.post("signIn", "/auth/sessions", {
    payload: Passphrase,
    success: IssuedCredential,
    error: [
      HttpApiError.BadRequestNoContent,
      Unauthorized,
      ProfileNotFound,
      InternalError,
    ],
  }),
);
const Credentials = HttpApiGroup.make("credentials")
  .add(
    HttpApiEndpoint.delete("signOut", "/auth/session", {
      error: [
        HttpApiError.BadRequestNoContent,
        Forbidden,
        ProfileNotFound,
        InternalError,
      ],
    }),
    HttpApiEndpoint.post("issueToken", "/auth/tokens", {
      payload: TokenOptions,
      success: IssuedCredential,
      error: [
        HttpApiError.BadRequestNoContent,
        Forbidden,
        ProfileNotFound,
        InternalError,
      ],
    }),
    HttpApiEndpoint.get("listTokens", "/auth/tokens", {
      success: Schema.Array(CredentialInfo),
      error: [
        HttpApiError.BadRequestNoContent,
        Forbidden,
        ProfileNotFound,
        InternalError,
      ],
    }),
    HttpApiEndpoint.delete("revokeToken", "/auth/tokens/:name", {
      params: { name: Schema.NonEmptyString },
      error: [
        HttpApiError.BadRequestNoContent,
        Forbidden,
        ProfileNotFound,
        InternalError,
      ],
    }),
  )
  .middleware(Authorization);
const Diagnostics = HttpApiGroup.make("diagnostics")
  .add(
    HttpApiEndpoint.get("snapshot", "/diagnostics", {
      success: HttpApiSchema.WithHeaders(DiagnosticsSnapshot, {
        "cache-control": Schema.Literal("no-store"),
      }),
      error: [Forbidden, InternalError, ProfileNotFound],
    }).annotate(
      OpenApi.Description,
      "Owner Session only. profiles contains active Profiles; deleted_profiles retains display names for historical operation labels. Poll at most once per second. After failures, wait 2, 4, 8, 16 then 30 seconds; reset to one second after success. No persistent writes. Request latency covers completed responses in the last 300 seconds, capped at 2048 samples. Last credential use is observed by this process only; null means unknown. Operation rates include external writers and use event times over 60 seconds. storage.external_id_tasks counts indexed Tasks without exposing external ID values; storage.attachments counts references and attachment_store_bytes counts managed-store file bytes without exposing names, paths or content. Metadata only; no Task content, bearer credentials or hashes.",
    ),
  )
  .middleware(Authorization);
const System = HttpApiGroup.make("system").add(
  HttpApiEndpoint.get("health", "/health", {
    success: Schema.Struct({
      service: Schema.Literal("todo-server"),
      contract: Schema.String,
      build: Schema.String,
    }),
  }),
);
const Snapshots = HttpApiGroup.make("snapshots")
  .add(
    HttpApiEndpoint.get("list", "/snapshots", {
      success: SnapshotList,
      error: taskErrors,
    }),
    HttpApiEndpoint.post("create", "/snapshots", {
      payload: Schema.Struct({ reason: Schema.NonEmptyString }),
      success: SnapshotManifest,
      error: taskErrors,
    }),
    HttpApiEndpoint.get("show", "/snapshots/:snapshot", {
      params: { snapshot: SnapshotId },
      success: SnapshotManifest,
      error: taskErrors,
    }),
    HttpApiEndpoint.post("restore", "/snapshots/:snapshot/restore", {
      params: { snapshot: SnapshotId },
      payload: Schema.Struct({ dry_run: Schema.Boolean }),
      success: SnapshotRestoreReport,
      error: taskErrors,
    }),
    HttpApiEndpoint.post("prune", "/snapshots/prune", {
      payload: Schema.Struct({ dry_run: Schema.Boolean }),
      success: SnapshotPruneReport,
      error: taskErrors,
    }),
  )
  .middleware(Authorization);
export class TodoApi extends HttpApi.make("todo-api")
  .add(
    System,
    SignIn,
    Credentials,
    Tasks,
    Changes,
    Reads,
    Diagnostics,
    Snapshots,
  )
  .annotateMerge(
    OpenApi.annotations({ title: "Todo local API", version: "0.1.0" }),
  ) {}

export { CONTRACT_ID } from "./contract.ts";
export { BUILD_ID } from "./identity.ts";

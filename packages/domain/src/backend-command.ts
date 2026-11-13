import { Effect, Schema } from "effect";
import { AttachmentInput } from "./attachments.ts";
import { type AccessRequest, ProfileResolutionError } from "./auth/model.ts";
import {
  authFailure,
  CommandError,
  createTask,
  nowInstant,
  readTasks,
  taskFlags,
} from "./commands.ts";
import { DependencyWarning } from "./dependency-contract.ts";
import { Task } from "./entities.ts";
import {
  ErrorResponse,
  renderError,
  TaskViewSchema,
  taskView,
} from "./presentation.ts";
import { QuickAddDraft } from "./quick-add.ts";
import type { OperationStore } from "./store/store.ts";
import { CreateTask } from "./task-commands.ts";

export const AddBackendCommand = Schema.Struct({
  kind: Schema.Literal("add"),
  profile: Schema.String,
  flags: taskFlags,
  draft: Schema.optionalKey(QuickAddDraft),
  attachments: Schema.optionalKey(Schema.Array(AttachmentInput)),
  depends_on: CreateTask.fields.depends_on,
});
export const BackendCommand = Schema.Union([AddBackendCommand]);
export type BackendCommand = typeof BackendCommand.Type;
export const AddBackendResult = Schema.Struct({
  task: Task,
  view: TaskViewSchema,
  dependency_warnings: Schema.optionalKey(Schema.Array(DependencyWarning)),
});
export const BackendReply = Schema.Union([
  Schema.Struct({
    outcome: Schema.Literal("success"),
    kind: Schema.Literal("add"),
    result: AddBackendResult,
  }),
  Schema.Struct({ outcome: Schema.Literal("failure"), error: ErrorResponse }),
]);

export const executeAdd = Effect.fn(function* (
  store: OperationStore,
  request: AccessRequest,
  command: typeof AddBackendCommand.Type,
) {
  const result = yield* createTask(
    store,
    request,
    command.flags,
    command.draft,
    command.attachments,
    command.depends_on,
  );
  const data = yield* readTasks(store, request);
  return {
    task: result.task,
    view: taskView(result.task, data.projects, data.tags, data.series),
    ...(result.dependency_warnings
      ? { dependency_warnings: result.dependency_warnings }
      : {}),
  };
});

export const executeBackendCommand = (
  store: OperationStore,
  credential: string,
  command: BackendCommand,
) =>
  Effect.gen(function* () {
    const profile = yield* store.auth
      .resolveProfile({
        credential,
        profile: command.profile,
        action: "mutate",
      })
      .pipe(
        Effect.mapError((error) =>
          error instanceof ProfileResolutionError
            ? new CommandError(
                3,
                "not_found",
                "Profile not found; run todo init --profile <name>",
              )
            : error,
        ),
      );
    const result = yield* executeAdd(
      store,
      { credential, profile: profile.id },
      command,
    );
    return {
      outcome: "success",
      kind: "add",
      result,
    } satisfies typeof BackendReply.Type;
  }).pipe(
    Effect.catch((error) => {
      const mapped = authFailure(error);
      const failure =
        mapped instanceof CommandError
          ? mapped
          : new CommandError(1, "runtime_error", String(mapped));
      return Effect.succeed({
        outcome: "failure" as const,
        error: Schema.decodeUnknownSync(ErrorResponse)(
          JSON.parse(
            renderError(
              failure.exit,
              failure.code,
              failure.message,
              "json",
              nowInstant(),
              failure.dependency_error ? undefined : failure.latest,
              failure.dependency_error?.details ?? failure.details,
            ),
          ),
        ),
      });
    }),
  );

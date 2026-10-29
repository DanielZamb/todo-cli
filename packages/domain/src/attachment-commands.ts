import { Clock, Effect, Schema } from "effect";
import {
  decodeImage,
  readManagedImage,
  removeWrittenImage,
  writeImage,
} from "./attachment-store.ts";
import {
  Attachment,
  AttachTask,
  DetachTask,
  LabelAttachment,
  type UploadAttachment,
} from "./attachments.ts";
import type { AccessRequest } from "./auth/model.ts";
import { type TaskCommandResult, TaskCommands } from "./commands.ts";
import { Task } from "./entities.ts";
import { AttachmentId, type TaskId } from "./ids.ts";
import { StoreError } from "./store/error.ts";
import type { OperationStore } from "./store/store.ts";
import { Instant } from "./time.ts";

type Target = AccessRequest & { readonly task_id: TaskId };
const io = <A>(run: () => A) =>
  Effect.try({ try: run, catch: (cause) => new StoreError(cause) });
export class AttachmentCommands {
  constructor(private readonly store: OperationStore) {}

  private change(
    request: Target,
    input: AttachTask | DetachTask | LabelAttachment,
    attachment?: Attachment,
  ) {
    const kind =
      "location" in input
        ? "AttachmentAdded"
        : "label" in input
          ? "TaskEdited"
          : "AttachmentRemoved";
    return Effect.gen({ self: this }, function* () {
      const time = Schema.decodeUnknownSync(Instant)(
        new Date(yield* Clock.currentTimeMillis).toISOString(),
      );
      return yield* this.store.auth.mutate(request, (identity) =>
        Effect.gen({ self: this }, function* () {
          const before = (yield* this.store.tasks()).find(
            (task) =>
              task.id === request.task_id &&
              task.profile_id === identity.profile &&
              task.deleted_at === null,
          );
          const reject = (reason: string) =>
            this.store.reject({
              ...identity,
              reason,
              from_version: input.from_version,
              event: { kind, occurred_at: time, task_id: request.task_id },
            });
          if (!before) {
            yield* reject("profile_mismatch");
            return { outcome: "not-found" } satisfies TaskCommandResult;
          }
          if (
            !Schema.is(
              kind === "AttachmentAdded"
                ? AttachTask
                : kind === "TaskEdited"
                  ? LabelAttachment
                  : DetachTask,
            )(input)
          ) {
            yield* reject("validation");
            return {
              outcome: "rejected",
              reason: "validation",
              latest: before,
            } satisfies TaskCommandResult;
          }
          if (before.row_version !== input.from_version) {
            yield* reject("conflict");
            return {
              outcome: "rejected",
              reason: "conflict",
              latest: before,
            } satisfies TaskCommandResult;
          }
          const attachments = before.attachments ?? [];
          if (
            "attachment_id" in input &&
            !attachments.some((value) => value.id === input.attachment_id)
          ) {
            yield* reject("attachment_not_found");
            return { outcome: "not-found" } satisfies TaskCommandResult;
          }
          const resolved =
            "attachment_id" in input
              ? "label" in input
                ? attachments.map((value) => {
                    if (value.id !== input.attachment_id) return value;
                    const { label: _label, ...rest } = value;
                    return input.label === null
                      ? rest
                      : { ...rest, label: input.label };
                  })
                : attachments.filter(
                    (value) => value.id !== input.attachment_id,
                  )
              : [
                  ...attachments,
                  attachment ??
                    Schema.decodeUnknownSync(Attachment)({
                      ...input.location,
                      id: crypto.randomUUID(),
                      added_at: time,
                      ...(input.label === undefined
                        ? {}
                        : { label: input.label }),
                    }),
                ];
          const after = Schema.decodeUnknownSync(Task)({
            ...before,
            attachments: resolved,
            row_version: before.row_version + 1,
            updated_at: time,
          });
          const definitions =
            kind === "TaskEdited"
              ? yield* new TaskCommands(this.store).definitions(
                  before,
                  identity.profile,
                )
              : { project: null, tags: [] };
          const entry = yield* this.store.append({
            ...identity,
            event:
              kind === "TaskEdited"
                ? {
                    kind,
                    entity_version: 1,
                    occurred_at: time,
                    before,
                    after,
                    series_before: null,
                    series_after: null,
                    project_before: definitions.project,
                    project_after: definitions.project,
                    tags_before: definitions.tags,
                    tags_after: definitions.tags,
                  }
                : { kind, entity_version: 1, occurred_at: time, before, after },
          });
          return entry.outcome === "committed"
            ? ({
                outcome: "committed",
                task: after,
              } satisfies TaskCommandResult)
            : ({
                outcome: "rejected",
                reason: entry.reason,
                latest: before,
              } satisfies TaskCommandResult);
        }),
      );
    });
  }

  readonly attach = (request: Target, input: AttachTask) =>
    this.change(request, input);
  readonly detach = (request: Target, input: DetachTask) =>
    this.change(request, input);

  readonly label = (request: Target, input: LabelAttachment) =>
    this.change(request, input);

  readonly upload = (request: Target, input: UploadAttachment) =>
    Effect.gen({ self: this }, function* () {
      yield* this.store.auth.authenticate({ ...request, access: "write" });
      const before = yield* new TaskCommands(this.store).get(request);
      if (before === null)
        return { outcome: "not-found" } satisfies TaskCommandResult;
      const bytes = yield* io(() =>
        decodeImage(input.data, input.mime_type),
      ).pipe(Effect.catch(() => Effect.succeed(null)));
      if (bytes === null)
        return yield* new TaskCommands(this.store).rejectValidation(request, {
          kind: "AttachmentAdded",
          task_id: request.task_id,
          from_version: input.from_version,
          input: {
            mime_type: input.mime_type,
            encoded_length: input.data.length,
          },
        });
      const id = Schema.decodeUnknownSync(AttachmentId)(crypto.randomUUID());
      const path = yield* io(() =>
        writeImage(
          this.store.attachmentRoot,
          request.profile,
          request.task_id,
          id,
          bytes,
          input.mime_type,
        ),
      );
      const attachment = Schema.decodeUnknownSync(Attachment)({
        kind: "image",
        byte_size: bytes.length,
        ...(input.name === undefined ? {} : { name: input.name }),
        path,
        id,
        added_at: new Date(yield* Clock.currentTimeMillis).toISOString(),
        ...(input.label === undefined ? {} : { label: input.label }),
      });
      const result = yield* this.change(
        request,
        {
          from_version: input.from_version,
          location: { kind: "image", path },
          ...(input.label === undefined ? {} : { label: input.label }),
        },
        attachment,
      ).pipe(
        Effect.onError(() =>
          Effect.orDie(
            io(() => removeWrittenImage(this.store.attachmentRoot, path)),
          ),
        ),
      );
      if (result.outcome !== "committed")
        yield* io(() => removeWrittenImage(this.store.attachmentRoot, path));
      return result;
    });

  readonly image = (request: Target, id: AttachmentId) =>
    Effect.gen({ self: this }, function* () {
      const task = yield* new TaskCommands(this.store).get(request);
      const attachment = task?.attachments?.find((value) => value.id === id);
      return attachment === undefined
        ? null
        : yield* io(() =>
            readManagedImage(
              this.store.attachmentRoot,
              attachment,
              request.task_id,
            ),
          ).pipe(Effect.catch(() => Effect.succeed(null)));
    });
}

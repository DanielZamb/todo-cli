import { Clock, Effect, Schema } from "effect";
import {
  sameAttachment,
  validateAttachmentInputs,
} from "./attachment-input.ts";
import {
  decodeImage,
  readManagedImage,
  removeWrittenImage,
  writeImage,
} from "./attachment-store.ts";
import {
  AttachManyItem,
  type AttachManyReport,
  type AttachManyRequest,
  type AttachManyRow,
  Attachment,
  AttachTask,
  DetachTask,
  LabelAttachment,
  type UploadAttachment,
} from "./attachments.ts";
import type { AccessRequest } from "./auth/model.ts";
import { type TaskCommandResult, TaskCommands } from "./commands.ts";
import { Task } from "./entities.ts";
import { exitStatus } from "./exit-status.ts";
import { AttachmentId, TaskId, Version } from "./ids.ts";
import { StoreError } from "./store/error.ts";
import type { OperationStore } from "./store/store.ts";
import { taskLookupError } from "./task-lookup-error.ts";
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
            return {
              outcome: "not-found",
              missing: "attachment",
            } satisfies TaskCommandResult;
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
                      ...(input.name === undefined ? {} : { name: input.name }),
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

  readonly attachMany = (request: AccessRequest, input: AttachManyRequest) =>
    input.dry_run
      ? // Authenticate before forking: a fork serializes the whole database.
        Effect.andThen(
          this.store.auth.authenticate({ ...request, access: "write" }),
          Effect.acquireUseRelease(
            this.store.fork(),
            (copy) => new AttachmentCommands(copy).executeMany(request, input),
            (copy) => Effect.orDie(copy.close()),
          ),
        )
      : this.executeMany(request, input);

  private executeMany(request: AccessRequest, input: AttachManyRequest) {
    return Effect.gen({ self: this }, function* () {
      yield* this.store.auth.authenticate({ ...request, access: "write" });
      const rows: AttachManyRow[] = [];
      for (const raw of input.items) {
        const decoded = Schema.decodeUnknownExit(AttachManyItem, {
          onExcessProperty: "error",
        })(raw);
        if (decoded._tag === "Failure") {
          const target = Schema.decodeUnknownExit(
            Schema.Struct({ task_id: TaskId }),
          )(raw);
          const expected = Schema.decodeUnknownExit(
            Schema.Struct({ from_version: Version }),
          )(raw);
          const task_id =
            target._tag === "Success" ? target.value.task_id : null;
          const from_version =
            expected._tag === "Success" ? expected.value.from_version : null;
          const current =
            task_id === null
              ? null
              : yield* new TaskCommands(this.store).get({
                  ...request,
                  task_id,
                });
          yield* this.store.auth.mutate(request, (identity) =>
            this.store.reject({
              ...identity,
              reason: "validation",
              ...(from_version === null ? {} : { from_version }),
              event: {
                kind: "AttachmentAdded",
                occurred_at: new Date().toISOString(),
                input: raw,
                ...(task_id === null ? {} : { task_id }),
              },
            }),
          );
          rows.push({
            task_id,
            from_version,
            current_version: current?.row_version ?? null,
            outcome: "rejected",
            attached: 0,
            error: {
              ...exitStatus(2),
              code: "invalid_args",
              message:
                "Invalid Attachment input. Check todo schema attach-many-input.",
            },
          });
          continue;
        }
        const item = decoded.value;
        const target = { ...request, task_id: item.task_id };
        const base = { task_id: item.task_id, from_version: item.from_version };
        const result = yield* this.store.auth
          .mutate(request, () =>
            Effect.gen({ self: this }, function* () {
              const before = yield* new TaskCommands(this.store).get(target);
              if (!before)
                return yield* Effect.fail(
                  new AttachManyFailure({ outcome: "not-found" }),
                );
              let task: Task = before;
              if (task.row_version !== item.from_version)
                return yield* Effect.fail(
                  new AttachManyFailure({
                    outcome: "rejected",
                    reason: "conflict",
                    latest: task,
                  }),
                );
              yield* Effect.try({
                try: () => validateAttachmentInputs(item.attachments),
                catch: () =>
                  new AttachManyFailure({
                    outcome: "rejected",
                    reason: "validation",
                    latest: task,
                  }),
              });
              let attached = 0;
              for (const attachment of item.attachments) {
                if (
                  task.attachments?.some((value) =>
                    sameAttachment(value, attachment),
                  )
                )
                  continue;
                const { label, name, ...location } = attachment;
                const change: TaskCommandResult = yield* this.attach(target, {
                  from_version: task.row_version,
                  location,
                  ...(name === undefined ? {} : { name }),
                  ...(label === undefined ? {} : { label }),
                });
                if (change.outcome !== "committed")
                  return yield* Effect.fail(new AttachManyFailure(change));
                task = change.task;
                attached++;
              }
              return {
                ...base,
                current_version: task.row_version,
                outcome: attached ? "attached" : "unchanged",
                attached,
              } satisfies AttachManyRow;
            }),
          )
          .pipe(
            Effect.catchTag("StoreError", (error) =>
              Effect.gen({ self: this }, function* () {
                const failure =
                  error instanceof AttachManyFailure
                    ? error
                    : error.cause instanceof AttachManyFailure
                      ? error.cause
                      : null;
                if (!failure) return yield* Effect.fail(error);
                const result = failure.result;
                const current =
                  result.outcome === "rejected" ? result.latest : null;
                const reason =
                  result.outcome === "rejected" ? result.reason : "not_found";
                const context =
                  reason === "not_found"
                    ? yield* taskLookupError(
                        this.store,
                        request,
                        item.task_id,
                        "http",
                        { action: "authenticate" },
                      )
                    : undefined;
                return yield* this.store.auth
                  .mutate(request, (identity) =>
                    this.store.reject({
                      ...identity,
                      reason,
                      from_version: item.from_version,
                      event: {
                        kind: "AttachmentAdded",
                        task_id: item.task_id,
                        occurred_at: new Date().toISOString(),
                        input: raw,
                      },
                    }),
                  )
                  .pipe(
                    Effect.map(
                      () =>
                        ({
                          ...base,
                          current_version: current?.row_version ?? null,
                          outcome: "rejected",
                          attached: 0,
                          error: {
                            ...exitStatus(
                              reason === "conflict"
                                ? 4
                                : reason === "not_found"
                                  ? 3
                                  : 2,
                            ),
                            code:
                              reason === "conflict"
                                ? "occ_conflict"
                                : reason === "not_found"
                                  ? "not_found"
                                  : "invalid_args",
                            message:
                              context?.message ??
                              (reason === "conflict"
                                ? "Task changed. Read its current Version and retry."
                                : reason === "not_found"
                                  ? "Task not found in this Profile."
                                  : "Invalid Attachment URI or file path. Check every Attachment and retry."),
                            details: {
                              ...context?.details,
                              current_version: current?.row_version ?? null,
                            },
                          },
                        }) satisfies AttachManyRow,
                    ),
                  );
              }),
            ),
          );
        rows.push(result);
      }
      const totals = { attached: 0, unchanged: 0, rejected: 0 };
      for (const row of rows) totals[row.outcome]++;
      return {
        generated_at: Schema.decodeUnknownSync(Instant)(
          new Date().toISOString(),
        ),
        dry_run: input.dry_run ?? false,
        items: rows,
        totals,
      } satisfies AttachManyReport;
    });
  }

  readonly imageRead = (request: Target, id: AttachmentId) =>
    Effect.gen({ self: this }, function* () {
      const { read, task } = yield* new TaskCommands(this.store).readOne(
        request,
        Schema.Struct({ task_id: TaskId, attachment_id: AttachmentId }),
        { task_id: request.task_id, attachment_id: id },
      );
      const authority = yield* this.store.auth.checkRead(read, "read");
      const attachment = task?.attachments?.find(
        (value) => value.id === authority.fields.attachment_id,
      );
      const image =
        attachment === undefined
          ? null
          : yield* io(() =>
              readManagedImage(
                this.store.attachmentRoot,
                attachment,
                authority.fields.task_id,
              ),
            ).pipe(Effect.catch(() => Effect.succeed(null)));
      return { read, image };
    });

  readonly image = (request: Target, id: AttachmentId) =>
    this.imageRead(request, id).pipe(Effect.map((result) => result.image));
}

class AttachManyFailure extends StoreError {
  constructor(readonly result: TaskCommandResult) {
    super(result);
  }
}

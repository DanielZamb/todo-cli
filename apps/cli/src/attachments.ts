import { existsSync } from "node:fs";
import type { AccessRequest } from "@todo/domain";
import { AttachmentId, TaskId, Version } from "@todo/domain";
import { attachmentInput } from "@todo/domain/attachment-input";
import { AttachmentCommands } from "@todo/domain/attachments";
import { CommandError, type TaskCommandResult } from "@todo/domain/commands";
import type { TaskView } from "@todo/domain/presentation";
import { type OperationStore, TaskCommands } from "@todo/domain/store";
import { Effect, Schema } from "effect";

export const withAttachmentStatus = (
  task: TaskView,
  attachments: NonNullable<Parameters<typeof attachmentStatus>[0]> = [],
) => ({ ...task, attachments: attachmentStatus(attachments) });
export const attachmentStatus = (
  attachments: NonNullable<import("@todo/domain").Task["attachments"]>,
) =>
  attachments.map((value) => ({
    ...value,
    exists: value.kind === "link" ? null : existsSync(value.path),
  }));
const resultTask = (result: TaskCommandResult, id: string) => {
  if (result.outcome === "not-found")
    return Effect.fail(
      new CommandError(
        3,
        "not_found",
        "Task or Attachment not found; read todo show <id>",
        undefined,
        undefined,
        id,
      ),
    );
  if (result.outcome === "rejected")
    return Effect.fail(
      new CommandError(
        result.reason === "conflict" ? 4 : 2,
        result.reason === "conflict" ? "occ_conflict" : "invalid_args",
        result.reason === "conflict"
          ? `Task changed; read todo show <id> and retry with Version ${result.latest?.row_version}`
          : result.reason,
      ),
    );
  return Effect.succeed(result.task);
};
export const changeAttachment = (
  store: OperationStore,
  request: AccessRequest,
  input: {
    id: string;
    value: string;
    label?: string;
    detach: boolean;
    dryRun: boolean;
    expected: number;
  },
) =>
  Effect.gen(function* () {
    const task_id = Schema.decodeUnknownSync(TaskId)(input.id);
    const target = { ...request, task_id };
    const before = yield* new TaskCommands(store).get(target);
    if (before === null)
      return yield* Effect.fail(
        new CommandError(
          3,
          "not_found",
          "Task not found; read todo list",
          undefined,
          undefined,
          input.id,
        ),
      );
    const from_version = Schema.decodeUnknownSync(Version)(
      input.expected > 0 ? input.expected : before.row_version,
    );
    if (input.dryRun && from_version !== before.row_version)
      return yield* Effect.fail(
        new CommandError(
          4,
          "occ_conflict",
          `Task changed; current Version is ${before.row_version}`,
        ),
      );
    const commands = new AttachmentCommands(store);
    if (input.detach) {
      const attachment_id = Schema.decodeUnknownSync(AttachmentId)(input.value);
      if (input.dryRun) {
        yield* store.auth.authenticate({ ...request, access: "write" });
        if (!before.attachments?.some((value) => value.id === attachment_id))
          return yield* Effect.fail(
            new CommandError(
              3,
              "not_found",
              "Attachment not found; read todo show <id>",
            ),
          );
        return {
          ...before,
          attachments:
            before.attachments?.filter((value) => value.id !== attachment_id) ??
            [],
        };
      }
      return yield* commands
        .detach(target, { from_version, attachment_id })
        .pipe(Effect.flatMap((result) => resultTask(result, task_id)));
    }
    const location = yield* Effect.try({
      try: () => attachmentInput(input.value),
      catch: (error) => new CommandError(2, "invalid_args", String(error)),
    });
    return yield* commands
      .attach(target, {
        from_version,
        location,
        ...(input.label === undefined ? {} : { label: input.label }),
      })
      .pipe(Effect.flatMap((result) => resultTask(result, task_id)));
  });

export const labelAttachment = (
  store: OperationStore,
  request: AccessRequest,
  id: string,
  attachment: string,
  label: string | null,
  expected: number,
) =>
  Effect.gen(function* () {
    const task_id = Schema.decodeUnknownSync(TaskId)(id);
    const target = { ...request, task_id };
    const before = yield* new TaskCommands(store).get(target);
    const from_version = Schema.decodeUnknownSync(Version)(
      expected > 0 ? expected : (before?.row_version ?? 1),
    );
    return yield* new AttachmentCommands(store)
      .label(target, {
        from_version,
        attachment_id: Schema.decodeUnknownSync(AttachmentId)(attachment),
        label,
      })
      .pipe(Effect.flatMap((result) => resultTask(result, task_id)));
  });

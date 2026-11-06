import { Effect, Schema } from "effect";
import type { AccessRequest } from "./auth/model.ts";
import { TaskCommands } from "./commands.ts";
import { TaskId, Version } from "./ids.ts";
import { limitedItems } from "./limits.ts";
import type { OperationStore } from "./store/store.ts";
import { TaskPatch } from "./task-commands.ts";
import { Instant } from "./time.ts";

export const BatchEditItem = Schema.Struct({
  task_id: TaskId,
  from_version: Version,
});
export const BatchEditRequest = Schema.Struct({
  items: limitedItems(BatchEditItem).check(
    Schema.isMinLength(1),
    Schema.makeFilter(
      (items) =>
        new Set(items.map((item) => item.task_id)).size === items.length ||
        "Each Task id must occur once.",
    ),
  ),
  changes: Schema.Struct({
    title: TaskPatch.fields.title,
    description: TaskPatch.fields.description,
    priority: TaskPatch.fields.priority,
    project_name: TaskPatch.fields.project_name,
    tag_names: TaskPatch.fields.tag_names,
    due_at: TaskPatch.fields.due_at,
    scheduled_at: TaskPatch.fields.scheduled_at,
    energy: TaskPatch.fields.energy,
    estimate_min: TaskPatch.fields.estimate_min,
  }).check(Schema.isBetweenProperties(1, 1)),
  dry_run: Schema.optionalKey(Schema.Boolean),
});
export type BatchEditRequest = typeof BatchEditRequest.Type;
export const BatchEditRow = Schema.Struct({
  task_id: TaskId,
  from_version: Version,
  current_version: Schema.NullOr(Version),
  outcome: Schema.Literals(["updated", "rejected"]),
  error: Schema.optionalKey(
    Schema.Struct({
      generated_at: Instant,
      code: Schema.String,
      message: Schema.String,
      details: Schema.Struct({ current_version: Schema.NullOr(Version) }),
    }),
  ),
});
export type BatchEditRow = typeof BatchEditRow.Type;
export const BatchEditReport = Schema.Struct({
  generated_at: Instant,
  dry_run: Schema.Boolean,
  items: Schema.Array(BatchEditRow),
  totals: Schema.Struct({ updated: Schema.Int, rejected: Schema.Int }),
});
export type BatchEditReport = typeof BatchEditReport.Type;

const execute = Effect.fn(function* (
  store: OperationStore,
  request: AccessRequest,
  input: BatchEditRequest,
) {
  yield* store.auth.authenticate({ ...request, access: "write" });
  const commands = new TaskCommands(store);
  const generated_at = Schema.decodeUnknownSync(Instant)(
    new Date().toISOString(),
  );
  const items: BatchEditRow[] = [];
  for (const item of input.items) {
    const result = yield* commands.edit(
      { ...request, task_id: item.task_id },
      { from_version: item.from_version, changes: input.changes },
    );
    const latest =
      result.outcome === "committed"
        ? result.task
        : result.outcome === "rejected"
          ? result.latest
          : null;
    const current_version =
      input.dry_run && result.outcome === "committed"
        ? item.from_version
        : (latest?.row_version ?? null);
    const code =
      result.outcome === "not-found"
        ? "not_found"
        : result.outcome === "rejected"
          ? result.reason === "conflict"
            ? "occ_conflict"
            : result.reason
          : null;
    items.push({
      ...item,
      current_version,
      outcome: result.outcome === "committed" ? "updated" : "rejected",
      ...(code === null
        ? {}
        : {
            error: {
              generated_at,
              code,
              message:
                code === "occ_conflict"
                  ? "Conflict. Reload Tasks, preview and apply with the current Version."
                  : code === "not_found"
                    ? "Task not found in this Profile. Reload Tasks and select again."
                    : "Change rejected. Check the field value and preview again.",
              details: { current_version },
            },
          }),
    });
  }
  return {
    generated_at,
    dry_run: input.dry_run ?? false,
    items,
    totals: {
      updated: items.filter((item) => item.outcome === "updated").length,
      rejected: items.filter((item) => item.outcome === "rejected").length,
    },
  } satisfies BatchEditReport;
});

export const batchEditTasks = (
  store: OperationStore,
  request: AccessRequest,
  input: BatchEditRequest,
) =>
  input.dry_run
    ? // Authenticate before forking: a fork serializes the whole database.
      Effect.andThen(
        store.auth.authenticate({ ...request, access: "write" }),
        Effect.acquireUseRelease(
          store.fork(),
          (copy) => execute(copy, request, input),
          (copy) => Effect.orDie(copy.close()),
        ),
      )
    : execute(store, request, input);

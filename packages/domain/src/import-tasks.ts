import { Effect, Option, Schema } from "effect";
import type { AccessRequest } from "./auth/model.ts";
import { type TaskCommandResult, TaskCommands } from "./commands.ts";
import type { Task } from "./entities.ts";
import {
  ImportItem,
  type ImportReport,
  type ImportRequest,
  type ImportRow,
} from "./import.ts";
import { StoreError } from "./store/error.ts";
import type { OperationStore } from "./store/store.ts";
import { CreateTask, TaskPatch } from "./task-commands.ts";
import { Instant } from "./time.ts";

class ImportFailure extends StoreError {
  constructor(readonly result: TaskCommandResult) {
    super(result);
  }
}
const accepted = (result: TaskCommandResult) =>
  result.outcome === "committed"
    ? Effect.succeed(result.task)
    : Effect.fail(new ImportFailure(result));
const same = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);
const identity = Schema.Struct({ external_id: Schema.String });
const expectedVersionInput = Schema.Struct({
  from_version: ImportItem.fields.from_version,
});

const executeImport = Effect.fn(function* (
  store: OperationStore,
  request: AccessRequest,
  input: ImportRequest,
) {
  const commands = new TaskCommands(store);
  const initial = (yield* store.auth.read(request)).tasks;
  const seen = new Set<string>();
  const identities = input.items.flatMap((raw) => {
    const decoded = Schema.decodeUnknownOption(identity)(raw);
    return Option.isSome(decoded) ? [decoded.value.external_id] : [];
  });
  const duplicates = new Set(
    identities.filter((id, index) => identities.indexOf(id) !== index),
  );
  const rows: ImportRow[] = [];
  for (const raw of input.items) {
    const decoded = Schema.decodeUnknownExit(ImportItem, {
      onExcessProperty: "error",
    })(raw);
    const id = Schema.decodeUnknownOption(identity)(raw);
    const external_id = Option.isSome(id) ? id.value.external_id : "";
    seen.add(external_id);
    const before =
      initial.find((task) => task.external_id === external_id) ?? null;
    const base = {
      external_id,
      task_id: before?.id ?? null,
      from_version: before?.row_version ?? null,
      changed_fields: [],
    };
    if (decoded._tag === "Failure" || duplicates.has(external_id)) {
      const version = Schema.decodeUnknownOption(expectedVersionInput)(raw);
      yield* commands.rejectValidation(request, {
        kind: before ? "TaskEdited" : "TaskCreated",
        input: raw,
        ...(before ? { task_id: before.id } : {}),
        ...(Option.isSome(version) && version.value.from_version != null
          ? { from_version: version.value.from_version }
          : {}),
      });
      rows.push({
        ...base,
        outcome: "rejected",
        error: {
          code: "invalid_args",
          message: duplicates.has(external_id)
            ? "Each external id must occur once in the file."
            : "Task does not match import-item. Check todo schema import-item.",
        },
      });
      continue;
    }
    const item = decoded.value;
    const expectedVersion =
      item.from_version === undefined ? base.from_version : item.from_version;
    const { project_name, ...fields } = item;
    const changes = Schema.decodeUnknownSync(TaskPatch)({
      ...fields,
      ...(item.tags === undefined ? {} : { tags: item.tags ?? [] }),
      ...(project_name === undefined || item.project_id !== undefined
        ? {}
        : { project_name: project_name ?? "" }),
      ...(item.tag_names === undefined
        ? {}
        : { tag_names: item.tag_names ?? [] }),
    });
    const result = yield* store.auth
      .mutate(request, () =>
        Effect.gen(function* () {
          const current =
            (yield* store.auth.read(request)).tasks.find(
              (task) => task.external_id === external_id,
            ) ?? null;
          if (current?.deleted_at != null)
            return yield* Effect.fail(
              new ImportFailure({
                outcome: "rejected",
                reason: "task_deleted",
                latest: current,
              }),
            );
          if (
            (item.task_id !== undefined &&
              item.task_id !== (current?.id ?? null)) ||
            (current?.row_version ?? null) !== expectedVersion ||
            current?.id !== before?.id
          )
            return yield* Effect.fail(
              new ImportFailure({
                outcome: "rejected",
                reason: "conflict",
                latest: current,
              }),
            );
          const data = yield* store.auth.read(request);
          const normalizedNames = (changes.tag_names ?? [])
            .flatMap((name) => name.split(","))
            .map((name) => name.trim().toLowerCase())
            .filter(Boolean);
          const requestedTags = [
            ...new Set([
              ...(changes.tags ?? []).map((id) => JSON.stringify(["id", id])),
              ...normalizedNames.map((name) => {
                const tag = data.tags.find((tag) => tag.name === name);
                return JSON.stringify(tag ? ["id", tag.id] : ["name", name]);
              }),
            ]),
          ].sort();
          const tagsChanged = !same(
            requestedTags,
            (current?.tags ?? [])
              .map((id) => JSON.stringify(["id", id]))
              .sort(),
          );
          const changed_fields = Object.entries(changes).flatMap(
            ([key, value]) => {
              if (key === "project_name" && changes.project_id !== undefined)
                return [];
              if (key === "tags" || key === "tag_names")
                return tagsChanged ? [key] : [];
              const old =
                key === "project_name"
                  ? (data.projects.find((p) => p.id === current?.project_id)
                      ?.name ?? "")
                  : current
                    ? Reflect.get(current, key)
                    : undefined;
              return same(old, value) ? [] : [key];
            },
          );
          let task: Task;
          if (current === null) {
            if (!item.title)
              return yield* Effect.fail(
                new ImportFailure({
                  outcome: "rejected",
                  reason: "title_required",
                  latest: null,
                }),
              );
            task = yield* accepted(
              yield* commands.create(
                request,
                Schema.decodeUnknownSync(CreateTask)({
                  source: "import",
                  ...changes,
                  title: item.title,
                }),
              ),
            );
          } else if (changed_fields.length) {
            task = yield* accepted(
              yield* commands.edit(
                { ...request, task_id: current.id },
                { from_version: current.row_version, changes },
              ),
            );
          } else task = current;
          if (item.status !== undefined && item.status !== task.status) {
            changed_fields.push("status");
            if (
              task.status === "done" ||
              task.status === "cancelled" ||
              (task.status === "snoozed" && item.status === "open")
            )
              task = yield* accepted(
                yield* commands.transition(
                  { ...request, task_id: task.id },
                  { from_version: task.row_version, action: "reopen" },
                ),
              );
            if (item.status !== "open")
              task = yield* accepted(
                yield* commands.transition(
                  { ...request, task_id: task.id },
                  {
                    from_version: task.row_version,
                    action: item.status === "done" ? "complete" : "cancel",
                  },
                ),
              );
          }
          return {
            ...base,
            task_id: current === null && input.dry_run ? null : task.id,
            outcome:
              current === null
                ? "created"
                : changed_fields.length
                  ? "updated"
                  : "unchanged",
            changed_fields,
          } satisfies ImportRow;
        }),
      )
      .pipe(
        Effect.catchTag("StoreError", (error) => {
          const failure =
            error instanceof ImportFailure
              ? error
              : error.cause instanceof ImportFailure
                ? error.cause
                : null;
          if (failure === null) return Effect.fail(error);
          const result = failure.result;
          const latest = result.outcome === "rejected" ? result.latest : null;
          const reason =
            result.outcome === "rejected" ? result.reason : "not_found";
          return store.auth
            .mutate(request, (actor) =>
              store.reject({
                ...actor,
                ...(expectedVersion === null
                  ? {}
                  : { from_version: expectedVersion }),
                reason,
                event: {
                  kind: before ? "TaskEdited" : "TaskCreated",
                  occurred_at: new Date().toISOString(),
                  input: raw,
                  ...(before ? { task_id: before.id } : {}),
                },
              }),
            )
            .pipe(
              Effect.map(
                () =>
                  ({
                    ...base,
                    outcome: "rejected",
                    error: {
                      code: reason === "conflict" ? "occ_conflict" : reason,
                      message:
                        reason === "conflict"
                          ? "Task changed since preview. Preview again and apply the current Version."
                          : reason === "title_required"
                            ? "New Tasks need a title. Add a title and import again."
                            : reason === "task_deleted"
                              ? "This Task is deleted. Restore it before importing changes."
                              : reason === "external_id_conflict"
                                ? "This external id already belongs to a Task. Restore the deleted Task or use another external id."
                                : "Task fields are invalid. Check import-item and import again.",
                      details: { current_version: latest?.row_version ?? null },
                    },
                  }) satisfies ImportRow,
              ),
            );
        }),
      );
    rows.push(result);
  }
  if (input.close_missing && !rows.some((row) => row.outcome === "rejected")) {
    const candidates =
      input.close_missing_candidates ??
      initial
        .filter(
          (task) =>
            task.deleted_at === null &&
            task.external_id &&
            !seen.has(task.external_id) &&
            (task.status === "open" || task.status === "snoozed"),
        )
        .map((task) => ({
          external_id: task.external_id ?? "",
          task_id: task.id,
          from_version: task.row_version,
        }));
    for (const candidate of candidates) {
      const task = (yield* commands.list(request)).find(
        (task) =>
          task.id === candidate.task_id &&
          task.external_id === candidate.external_id,
      );
      const result =
        task && !seen.has(candidate.external_id)
          ? yield* commands.transition(
              { ...request, task_id: candidate.task_id },
              { from_version: candidate.from_version, action: "cancel" },
            )
          : yield* store.auth
              .mutate(request, (actor) =>
                store.reject({
                  ...actor,
                  reason: "conflict",
                  from_version: candidate.from_version,
                  event: {
                    kind: "TaskCancelled",
                    occurred_at: new Date().toISOString(),
                    task_id: candidate.task_id,
                  },
                }),
              )
              .pipe(
                Effect.map(
                  () =>
                    ({
                      outcome: "rejected",
                      reason: "conflict",
                      latest: task ?? null,
                    }) satisfies TaskCommandResult,
                ),
              );
      rows.push({
        external_id: candidate.external_id,
        task_id: candidate.task_id,
        from_version: candidate.from_version,
        outcome: result.outcome === "committed" ? "updated" : "rejected",
        changed_fields: ["status"],
        ...(result.outcome !== "committed"
          ? {
              error: {
                code:
                  result.outcome === "rejected" && result.reason !== "conflict"
                    ? result.reason
                    : "occ_conflict",
                message: "Cancellation rejected. Preview again.",
                details: {
                  current_version:
                    result.outcome === "rejected"
                      ? (result.latest?.row_version ?? null)
                      : null,
                },
              },
            }
          : {}),
      });
    }
  }

  const totals = { created: 0, updated: 0, unchanged: 0, rejected: 0 };
  for (const row of rows) totals[row.outcome]++;
  return {
    generated_at: Schema.decodeUnknownSync(Instant)(new Date().toISOString()),
    dry_run: input.dry_run ?? false,
    items: rows,
    totals,
  } satisfies ImportReport;
});

export const importTasks = (
  store: OperationStore,
  request: AccessRequest,
  input: ImportRequest,
) =>
  input.dry_run
    ? Effect.acquireUseRelease(
        store.fork(),
        (copy) => executeImport(copy, request, input),
        (copy) => Effect.orDie(copy.close()),
      )
    : Effect.gen(function* () {
        yield* store.auth.authenticate({ ...request, access: "write" });
        yield* store.snapshots.create(
          `before import ${input.file_name ?? "request"}`,
        );
        return yield* executeImport(store, request, input);
      });

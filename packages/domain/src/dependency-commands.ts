import { Clock, Effect, Schema } from "effect";
import type { AccessRequest } from "./auth/model.ts";
import type { DependencyError, Edge } from "./dependencies.ts";
import {
  type BatchEdgeReport,
  type BatchEdgeRequest,
  type DependencyWarning,
  DependRequest,
  type EdgeFailure,
  type EdgeReport,
} from "./dependency-contract.ts";
import { dependencyAdvice, shortestUpstreamPath } from "./dependency-rules.ts";
import type { Task } from "./entities.ts";
import { indexGraph, type TaskGraph } from "./graph-model.ts";
import { type TaskId, Version } from "./ids.ts";
import type { OperationStore } from "./store/store.ts";
import { Instant } from "./time.ts";

export type EdgeCommandResult =
  | { readonly outcome: "success"; readonly report: EdgeReport }
  | {
      readonly outcome: "rejected";
      readonly reason: string;
      readonly latest: Task | null;
      readonly dependency_error?: DependencyError;
    };

export function dependencyWarnings(
  edge: Edge,
  graph: TaskGraph,
): DependencyWarning[] {
  const index = indexGraph({
    ...graph,
    edges: graph.edges.filter(
      (existing) =>
        existing.dependent_id !== edge.dependent_id ||
        existing.blocker_id !== edge.blocker_id,
    ),
  });
  const path = shortestUpstreamPath(
    edge.dependent_id,
    edge.blocker_id,
    (id) => index.upstream.get(id) ?? [],
  );
  const warnings: DependencyWarning[] =
    path && path.length >= 3
      ? [
          {
            code: "redundant_dependency",
            message:
              "This Dependency is already implied by this path. The direct Dependency is kept.",
            dependent_id: edge.dependent_id,
            blocker_id: edge.blocker_id,
            path: [...path].reverse(),
          },
        ]
      : [];
  const count = graph.edges.filter(
    (existing) => existing.dependent_id === edge.dependent_id,
  ).length;
  if (count > 8)
    warnings.push({
      code: "many_dependencies",
      dependent_id: edge.dependent_id,
      count,
      message: dependencyAdvice(count),
    });
  return warnings;
}

export const edgeFailure = (
  result: Extract<EdgeCommandResult, { outcome: "rejected" }>,
  generated_at: Instant,
): { error: EdgeFailure; exit_code: 2 | 3 | 4 } => {
  if (result.dependency_error)
    return { error: result.dependency_error, exit_code: 2 };
  if (result.reason === "conflict")
    return {
      error: {
        generated_at,
        code: "conflict",
        message:
          "Task changed. Reload and retry with its current --expected-version.",
        details: { current_version: result.latest?.row_version ?? null },
      },
      exit_code: 4,
    };
  if (result.reason === "profile_mismatch")
    return {
      error: {
        generated_at,
        code: "not_found",
        message:
          "Task not found in this Profile. Read todo list and select again.",
      },
      exit_code: 3,
    };
  return {
    error: {
      generated_at,
      code: "invalid_args",
      message:
        "Dependency change rejected. Check both Task ids and --expected-version, then retry.",
    },
    exit_code: 2,
  };
};

export class DependencyCommands {
  constructor(private readonly store: OperationStore) {}
  readonly change = (
    request: AccessRequest & { readonly task_id: TaskId },
    input: DependRequest,
    action: "depend" | "undepend",
  ) =>
    Effect.gen({ self: this }, function* () {
      const generated_at = Schema.decodeUnknownSync(Instant)(
        new Date(yield* Clock.currentTimeMillis).toISOString(),
      );
      return yield* this.store.auth.mutate(request, (identity) =>
        Effect.gen({ self: this }, function* () {
          const kind =
            action === "depend" ? "DependencyAdded" : "DependencyRemoved";
          const event = {
            kind,
            occurred_at: generated_at,
            dependent_id: request.task_id,
            ...input,
          };
          const graph = yield* this.store.graph(identity.profile);
          const index = indexGraph(graph);
          const before = index.tasks.get(request.task_id) ?? null;
          const edge: Edge = {
            profile_id: identity.profile,
            dependent_id: request.task_id,
            blocker_id: input.blocker_id,
          };
          if (!Schema.is(DependRequest)(input)) {
            const entry = yield* this.store.reject({
              ...identity,
              event,
              reason: "validation",
            });
            return {
              outcome: "rejected",
              reason: entry.reason ?? "validation",
              latest: before,
            } satisfies EdgeCommandResult;
          }
          if (!before || !index.tasks.has(input.blocker_id)) {
            const dependency_error: DependencyError = {
              generated_at,
              code: "dependency_profile_mismatch",
              message:
                "Choose two visible Tasks in the same Profile. Move drops Dependencies; copy creates none.",
              details: edge,
            };
            yield* this.store.reject({
              ...identity,
              event,
              from_version: input.from_version,
              reason: dependency_error.code,
              dependency_error,
            });
            return {
              outcome: "rejected",
              reason: dependency_error.code,
              latest: before,
              dependency_error,
            } satisfies EdgeCommandResult;
          }
          const exists = (index.upstream.get(before.id) ?? []).includes(
            input.blocker_id,
          );
          if ((action === "depend") === exists)
            return {
              outcome: "success",
              report: {
                generated_at,
                outcome: "unchanged",
                dependent_id: before.id,
                blocker_id: input.blocker_id,
                from_version: before.row_version,
                to_version: before.row_version,
                seq: null,
                warnings: [],
              },
            } satisfies EdgeCommandResult;
          const entry = yield* this.store.append({
            ...identity,
            event: {
              ...event,
              entity_version: 1,
              to_version: input.from_version + 1,
            },
          });
          if (entry.outcome === "rejected")
            return {
              outcome: "rejected",
              reason: entry.reason,
              latest: before,
              ...(entry.dependency_error
                ? { dependency_error: entry.dependency_error }
                : {}),
            } satisfies EdgeCommandResult;
          const updated = yield* this.store.graph(identity.profile);
          return {
            outcome: "success",
            report: {
              generated_at,
              outcome: action === "depend" ? "added" : "removed",
              dependent_id: before.id,
              blocker_id: input.blocker_id,
              from_version: input.from_version,
              to_version: Schema.decodeUnknownSync(Version)(
                input.from_version + 1,
              ),
              seq: entry.seq,
              warnings:
                action === "depend" ? dependencyWarnings(edge, updated) : [],
            },
          } satisfies EdgeCommandResult;
        }),
      );
    });
}

const executeBatch = Effect.fn(function* (
  store: OperationStore,
  request: AccessRequest,
  input: BatchEdgeRequest,
) {
  yield* store.auth.authenticate({ ...request, access: "write" });
  const generated_at = Schema.decodeUnknownSync(Instant)(
    new Date().toISOString(),
  );
  const commands = new DependencyCommands(store);
  const results: BatchEdgeReport["results"][number][] = [];
  for (const [index, item] of input.items.entries()) {
    const row = yield* commands
      .change(
        { ...request, task_id: item.dependent_id },
        { blocker_id: item.blocker_id, from_version: item.from_version },
        item.action,
      )
      .pipe(
        Effect.match({
          onSuccess: (result): BatchEdgeReport["results"][number] =>
            result.outcome === "success"
              ? {
                  index,
                  result: {
                    ...result.report,
                    ...(input.dry_run ? { dry_run: true } : {}),
                  },
                }
              : { index, ...edgeFailure(result, generated_at) },
          onFailure: (error): BatchEdgeReport["results"][number] => ({
            index,
            error: {
              generated_at,
              code:
                error._tag === "AuthError"
                  ? error.detail === "write_scope" ||
                    error.detail === "profile_scope"
                    ? "forbidden"
                    : "auth_required"
                  : "runtime",
              message:
                error._tag === "AuthError"
                  ? "Authorization changed. Sign in or choose an authorized Profile before retrying this item."
                  : "Storage failed. Check server status and retry this item.",
            },
            exit_code: error._tag === "AuthError" ? 3 : 1,
          }),
        }),
      );
    results.push(row);
  }
  return {
    generated_at,
    dry_run: input.dry_run ?? false,
    results,
  } satisfies BatchEdgeReport;
});
export const batchDepend = (
  store: OperationStore,
  request: AccessRequest,
  input: BatchEdgeRequest,
) =>
  input.dry_run
    ? Effect.andThen(
        store.auth.authenticate({ ...request, access: "write" }),
        Effect.acquireUseRelease(
          store.fork(),
          (copy) => executeBatch(copy, request, input),
          (copy) => Effect.orDie(copy.close()),
        ),
      )
    : executeBatch(store, request, input);

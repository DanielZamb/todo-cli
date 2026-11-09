import { Schema } from "effect";
import { Edge } from "./dependencies.ts";
import { Task } from "./entities.ts";
import { ProfileId, TaskId } from "./ids.ts";
import { Instant } from "./time.ts";

const count = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));
export const RemainingEnergySchema = Schema.Struct({
  energy: count,
  unweighted: count,
});
export const GraphNode = Schema.Struct({
  mermaid_id: Schema.String.check(Schema.isPattern(/^n[0-9]+$/u)),
  task: Task,
  in_degree: count,
  out_degree: count,
  ready: Schema.Boolean,
  blocked: Schema.Boolean,
  ancestors: Schema.Array(TaskId),
  descendants: Schema.Array(TaskId),
  depth: count,
  remaining_energy: RemainingEnergySchema,
  lightest_next: Schema.Array(TaskId),
});
const graphFields = {
  generated_at: Instant,
  profile_id: ProfileId,
  task_id: TaskId,
  nodes: Schema.Array(GraphNode).check(Schema.isMinLength(1)),
  edges: Schema.Array(Edge),
  sources: Schema.Array(TaskId),
  sinks: Schema.Array(TaskId),
  topological_order: Schema.Array(TaskId),
  mermaid: Schema.NonEmptyString,
};
export const GraphReport = Schema.Union([
  Schema.Struct({
    ...graphFields,
    shape: Schema.Literal("tree"),
    orientation: Schema.Literals(["converging", "diverging", "mixed"]),
  }),
  Schema.Struct({
    ...graphFields,
    shape: Schema.Literals(["single", "chain", "dag"]),
  }),
]);
export type GraphReport = typeof GraphReport.Type;

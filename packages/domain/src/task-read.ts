import { Schema } from "effect";
import { Edge, VersionChange } from "./dependencies.ts";
import { DependencyWarning } from "./dependency-contract.ts";
import { Task } from "./entities.ts";
import { RemainingEnergySchema } from "./graph-contract.ts";
import { TaskId } from "./ids.ts";
import { SearchMatches } from "./task-search.ts";

export const DependencyReadFields = {
  depends_on: Schema.optionalKey(Schema.Array(TaskId)),
  blocks: Schema.optionalKey(Schema.Array(TaskId)),
  ready: Schema.optionalKey(Schema.Boolean),
  blocked: Schema.optionalKey(Schema.Boolean),
  remaining_energy: Schema.optionalKey(RemainingEnergySchema),
};
export const TaskWrite = Schema.Struct({
  ...Task.fields,
  dependency_warnings: Schema.optionalKey(Schema.Array(DependencyWarning)),
  removed_dependencies: Schema.optionalKey(Schema.Array(Edge)),
  affected_versions: Schema.optionalKey(Schema.Array(VersionChange)),
  dependency_fingerprint: Schema.optionalKey(Schema.String),
  dry_run: Schema.optionalKey(Schema.Boolean),
}).annotate({ identifier: "TaskWrite" });
export type TaskWrite = typeof TaskWrite.Type;
export const TaskRead = Schema.Struct({
  ...DependencyReadFields,
  ...Task.fields,
  search_matches: Schema.optionalKey(SearchMatches),
});
export type TaskRead = typeof TaskRead.Type;

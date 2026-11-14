import {
  DependencyError,
  Edge,
  TaskLookupDetails,
  VersionChange,
} from "@todo/domain";
import {
  ErrorDetails,
  ExternalIdConflictDetails,
} from "@todo/domain/presentation";
import { Schema } from "effect";
import { registerCommandSchema } from "./schema.ts";

const TransferResult = Schema.Struct({
  source_id: Schema.String,
  target_id: Schema.NullOr(Schema.String),
  outcome: Schema.String,
  occurrence_as_plain_task: Schema.Boolean,
  managed_image_count: Schema.optionalKey(Schema.Int),
  managed_image_bytes: Schema.optionalKey(Schema.Int),
  current_version: Schema.optionalKey(Schema.Int),
  message: Schema.optionalKey(Schema.String),
  details: Schema.optionalKey(
    Schema.Union([
      ExternalIdConflictDetails,
      TaskLookupDetails,
      ...DependencyError.members.map((member) => member.fields.details),
    ]),
  ),
  removed_dependencies: Schema.optionalKey(Schema.Array(Edge)),
  affected_versions: Schema.optionalKey(Schema.Array(VersionChange)),
});
export type TransferResult = typeof TransferResult.Type;
export const TransferResponse = Schema.Struct({
  generated_at: Schema.String,
  dry_run: Schema.Boolean,
  results: Schema.Array(TransferResult),
  exit_code: Schema.optionalKey(Schema.Literals([1, 2, 3, 4])),
  exit_meaning: Schema.optionalKey(
    Schema.Literals([
      "runtime failure",
      "validation or usage",
      "not found or auth missing",
      "Conflict",
    ]),
  ),
  code: Schema.optionalKey(Schema.String),
  message: Schema.optionalKey(Schema.String),
  details: ErrorDetails,
});
registerCommandSchema("move", TransferResponse);
registerCommandSchema("copy", TransferResponse);

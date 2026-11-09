import { DependencyError, Edge, VersionChange } from "@todo/domain";
import {
  ErrorResponse,
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
  code: Schema.optionalKey(Schema.String),
  message: Schema.optionalKey(Schema.String),
  details: ErrorResponse.fields.details,
});
registerCommandSchema("move", TransferResponse);
registerCommandSchema("copy", TransferResponse);

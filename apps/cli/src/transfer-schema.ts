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
  details: Schema.optionalKey(ExternalIdConflictDetails),
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

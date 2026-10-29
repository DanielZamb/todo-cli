import { Schema } from "effect";
import { TagId, TaskId, Version } from "./ids.ts";
import { TaskPatch } from "./task-commands.ts";
import { Instant } from "./time.ts";

export const ImportItem = Schema.Struct({
  ...TaskPatch.fields,
  external_id: Schema.NonEmptyString.check(Schema.isPattern(/\S/)),
  project_name: Schema.optionalKey(Schema.NullOr(Schema.String)),
  tags: Schema.optionalKey(Schema.NullOr(Schema.Array(TagId))),
  tag_names: Schema.optionalKey(Schema.NullOr(Schema.Array(Schema.String))),
  status: Schema.optionalKey(Schema.Literals(["open", "done", "cancelled"])),
  task_id: Schema.optionalKey(Schema.NullOr(TaskId)),
  from_version: Schema.optionalKey(Schema.NullOr(Version)),
});
export type ImportItem = typeof ImportItem.Type;
export const ImportCancellation = Schema.Struct({
  external_id: Schema.NonEmptyString,
  task_id: TaskId,
  from_version: Version,
});
export const ImportRequest = Schema.Struct({
  file_name: Schema.optionalKey(
    Schema.NonEmptyString.check(Schema.isMaxLength(480)),
  ),
  items: Schema.Array(Schema.Json),
  dry_run: Schema.optionalKey(Schema.Boolean),
  close_missing: Schema.optionalKey(Schema.Boolean),
  close_missing_candidates: Schema.optionalKey(
    Schema.Array(ImportCancellation),
  ),
});
export type ImportRequest = typeof ImportRequest.Type;
export const ImportRow = Schema.Struct({
  external_id: Schema.String,
  outcome: Schema.Literals(["created", "updated", "unchanged", "rejected"]),
  task_id: Schema.NullOr(TaskId),
  from_version: Schema.NullOr(Version),
  changed_fields: Schema.Array(Schema.String),
  error: Schema.optionalKey(
    Schema.Struct({
      code: Schema.String,
      message: Schema.String,
      details: Schema.optionalKey(
        Schema.Struct({ current_version: Schema.NullOr(Version) }),
      ),
    }),
  ),
});
export type ImportRow = typeof ImportRow.Type;
export const ImportReport = Schema.Struct({
  generated_at: Instant,
  dry_run: Schema.Boolean,
  items: Schema.Array(ImportRow),
  totals: Schema.Struct({
    created: Schema.Int,
    updated: Schema.Int,
    unchanged: Schema.Int,
    rejected: Schema.Int,
  }),
});
export type ImportReport = typeof ImportReport.Type;

export function parseImportText(text: string): ImportRequest["items"] {
  const trimmed = text.trim();
  if (!trimmed)
    throw new Error(
      "Import file is empty. Supply a JSON array or NDJSON Tasks.",
    );
  return trimmed.startsWith("[")
    ? Schema.decodeUnknownSync(Schema.Array(Schema.Json))(JSON.parse(trimmed))
    : trimmed
        .split(/\r?\n/)
        .filter((line) => line.trim())
        .map((line) => Schema.decodeUnknownSync(Schema.Json)(JSON.parse(line)));
}

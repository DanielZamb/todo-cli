import { Schema } from "effect";
import { AttachmentInput } from "./attachments.ts";
import { DependencyError } from "./dependencies.ts";
import { TagId, TaskId, Version } from "./ids.ts";
import {
  ExternalIdInput,
  inputLimits,
  limitedItems,
  NameInput,
  TagNamesInput,
  TaskIdInput,
} from "./limits.ts";
import { TaskPatch } from "./task-commands.ts";
import { Instant } from "./time.ts";

export const ImportItem = Schema.Struct({
  depends_on: Schema.optionalKey(
    limitedItems(ExternalIdInput, 13).check(
      Schema.makeFilter(
        (ids) =>
          new Set(ids).size === ids.length ||
          "Each Dependency external id must occur once.",
      ),
    ),
  ),
  attachments: Schema.optionalKey(
    limitedItems(AttachmentInput, inputLimits.attachmentsPerTask),
  ),
  ...TaskPatch.fields,
  external_id: ExternalIdInput,
  project_name: Schema.optionalKey(Schema.NullOr(NameInput)),
  tags: Schema.optionalKey(
    Schema.NullOr(limitedItems(TagId, inputLimits.tagsPerTask)),
  ),
  tag_names: Schema.optionalKey(Schema.NullOr(TagNamesInput)),
  status: Schema.optionalKey(Schema.Literals(["open", "done", "cancelled"])),
  task_id: Schema.optionalKey(Schema.NullOr(TaskIdInput)),
  from_version: Schema.optionalKey(Schema.NullOr(Version)),
});
export type ImportItem = typeof ImportItem.Type;
export const ImportCancellation = Schema.Struct({
  // A reference to a stored Task's id, which may predate the limit.
  external_id: Schema.NonEmptyString,
  task_id: TaskIdInput,
  from_version: Version,
});
export const ImportRequest = Schema.Struct({
  file_name: Schema.optionalKey(
    Schema.NonEmptyString.check(Schema.isMaxLength(480)),
  ),
  items: limitedItems(Schema.Json),
  dry_run: Schema.optionalKey(Schema.Boolean),
  close_missing: Schema.optionalKey(Schema.Boolean),
  close_missing_candidates: Schema.optionalKey(
    limitedItems(ImportCancellation, inputLimits.closeMissingCandidates),
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
        Schema.Struct({
          current_version: Schema.NullOr(Version),
          dependency_error: Schema.optionalKey(DependencyError),
        }),
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

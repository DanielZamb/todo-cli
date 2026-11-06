import { Schema } from "effect";
import { AttachmentId, TaskId, Version } from "./ids.ts";
import { inputLimits, limitedItems, NonEmptyNameInput } from "./limits.ts";
import { Instant } from "./time.ts";

export const attachmentLimit = 20 * 1024 * 1024;
export const ImageMime = Schema.Literals([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
]);
export type ImageMime = typeof ImageMime.Type;
export const AttachmentPath = Schema.NonEmptyString.check(
  Schema.isPattern(/^\/[^\0]*$/),
);
const fields = {
  id: AttachmentId,
  name: Schema.optionalKey(Schema.NonEmptyString),
  label: Schema.optionalKey(Schema.NonEmptyString),
  added_at: Instant,
};
const AttachmentUrl = Schema.NonEmptyString.check(
  Schema.isPattern(/^[a-z][a-z\d+.-]*:[^\s]*$/i),
);
export const AttachmentLocation = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("file"), path: AttachmentPath }),
  Schema.Struct({ kind: Schema.Literal("image"), path: AttachmentPath }),
  Schema.Struct({ kind: Schema.Literal("link"), url: AttachmentUrl }),
]);
// What a client may submit: the stored Attachment above is not limited.
const PathInput = AttachmentPath.check(Schema.isMaxLength(inputLimits.path));
const AttachmentLocationInput = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("file"), path: PathInput }),
  Schema.Struct({ kind: Schema.Literal("image"), path: PathInput }),
  Schema.Struct({
    kind: Schema.Literal("link"),
    url: AttachmentUrl.check(Schema.isMaxLength(inputLimits.url)),
  }),
]);
const LabelInput = Schema.optionalKey(NonEmptyNameInput);
export const Attachment = Schema.Union([
  Schema.Struct({ ...fields, ...AttachmentLocation.members[0].fields }),
  Schema.Struct({
    ...fields,
    ...AttachmentLocation.members[1].fields,
    byte_size: Schema.optionalKey(
      Schema.Number.check(Schema.isInt(), Schema.isGreaterThan(0)),
    ),
  }),
  Schema.Struct({ ...fields, ...AttachmentLocation.members[2].fields }),
]).annotate({ identifier: "Attachment" });
export type Attachment = typeof Attachment.Type;
export const AttachmentStatus = Schema.Union([
  Schema.Struct({
    ...Attachment.members[0].fields,
    exists: Schema.NullOr(Schema.Boolean),
  }),
  Schema.Struct({
    ...Attachment.members[1].fields,
    exists: Schema.NullOr(Schema.Boolean),
  }),
  Schema.Struct({
    ...Attachment.members[2].fields,
    exists: Schema.NullOr(Schema.Boolean),
  }),
]);
export const AttachTask = Schema.Struct({
  name: LabelInput,
  from_version: Version,
  location: AttachmentLocationInput,
  label: LabelInput,
});
export type AttachTask = typeof AttachTask.Type;
export function validAttachmentLocation(location: AttachTask["location"]) {
  if (location.kind !== "link") return true;
  if (
    !Schema.is(AttachmentLocation.members[2])(location) ||
    Array.from(location.url).some(
      (character) =>
        character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
    )
  )
    return false;
  try {
    const url = new URL(location.url);
    return !["http:", "https:"].includes(url.protocol) || url.hostname !== "";
  } catch {
    return false;
  }
}
export const DetachTask = Schema.Struct({
  from_version: Version,
  attachment_id: AttachmentId,
});
export type DetachTask = typeof DetachTask.Type;
export const LabelAttachment = Schema.Struct({
  from_version: Version,
  attachment_id: AttachmentId,
  label: Schema.NullOr(NonEmptyNameInput),
});
export type LabelAttachment = typeof LabelAttachment.Type;
export const UploadAttachment = Schema.Struct({
  from_version: Version,
  name: LabelInput,
  mime_type: ImageMime,
  data: Schema.NonEmptyString.check(
    Schema.isMaxLength(Math.ceil(attachmentLimit / 3) * 4),
  ),
  label: LabelInput,
});
export type UploadAttachment = typeof UploadAttachment.Type;

const inputFields = { label: LabelInput, name: LabelInput };
export const AttachmentInput = Schema.Union([
  Schema.Struct({
    ...AttachmentLocationInput.members[0].fields,
    ...inputFields,
  }),
  Schema.Struct({
    ...AttachmentLocationInput.members[1].fields,
    ...inputFields,
  }),
  Schema.Struct({
    ...AttachmentLocationInput.members[2].fields,
    ...inputFields,
  }),
]);
export type AttachmentInput = typeof AttachmentInput.Type;
export const AttachManyItem = Schema.Struct({
  task_id: TaskId,
  from_version: Version,
  attachments: limitedItems(
    AttachmentInput,
    inputLimits.attachmentsPerTask,
  ).check(Schema.isMinLength(1)),
});
export type AttachManyItem = typeof AttachManyItem.Type;
export const AttachManyRequest = Schema.Struct({
  items: limitedItems(Schema.Json),
  dry_run: Schema.optionalKey(Schema.Boolean),
});
export type AttachManyRequest = typeof AttachManyRequest.Type;
export const AttachManyRow = Schema.Struct({
  task_id: Schema.NullOr(TaskId),
  from_version: Schema.NullOr(Version),
  current_version: Schema.NullOr(Version),
  outcome: Schema.Literals(["attached", "unchanged", "rejected"]),
  attached: Schema.Int,
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
export type AttachManyRow = typeof AttachManyRow.Type;
export const AttachManyReport = Schema.Struct({
  generated_at: Instant,
  dry_run: Schema.Boolean,
  items: Schema.Array(AttachManyRow),
  totals: Schema.Struct({
    attached: Schema.Int,
    unchanged: Schema.Int,
    rejected: Schema.Int,
  }),
});
export type AttachManyReport = typeof AttachManyReport.Type;

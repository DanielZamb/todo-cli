import { Schema } from "effect";
import { AttachmentId, Version } from "./ids.ts";
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
export const AttachmentLocation = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("file"), path: AttachmentPath }),
  Schema.Struct({ kind: Schema.Literal("image"), path: AttachmentPath }),
  Schema.Struct({
    kind: Schema.Literal("link"),
    url: Schema.NonEmptyString.check(Schema.isPattern(/^https?:\/\/[^\s]+$/i)),
  }),
]);
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
  from_version: Version,
  location: AttachmentLocation,
  label: Schema.optionalKey(Schema.NonEmptyString),
});
export type AttachTask = typeof AttachTask.Type;
export function validAttachmentLocation(location: AttachTask["location"]) {
  if (location.kind !== "link") return true;
  try {
    const url = new URL(location.url);
    return (
      ["http:", "https:"].includes(url.protocol) &&
      url.hostname !== "" &&
      url.username === "" &&
      url.password === ""
    );
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
  label: Schema.NullOr(Schema.NonEmptyString),
});
export type LabelAttachment = typeof LabelAttachment.Type;
export const UploadAttachment = Schema.Struct({
  from_version: Version,
  name: Schema.optionalKey(Schema.NonEmptyString),
  mime_type: ImageMime,
  data: Schema.NonEmptyString.check(
    Schema.isMaxLength(Math.ceil(attachmentLimit / 3) * 4),
  ),
  label: Schema.optionalKey(Schema.NonEmptyString),
});
export type UploadAttachment = typeof UploadAttachment.Type;

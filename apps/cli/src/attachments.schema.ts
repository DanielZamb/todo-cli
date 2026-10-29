import { AttachmentStatus } from "@todo/domain";
import { Schema } from "effect";
import { registerCommandSchema } from "./schema.ts";
export const AttachmentCommandResponse = Schema.Struct({
  generated_at: Schema.String,
  dry_run: Schema.Boolean,
  task: Schema.Struct({
    id: Schema.String,
    row_version: Schema.Number,
    attachments: Schema.Array(AttachmentStatus),
  }),
});
export const attachmentCommandSchemas = {
  attach: AttachmentCommandResponse,
  detach: AttachmentCommandResponse,
};
registerCommandSchema("attach", AttachmentCommandResponse);
registerCommandSchema("detach", AttachmentCommandResponse);

registerCommandSchema("label-attachment", AttachmentCommandResponse);

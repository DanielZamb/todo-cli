import { statSync } from "node:fs";
import { extname, resolve } from "node:path";
import { Schema } from "effect";
import {
  Attachment,
  AttachmentInput,
  validAttachmentLocation,
} from "./attachments.ts";
import type { Instant } from "./time.ts";

export function validateAttachmentInputs(inputs: readonly AttachmentInput[]) {
  for (const input of inputs) {
    Schema.decodeUnknownSync(AttachmentInput)(input);
    if (!validAttachmentLocation(input))
      throw new Error(
        "Use an absolute URI; HTTP(S) links need a host and no credentials.",
      );
    if (input.kind !== "link" && !statSync(input.path).isFile())
      throw new Error(`Attachment path is not a file: ${input.path}`);
  }
}

export function resolveAttachments(
  inputs: readonly AttachmentInput[],
  time: Instant,
) {
  validateAttachmentInputs(inputs);
  return inputs.map((input) =>
    Schema.decodeUnknownSync(Attachment)({
      ...input,
      id: crypto.randomUUID(),
      added_at: time,
    }),
  );
}

export function attachmentInput(
  value: string,
  kind: "file" | "link" | "auto" = "auto",
  label?: string,
): AttachmentInput {
  const location =
    kind === "link" || (kind === "auto" && /^[a-z][a-z\d+.-]*:/i.test(value))
      ? { kind: "link", url: value }
      : {
          kind: [".png", ".jpg", ".jpeg", ".gif", ".webp"].includes(
            extname(value).toLowerCase(),
          )
            ? "image"
            : "file",
          path: resolve(value),
        };
  const input = Schema.decodeUnknownSync(AttachmentInput)({
    ...location,
    ...(label === undefined ? {} : { label }),
  });
  if (!validAttachmentLocation(input))
    throw new Error(
      "Use an absolute URI; HTTP(S) links need a host and no credentials.",
    );
  return input;
}

export function sameAttachment(a: AttachmentInput, b: AttachmentInput) {
  return (
    a.kind === b.kind &&
    (a.kind === "link" && b.kind === "link"
      ? a.url === b.url
      : "path" in a && "path" in b && a.path === b.path) &&
    a.label === b.label &&
    a.name === b.name
  );
}

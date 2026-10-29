import { ImageMime } from "@todo/domain";
import { Schema } from "effect";
import { clipboard, dialog, shell } from "electron";
import {
  localAttachmentStatus,
  openableAttachmentPath,
} from "./attachment-files.ts";
import type { Request } from "./protocol.ts";
import { NativeAttachmentRequest, type Reply } from "./protocol.ts";
export const isNativeAttachmentRequest = (
  request: Request,
): request is typeof NativeAttachmentRequest.Type =>
  Schema.is(NativeAttachmentRequest)(request);
export async function nativeAttachmentRequest(
  request: typeof NativeAttachmentRequest.Type,
): Promise<Reply> {
  try {
    switch (request._tag) {
      case "attachmentClipboard":
        return {
          _tag: "attachmentClipboard",
          hasImage: (await clipboard.read()).some((item) =>
            item.types.some(Schema.is(ImageMime)),
          ),
        };
      case "pickAttachment": {
        const result = await dialog.showOpenDialog({
          title: "Attach files",
          properties: ["openFile", "multiSelections"],
        });
        return {
          _tag: "attachmentPaths",
          paths: result.canceled ? [] : result.filePaths,
        };
      }
      case "pasteAttachment": {
        for (const item of await clipboard.read()) {
          const mime = item.types.find(Schema.is(ImageMime));
          if (mime !== undefined) {
            const image = await item.getType(mime);
            return {
              _tag: "attachmentImage",
              mime_type: mime,
              data: Buffer.from(await image.arrayBuffer()).toString("base64"),
            };
          }
        }
        return {
          _tag: "error",
          message: "Copy an image, then choose Paste image.",
        };
      }
      case "attachmentStatus":
        return {
          _tag: "attachmentStatus",
          ...localAttachmentStatus(request.attachment),
        };
      case "openAttachment": {
        if (request.attachment.kind === "link") {
          const url = new URL(request.attachment.url);
          if (
            !["https:", "http:"].includes(url.protocol) ||
            url.username ||
            url.password
          )
            throw new Error("Only HTTP/HTTPS links can open");
          await shell.openExternal(url.href);
        } else {
          const path = openableAttachmentPath(request.attachment.path);
          if (request.action === "reveal") shell.showItemInFolder(path);
          else {
            const error = await shell.openPath(path);
            if (error) throw new Error(error);
          }
        }
        return { _tag: "ok" };
      }
    }
  } catch (error) {
    return {
      _tag: "error",
      message:
        error instanceof Error
          ? error.message
          : "Could not access the Attachment",
    };
  }
}

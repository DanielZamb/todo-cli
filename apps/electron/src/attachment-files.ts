import {
  closeSync,
  constants,
  existsSync,
  fstatSync,
  openSync,
  readFileSync,
  realpathSync,
  statSync,
} from "node:fs";
import { extname, resolve, sep } from "node:path";
import { type Attachment, attachmentLimit } from "@todo/domain";
import { imageMime } from "@todo/domain/attachment-store";

const executableExtensions = new Set([
  ".app",
  ".bundle",
  ".exe",
  ".com",
  ".bat",
  ".cmd",
  ".sh",
  ".bash",
  ".zsh",
  ".command",
  ".py",
  ".rb",
  ".pl",
  ".js",
  ".mjs",
  ".cjs",
  ".jar",
  ".pkg",
  ".dmg",
  ".scpt",
  ".workflow",
]);
export function openableAttachmentPath(path: string) {
  const target = realpathSync(path);
  for (const candidate of [resolve(path), target]) {
    if (candidate.split(sep).some((part) => /\.(app|bundle)$/i.test(part)))
      throw new Error("Todo cannot open app bundles");
    if (executableExtensions.has(extname(candidate).toLowerCase()))
      throw new Error("Todo cannot open executables or scripts");
  }
  const stat = statSync(target);
  if (!stat.isFile() || (stat.mode & 0o111) !== 0)
    throw new Error("Todo cannot open executables or folders");
  return target;
}
export function localAttachmentStatus(attachment: Attachment) {
  if (attachment.kind === "link") return { exists: null, preview: null };
  const exists = existsSync(attachment.path);
  if (!exists || attachment.kind !== "image") return { exists, preview: null };
  const path = openableAttachmentPath(attachment.path);
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    if (fstatSync(fd).size > attachmentLimit) return { exists, preview: null };
    const bytes = readFileSync(fd);
    const mime = imageMime(bytes);
    return {
      exists,
      preview: mime ? `data:${mime};base64,${bytes.toString("base64")}` : null,
    };
  } finally {
    closeSync(fd);
  }
}

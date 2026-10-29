import {
  closeSync,
  constants,
  existsSync,
  lstatSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { Schema } from "effect";
import {
  type Attachment,
  attachmentLimit,
  type ImageMime,
} from "./attachments.ts";
import type { Task } from "./entities.ts";
import { AttachmentId } from "./ids.ts";

export const attachmentSegment = (value: string) =>
  Buffer.from(value, "utf8").toString("hex");
export const attachmentDirectory = (
  root: string,
  profile: string,
  task: string,
) => join(resolve(root), attachmentSegment(profile), attachmentSegment(task));
const inside = (root: string, path: string) => {
  const distance = relative(root, path);
  return (
    distance !== "" &&
    !isAbsolute(distance) &&
    distance !== ".." &&
    !distance.startsWith(`..${sep}`)
  );
};
const assertInside = (root: string, path: string) => {
  if (!inside(realpathSync(root), realpathSync(path)))
    throw new Error("Attachment path escapes the attachment store");
  let cursor = resolve(root);
  for (const part of [
    "",
    ...relative(resolve(root), resolve(path)).split(sep),
  ]) {
    cursor = join(cursor, part);
    if (lstatSync(cursor).isSymbolicLink())
      throw new Error("Attachment store refuses symbolic links");
  }
};
const assertTree = (root: string, path: string): void => {
  assertInside(root, path);
  if (lstatSync(path).isSymbolicLink())
    throw new Error("Attachment store refuses symbolic links");
  if (lstatSync(path).isDirectory())
    for (const child of readdirSync(path)) assertTree(root, join(path, child));
};
const extensions = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
};
export const imageMime = (bytes: Uint8Array): ImageMime | null => {
  const data = Buffer.from(bytes);
  if (
    data.length >= 8 &&
    data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    return "image/png";
  if (data.length >= 3 && data[0] === 255 && data[1] === 216 && data[2] === 255)
    return "image/jpeg";
  if (["GIF87a", "GIF89a"].includes(data.subarray(0, 6).toString("ascii")))
    return "image/gif";
  if (
    data.length >= 12 &&
    data.subarray(0, 4).toString("ascii") === "RIFF" &&
    data.subarray(8, 12).toString("ascii") === "WEBP"
  )
    return "image/webp";
  return null;
};
export const decodeImage = (data: string, mime: ImageMime) => {
  if (data.length > Math.ceil(attachmentLimit / 3) * 4)
    throw new Error("Image exceeds the 20 MiB limit");
  const bytes = Buffer.from(data, "base64");
  if (bytes.toString("base64") !== data)
    throw new Error("Image data must be base64");
  if (bytes.length === 0 || bytes.length > attachmentLimit)
    throw new Error("Image exceeds the 20 MiB limit");
  if (imageMime(bytes) !== mime)
    throw new Error("Image bytes do not match the declared MIME type");
  return bytes;
};
export function writeImage(
  root: string,
  profile: string,
  task: string,
  id: string,
  bytes: Uint8Array,
  mime: ImageMime,
) {
  if (bytes.length > attachmentLimit || imageMime(bytes) !== mime)
    throw new Error("Invalid attachment image");
  mkdirSync(root, { recursive: true, mode: 0o700 });
  const directory = attachmentDirectory(root, profile, task);
  const profileDirectory = dirname(directory);
  mkdirSync(profileDirectory, { recursive: true, mode: 0o700 });
  assertInside(root, profileDirectory);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  assertTree(root, directory);
  const path = join(directory, `${attachmentSegment(id)}.${extensions[mime]}`);
  const fd = openSync(
    path,
    constants.O_WRONLY |
      constants.O_CREAT |
      constants.O_EXCL |
      constants.O_NOFOLLOW,
    0o600,
  );
  try {
    try {
      writeFileSync(fd, bytes);
    } finally {
      closeSync(fd);
    }
  } catch (cause) {
    removeWrittenImage(root, path);
    throw cause;
  }
  return path;
}
export function eraseTaskAttachments(
  root: string,
  profile: string,
  task: string,
) {
  const directory = attachmentDirectory(root, profile, task);
  if (!existsSync(directory) && !lstatExists(directory)) return;
  assertTree(root, directory);
  rmSync(directory, { recursive: true });
}
const lstatExists = (path: string) => {
  try {
    lstatSync(path);
    return true;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT")
      return false;
    throw error;
  }
};
export function readManagedImage(
  root: string,
  attachment: Attachment,
  taskId: string,
) {
  if (attachment.kind !== "image")
    throw new Error("Attachment is not an image");
  const path = attachment.path;
  assertInside(root, path);
  const parts = relative(resolve(root), resolve(path)).split(sep);
  if (
    parts.length !== 3 ||
    !parts.every((part) =>
      /^[a-f0-9]+(?:\.(?:png|jpg|gif|webp))?$/.test(part),
    ) ||
    parts[1] !== attachmentSegment(taskId) ||
    !parts[2]?.startsWith(`${attachmentSegment(attachment.id)}.`)
  )
    throw new Error("Image is outside the managed layout");
  assertTree(root, dirname(path));
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    if (lstatSync(path).size > attachmentLimit)
      throw new Error("Image exceeds the 20 MiB limit");
    const bytes = readFileSync(fd);
    const mime_type = imageMime(bytes);
    if (mime_type === null) throw new Error("Invalid image bytes");
    return { mime_type, data: bytes.toString("base64") };
  } finally {
    closeSync(fd);
  }
}
export const attachmentExists = (attachment: Attachment) =>
  attachment.kind === "link" ? null : existsSync(attachment.path);

export function removeWrittenImage(root: string, path: string) {
  if (!lstatExists(path)) return;
  assertInside(root, path);
  rmSync(path, { force: true });
}
const managedImage = (root: string, task: Task, attachment: Attachment) => {
  if (attachment.kind !== "image") return false;
  const parts = relative(resolve(root), resolve(attachment.path)).split(sep);
  return (
    parts.length === 3 &&
    parts[1] === attachmentSegment(task.id) &&
    parts[2]?.startsWith(`${attachmentSegment(attachment.id)}.`) === true
  );
};
export function attachmentCopyStats(root: string, task: Task) {
  let count = 0,
    bytes = 0;
  for (const attachment of task.attachments ?? [])
    if (managedImage(root, task, attachment)) {
      const image = readManagedImage(root, attachment, task.id);
      count++;
      bytes += Buffer.from(image.data, "base64").length;
    }
  return { managed_image_count: count, managed_image_bytes: bytes };
}
export function copyAttachments(
  root: string,
  source: Task,
  target: Pick<Task, "id" | "profile_id">,
  created: string[],
  copyManaged = true,
) {
  return source.attachments?.map((attachment) => {
    const id = Schema.decodeUnknownSync(AttachmentId)(crypto.randomUUID());
    if (!managedImage(root, source, attachment)) return { ...attachment, id };
    const image = readManagedImage(root, attachment, source.id);
    if (!copyManaged) return { ...attachment, id };
    const path = writeImage(
      root,
      target.profile_id,
      target.id,
      id,
      Buffer.from(image.data, "base64"),
      image.mime_type,
    );
    created.push(path);
    return { ...attachment, id, path };
  });
}

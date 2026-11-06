import { execFileSync } from "node:child_process";
import {
  closeSync,
  constants,
  existsSync,
  fstatSync,
  openSync,
  readFileSync,
  readSync,
  realpathSync,
  statSync,
} from "node:fs";
import { extname, resolve, sep } from "node:path";
import { type Attachment, attachmentLimit } from "@todo/domain";
import { imageMime } from "@todo/domain/attachment-store";

// Keep this list identical to AttachmentOpening.blocked in the SwiftUI client.
// Files of these types run code, install software or settings, or open another
// location when macOS opens them (ADR-0011).
const executableExtensions = new Set([
  ".app",
  ".bundle",
  ".exe",
  ".com",
  ".bat",
  ".cmd",
  ".ps1",
  ".vbs",
  ".msi",
  ".sh",
  ".bash",
  ".zsh",
  ".csh",
  ".tcsh",
  ".ksh",
  ".fish",
  ".command",
  ".tool",
  ".terminal",
  ".py",
  ".rb",
  ".pl",
  ".php",
  ".lua",
  ".tcl",
  ".js",
  ".mjs",
  ".cjs",
  ".jar",
  ".jnlp",
  ".pkg",
  ".mpkg",
  ".dmg",
  ".xip",
  ".scpt",
  ".scptd",
  ".applescript",
  ".osascript",
  ".workflow",
  ".action",
  ".caction",
  ".shortcut",
  ".mobileconfig",
  ".configprofile",
  ".provisionprofile",
  ".webloc",
  ".inetloc",
  ".fileloc",
  ".afploc",
  ".ftploc",
  ".smbloc",
  ".url",
  ".prefpane",
  ".plugin",
  ".kext",
  ".appex",
  ".framework",
  ".osax",
  ".qlgenerator",
  ".saver",
  ".wdgt",
  ".mdimporter",
  ".service",
  ".xpc",
  ".systemextension",
  ".dext",
  ".component",
  ".definition",
  ".inputplugin",
]);
// A Finder alias opens its original, which realpath never resolves. Modern
// aliases start with bookmark data; any alias carries the Finder kIsAlias flag.
const bookmarkMagic = Buffer.from("book\0\0\0\0mark", "latin1");
function isFinderAlias(path: string) {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const head = Buffer.alloc(bookmarkMagic.length);
    const read = readSync(fd, head, 0, head.length, 0);
    if (read === head.length && head.equals(bookmarkMagic)) return true;
  } finally {
    closeSync(fd);
  }
  let finderInfo: string;
  try {
    finderInfo = execFileSync(
      "/usr/bin/xattr",
      ["-px", "com.apple.FinderInfo", path],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    );
  } catch {
    return false;
  }
  const bytes = Buffer.from(finderInfo.replace(/\s+/g, ""), "hex");
  return bytes.length >= 10 && (bytes.readUInt16BE(8) & 0x8000) !== 0;
}
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
  if (isFinderAlias(target)) throw new Error("Todo cannot open Finder aliases");
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

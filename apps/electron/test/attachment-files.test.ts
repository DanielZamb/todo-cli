import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "@effect/vitest";
import { openableAttachmentPath } from "../src/attachment-files.ts";

it("refuses executable files, app bundles, and symlinks to either without opening them", () => {
  const root = mkdtempSync(join(tmpdir(), "todo-f11-open-"));
  try {
    const safe = join(root, "draft.md");
    writeFileSync(safe, "Jira draft", { mode: 0o600 });
    expect(openableAttachmentPath(safe)).toBe(
      join(realpathSync(root), "draft.md"),
    );
    const executable = join(root, "run");
    writeFileSync(executable, "#!/bin/sh\necho forbidden\n");
    chmodSync(executable, 0o700);
    symlinkSync(executable, join(root, "alias.md"));
    mkdirSync(join(root, "Unsafe.app"));
    const bundled = join(root, "Unsafe.app", "notes.md");
    writeFileSync(bundled, "Bundle content");
    symlinkSync(bundled, join(root, "bundle-alias.md"));
    for (const path of [
      executable,
      join(root, "alias.md"),
      bundled,
      join(root, "bundle-alias.md"),
    ])
      expect(() => openableAttachmentPath(path)).toThrow();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

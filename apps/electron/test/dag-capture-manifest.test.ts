import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, it } from "@effect/vitest";
import { writeDagCaptureManifest } from "../scripts/dag-capture-manifest.ts";

it("refuses premature and symlink-escaping capture receipt references", () => {
  const root = resolve(import.meta.dirname, "../../..");
  mkdirSync(join(root, ".scratch"), { recursive: true });
  const evidence = mkdtempSync(join(root, ".scratch/manifest-"));
  const external = mkdtempSync(join(tmpdir(), "todo-manifest-"));
  try {
    writeFileSync(join(evidence, "frame.png"), "fixture");
    const entry = { png: "frame.png", receipt: "missing.json" };
    expect(() => writeDagCaptureManifest(root, evidence, [entry])).toThrow(
      "missing repo input",
    );
    writeFileSync(join(external, "receipt.json"), "{}");
    symlinkSync(join(external, "receipt.json"), join(evidence, "escape.json"));
    expect(() =>
      writeDagCaptureManifest(root, evidence, [
        { ...entry, receipt: "escape.json" },
      ]),
    ).toThrow("symlink escapes");
    writeFileSync(join(evidence, "receipt.json"), "{}");
    expect(() =>
      writeDagCaptureManifest(root, evidence, [
        { ...entry, receipt: "receipt.json" },
      ]),
    ).not.toThrow();
  } finally {
    rmSync(evidence, { recursive: true, force: true });
    rmSync(external, { recursive: true, force: true });
  }
});

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import {
  repositoryPath,
  verificationRoot,
} from "../../../scripts/verification-inputs.ts";

const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;

export function xcodeCompilerGuards(
  root: string,
  directory: string,
  delegates: { swiftc: string; clang: string; "clang++": string },
) {
  assert.ok(!existsSync(directory), "Choose a fresh compiler guard directory");
  const bin = join(directory, "usr/bin");
  mkdirSync(bin, { recursive: true });
  const wrappers: Record<string, string> = {};
  for (const [name, delegate] of Object.entries(delegates)) {
    const path = join(bin, name);
    writeFileSync(
      path,
      `#!/bin/sh\nsh ${quote(join(root, "apps/electron/scripts/guarded-disk.sh"))} || exit $?\nexec ${quote(delegate)} "$@"\n`,
      { mode: 0o755 },
    );
    wrappers[name] = path;
  }
  const source = resolve(
    dirname(delegates.swiftc),
    "../share/swift/features.json",
  );
  const features = join(directory, "usr/share/swift/features.json");
  mkdirSync(dirname(features), { recursive: true });
  copyFileSync(source, features);
  return {
    settings: [
      `SWIFT_EXEC=${wrappers.swiftc}`,
      `CC=${wrappers.clang}`,
      `CPLUSPLUS=${wrappers["clang++"]}`,
    ],
    wrappers,
    features: {
      source,
      path: features,
      sha256: createHash("sha256").update(readFileSync(features)).digest("hex"),
      bytes: readFileSync(features).byteLength,
    },
  };
}

if (import.meta.main) {
  const root = verificationRoot(import.meta.dirname);
  const output = repositoryPath(
    root,
    process.argv[2] ?? "",
    "Xcode compiler guards",
  );
  const guard = join(root, "apps/electron/scripts/guarded-disk.sh");
  const find = (name: string) => {
    execFileSync("sh", [guard], { stdio: "inherit" });
    return execFileSync("xcrun", ["--find", name], { encoding: "utf8" }).trim();
  };
  const result = xcodeCompilerGuards(root, output, {
    swiftc: find("swiftc"),
    clang: find("clang"),
    "clang++": find("clang++"),
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

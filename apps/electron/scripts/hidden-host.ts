import { accessSync, constants, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, relative, resolve } from "node:path";

type LaunchOptions = NonNullable<
  Parameters<typeof import("@playwright/test")._electron.launch>[0]
>;

export function hiddenHostEntry(
  entry = resolve(import.meta.dirname, "../dist/verification/write-host.mjs"),
) {
  try {
    if (!statSync(entry).isFile()) throw new Error("Not a file");
    accessSync(entry, constants.R_OK);
  } catch {
    throw new Error(
      `Missing hidden-host entry: ${entry}. Build the unsigned verification host before launching.`,
    );
  }
  return entry;
}

export function hiddenHostOptions(
  options: Omit<LaunchOptions, "args" | "executablePath">,
): LaunchOptions {
  const entry = hiddenHostEntry();
  const executablePath = hiddenHostRuntime();
  return { ...options, executablePath, args: [entry] };
}

export function hiddenHostRuntime(
  directory = dirname(
    createRequire(import.meta.url).resolve("electron/package.json"),
  ),
) {
  let executablePath: string;
  try {
    const path = readFileSync(resolve(directory, "path.txt"), "utf8").trim();
    executablePath = resolve(directory, "dist", path);
    const part = relative(resolve(directory, "dist"), executablePath);
    if (!path || part === ".." || part.startsWith("../"))
      throw new Error("Invalid runtime path");
    if (!statSync(executablePath).isFile()) throw new Error("Not a file");
    accessSync(executablePath, constants.X_OK);
  } catch {
    throw new Error(
      "Missing installed Electron runtime. Background verification never installs or downloads Electron.",
    );
  }
  return executablePath;
}

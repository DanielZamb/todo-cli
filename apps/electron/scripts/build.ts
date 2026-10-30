import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { sign } from "@electron/osx-sign";
import { CONTRACT_ID } from "@todo/api";

const {
  values: { sign: signed, output },
} = parseArgs({
  args: process.argv.slice(2),
  options: {
    sign: { type: "boolean", default: false },
    output: { type: "string", default: "dist/Todo.app" },
  },
  allowPositionals: false,
});
if (
  signed &&
  (process.platform !== "darwin" ||
    process.env.TODO_ELECTRON_VERIFY_HOST === "1")
)
  throw new Error(
    "Signing requires a macOS user build without verification host mode",
  );
const signingIdentity = (process.env.TODO_SIGNING_IDENTITY ?? "").trim();
if (signed && !signingIdentity)
  throw new Error("Set TODO_SIGNING_IDENTITY before building a signed app");

execFileSync(resolve(import.meta.dirname, "../../../scripts/disk-guard.sh"), {
  stdio: "inherit",
});
mkdirSync("dist", { recursive: true });
let build = process.env.TODO_BUILD_ID;
if (!build) {
  try {
    build = execFileSync("git", ["rev-parse", "--short", "HEAD"], {
      encoding: "utf8",
    }).trim();
  } catch {
    build = "dev";
  }
}
const buildDefinition = `TODO_BUILD_ID=${JSON.stringify(build)}`;
writeFileSync(
  "dist/identity.json",
  `${JSON.stringify({ build, contract: CONTRACT_ID })}\n`,
);
execFileSync(
  "bun",
  [
    "build",
    "src/main.ts",
    "--define",
    buildDefinition,
    "--target=node",
    "--format=cjs",
    "--external=electron",
    "--outfile=dist/main.cjs",
  ],
  { stdio: "inherit" },
);
execFileSync(
  "bun",
  [
    "build",
    "src/preload.ts",
    "--target=node",
    "--format=cjs",
    "--external=electron",
    "--outfile=dist/preload.cjs",
  ],
  { stdio: "inherit" },
);
execFileSync("pnpm", ["exec", "vite", "build"], { stdio: "inherit" });

if (process.env.TODO_ELECTRON_VERIFY_HOST === "1") {
  execFileSync(
    "bun",
    [
      "build",
      "scripts/write-host.ts",
      "--define",
      buildDefinition,
      "--target=node",
      "--format=esm",
      "--external=electron",
      "--outfile=dist/verification/write-host.mjs",
    ],
    { stdio: "inherit" },
  );
}

if (
  process.platform === "darwin" &&
  process.env.TODO_ELECTRON_VERIFY_HOST !== "1"
) {
  const bundle = resolve(output);
  mkdirSync(resolve(bundle, ".."), { recursive: true });
  rmSync(bundle, { recursive: true, force: true });
  execFileSync("cp", [
    "-cR",
    "node_modules/electron/dist/Electron.app",
    bundle,
  ]);
  const resources = `${bundle}/Contents/Resources/app`;
  mkdirSync(`${resources}/dist`, { recursive: true });
  for (const file of ["main.cjs", "preload.cjs", "renderer"])
    cpSync(`dist/${file}`, `${resources}/dist/${file}`, { recursive: true });
  cpSync("package.json", `${resources}/package.json`);
  cpSync("dist/identity.json", `${resources}/identity.json`);
  for (const { source, destination } of [
    { source: "LICENSE", destination: "LICENSE.electron" },
    { source: "LICENSES.chromium.html", destination: "LICENSES.chromium.html" },
  ]) {
    cpSync(
      `node_modules/electron/dist/${source}`,
      `${bundle}/Contents/Resources/${destination}`,
    );
  }
  execFileSync(
    "bun",
    [
      resolve(import.meta.dirname, "../../../scripts/third-party-notices.ts"),
      `${resources}/THIRD_PARTY_NOTICES.txt`,
    ],
    { stdio: "inherit" },
  );
  const plist = `${bundle}/Contents/Info.plist`;
  execFileSync("/usr/libexec/PlistBuddy", [
    "-c",
    "Set :CFBundleIdentifier dev.todo.electron",
    plist,
  ]);
  execFileSync("/usr/libexec/PlistBuddy", [
    "-c",
    "Set :CFBundleName Todo",
    plist,
  ]);
  rmSync(`${bundle}/Contents/Resources/electron.icns`);
  execFileSync("xcrun", [
    "actool",
    resolve("../../design/icon/Todo.icon"),
    "--compile",
    `${bundle}/Contents/Resources`,
    "--app-icon",
    "Todo",
    "--platform",
    "macosx",
    "--minimum-deployment-target",
    "26.0",
    "--output-partial-info-plist",
    resolve("dist/icon-info.plist"),
  ]);
  execFileSync("/usr/libexec/PlistBuddy", [
    "-c",
    "Set :CFBundleIconFile Todo",
    "-c",
    "Add :CFBundleIconName string Todo",
    plist,
  ]);
  if (signed)
    await sign({
      app: bundle,
      identity: signingIdentity,
      platform: "darwin",
      type: "development",
      preAutoEntitlements: false,
      preEmbedProvisioningProfile: false,
      optionsForFile: () => ({ hardenedRuntime: true, timestamp: "none" }),
    });
}

import { execFileSync, spawnSync } from "node:child_process";
import {
  closeSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, it } from "@effect/vitest";
import { CONTRACT_ID } from "@todo/api";

it.skipIf(process.env.TODO_VERIFY_ELECTRON_PACKAGE !== "1")(
  "packages an unsigned macOS app from a clean install without launching it",
  () => {
    expect(process.platform).toBe("darwin");
    const root = execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd: resolve(import.meta.dirname, "../../.."),
      encoding: "utf8",
    }).trim();
    const head = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: root,
      encoding: "utf8",
    }).trim();
    const scratch = mkdtempSync(join(tmpdir(), "todo-electron-package-"));
    const clean = join(scratch, "repo");
    mkdirSync(clean);
    execFileSync("git", ["archive", head, "-o", join(scratch, "source.tar")], {
      cwd: root,
    });
    execFileSync("tar", ["-xf", join(scratch, "source.tar"), "-C", clean]);
    const env = {
      ...process.env,
      HOME: join(scratch, "home"),
      XDG_CACHE_HOME: join(scratch, "cache"),
      ELECTRON_CACHE: join(scratch, "electron-cache"),
      electron_config_cache: join(scratch, "electron-cache"),
      TODO_BUILD_ID: head,
      TODO_ELECTRON_VERIFY_HOST: "0",
    };
    mkdirSync(env.HOME);
    const guard =
      process.env.TODO_PACKAGE_DISK_GUARD ??
      join(clean, "scripts/disk-guard.sh");
    const commands: { command: string; args: string[]; exit: number | null }[] =
      [];
    process.stderr.write(`Clean package proof: ${scratch}\n`);
    writeFileSync(join(scratch, "head.txt"), `${head}\n`);
    const run = (label: string, command: string, args: string[]) => {
      const log = join(scratch, `${label}.log`);
      const descriptor = openSync(log, "w");
      const result = (() => {
        try {
          return spawnSync(command, args, {
            cwd: clean,
            env,
            stdio: ["ignore", descriptor, descriptor],
            timeout: 1_200_000,
          });
        } finally {
          closeSync(descriptor);
        }
      })();
      commands.push({ command, args, exit: result.status });
      writeFileSync(
        join(scratch, "commands.json"),
        `${JSON.stringify(commands, null, 2)}\n`,
      );
      expect(result.error, log).toBeUndefined();
      expect(result.status, log).toBe(0);
    };
    expect(existsSync(join(clean, "node_modules"))).toBe(false);
    run("disk-before-install", "sh", [guard]);
    run("install", "pnpm", [
      "install",
      "--frozen-lockfile",
      "--store-dir",
      join(scratch, "pnpm-store"),
    ]);
    expect(
      existsSync(
        join(clean, "apps/electron/node_modules/electron/dist/Electron.app"),
      ),
    ).toBe(false);
    run("disk-before-build", "sh", [guard]);
    run("build", "/usr/bin/lockf", [
      "-k",
      "/tmp/todo-own-work-electron.lock",
      "pnpm",
      "--filter",
      "@todo/electron",
      "build",
    ]);
    const bundle = join(clean, "apps/electron/dist/Todo.app/Contents");
    for (const file of [
      "MacOS/Electron",
      "Resources/Assets.car",
      "Resources/LICENSE.electron",
      "Resources/LICENSES.chromium.html",
      "Resources/app/dist/main.cjs",
      "Resources/app/dist/preload.cjs",
      "Resources/app/dist/renderer/index.html",
      "Resources/app/THIRD_PARTY_NOTICES.txt",
    ])
      expect(existsSync(join(bundle, file)), file).toBe(true);
    expect(
      execFileSync(
        "/usr/libexec/PlistBuddy",
        ["-c", "Print :CFBundleIdentifier", join(bundle, "Info.plist")],
        { encoding: "utf8" },
      ).trim(),
    ).toBe("dev.todo.electron");
    expect(
      readFileSync(join(bundle, "Resources/app/identity.json"), "utf8"),
    ).toBe(`${JSON.stringify({ build: head, contract: CONTRACT_ID })}\n`);
    writeFileSync(
      join(scratch, "PASS"),
      "Unsigned package built and inspected; app never launched.\n",
    );
  },
  1_800_000,
);

import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, it } from "@effect/vitest";
import { hiddenHostRuntime } from "../scripts/hidden-host.ts";

it("refuses a missing host in under a second before any launch delegate", () => {
  const scratch = mkdtempSync(join(tmpdir(), "todo-hidden-entry-"));
  const marker = join(scratch, "launched");
  const driver = join(scratch, "control.ts");
  try {
    writeFileSync(
      driver,
      `import { hiddenHostEntry } from ${JSON.stringify(resolve(import.meta.dirname, "../scripts/hidden-host.ts"))};\nhiddenHostEntry(${JSON.stringify(join(scratch, "missing.mjs"))});\nawait Bun.write(${JSON.stringify(marker)}, "launched");\n`,
    );
    const start = performance.now();
    const result = spawnSync(process.execPath, [driver], { encoding: "utf8" });
    const elapsed_ms = performance.now() - start;
    if (process.env.TODO_VERIFICATION_CONTROLS_DIR) {
      const directory = resolve(
        import.meta.dirname,
        "../../..",
        process.env.TODO_VERIFICATION_CONTROLS_DIR,
      );
      mkdirSync(directory, { recursive: true });
      writeFileSync(
        join(directory, "missing-host.json"),
        JSON.stringify(
          {
            exit: result.status,
            elapsed_ms,
            launch_delegate_called: existsSync(marker),
            stderr: result.stderr,
          },
          null,
          2,
        ),
      );
    }
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Missing hidden-host entry:");
    expect(elapsed_ms).toBeLessThan(1000);
    expect(existsSync(marker)).toBe(false);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});

it("preflights every unsigned hidden-host launch", () => {
  const directory = resolve(import.meta.dirname, "../scripts");
  const launchers = readdirSync(directory).filter((name) => {
    if (
      name === "verify.ts" ||
      !name.startsWith("verify-") ||
      !name.endsWith(".ts")
    )
      return false;
    return readFileSync(join(directory, name), "utf8").includes(
      "_electron.launch(",
    );
  });
  expect(launchers).toHaveLength(11);
  for (const name of launchers) {
    const source = readFileSync(join(directory, name), "utf8");
    expect(source).toMatch(/_electron\.launch\(\s*hiddenHostOptions\(\{/u);
    expect(source).not.toContain('require("electron")');
    expect(source).not.toContain(')("electron")');
  }
});

it("refuses missing runtime files without importing the auto-download module", () => {
  const directory = mkdtempSync(join(tmpdir(), "todo-missing-electron-"));
  const marker = join(directory, "downloaded");
  try {
    writeFileSync(
      join(directory, "index.js"),
      `require("node:fs").writeFileSync(${JSON.stringify(marker)}, "downloaded");`,
    );
    expect(() => hiddenHostRuntime(directory)).toThrow(
      "Missing installed Electron runtime. Background verification never installs or downloads Electron.",
    );
    writeFileSync(
      join(directory, "path.txt"),
      "Electron.app/Contents/MacOS/Electron",
    );
    expect(() => hiddenHostRuntime(directory)).toThrow(
      "Missing installed Electron runtime.",
    );
    expect(existsSync(marker)).toBe(false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

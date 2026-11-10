import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "@effect/vitest";
import {
  repositoryInput,
  repositoryPath,
  verificationRoot,
} from "../../../scripts/verification-inputs.ts";

const root = verificationRoot(import.meta.dirname);
const wrapper = repositoryInput(
  root,
  "apps/electron/scripts/guarded-run.sh",
  "compiler wrapper",
);
function control(
  name: string,
  nested: "direct" | "shell" | "env",
  failAt = 0,
  executable = "bun",
) {
  const fixture = mkdtempSync(join(tmpdir(), "todo-guard-control-"));
  try {
    const scripts = join(fixture, "apps/electron/scripts");
    const bin = join(fixture, "fake-bin");
    mkdirSync(scripts, { recursive: true });
    mkdirSync(bin);
    mkdirSync(join(fixture, "scripts"));
    const copied = join(scripts, "guarded-run.sh");
    copyFileSync(wrapper, copied);
    writeFileSync(
      join(fixture, "scripts/disk-guard.sh"),
      `#!/bin/sh
set -eu
count=0
[ ! -f "$CONTROL_COUNT" ] || count=$(cat "$CONTROL_COUNT")
count=$((count + 1))
printf '%s' "$count" > "$CONTROL_COUNT"
[ "$count" -le 8 ] || exit 77
[ "$count" -ne "$CONTROL_FAIL_AT" ] || exit 3
`,
    );
    for (const name of ["bun", "pnpm", "node", "xcrun"])
      writeFileSync(
        join(bin, name),
        `#!/bin/sh
printf '%s\\0' "$@" > "$CONTROL_ARGS"
printf '%s' "$CONTROL_VALUE" > "$CONTROL_ENV"
exit 7
`,
        { mode: 0o755 },
      );
    const values = [
      "quote value",
      "Unicode café",
      "$(literal)",
      "line\nbreak",
      "--flag",
    ];
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      PATH: `${bin}:/usr/bin:/bin`,
      CONTROL_COUNT: join(fixture, "count"),
      CONTROL_ARGS: join(fixture, "args"),
      CONTROL_ENV: join(fixture, "environment"),
      CONTROL_FAIL_AT: String(failAt),
      CONTROL_VALUE: "retained env café",
    };
    for (const key of [
      "TODO_DAG_REAL_BUN",
      "TODO_DAG_REAL_PNPM",
      "TODO_DAG_REAL_NODE",
      "TODO_DAG_REAL_XCRUN",
      "TODO_DAG_GUARD_ROOT",
    ])
      delete env[key];
    const command =
      nested === "direct"
        ? [executable, ...values]
        : nested === "shell"
          ? ["/bin/sh", copied, executable, ...values]
          : [
              "/usr/bin/env",
              "CONTROL_VALUE=inner env café",
              "/bin/sh",
              copied,
              executable,
              ...values,
            ];
    const result = spawnSync("/bin/sh", [copied, ...command], {
      env,
      encoding: "utf8",
    });
    const receipt = {
      name,
      source_sha256: createHash("sha256")
        .update(readFileSync(wrapper))
        .digest("hex"),
      argv: ["/bin/sh", copied, ...command],
      exit: result.status,
      signal: result.signal,
      guardCalls: Number(readFileSync(env.CONTROL_COUNT ?? "", "utf8")),
      delegateEntered: existsSync(env.CONTROL_ARGS ?? ""),
      args: existsSync(env.CONTROL_ARGS ?? "")
        ? readFileSync(env.CONTROL_ARGS ?? "", "utf8")
            .split("\0")
            .slice(0, -1)
        : [],
      value: existsSync(env.CONTROL_ENV ?? "")
        ? readFileSync(env.CONTROL_ENV ?? "", "utf8")
        : null,
      stderr: result.stderr,
    };
    if (process.env.TODO_VERIFICATION_CONTROLS_DIR) {
      const evidence = repositoryPath(
        root,
        process.env.TODO_VERIFICATION_CONTROLS_DIR,
        "guard control evidence",
      );
      mkdirSync(evidence, { recursive: true });
      writeFileSync(
        join(evidence, `${name}.json`),
        JSON.stringify(receipt, null, 2),
      );
    }
    expect(receipt.signal).toBeNull();
    expect(receipt.exit).toBe(failAt ? 3 : 7);
    expect(receipt.delegateEntered).toBe(!failAt);
    expect(receipt.guardCalls).toBe(failAt || (nested === "direct" ? 2 : 3));
    if (!failAt) {
      expect(receipt.args).toEqual(values);
      expect(receipt.value).toBe(
        nested === "env" ? "inner env café" : "retained env café",
      );
    }
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
}
it("preserves literal argv and exit through direct fake delegates", () => {
  for (const executable of ["bun", "pnpm", "node", "xcrun"])
    control(`direct-${executable}`, "direct", 0, executable);
});
it("preserves original delegates through nested shell and env wrappers", () => {
  control("nested-shell", "shell");
  control("nested-env", "env");
});
it("stops immediately on a failed initial or nested compiler guard", () => {
  control("initial-disk-stop", "direct", 1);
  control("nested-disk-stop", "shell", 3);
});

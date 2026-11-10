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
  delegateExit = 7,
  trace = false,
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
    const quietGuard = join(root, "apps/electron/scripts/guarded-disk.sh");
    if (existsSync(quietGuard))
      copyFileSync(quietGuard, join(scripts, "guarded-disk.sh"));
    writeFileSync(
      join(fixture, "scripts/disk-guard.sh"),
      `#!/bin/sh
set -eu
count=0
[ ! -f "$CONTROL_COUNT" ] || count=$(cat "$CONTROL_COUNT")
count=$((count + 1))
printf '%s' "$count" > "$CONTROL_COUNT"
[ "$count" -le 8 ] || exit 77
if [ "$count" -eq "$CONTROL_FAIL_AT" ]; then
  printf 'DISK STOP fake floor\\n' >&2
  exit 3
fi
printf 'disk-guard ok: fake success\\n'
`,
    );
    for (const name of ["bun", "pnpm", "node", "xcrun"])
      writeFileSync(
        join(bin, name),
        `#!/bin/sh
printf '%s\\0' "$@" > "$CONTROL_ARGS"
printf '%s' "$CONTROL_VALUE" > "$CONTROL_ENV"
exit ${delegateExit}
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
    delete env.TODO_DAG_GUARD_TRACE;
    if (trace) env.TODO_DAG_GUARD_TRACE = join(fixture, "trace");
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
      stdout: result.stdout,
      trace:
        env.TODO_DAG_GUARD_TRACE && existsSync(env.TODO_DAG_GUARD_TRACE)
          ? readFileSync(env.TODO_DAG_GUARD_TRACE, "utf8")
          : null,
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
    expect(receipt.exit).toBe(failAt ? 3 : delegateExit);
    expect(receipt.delegateEntered).toBe(!failAt);
    expect(receipt.stdout).toBe("");
    expect(receipt.stderr).toBe(failAt ? "DISK STOP fake floor\n" : "");
    expect(receipt.guardCalls).toBe(failAt || (nested === "direct" ? 2 : 3));
    if (trace)
      expect(receipt.trace).toBe(
        "disk-guard ok: fake success\n".repeat(receipt.guardCalls),
      );
    else expect(receipt.trace).toBeNull();
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
it("keeps a silent successful delegate silent and writes optional traces only to a file", () => {
  control("silent-zero", "direct", 0, "bun", 0);
  control("trace-file-only", "shell", 0, "bun", 0, true);
});

it("preserves nested JSON stdout and delegate stderr without successful guard output", () => {
  const fixture = mkdtempSync(join(tmpdir(), "todo-guard-json-"));
  try {
    const scripts = join(fixture, "apps/electron/scripts");
    const bin = join(fixture, "fake-bin");
    mkdirSync(scripts, { recursive: true });
    mkdirSync(join(fixture, "scripts"));
    mkdirSync(bin);
    const copied = join(scripts, "guarded-run.sh");
    copyFileSync(wrapper, copied);
    const quietGuard = join(root, "apps/electron/scripts/guarded-disk.sh");
    if (existsSync(quietGuard))
      copyFileSync(quietGuard, join(scripts, "guarded-disk.sh"));
    writeFileSync(
      join(fixture, "scripts/disk-guard.sh"),
      "#!/bin/sh\nprintf 'guard success\\n'\nprintf 'guard detail\\n' >&2\n",
    );
    for (const name of ["bun", "pnpm", "node", "xcrun"])
      writeFileSync(
        join(bin, name),
        "#!/bin/sh\nprintf '{\"licenses\":[\"MIT\"]}\\n'\nprintf 'delegate diagnostic\\n' >&2\n",
        { mode: 0o755 },
      );
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      PATH: `${bin}:/usr/bin:/bin`,
    };
    delete env.TODO_DAG_GUARD_TRACE;
    for (const key of [
      "TODO_DAG_REAL_BUN",
      "TODO_DAG_REAL_PNPM",
      "TODO_DAG_REAL_NODE",
      "TODO_DAG_REAL_XCRUN",
    ])
      delete env[key];
    const result = spawnSync(
      "/bin/sh",
      [copied, "/bin/sh", copied, "pnpm", "licenses", "list", "--json"],
      { env, encoding: "utf8" },
    );
    const receipt = {
      exit: result.status,
      signal: result.signal,
      stdout: result.stdout,
      stderr: result.stderr,
      scope: "fake JSON delegate only; no compiler or native process",
    };
    if (process.env.TODO_VERIFICATION_CONTROLS_DIR) {
      const evidence = repositoryPath(
        root,
        process.env.TODO_VERIFICATION_CONTROLS_DIR,
        "guard stdout control",
      );
      mkdirSync(evidence, { recursive: true });
      writeFileSync(
        join(evidence, "json-stdout.json"),
        JSON.stringify(receipt, null, 2),
      );
    }
    expect(result.status).toBe(0);
    expect(result.signal).toBeNull();
    expect(result.stdout).toBe('{"licenses":["MIT"]}\n');
    expect(JSON.parse(result.stdout)).toEqual({ licenses: ["MIT"] });
    expect(result.stderr).toBe("delegate diagnostic\n");
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

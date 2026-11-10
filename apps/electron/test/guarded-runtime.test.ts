import { spawnSync } from "node:child_process";
import {
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
const helper = repositoryInput(
  root,
  "apps/electron/scripts/guarded-runtime.cjs",
  "in-process compiler guard",
);
function control(
  name: string,
  mode: "api" | "sync" | "async" | "ordinary",
  fail: boolean,
) {
  const fixture = mkdtempSync(join(tmpdir(), "todo-runtime-control-"));
  try {
    mkdirSync(join(fixture, "scripts"));
    const guard = join(fixture, "scripts/disk-guard.sh");
    writeFileSync(
      guard,
      `#!/bin/sh\nprintf 'guard' >> "$CONTROL_CALLS"\nprintf 'guard diagnostic\\n'\nprintf 'guard detail\\n' >&2\nexit ${fail ? 3 : 0}\n`,
    );
    const delegate = join(fixture, "delegate.json");
    const program = join(fixture, "control.cjs");
    writeFileSync(
      program,
      `const fs = require("node:fs");
const { execFileSync } = require("node:child_process");
const { installBuildGuard } = require(${JSON.stringify(helper)});
const mode = ${JSON.stringify(mode)};
if (mode === "api") {
  const runtime = { build(options) { fs.writeFileSync(${JSON.stringify(delegate)}, JSON.stringify({ options, preloaded: Bun.build.name })); return "literal result"; } };
  installBuildGuard(runtime);
  if (runtime.build({ entrypoints: ["fake-only.ts"] }) !== "literal result") process.exit(9);
  process.stdout.write('{"delegate":"json"}\\n');
  process.exit(7);
} else if (mode === "sync") execFileSync("/bin/sh", [${JSON.stringify(guard)}]);
else if (mode === "async") Promise.resolve().then(() => execFileSync("/bin/sh", [${JSON.stringify(guard)}]));
else throw new Error("ordinary failure remains nonzero");
`,
    );
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      TODO_DAG_GUARD_ROOT: fixture,
      CONTROL_CALLS: join(fixture, "calls"),
    };
    delete env.BUN_OPTIONS;
    const result = spawnSync(
      process.env.TODO_DAG_REAL_BUN ?? process.execPath,
      ["--preload", helper, program],
      { env, encoding: "utf8" },
    );
    const receipt = {
      name,
      scope:
        "Bun runtime only; guarded build delegate is fake and no real compiler or native process runs",
      exit: result.status,
      signal: result.signal,
      guardCalls: existsSync(env.CONTROL_CALLS ?? "")
        ? readFileSync(env.CONTROL_CALLS ?? "", "utf8")
        : "",
      delegate: existsSync(delegate)
        ? JSON.parse(readFileSync(delegate, "utf8"))
        : null,
      stderr: result.stderr,
      stdout: result.stdout,
    };
    if (process.env.TODO_VERIFICATION_CONTROLS_DIR) {
      const evidence = repositoryPath(
        root,
        process.env.TODO_VERIFICATION_CONTROLS_DIR,
        "runtime control evidence",
      );
      mkdirSync(evidence, { recursive: true });
      writeFileSync(
        join(evidence, `${name}.json`),
        JSON.stringify(receipt, null, 2),
      );
    }
    expect(receipt.signal).toBeNull();
    expect(receipt.exit).toBe(mode === "ordinary" ? 1 : fail ? 3 : 7);
    if (mode === "api" && !fail)
      expect(receipt.delegate).toEqual({
        options: { entrypoints: ["fake-only.ts"] },
        preloaded: "guardedBuild",
      });
    else expect(receipt.delegate).toBeNull();
    expect(receipt.guardCalls).toBe(mode === "ordinary" ? "" : "guard");
    if (mode === "api") {
      expect(receipt.stdout).toBe(fail ? "" : '{"delegate":"json"}\n');
      expect(receipt.stderr).toBe("guard diagnostic\nguard detail\n");
    }
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
}
it("guards each in-process build immediately before its fake delegate", () => {
  control("api-build-pass", "api", false);
  control("api-build-disk-stop", "api", true);
});
it("preserves Disk Stop from synchronous and asynchronous immediate guards", () => {
  control("sync-api-disk-stop", "sync", true);
  control("async-api-disk-stop", "async", true);
  control("ordinary-runtime-failure", "ordinary", false);
});

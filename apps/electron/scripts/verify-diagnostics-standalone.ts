import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { Schema } from "effect";
import {
  repositoryInput,
  repositoryPath,
  verificationRoot,
} from "../../../scripts/verification-inputs.ts";

const root = verificationRoot(import.meta.dirname);
const evidence = repositoryPath(
  root,
  process.argv[2] ?? "",
  "Diagnostics evidence",
);
const cache = Schema.decodeUnknownSync(
  Schema.Struct({
    cli: Schema.String,
    server: Schema.String,
    seed: Schema.String,
  }),
)(
  JSON.parse(
    readFileSync(
      repositoryInput(
        root,
        ".scratch/bin/build.json",
        "compiled scratch cache",
      ),
      "utf8",
    ),
  ),
);
const scratch = mkdtempSync(join(tmpdir(), "todo-s01-verify-diagnostics-"));
mkdirSync(evidence);
try {
  for (const [name, path] of [
    ["todo", cache.cli],
    ["server", cache.server],
    ["seed", cache.seed],
  ]) {
    assert.ok(name && path);
    symlinkSync(
      repositoryInput(root, relative(root, path), "compiled scratch binary"),
      join(scratch, name),
    );
  }
  const env: NodeJS.ProcessEnv & { HOME: string } = {
    ...process.env,
    HOME: join(scratch, "home"),
    TODO_ELECTRON_VERIFY_HOST: "1",
    TODO_ELECTRON_VERIFY_BACKGROUND: "1",
  };
  delete env.TODO_DIAGNOSTICS_URL;
  delete env.TODO_DIAGNOSTICS_HOME;
  delete env.TODO_DIAGNOSTICS_DB;
  mkdirSync(env.HOME);
  const seed = spawnSync(cache.seed, [scratch, "diagnostics"], {
    cwd: root,
    env,
    stdio: "inherit",
  });
  if (seed.status !== 0) process.exitCode = seed.status ?? 1;
  else {
    const proof = spawnSync(
      "bun",
      [
        repositoryInput(
          root,
          "apps/electron/scripts/verify-diagnostics.ts",
          "Diagnostics driver",
        ),
        scratch,
        evidence,
      ],
      { cwd: root, env, stdio: "inherit" },
    );
    process.exitCode = proof.status ?? 1;
  }
} finally {
  rmSync(scratch, { recursive: true, force: true });
}

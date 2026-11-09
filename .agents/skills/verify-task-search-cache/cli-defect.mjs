import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const [manifest, evidence] = process.argv.slice(2);
const { cli } = JSON.parse(readFileSync(manifest, "utf8"));
mkdirSync(evidence, { recursive: true });
const scratch = mkdtempSync(join(tmpdir(), "todo-cache-defect-"));
const env = {
  ...process.env,
  HOME: join(scratch, "home"),
  TODO_DB: join(scratch, "scratch.db"),
  TODO_ATTACHMENT_ROOT: join(scratch, "attachments"),
};
delete env.BUN_OPTIONS;
mkdirSync(env.HOME);
const actions = [];
const run = (args, input, fault = false) => {
  const result = spawnSync(
    cli,
    ["--profile", "work", "--format", "json", ...args],
    {
      env: fault
        ? {
            ...env,
            BUN_OPTIONS: `--preload=${join(import.meta.dirname, "prepare-fault-preload.mjs")}`,
          }
        : env,
      input,
      encoding: "utf8",
      timeout: 60000,
    },
  );
  actions.push({
    args,
    exit: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  });
  return result;
};
try {
  assert.equal(
    run(["init", "--password-stdin"], "compiled defect passphrase\n").status,
    0,
  );
  assert.equal(
    run(["login", "--password-stdin"], "compiled defect passphrase\n").status,
    0,
  );
  assert.equal(run(["add", "Fault preparation field"]).status, 0);
  const result = run(["list", "--text", "fault"], undefined, true);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /seat1 fault preload enabled/);
  assert.notEqual(
    result.stdout.trim(),
    "",
    "CLI defect returns one runtime_error envelope",
  );
  const body = JSON.parse(result.stdout);
  assert.deepEqual(
    { ...body, generated_at: "<clock>" },
    {
      generated_at: "<clock>",
      code: "runtime_error",
      message: "Error: seat1 injected preparation defect",
    },
  );
  writeFileSync(
    join(evidence, "result.json"),
    JSON.stringify(
      {
        status: "PASS",
        actions,
        cli,
        realExit: result.status,
        exactEnvelope: body,
      },
      null,
      2,
    ),
  );
} finally {
  writeFileSync(
    join(evidence, "actions.json"),
    JSON.stringify(actions, null, 2),
  );
  rmSync(scratch, { recursive: true, force: true });
}
